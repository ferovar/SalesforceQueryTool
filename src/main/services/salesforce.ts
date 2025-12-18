import * as jsforce from 'jsforce';
import { dialog, shell, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

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

  async loginWithOAuth(isSandbox: boolean): Promise<{ userId: string; organizationId: string; instanceUrl: string }> {
    // For OAuth, we'll use a simple OAuth2 flow
    // This is a simplified version - in production you'd want a proper OAuth setup
    const loginUrl = isSandbox
      ? 'https://test.salesforce.com'
      : 'https://login.salesforce.com';

    // Create a new browser window for OAuth
    const authWindow = new BrowserWindow({
      width: 600,
      height: 700,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // For now, redirect to Salesforce login
    // In a real implementation, you'd register a Connected App and use its credentials
    const oauthUrl = `${loginUrl}/services/oauth2/authorize?response_type=token&client_id=YOUR_CONNECTED_APP_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI`;
    
    authWindow.loadURL(oauthUrl);

    return new Promise((resolve, reject) => {
      authWindow.webContents.on('will-redirect', async (event, url) => {
        try {
          if (url.includes('access_token=')) {
            const params = new URLSearchParams(url.split('#')[1]);
            const accessToken = params.get('access_token');
            const instanceUrl = params.get('instance_url');

            if (accessToken && instanceUrl) {
              this.connection = new jsforce.Connection({
                instanceUrl,
                accessToken,
              });

              const identity = await this.connection.identity();
              authWindow.close();

              resolve({
                userId: identity.user_id,
                organizationId: identity.organization_id,
                instanceUrl,
              });
            }
          }
        } catch (error) {
          authWindow.close();
          reject(error);
        }
      });

      authWindow.on('closed', () => {
        reject(new Error('Authentication window was closed'));
      });
    });
  }

  async logout(): Promise<void> {
    if (this.connection) {
      await this.connection.logout();
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

    // Get all unique keys from the data (excluding Salesforce metadata)
    const excludeKeys = ['attributes'];
    const headers = new Set<string>();
    data.forEach((record) => {
      Object.keys(record).forEach((key) => {
        if (!excludeKeys.includes(key)) {
          headers.add(key);
        }
      });
    });

    const headerArray = Array.from(headers);

    // Create CSV content
    const csvRows: string[] = [];
    
    // Add header row
    csvRows.push(headerArray.map(h => `"${h}"`).join(','));

    // Add data rows
    data.forEach((record) => {
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
}
