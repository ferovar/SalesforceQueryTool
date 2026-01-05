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
}
