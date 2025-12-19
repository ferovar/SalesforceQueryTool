import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { SalesforceService } from './services/salesforce';
import { CredentialsStore } from './services/credentials';
import { QueriesStore } from './services/queries';
import { QueryHistoryStore } from './services/queryHistory';
import { OrgConnectionManager } from './services/orgConnectionManager';
import { DataMigrationService, RelationshipConfig, DEFAULT_EXCLUDED_FIELDS, DEFAULT_EXCLUDED_OBJECTS } from './services/dataMigration';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
const salesforceService = new SalesforceService();
const credentialsStore = new CredentialsStore();
const queriesStore = new QueriesStore();
const queryHistoryStore = new QueryHistoryStore();
const orgConnectionManager = new OrgConnectionManager();
let dataMigrationService: DataMigrationService | null = null;

// Check if we should use dev server - only if explicitly in development AND not in production mode
const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged && process.env.VITE_DEV_SERVER_URL !== undefined;

console.log('Starting Salesforce Query Tool...');
console.log('isDev:', isDev);
console.log('__dirname:', __dirname);

function createSplashWindow(): void {
  console.log('Creating splash window...');
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    splashWindow.loadURL('http://localhost:5173/splash.html');
  } else {
    splashWindow.loadFile(path.join(__dirname, '../renderer/splash.html'));
  }
  
  splashWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Splash failed to load:', errorCode, errorDescription);
  });
}

function createMainWindow(): void {
  console.log('Creating main window...');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#1e1f22',
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  console.log('Loading main window content...');
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // Press F12 to open DevTools when needed
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Main window failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Main window finished loading');
  });

  mainWindow.once('ready-to-show', () => {
    console.log('Main window ready to show');
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow?.show();
    }, 2000); // Show splash for 2 seconds minimum
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  createSplashWindow();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers for window controls
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

// IPC Handler for performance data
ipcMain.handle('app:getPerformanceData', () => {
  const memUsage = process.memoryUsage();
  return {
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal,
    external: memUsage.external,
    uptime: process.uptime(),
  };
});

// IPC Handlers for Salesforce operations
ipcMain.handle('salesforce:login', async (_event, credentials: {
  label: string;
  username: string;
  password: string;
  securityToken: string;
  isSandbox: boolean;
  saveCredentials: boolean;
}) => {
  try {
    const result = await salesforceService.login(
      credentials.username,
      credentials.password,
      credentials.securityToken,
      credentials.isSandbox
    );
    
    if (credentials.saveCredentials) {
      credentialsStore.saveCredentials({
        label: credentials.label || credentials.username,
        username: credentials.username,
        password: credentials.password,
        securityToken: credentials.securityToken,
        isSandbox: credentials.isSandbox,
      });
    }
    
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('salesforce:loginOAuth', async (_event, options: { isSandbox: boolean; saveConnection: boolean; label: string; clientId: string }) => {
  try {
    const result = await salesforceService.loginWithOAuth(options.isSandbox, options.clientId);
    
    if (options.saveConnection) {
      credentialsStore.saveOAuthLogin({
        label: options.label || result.username,
        instanceUrl: result.instanceUrl,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        isSandbox: options.isSandbox,
        username: result.username,
        clientId: options.clientId,
      });
    }
    
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('salesforce:loginWithSavedOAuth', async (_event, id: string) => {
  try {
    const savedOAuth = credentialsStore.getOAuthLoginById(id);
    if (!savedOAuth) {
      return { success: false, error: 'Saved OAuth connection not found' };
    }
    
    const result = await salesforceService.loginWithSavedOAuth(savedOAuth.instanceUrl, savedOAuth.accessToken);
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('salesforce:logout', async () => {
  try {
    await salesforceService.logout();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('salesforce:getObjects', async () => {
  try {
    const objects = await salesforceService.getObjects();
    return { success: true, data: objects };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('salesforce:describeObject', async (_event, objectName: string) => {
  try {
    const description = await salesforceService.describeObject(objectName);
    return { success: true, data: description };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('salesforce:executeQuery', async (_event, query: string, includeDeleted: boolean) => {
  try {
    const results = await salesforceService.executeQuery(query, includeDeleted);
    return { success: true, data: results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('salesforce:updateRecord', async (_event, objectName: string, recordId: string, fields: Record<string, any>) => {
  try {
    const result = await salesforceService.updateRecord(objectName, recordId, fields);
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('salesforce:exportToCsv', async (_event, data: any[], filename: string) => {
  try {
    const result = await salesforceService.exportToCsv(data, filename);
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// IPC Handlers for credentials
ipcMain.handle('credentials:get', () => {
  return credentialsStore.getCredentials();
});

ipcMain.handle('credentials:clear', () => {
  credentialsStore.clearCredentials();
  return { success: true };
});

ipcMain.handle('credentials:getSavedLogins', () => {
  return credentialsStore.getSavedLogins();
});

ipcMain.handle('credentials:deleteSavedLogin', (_event, username: string) => {
  credentialsStore.deleteSavedLogin(username);
  return { success: true };
});

ipcMain.handle('credentials:getLoginByUsername', (_event, username: string) => {
  return credentialsStore.getLoginByUsername(username);
});

ipcMain.handle('credentials:getSavedOAuthLogins', () => {
  return credentialsStore.getSavedOAuthLogins();
});

ipcMain.handle('credentials:deleteOAuthLogin', (_event, id: string) => {
  credentialsStore.deleteOAuthLogin(id);
  return { success: true };
});

// IPC Handlers for saved queries
ipcMain.handle('queries:save', (_event, objectName: string, name: string, query: string) => {
  try {
    const savedQuery = queriesStore.saveQuery(objectName, name, query);
    return { success: true, data: savedQuery };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('queries:getForObject', (_event, objectName: string) => {
  return queriesStore.getQueriesForObject(objectName);
});

ipcMain.handle('queries:delete', (_event, queryId: string) => {
  queriesStore.deleteQuery(queryId);
  return { success: true };
});

ipcMain.handle('queries:updateLastRun', (_event, queryId: string) => {
  queriesStore.updateLastRunAt(queryId);
  return { success: true };
});

// IPC Handlers for query history
ipcMain.handle('history:add', (_event, entry: { query: string; objectName: string; recordCount: number; success: boolean; error?: string }) => {
  try {
    const historyEntry = queryHistoryStore.addEntry(entry);
    return { success: true, data: historyEntry };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('history:getAll', () => {
  return queryHistoryStore.getHistory();
});

ipcMain.handle('history:clear', () => {
  queryHistoryStore.clearHistory();
  return { success: true };
});

ipcMain.handle('history:delete', (_event, entryId: string) => {
  queryHistoryStore.deleteEntry(entryId);
  return { success: true };
});

// IPC Handlers for data migration
ipcMain.handle('migration:connectTargetOrg', async (_event, options: { isSandbox: boolean; label: string; clientId: string }) => {
  try {
    const result = await orgConnectionManager.connectWithOAuth(options.isSandbox, options.clientId, options.label);
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('migration:connectWithSavedOAuth', async (_event, savedOAuthId: string) => {
  try {
    const savedOAuth = credentialsStore.getOAuthLoginById(savedOAuthId);
    if (!savedOAuth) {
      return { success: false, error: 'Saved OAuth connection not found' };
    }
    
    const result = await orgConnectionManager.connectWithToken(
      savedOAuth.instanceUrl,
      savedOAuth.accessToken,
      savedOAuth.isSandbox,
      savedOAuth.username
    );
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('migration:connectWithSavedCredentials', async (_event, username: string) => {
  try {
    const savedCredentials = credentialsStore.getLoginByUsername(username);
    if (!savedCredentials) {
      return { success: false, error: 'Saved credentials not found' };
    }
    
    const result = await orgConnectionManager.connectWithPassword(
      savedCredentials.username,
      savedCredentials.password,
      savedCredentials.securityToken,
      savedCredentials.isSandbox,
      savedCredentials.label || savedCredentials.username
    );
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('migration:getTargetOrgs', () => {
  const connections = orgConnectionManager.getAllConnections();
  return connections.map(c => ({
    id: c.id,
    label: c.label,
    instanceUrl: c.instanceUrl,
    username: c.username,
    isSandbox: c.isSandbox,
  }));
});

ipcMain.handle('migration:disconnectTargetOrg', async (_event, connectionId: string) => {
  try {
    await orgConnectionManager.disconnect(connectionId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('migration:getRelationships', async (_event, objectName: string) => {
  try {
    // Initialize data migration service if not exists
    const connection = salesforceService.getConnection();
    if (!connection) {
      return { success: false, error: 'Not connected to source org' };
    }
    dataMigrationService = new DataMigrationService(connection);
    
    const relationships = await dataMigrationService.getRelationships(objectName);
    const defaultConfig = await dataMigrationService.getDefaultRelationshipConfig(objectName);
    
    return { 
      success: true, 
      data: { 
        relationships, 
        defaultConfig,
        excludedFields: DEFAULT_EXCLUDED_FIELDS,
        excludedObjects: DEFAULT_EXCLUDED_OBJECTS,
      } 
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('migration:analyzeRecords', async (_event, params: {
  objectName: string;
  records: Record<string, any>[];
  relationshipConfig: RelationshipConfig[];
}) => {
  try {
    const connection = salesforceService.getConnection();
    if (!connection) {
      return { success: false, error: 'Not connected to source org' };
    }
    dataMigrationService = new DataMigrationService(connection);
    
    const analyzed = await dataMigrationService.analyzeRelationships(
      params.objectName,
      params.records,
      params.relationshipConfig
    );
    
    const plan = dataMigrationService.buildMigrationPlan(analyzed);
    
    // Convert Map to serializable object
    const recordsByObjectSerialized: Record<string, Record<string, any>[]> = {};
    for (const [key, value] of plan.recordsByObject) {
      recordsByObjectSerialized[key] = value;
    }
    
    return { 
      success: true, 
      data: {
        objectOrder: plan.objectOrder,
        recordsByObject: recordsByObjectSerialized,
        totalRecords: plan.totalRecords,
        objectCounts: plan.objectCounts,
        relationshipRemapping: plan.relationshipRemapping,
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('migration:executeMigration', async (_event, params: {
  targetOrgId: string;
  objectOrder: string[];
  recordsByObject: Record<string, Record<string, any>[]>;
  relationshipRemapping: { objectName: string; fieldName: string; originalId: string; recordIndex: number }[];
}) => {
  try {
    const { targetOrgId, objectOrder, recordsByObject, relationshipRemapping } = params;
    
    const idMapping = new Map<string, string>();
    const results: { objectName: string; inserted: number; failed: number; errors: string[] }[] = [];
    
    // Insert records in order (parents first)
    for (const objectName of objectOrder) {
      const records = recordsByObject[objectName] || [];
      if (records.length === 0) continue;
      
      // Prepare records: remap relationship IDs and remove internal fields
      const preparedRecords = records.map(record => {
        const prepared: Record<string, any> = {};
        
        for (const [key, value] of Object.entries(record)) {
          // Skip internal tracking fields
          if (key === '_originalId' || key === '_tempId') {
            continue;
          }
          
          // Check if this is a relationship field that needs remapping
          if (value && typeof value === 'string' && idMapping.has(value)) {
            prepared[key] = idMapping.get(value);
          } else {
            prepared[key] = value;
          }
        }
        
        return prepared;
      });
      
      // Insert into target org
      const insertResults = await orgConnectionManager.insertRecords(
        targetOrgId,
        objectName,
        preparedRecords
      );
      
      let inserted = 0;
      let failed = 0;
      const errors: string[] = [];
      
      insertResults.forEach((result, index) => {
        if (result.success) {
          inserted++;
          // Map original ID to new ID
          const originalId = records[index]._originalId;
          if (originalId) {
            idMapping.set(originalId, result.id);
          }
        } else {
          failed++;
          errors.push(`Record ${index + 1}: ${result.errors?.join(', ') || 'Unknown error'}`);
        }
      });
      
      results.push({ objectName, inserted, failed, errors });
    }
    
    // Convert idMapping to serializable object
    const idMappingSerialized: Record<string, string> = {};
    for (const [key, value] of idMapping) {
      idMappingSerialized[key] = value;
    }
    
    return { 
      success: true, 
      data: { 
        results,
        idMapping: idMappingSerialized,
        totalInserted: results.reduce((sum, r) => sum + r.inserted, 0),
        totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('migration:getChildRelationships', async (_event, objectName: string) => {
  try {
    const connection = salesforceService.getConnection();
    if (!connection) {
      return { success: false, error: 'Not connected to source org' };
    }
    dataMigrationService = new DataMigrationService(connection);
    
    const childRelationships = await dataMigrationService.getChildRelationships(objectName);
    return { success: true, data: childRelationships };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
