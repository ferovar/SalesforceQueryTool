import * as jsforce from 'jsforce';
import { performOAuthFlow } from './oauthHelper';
import {
  DEFAULT_CLIENT_ID,
  TARGET_OAUTH_PORT,
  TARGET_CALLBACK_URL,
  getLoginUrl,
} from './oauthConstants';

export interface OrgConnection {
  id: string;
  label: string;
  instanceUrl: string;
  username: string;
  isSandbox: boolean;
  connection: jsforce.Connection;
}

export interface ConnectResult {
  userId: string;
  organizationId: string;
  instanceUrl: string;
  username: string;
}

/**
 * Manages multiple Salesforce org connections for data migration operations.
 * The primary connection is managed by SalesforceService (source org).
 * This manager handles additional connections (target orgs).
 */
export class OrgConnectionManager {
  private connections: Map<string, OrgConnection> = new Map();
  private connectionCounter = 0;

  /**
   * Connect to a target org using OAuth
   */
  async connectWithOAuth(
    isSandbox: boolean,
    clientId: string | undefined,
    label: string
  ): Promise<{ id: string; data: ConnectResult }> {
    const resolvedClientId = clientId?.trim() || DEFAULT_CLIENT_ID;

    const result = await performOAuthFlow({
      isSandbox,
      clientId: resolvedClientId,
      callbackUrl: TARGET_CALLBACK_URL,
      port: TARGET_OAUTH_PORT,
    });

    const connection = new jsforce.Connection({
      instanceUrl: result.instanceUrl,
      accessToken: result.accessToken,
    });

    // Generate unique ID for this connection
    const connectionId = `target_${++this.connectionCounter}`;

    // Store the connection
    this.connections.set(connectionId, {
      id: connectionId,
      label: label || result.username,
      instanceUrl: result.instanceUrl,
      username: result.username,
      isSandbox,
      connection,
    });

    return {
      id: connectionId,
      data: {
        userId: result.userId,
        organizationId: result.organizationId,
        instanceUrl: result.instanceUrl,
        username: result.username,
      },
    };
  }

  /**
   * Connect to a target org using existing access token
   */
  async connectWithToken(
    instanceUrl: string,
    accessToken: string,
    isSandbox: boolean,
    label: string
  ): Promise<{ id: string; data: ConnectResult }> {
    const connection = new jsforce.Connection({
      instanceUrl,
      accessToken,
    });

    const identity = await connection.identity();

    // Generate unique ID for this connection
    const connectionId = `target_${++this.connectionCounter}`;

    // Store the connection
    this.connections.set(connectionId, {
      id: connectionId,
      label: label || identity.username,
      instanceUrl,
      username: identity.username,
      isSandbox,
      connection,
    });

    return {
      id: connectionId,
      data: {
        userId: identity.user_id,
        organizationId: identity.organization_id,
        instanceUrl,
        username: identity.username,
      },
    };
  }

  /**
   * Connect to a target org using username/password credentials
   */
  async connectWithPassword(
    username: string,
    password: string,
    securityToken: string,
    isSandbox: boolean,
    label: string
  ): Promise<{ id: string; data: ConnectResult }> {
    const loginUrl = getLoginUrl(isSandbox);

    const connection = new jsforce.Connection({
      loginUrl,
    });

    await connection.login(username, password + securityToken);

    const identity = await connection.identity();

    // Generate unique ID for this connection
    const connectionId = `target_${++this.connectionCounter}`;

    // Store the connection
    this.connections.set(connectionId, {
      id: connectionId,
      label: label || identity.username,
      instanceUrl: connection.instanceUrl,
      username: identity.username,
      isSandbox,
      connection,
    });

    return {
      id: connectionId,
      data: {
        userId: identity.user_id,
        organizationId: identity.organization_id,
        instanceUrl: connection.instanceUrl,
        username: identity.username,
      },
    };
  }

  /**
   * Get a specific connection by ID
   */
  getConnection(connectionId: string): OrgConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all active connections
   */
  getAllConnections(): OrgConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Disconnect a specific org
   */
  async disconnect(connectionId: string): Promise<void> {
    const orgConnection = this.connections.get(connectionId);
    if (orgConnection) {
      try {
        await orgConnection.connection.logout();
      } catch {
        // Ignore logout errors
      }
      this.connections.delete(connectionId);
    }
  }

  /**
   * Disconnect all target orgs
   */
  async disconnectAll(): Promise<void> {
    for (const [id] of this.connections) {
      await this.disconnect(id);
    }
  }

  /**
   * Execute a query on a target org
   */
  async executeQuery(connectionId: string, query: string): Promise<any[]> {
    const orgConnection = this.connections.get(connectionId);
    if (!orgConnection) {
      throw new Error('Target org not connected');
    }

    let results: any[] = [];
    let queryResult = await orgConnection.connection.query(query);
    results = [...queryResult.records];

    while (!queryResult.done && queryResult.nextRecordsUrl) {
      queryResult = await orgConnection.connection.queryMore(queryResult.nextRecordsUrl);
      results = [...results, ...queryResult.records];
    }

    return results;
  }

  /**
   * Describe an object on a target org
   */
  async describeObject(connectionId: string, objectName: string): Promise<any> {
    const orgConnection = this.connections.get(connectionId);
    if (!orgConnection) {
      throw new Error('Target org not connected');
    }

    return await orgConnection.connection.describe(objectName);
  }

  /**
   * Insert records into a target org
   * Returns a map of temporary IDs to actual Salesforce IDs
   */
  async insertRecords(
    connectionId: string,
    objectName: string,
    records: Record<string, any>[]
  ): Promise<{ success: boolean; id: string; tempId?: string; errors?: string[] }[]> {
    const orgConnection = this.connections.get(connectionId);
    if (!orgConnection) {
      throw new Error('Target org not connected');
    }

    const sobject = orgConnection.connection.sobject(objectName);
    
    // Use standard insert - jsforce handles batching internally for large datasets
    // For very large datasets, we batch manually
    const batchSize = 200;
    const allResults: { success: boolean; id: string; tempId?: string; errors?: string[] }[] = [];
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const results = await sobject.insert(batch);
      const resultArray = Array.isArray(results) ? results : [results];
      
      resultArray.forEach((r: any, index: number) => {
        allResults.push({
          success: r.success,
          id: r.id || '',
          tempId: batch[index]._tempId,
          errors: r.errors?.map((e: any) => e.message) || [],
        });
      });
    }
    
    return allResults;
  }

  /**
   * Upsert records into a target org using an external ID field
   */
  async upsertRecords(
    connectionId: string,
    objectName: string,
    externalIdField: string,
    records: Record<string, any>[]
  ): Promise<{ success: boolean; id: string; created: boolean; errors?: string[] }[]> {
    const orgConnection = this.connections.get(connectionId);
    if (!orgConnection) {
      throw new Error('Target org not connected');
    }

    const sobject = orgConnection.connection.sobject(objectName);
    const results = await sobject.upsert(records, externalIdField);
    const resultArray = Array.isArray(results) ? results : [results];
    
    return resultArray.map((r: any) => ({
      success: r.success,
      id: r.id || '',
      created: r.created || false,
      errors: r.errors?.map((e: any) => e.message) || [],
    }));
  }

  /**
   * Get all RecordTypes from a target org for mapping
   * Returns a map of "SObjectType:DeveloperName" -> RecordType Id
   */
  async getRecordTypeMapping(
    connectionId: string
  ): Promise<Map<string, { id: string; name: string }>> {
    const orgConnection = this.connections.get(connectionId);
    if (!orgConnection) {
      throw new Error('Target org not connected');
    }

    const recordTypes = await this.executeQuery(
      connectionId,
      'SELECT Id, SobjectType, DeveloperName, Name FROM RecordType WHERE IsActive = true'
    );

    const mapping = new Map<string, { id: string; name: string }>();
    for (const rt of recordTypes) {
      const key = `${rt.SobjectType}:${rt.DeveloperName}`;
      mapping.set(key, { id: rt.Id, name: rt.Name });
    }

    // Also map by Id for quick lookups
    for (const rt of recordTypes) {
      mapping.set(rt.Id, { id: rt.Id, name: rt.Name });
    }

    return mapping;
  }
}
