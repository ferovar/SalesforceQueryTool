import * as jsforce from 'jsforce';
import * as http from 'http';
import * as url from 'url';
import { BrowserWindow } from 'electron';

const OAUTH_CALLBACK_URL = 'http://localhost:1718/OauthRedirect'; // Different port for target org

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
    clientId: string,
    label: string
  ): Promise<{ id: string; data: ConnectResult }> {
    const loginUrl = isSandbox
      ? 'https://test.salesforce.com'
      : 'https://login.salesforce.com';

    return new Promise((resolve, reject) => {
      let server: http.Server | null = null;
      let authWindow: BrowserWindow | null = null;
      let resolved = false;

      const cleanup = () => {
        if (server) {
          server.close();
          server = null;
        }
        if (authWindow && !authWindow.isDestroyed()) {
          authWindow.close();
          authWindow = null;
        }
      };

      // Create local HTTP server on a different port for target org
      server = http.createServer(async (req, res) => {
        try {
          const parsedUrl = url.parse(req.url || '', true);

          if (parsedUrl.pathname === '/OauthRedirect') {
            if (parsedUrl.query.error) {
              const errorDesc = parsedUrl.query.error_description || parsedUrl.query.error;
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #1e1f22; color: #dbdee1;">
                    <h2>Authentication Failed</h2>
                    <p>${errorDesc}</p>
                    <p>You can close this window.</p>
                  </body>
                </html>
              `);
              cleanup();
              if (!resolved) {
                resolved = true;
                reject(new Error(String(errorDesc)));
              }
              return;
            }

            const code = parsedUrl.query.code as string;

            if (code) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #1e1f22; color: #dbdee1;">
                    <h2>Target Org Connected!</h2>
                    <p>You can close this window and return to the application.</p>
                    <script>setTimeout(() => window.close(), 1500);</script>
                  </body>
                </html>
              `);

              try {
                const tokenUrl = `${loginUrl}/services/oauth2/token`;
                const tokenResponse = await fetch(tokenUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    client_id: clientId,
                    redirect_uri: OAUTH_CALLBACK_URL,
                  }),
                });

                const tokenData = (await tokenResponse.json()) as {
                  error?: string;
                  error_description?: string;
                  access_token?: string;
                  refresh_token?: string;
                  instance_url?: string;
                };

                if (tokenData.error) {
                  cleanup();
                  if (!resolved) {
                    resolved = true;
                    reject(new Error(tokenData.error_description || tokenData.error));
                  }
                  return;
                }

                const accessToken = tokenData.access_token!;
                const instanceUrl = tokenData.instance_url!;

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

                cleanup();
                if (!resolved) {
                  resolved = true;
                  resolve({
                    id: connectionId,
                    data: {
                      userId: identity.user_id,
                      organizationId: identity.organization_id,
                      instanceUrl,
                      username: identity.username,
                    },
                  });
                }
              } catch (tokenError: any) {
                cleanup();
                if (!resolved) {
                  resolved = true;
                  reject(new Error(tokenError.message || 'Failed to exchange authorization code'));
                }
              }
            }
          }
        } catch (err: any) {
          cleanup();
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        }
      });

      server.listen(1718, 'localhost', () => {
        const oauthUrl = new URL(`${loginUrl}/services/oauth2/authorize`);
        oauthUrl.searchParams.set('response_type', 'code');
        oauthUrl.searchParams.set('client_id', clientId);
        oauthUrl.searchParams.set('redirect_uri', OAUTH_CALLBACK_URL);
        oauthUrl.searchParams.set('scope', 'api refresh_token');

        authWindow = new BrowserWindow({
          width: 600,
          height: 700,
          show: true,
          title: 'Connect Target Org - Salesforce Login',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        });

        authWindow.loadURL(oauthUrl.toString());

        authWindow.on('closed', () => {
          authWindow = null;
          if (server) {
            server.close();
            server = null;
          }
          if (!resolved) {
            resolved = true;
            reject(new Error('Authentication window was closed'));
          }
        });
      });

      server.on('error', (err: any) => {
        cleanup();
        if (!resolved) {
          resolved = true;
          if (err.code === 'EADDRINUSE') {
            reject(new Error('OAuth callback port 1718 is already in use. Please close any other Salesforce tools and try again.'));
          } else {
            reject(err);
          }
        }
      });
    });
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
    const loginUrl = isSandbox
      ? 'https://test.salesforce.com'
      : 'https://login.salesforce.com';

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
}
