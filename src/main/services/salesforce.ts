import * as jsforce from 'jsforce';
import { dialog, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { performOAuthFlow, refreshAccessToken } from './oauthHelper';
import {
  DEFAULT_CLIENT_ID,
  PRIMARY_OAUTH_PORT,
  PRIMARY_CALLBACK_URL,
  getLoginUrl,
} from './oauthConstants';
import {
  escapeSoqlLikeString,
  buildIdInClause,
  isValidSalesforceId,
  validateLimit,
  validateDatetime,
} from './soqlUtils';
import { recordsToCsv, sanitizeCsvFilename } from './csvExport';

/** Delay before executing Apex to let the trace flag activate (ms) */
const TRACE_FLAG_SETTLE_MS = 500;
/** Delay after Apex execution before fetching debug logs (ms) */
const LOG_AVAILABILITY_DELAY_MS = 1000;

export interface SalesforceObject {
  name: string;
  label: string;
  labelPlural: string;
  keyPrefix: string;
  custom: boolean;
  queryable: boolean;
}

export interface SalesforceField {
  name: string;
  label: string;
  type: string;
  length: number;
  referenceTo: string[];
  relationshipName: string | null;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  custom: boolean;
}

export interface ObjectDescription {
  name: string;
  label: string;
  fields: SalesforceField[];
  childRelationships: any[];
}

export class SalesforceService {
  private connection: jsforce.Connection | null = null;
  private userInfo: any = null;

  async login(
    username: string,
    password: string,
    securityToken: string,
    isSandbox: boolean
  ): Promise<{ userId: string; organizationId: string; instanceUrl: string }> {
    const loginUrl = getLoginUrl(isSandbox);

    this.connection = new jsforce.Connection({ loginUrl });

    const passwordWithToken = password + securityToken;
    
    this.userInfo = await this.connection.login(username, passwordWithToken);

    return {
      userId: this.userInfo.id,
      organizationId: this.userInfo.organizationId,
      instanceUrl: this.connection.instanceUrl,
    };
  }

  async loginWithOAuth(
    isSandbox: boolean,
    clientId?: string
  ): Promise<{ userId: string; organizationId: string; instanceUrl: string; accessToken: string; refreshToken: string; username: string }> {
    const resolvedClientId = clientId?.trim() || DEFAULT_CLIENT_ID;

    const result = await performOAuthFlow({
      isSandbox,
      clientId: resolvedClientId,
      callbackUrl: PRIMARY_CALLBACK_URL,
      port: PRIMARY_OAUTH_PORT,
    });

    // Create a jsforce connection for subsequent API calls
    this.connection = new jsforce.Connection({
      instanceUrl: result.instanceUrl,
      accessToken: result.accessToken,
    });

    return {
      userId: result.userId,
      organizationId: result.organizationId,
      instanceUrl: result.instanceUrl,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      username: result.username,
    };
  }

  async loginWithSavedOAuth(
    instanceUrl: string,
    accessToken: string,
    refreshToken?: string,
    clientId?: string,
    isSandbox?: boolean
  ): Promise<{ userId: string; organizationId: string; instanceUrl: string; username: string; accessToken?: string }> {
    this.connection = new jsforce.Connection({
      instanceUrl,
      accessToken,
    });

    try {
      const identity = await this.connection.identity();
      return {
        userId: identity.user_id,
        organizationId: identity.organization_id,
        instanceUrl,
        username: identity.username,
      };
    } catch {
      // Access token expired — attempt refresh if we have a refresh token
      if (refreshToken && clientId) {
        try {
          const refreshed = await refreshAccessToken(
            instanceUrl,
            refreshToken,
            clientId,
            isSandbox ?? false
          );

          // Rebuild connection with the fresh access token
          this.connection = new jsforce.Connection({
            instanceUrl,
            accessToken: refreshed.accessToken,
          });

          const identity = await this.connection.identity();
          return {
            userId: identity.user_id,
            organizationId: identity.organization_id,
            instanceUrl,
            username: identity.username,
            // Return the new access token so the caller can persist it
            accessToken: refreshed.accessToken,
          };
        } catch {
          this.connection = null;
          throw new Error('OAuth session expired and refresh failed. Please log in again.');
        }
      }

      this.connection = null;
      throw new Error('OAuth session expired. Please log in again.');
    }
  }

  async logout(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.logout();
      } catch {
        // Ignore logout errors (token might already be invalid)
      }
      this.connection = null;
      this.userInfo = null;
    }
  }

  async getObjects(): Promise<SalesforceObject[]> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const result = await this.connection.describeGlobal();
    
    return result.sobjects
      .filter((obj: any) => obj.queryable)
      .map((obj: any) => ({
        name: obj.name,
        label: obj.label,
        labelPlural: obj.labelPlural,
        keyPrefix: obj.keyPrefix,
        custom: obj.custom,
        queryable: obj.queryable,
      }))
      .sort((a: SalesforceObject, b: SalesforceObject) => a.label.localeCompare(b.label));
  }

  async describeObject(objectName: string): Promise<ObjectDescription> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const result = await this.connection.describe(objectName);

    return {
      name: result.name,
      label: result.label,
      fields: result.fields.map((field: any) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        length: field.length,
        referenceTo: field.referenceTo || [],
        relationshipName: field.relationshipName,
        nillable: field.nillable,
        createable: field.createable,
        updateable: field.updateable,
        custom: field.custom,
      })),
      childRelationships: result.childRelationships || [],
    };
  }

  async executeQuery(query: string, includeDeleted: boolean = false): Promise<any[]> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    let results: any[] = [];
    
    let queryResult = includeDeleted
      ? await this.connection.query(query, { scanAll: true })
      : await this.connection.query(query);
    results = [...queryResult.records];

    // Handle pagination
    while (!queryResult.done && queryResult.nextRecordsUrl) {
      queryResult = await this.connection.queryMore(queryResult.nextRecordsUrl);
      results = [...results, ...queryResult.records];
    }

    return results;
  }

  async updateRecord(objectName: string, recordId: string, fields: Record<string, any>): Promise<{ success: boolean; id: string }> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const sobject = this.connection.sobject(objectName);
    const result = await sobject.update({
      Id: recordId,
      ...fields,
    });

    if (result.success) {
      return { success: true, id: result.id };
    } else {
      throw new Error((result as any).errors?.map((e: any) => e.message).join(', ') || 'Update failed');
    }
  }

  async exportToCsv(data: any[], filename: string): Promise<string> {
    if (data.length === 0) {
      throw new Error('No data to export');
    }

    // Sanitize the renderer-supplied default filename against path traversal
    // and invalid characters before suggesting it in the save dialog.
    const safeDefault = sanitizeCsvFilename(filename);

    const { filePath } = await dialog.showSaveDialog({
      defaultPath: safeDefault,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    });

    if (!filePath) {
      throw new Error('Export cancelled');
    }

    // Defense-in-depth: refuse to write to anything that isn't a .csv file.
    // The OS dialog already constrained the user choice, but we verify here
    // so a compromised dialog or test-time stub cannot drop arbitrary paths.
    const resolved = path.resolve(filePath);
    if (path.extname(resolved).toLowerCase() !== '.csv') {
      throw new Error('Export path must end with .csv');
    }

    const csvContent = recordsToCsv(data);
    fs.writeFileSync(resolved, csvContent, 'utf-8');

    // Open the file location
    shell.showItemInFolder(resolved);

    return resolved;
  }

  isConnected(): boolean {
    return this.connection !== null;
  }

  getConnection(): jsforce.Connection | null {
    return this.connection;
  }

  async executeAnonymousApex(script: string): Promise<{
    success: boolean;
    compiled: boolean;
    compileProblem?: string;
    exceptionMessage?: string;
    exceptionStackTrace?: string;
    line?: number;
    column?: number;
    debugLog?: string;
  }> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const toolingApi = this.connection.tooling;
    const instanceUrl = this.connection.instanceUrl;
    const accessToken = this.connection.accessToken;

    // Get the current user's ID for trace flag
    let userId: string;
    try {
      const identity = await this.connection.identity();
      userId = identity.user_id;
    } catch (err) {
      throw new Error('Failed to get current user identity');
    }

    // Try to create or find a debug level for our trace flag
    let debugLevelId: string | null = null;
    try {
      // First, try to find an existing debug level we can use
      const existingLevels = await toolingApi.query<{ Id: string; DeveloperName: string }>(
        `SELECT Id, DeveloperName FROM DebugLevel WHERE DeveloperName = 'SFDC_DevConsole' LIMIT 1`
      );
      
      if (existingLevels.records && existingLevels.records.length > 0) {
        debugLevelId = existingLevels.records[0].Id;
      } else {
        // Try to find any debug level
        const anyLevel = await toolingApi.query<{ Id: string }>(
          `SELECT Id FROM DebugLevel LIMIT 1`
        );
        if (anyLevel.records && anyLevel.records.length > 0) {
          debugLevelId = anyLevel.records[0].Id;
        }
      }
    } catch (err) {
      console.error('Failed to find debug level:', err);
    }

    // Create a temporary trace flag if we have a debug level
    let traceFlagId: string | null = null;
    if (debugLevelId) {
      try {
        // Check for existing trace flag for this user
        const existingFlags = await toolingApi.query<{ Id: string; ExpirationDate: string }>(
          `SELECT Id, ExpirationDate FROM TraceFlag WHERE TracedEntityId = ${isValidSalesforceId(userId) ? `'${userId}'` : "''"} AND LogType = 'USER_DEBUG' LIMIT 1`
        );

        const now = new Date();
        const startDate = now.toISOString();
        // Set expiration to 1 hour from now (well under 24 hour limit)
        const expirationDate = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

        if (existingFlags.records && existingFlags.records.length > 0) {
          // Update existing trace flag with new start and expiration
          traceFlagId = existingFlags.records[0].Id;
          await toolingApi.sobject('TraceFlag').update({
            Id: traceFlagId,
            StartDate: startDate,
            ExpirationDate: expirationDate,
          });
        } else {
          // Create new trace flag
          const createResult = await toolingApi.sobject('TraceFlag').create({
            TracedEntityId: userId,
            DebugLevelId: debugLevelId,
            LogType: 'USER_DEBUG',
            StartDate: startDate,
            ExpirationDate: expirationDate,
          });
          if (createResult.success) {
            traceFlagId = createResult.id;
          }
        }
      } catch (err) {
        console.error('Failed to create/update trace flag:', err);
        // Continue anyway - we might still get some logs
      }
    }

    // Small delay to ensure trace flag is active before execution
    await new Promise(resolve => setTimeout(resolve, TRACE_FLAG_SETTLE_MS));

    // Record time before execution to find the right log
    const executionStartTime = new Date().toISOString();

    // URL encode the apex code
    const encodedScript = encodeURIComponent(script);
    
    // Make request to the executeAnonymous endpoint
    const response = await fetch(
      `${instanceUrl}/services/data/v59.0/tooling/executeAnonymous/?anonymousBody=${encodedScript}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to execute anonymous apex: ${errorText}`);
    }

    const result = await response.json() as {
      success: boolean;
      compiled: boolean;
      compileProblem?: string;
      exceptionMessage?: string;
      exceptionStackTrace?: string;
      line?: number;
      column?: number;
    };

    // Wait for log to become available in the system
    await new Promise(resolve => setTimeout(resolve, LOG_AVAILABILITY_DELAY_MS));

    // Try to get the debug log
    let debugLog: string | undefined;
    try {
      // Query for the most recent ApexLog created after our execution started
      const logsResult = await toolingApi.query<{
        Id: string;
        LogLength: number;
        Request: string;
        Operation: string;
        Application: string;
        Status: string;
        DurationMilliseconds: number;
        StartTime: string;
      }>(
        `SELECT Id, LogLength, Request, Operation, Application, Status, DurationMilliseconds, StartTime 
         FROM ApexLog 
         WHERE StartTime >= ${executionStartTime}
         ORDER BY StartTime DESC 
         LIMIT 1`
      );

      if (logsResult.records && logsResult.records.length > 0) {
        const logId = logsResult.records[0].Id;
        
        // Fetch the actual log body
        const logResponse = await fetch(
          `${instanceUrl}/services/data/v59.0/tooling/sobjects/ApexLog/${logId}/Body`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (logResponse.ok) {
          debugLog = await logResponse.text();
        }
      } else {
        // Fallback: try getting any recent log
        const fallbackResult = await toolingApi.query<{ Id: string }>(
          `SELECT Id FROM ApexLog ORDER BY StartTime DESC LIMIT 1`
        );
        
        if (fallbackResult.records && fallbackResult.records.length > 0) {
          const logId = fallbackResult.records[0].Id;
          const logResponse = await fetch(
            `${instanceUrl}/services/data/v59.0/tooling/sobjects/ApexLog/${logId}/Body`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            }
          );

          if (logResponse.ok) {
            debugLog = await logResponse.text();
          }
        }
      }
    } catch (logError) {
      // If we can't get the log, continue without it
      console.error('Failed to fetch debug log:', logError);
    }

    return {
      ...result,
      debugLog,
    };
  }

  async getDebugLogs(limit: number = 20): Promise<Array<{
    id: string;
    logLength: number;
    operation: string;
    status: string;
    durationMs: number;
    startTime: string;
  }>> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const toolingApi = this.connection.tooling;
    const safeLimit = validateLimit(limit);

    const result = await toolingApi.query<{
      Id: string;
      LogLength: number;
      Operation: string;
      Status: string;
      DurationMilliseconds: number;
      StartTime: string;
    }>(
      `SELECT Id, LogLength, Operation, Status, DurationMilliseconds, StartTime
       FROM ApexLog
       ORDER BY StartTime DESC
       LIMIT ${safeLimit}`
    );

    return (result.records || []).map(log => ({
      id: log.Id,
      logLength: log.LogLength,
      operation: log.Operation,
      status: log.Status,
      durationMs: log.DurationMilliseconds,
      startTime: log.StartTime,
    }));
  }

  async getDebugLogBody(logId: string): Promise<string> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    if (!isValidSalesforceId(logId)) {
      throw new Error('Invalid log ID');
    }

    const instanceUrl = this.connection.instanceUrl;
    const accessToken = this.connection.accessToken;

    const response = await fetch(
      `${instanceUrl}/services/data/v59.0/tooling/sobjects/ApexLog/${logId}/Body`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch debug log');
    }

    return await response.text();
  }

  // =============================================
  // User Debugging Methods
  // =============================================

  async searchUsers(searchTerm: string): Promise<Array<{
    id: string;
    name: string;
    username: string;
    email: string;
    isActive: boolean;
    profileName: string;
  }>> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const escapedTerm = escapeSoqlLikeString(searchTerm);
    const query = `
      SELECT Id, Name, Username, Email, IsActive, Profile.Name
      FROM User
      WHERE (Name LIKE '%${escapedTerm}%' OR Username LIKE '%${escapedTerm}%' OR Email LIKE '%${escapedTerm}%')
      AND IsActive = true
      ORDER BY Name
      LIMIT 20
    `;

    const result = await this.connection.query<{
      Id: string;
      Name: string;
      Username: string;
      Email: string;
      IsActive: boolean;
      Profile: { Name: string };
    }>(query);

    return (result.records || []).map(user => ({
      id: user.Id,
      name: user.Name,
      username: user.Username,
      email: user.Email,
      isActive: user.IsActive,
      profileName: user.Profile?.Name || 'Unknown',
    }));
  }

  async createUserTraceFlag(
    userId: string, 
    durationMinutes: number
  ): Promise<{ traceFlagId: string; expirationDate: string }> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const toolingApi = this.connection.tooling;

    // First, get or create a debug level
    let debugLevelId: string;
    const existingDebugLevel = await toolingApi.query<{ Id: string }>(
      "SELECT Id FROM DebugLevel WHERE DeveloperName = 'SFQueryToolUserDebug' LIMIT 1"
    );

    if (existingDebugLevel.records && existingDebugLevel.records.length > 0) {
      debugLevelId = existingDebugLevel.records[0].Id;
    } else {
      // Create a new debug level with comprehensive logging
      const newDebugLevel = await toolingApi.sobject('DebugLevel').create({
        DeveloperName: 'SFQueryToolUserDebug',
        MasterLabel: 'SF Query Tool User Debug',
        ApexCode: 'FINEST',
        ApexProfiling: 'INFO',
        Callout: 'INFO',
        Database: 'FINEST',
        System: 'DEBUG',
        Validation: 'INFO',
        Visualforce: 'INFO',
        Workflow: 'INFO',
        Nba: 'INFO',
        Wave: 'INFO',
      });

      if (!newDebugLevel.success) {
        throw new Error('Failed to create debug level');
      }
      debugLevelId = newDebugLevel.id;
    }

    // Check for existing trace flag for this user
    const existingTraceFlag = await toolingApi.query<{ Id: string; ExpirationDate: string }>(
      `SELECT Id, ExpirationDate FROM TraceFlag WHERE TracedEntityId = ${isValidSalesforceId(userId) ? `'${userId}'` : "''"} AND LogType = 'USER_DEBUG' LIMIT 1`
    );

    const now = new Date();
    const startDate = new Date(now.getTime() - 60000); // 1 minute ago
    const expirationDate = new Date(now.getTime() + durationMinutes * 60 * 1000);

    if (existingTraceFlag.records && existingTraceFlag.records.length > 0) {
      // Update existing trace flag
      const updateResult = await toolingApi.sobject('TraceFlag').update({
        Id: existingTraceFlag.records[0].Id,
        StartDate: startDate.toISOString(),
        ExpirationDate: expirationDate.toISOString(),
        DebugLevelId: debugLevelId,
      });

      if (!updateResult.success) {
        throw new Error('Failed to update trace flag');
      }

      return {
        traceFlagId: existingTraceFlag.records[0].Id,
        expirationDate: expirationDate.toISOString(),
      };
    } else {
      // Create new trace flag
      const newTraceFlag = await toolingApi.sobject('TraceFlag').create({
        TracedEntityId: userId,
        DebugLevelId: debugLevelId,
        LogType: 'USER_DEBUG',
        StartDate: startDate.toISOString(),
        ExpirationDate: expirationDate.toISOString(),
      });

      if (!newTraceFlag.success) {
        throw new Error('Failed to create trace flag');
      }

      return {
        traceFlagId: newTraceFlag.id,
        expirationDate: expirationDate.toISOString(),
      };
    }
  }

  async deleteTraceFlag(traceFlagId: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const toolingApi = this.connection.tooling;
    await toolingApi.sobject('TraceFlag').delete(traceFlagId);
  }

  async getActiveTraceFlags(): Promise<Array<{
    id: string;
    tracedEntityId: string;
    tracedEntityName: string;
    logType: string;
    expirationDate: string;
    debugLevelName: string;
  }>> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const toolingApi = this.connection.tooling;
    const now = new Date().toISOString();

    const result = await toolingApi.query<{
      Id: string;
      TracedEntityId: string;
      LogType: string;
      ExpirationDate: string;
      DebugLevel: { DeveloperName: string };
    }>(
      `SELECT Id, TracedEntityId, LogType, ExpirationDate, DebugLevel.DeveloperName 
       FROM TraceFlag 
       WHERE ExpirationDate > ${now}
       ORDER BY ExpirationDate DESC`
    );

    // Get user names for the traced entities
    const tracedEntityIds = (result.records || []).map(tf => tf.TracedEntityId);
    let userMap: Record<string, string> = {};

    if (tracedEntityIds.length > 0) {
      const validIds = tracedEntityIds.filter(id => isValidSalesforceId(id));
      if (validIds.length > 0) {
        const userQuery = await this.connection.query<{ Id: string; Name: string }>(
          `SELECT Id, Name FROM User WHERE Id IN ${buildIdInClause(validIds)}`
        );
        userMap = (userQuery.records || []).reduce((acc, user) => {
          acc[user.Id] = user.Name;
          return acc;
        }, {} as Record<string, string>);
      }
    }

    return (result.records || []).map(tf => ({
      id: tf.Id,
      tracedEntityId: tf.TracedEntityId,
      tracedEntityName: userMap[tf.TracedEntityId] || 'Unknown',
      logType: tf.LogType,
      expirationDate: tf.ExpirationDate,
      debugLevelName: tf.DebugLevel?.DeveloperName || 'Unknown',
    }));
  }

  async getDebugLogsForUser(
    userId: string, 
    sinceTime?: string,
    limit: number = 50
  ): Promise<Array<{
    id: string;
    logLength: number;
    operation: string;
    status: string;
    durationMs: number;
    startTime: string;
    request: string;
  }>> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const toolingApi = this.connection.tooling;

    if (!isValidSalesforceId(userId)) {
      throw new Error('Invalid user ID');
    }

    const safeLimit = validateLimit(limit);

    let query = `
      SELECT Id, LogLength, Operation, Status, DurationMilliseconds, StartTime, Request
      FROM ApexLog
      WHERE LogUserId = '${userId}'
    `;

    if (sinceTime) {
      query += ` AND StartTime > ${validateDatetime(sinceTime)}`;
    }

    query += ` ORDER BY StartTime DESC LIMIT ${safeLimit}`;

    const result = await toolingApi.query<{
      Id: string;
      LogLength: number;
      Operation: string;
      Status: string;
      DurationMilliseconds: number;
      StartTime: string;
      Request: string;
    }>(query);

    return (result.records || []).map(log => ({
      id: log.Id,
      logLength: log.LogLength,
      operation: log.Operation,
      status: log.Status,
      durationMs: log.DurationMilliseconds,
      startTime: log.StartTime,
      request: log.Request || '',
    }));
  }

  // =============================================
  // Org Limits
  // =============================================

  async getOrgLimits(): Promise<Record<string, { Max: number; Remaining: number }>> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const result = await this.connection.request('/services/data/v59.0/limits/');
    return result as Record<string, { Max: number; Remaining: number }>;
  }

  // =============================================
  // Record Inspector
  // =============================================

  async getRecordById(recordId: string): Promise<{
    objectName: string;
    objectLabel: string;
    record: Record<string, any>;
    fields: SalesforceField[];
  }> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    // Get all objects to match keyPrefix
    const globalResult = await this.connection.describeGlobal();
    const keyPrefix = recordId.substring(0, 3);
    const matchedObject = globalResult.sobjects.find(
      (obj: any) => obj.keyPrefix === keyPrefix
    );

    if (!matchedObject) {
      throw new Error(`No Salesforce object found with key prefix "${keyPrefix}"`);
    }

    const objectName = matchedObject.name;

    // Describe the object to get all fields
    const description = await this.connection.describe(objectName);
    const fields: SalesforceField[] = description.fields.map((field: any) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      length: field.length,
      referenceTo: field.referenceTo || [],
      relationshipName: field.relationshipName,
      nillable: field.nillable,
      createable: field.createable,
      updateable: field.updateable,
      custom: field.custom,
    }));

    // Build query with all queryable fields (skip compound fields that can't be queried)
    const compoundTypes = ['address', 'location'];
    const queryableFields = fields
      .filter((f) => !compoundTypes.includes(f.type))
      .map((f) => f.name);

    const query = `SELECT ${queryableFields.join(', ')} FROM ${objectName} WHERE Id = '${recordId}' LIMIT 1`;
    const queryResult = await this.connection.query(query);

    if (!queryResult.records || queryResult.records.length === 0) {
      throw new Error(`Record not found: ${recordId}`);
    }

    return {
      objectName,
      objectLabel: matchedObject.label,
      record: queryResult.records[0] as Record<string, any>,
      fields,
    };
  }

  // =============================================
  // Sandbox Management
  // =============================================

  async getSandboxes(): Promise<Array<{
    id: string;
    sandboxName: string;
    licenseType: string;
    description: string;
    createdDate: string;
    lastModifiedDate: string;
  }>> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const toolingApi = this.connection.tooling;

    const result = await toolingApi.query<{
      Id: string;
      SandboxName: string;
      LicenseType: string;
      Description: string;
      CreatedDate: string;
      LastModifiedDate: string;
    }>(
      `SELECT Id, SandboxName, LicenseType, Description, CreatedDate, LastModifiedDate
       FROM SandboxInfo
       ORDER BY SandboxName ASC`
    );

    return (result.records || []).map(sb => ({
      id: sb.Id,
      sandboxName: sb.SandboxName,
      licenseType: sb.LicenseType,
      description: sb.Description || '',
      createdDate: sb.CreatedDate,
      lastModifiedDate: sb.LastModifiedDate,
    }));
  }

  async createSandbox(params: {
    sandboxName: string;
    licenseType: string;
    description?: string;
  }): Promise<{ success: boolean; id?: string }> {
    if (!this.connection) {
      throw new Error('Not connected to Salesforce');
    }

    const metadata = {
      fullName: params.sandboxName,
      licenseType: params.licenseType,
      ...(params.description ? { description: params.description } : {}),
    };

    const result = await (this.connection.metadata as any).create('SandboxInfo', metadata);

    if (Array.isArray(result)) {
      const first = result[0];
      if (first?.success) {
        return { success: true, id: first.id };
      }
      throw new Error(first?.errors?.map((e: any) => e.message).join(', ') || 'Failed to create sandbox');
    }

    if (result?.success) {
      return { success: true, id: result.id };
    }

    throw new Error(result?.errors?.map((e: any) => e.message).join(', ') || 'Failed to create sandbox');
  }
}
