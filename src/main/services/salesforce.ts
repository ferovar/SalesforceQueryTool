import * as jsforce from 'jsforce';
import { dialog, shell, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as url from 'url';

const OAUTH_CALLBACK_URL = 'http://localhost:1717/OauthRedirect';

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
    const loginUrl = isSandbox
      ? 'https://test.salesforce.com'
      : 'https://login.salesforce.com';

    this.connection = new jsforce.Connection({ loginUrl });

    const passwordWithToken = password + securityToken;
    
    this.userInfo = await this.connection.login(username, passwordWithToken);

    return {
      userId: this.userInfo.id,
      organizationId: this.userInfo.organizationId,
      instanceUrl: this.connection.instanceUrl,
    };
  }

  async loginWithOAuth(isSandbox: boolean, clientId: string): Promise<{ userId: string; organizationId: string; instanceUrl: string; accessToken: string; refreshToken: string; username: string }> {
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

      // Create local HTTP server to receive OAuth callback
      server = http.createServer(async (req, res) => {
        try {
          const parsedUrl = url.parse(req.url || '', true);
          
          if (parsedUrl.pathname === '/OauthRedirect') {
            // Check for error first
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

            // Get authorization code
            const code = parsedUrl.query.code as string;
            
            if (code) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #1e1f22; color: #dbdee1;">
                    <h2>Authentication Successful!</h2>
                    <p>You can close this window and return to the application.</p>
                    <script>setTimeout(() => window.close(), 1500);</script>
                  </body>
                </html>
              `);

              // Exchange code for tokens
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

                const tokenData = await tokenResponse.json() as {
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
                const refreshToken = tokenData.refresh_token || '';
                const instanceUrl = tokenData.instance_url!;

                // Connect and get identity
                this.connection = new jsforce.Connection({
                  instanceUrl,
                  accessToken,
                });

                const identity = await this.connection.identity();
                
                cleanup();
                if (!resolved) {
                  resolved = true;
                  resolve({
                    userId: identity.user_id,
                    organizationId: identity.organization_id,
                    instanceUrl,
                    accessToken,
                    refreshToken,
                    username: identity.username,
                  });
                }
              } catch (tokenError: any) {
                cleanup();
                if (!resolved) {
                  resolved = true;
                  reject(new Error(tokenError.message || 'Failed to exchange authorization code'));
                }
              }
            } else {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #1e1f22; color: #dbdee1;">
                    <h2>Authentication Failed</h2>
                    <p>No authorization code received.</p>
                  </body>
                </html>
              `);
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

      server.listen(1717, 'localhost', () => {
        // Build OAuth URL with authorization code flow
        const oauthUrl = new URL(`${loginUrl}/services/oauth2/authorize`);
        oauthUrl.searchParams.set('response_type', 'code');
        oauthUrl.searchParams.set('client_id', clientId);
        oauthUrl.searchParams.set('redirect_uri', OAUTH_CALLBACK_URL);
        oauthUrl.searchParams.set('scope', 'api refresh_token');

        // Open in a BrowserWindow
        authWindow = new BrowserWindow({
          width: 600,
          height: 700,
          show: true,
          title: 'Salesforce Login',
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
            reject(new Error('OAuth callback port 1717 is already in use. Please close any other Salesforce tools and try again.'));
          } else {
            reject(err);
          }
        }
      });
    });
  }

  async loginWithSavedOAuth(instanceUrl: string, accessToken: string): Promise<{ userId: string; organizationId: string; instanceUrl: string; username: string }> {
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
    } catch (error: any) {
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
    
    const queryMethod = includeDeleted ? 'queryAll' : 'query';
    
    let queryResult = await (this.connection as any)[queryMethod](query);
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

    const { filePath } = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    });

    if (!filePath) {
      throw new Error('Export cancelled');
    }

    // Helper function to flatten nested objects into dot-notation keys
    const flattenRecord = (record: any, prefix: string = ''): Record<string, any> => {
      const result: Record<string, any> = {};
      
      for (const key of Object.keys(record)) {
        if (key === 'attributes') continue; // Skip Salesforce metadata
        
        const value = record[key];
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          // Recursively flatten nested objects (including those with 'attributes')
          const nested = flattenRecord(value, newKey);
          Object.assign(result, nested);
        } else {
          result[newKey] = value;
        }
      }
      
      return result;
    };

    // Flatten all records
    const flattenedData = data.map(record => flattenRecord(record));

    // Get all unique keys from the flattened data
    const headers = new Set<string>();
    flattenedData.forEach((record) => {
      Object.keys(record).forEach((key) => {
        headers.add(key);
      });
    });

    const headerArray = Array.from(headers);

    // Create CSV content
    const csvRows: string[] = [];
    
    // Add header row
    csvRows.push(headerArray.map(h => `"${h}"`).join(','));

    // Add data rows
    flattenedData.forEach((record) => {
      const row = headerArray.map((header) => {
        let value = record[header];
        if (value === null || value === undefined) {
          return '';
        }
        if (typeof value === 'object') {
          value = JSON.stringify(value);
        }
        // Escape quotes and wrap in quotes
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    fs.writeFileSync(filePath, csvContent, 'utf-8');

    // Open the file location
    shell.showItemInFolder(filePath);

    return filePath;
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
          `SELECT Id, ExpirationDate FROM TraceFlag WHERE TracedEntityId = '${userId}' AND LogType = 'USER_DEBUG' LIMIT 1`
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

    // Small delay to ensure trace flag is active
    await new Promise(resolve => setTimeout(resolve, 500));

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

    // Wait a bit for log to be available
    await new Promise(resolve => setTimeout(resolve, 1000));

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
       LIMIT ${limit}`
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

    const escapedTerm = searchTerm.replace(/'/g, "\\'");
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
      `SELECT Id, ExpirationDate FROM TraceFlag WHERE TracedEntityId = '${userId}' AND LogType = 'USER_DEBUG' LIMIT 1`
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
      const userQuery = await this.connection.query<{ Id: string; Name: string }>(
        `SELECT Id, Name FROM User WHERE Id IN ('${tracedEntityIds.join("','")}')`
      );
      userMap = (userQuery.records || []).reduce((acc, user) => {
        acc[user.Id] = user.Name;
        return acc;
      }, {} as Record<string, string>);
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
    
    let query = `
      SELECT Id, LogLength, Operation, Status, DurationMilliseconds, StartTime, Request 
      FROM ApexLog 
      WHERE LogUserId = '${userId}'
    `;

    if (sinceTime) {
      query += ` AND StartTime > ${sinceTime}`;
    }

    query += ` ORDER BY StartTime DESC LIMIT ${limit}`;

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
}
