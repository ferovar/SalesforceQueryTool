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
    
    return { success: true, data: { ...result, username: credentials.username } };
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
  relationshipConfig?: RelationshipConfig[];
}) => {
  try {
    const { targetOrgId, objectOrder, recordsByObject, relationshipRemapping, relationshipConfig } = params;
    
    const idMapping = new Map<string, string>();
    const results: { objectName: string; inserted: number; failed: number; errors: string[] }[] = [];
    
    // Get source connection for queries
    const sourceConnection = salesforceService.getConnection();
    
    // Handle matchByExternalId lookups - query target org to find matching records
    // Note: RecordTypeId is handled separately with special SObjectType+DeveloperName matching
    const externalIdMappings = relationshipConfig?.filter(c => 
      c.action === 'matchByExternalId' && 
      c.externalIdField && 
      c.fieldName !== 'RecordTypeId' // RecordTypeId has special handling below
    ) || [];
    
    if (externalIdMappings.length > 0 && sourceConnection) {
      for (const config of externalIdMappings) {
        // Collect all unique source IDs for this relationship field across all records
        const sourceIds = new Set<string>();
        for (const records of Object.values(recordsByObject)) {
          for (const record of records) {
            const value = record[config.fieldName];
            if (value && typeof value === 'string') {
              sourceIds.add(value);
            }
          }
        }
        
        if (sourceIds.size === 0) continue;
        
        try {
          // Query source org to get the external ID values for these records
          const sourceQuery = `SELECT Id, ${config.externalIdField} FROM ${config.referenceTo} WHERE Id IN ('${Array.from(sourceIds).join("','")}')`;
          const sourceResult = await sourceConnection.query(sourceQuery);
          
          // Build a map of source ID -> external ID value
          const sourceIdToExternalValue = new Map<string, any>();
          for (const record of sourceResult.records as any[]) {
            if (record[config.externalIdField!] !== null && record[config.externalIdField!] !== undefined) {
              sourceIdToExternalValue.set(record.Id, record[config.externalIdField!]);
            }
          }
          
          // Get unique external ID values to query target
          const externalValues = new Set(sourceIdToExternalValue.values());
          if (externalValues.size === 0) continue;
          
          // Query target org to find records with matching external ID values
          const escapedValues = Array.from(externalValues).map(v => 
            typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : v
          );
          const targetQuery = `SELECT Id, ${config.externalIdField} FROM ${config.referenceTo} WHERE ${config.externalIdField} IN (${escapedValues.join(',')})`;
          const targetResult = await orgConnectionManager.executeQuery(targetOrgId, targetQuery);
          
          // Build a map of external ID value -> target record ID
          const externalValueToTargetId = new Map<any, string>();
          for (const record of targetResult as any[]) {
            externalValueToTargetId.set(record[config.externalIdField!], record.Id);
          }
          
          // Now map source IDs to target IDs through the external ID values
          for (const [sourceId, externalValue] of sourceIdToExternalValue) {
            const targetId = externalValueToTargetId.get(externalValue);
            if (targetId) {
              idMapping.set(sourceId, targetId);
            }
          }
        } catch (err) {
          console.error(`Error performing external ID lookup for ${config.fieldName}:`, err);
        }
      }
    }
    
    // Build RecordType mapping from target org
    // Maps source RecordTypeId -> target RecordTypeId based on SObjectType:DeveloperName
    const recordTypeMapping = new Map<string, string>();
    let targetRecordTypes: Map<string, { id: string; name: string }> | null = null;
    
    // Check if we have any RecordTypeId fields to remap
    const hasRecordTypeFields = Object.values(recordsByObject).some(records =>
      records.some(record => record.RecordTypeId)
    );
    
    if (hasRecordTypeFields) {
      // Query RecordTypes from both source and target
      targetRecordTypes = await orgConnectionManager.getRecordTypeMapping(targetOrgId);
      
      // Query source RecordTypes to build mapping
      const sourceConnection = salesforceService.getConnection();
      if (sourceConnection) {
        // Get all unique RecordTypeIds from records being migrated
        const sourceRecordTypeIds = new Set<string>();
        for (const records of Object.values(recordsByObject)) {
          for (const record of records) {
            if (record.RecordTypeId) {
              sourceRecordTypeIds.add(record.RecordTypeId);
            }
          }
        }
        
        if (sourceRecordTypeIds.size > 0) {
          // Query source RecordTypes
          const sourceQuery = `SELECT Id, SobjectType, DeveloperName FROM RecordType WHERE Id IN ('${Array.from(sourceRecordTypeIds).join("','")}')`;          const sourceRecordTypes = await sourceConnection.query(sourceQuery);
          
          // Build mapping: source Id -> target Id (based on SObjectType:DeveloperName match)
          for (const srcRT of sourceRecordTypes.records as any[]) {
            const key = `${srcRT.SobjectType}:${srcRT.DeveloperName}`;
            const targetRT = targetRecordTypes.get(key);
            if (targetRT) {
              // Same RecordType exists in target - map source ID to target ID
              recordTypeMapping.set(srcRT.Id, targetRT.id);
              // Also add to general idMapping so relationship remapping works
              idMapping.set(srcRT.Id, targetRT.id);
            } else {
              // RecordType doesn't exist in target - this will cause an error on insert
              // Leave unmapped, the error will be reported
            }
          }
        }
      }
    }
    
    // Insert records in order (parents first)
    for (const objectName of objectOrder) {
      // Skip RecordType - they should already exist and we just remap IDs
      if (objectName === 'RecordType') {
        // Add to results as "skipped" (0 inserted, 0 failed)
        results.push({ objectName, inserted: 0, failed: 0, errors: ['RecordTypes are matched by DeveloperName, not inserted'] });
        continue;
      }
      
      const records = recordsByObject[objectName] || [];
      if (records.length === 0) continue;
      
      // Compound/read-only fields that should be excluded from insert/update
      // These are auto-calculated by Salesforce and cannot be set directly
      const compoundReadOnlyFields = new Set([
        'Name',           // Compound field on Contact, Lead (FirstName + LastName), read-only on Person objects
        'PhotoUrl',       // System-calculated
        'IsDeleted',      // System field
        'CreatedDate',    // System audit field
        'CreatedById',    // System audit field
        'LastModifiedDate', // System audit field
        'LastModifiedById', // System audit field
        'SystemModstamp', // System field
        'LastActivityDate', // System-calculated
        'LastViewedDate', // System-calculated
        'LastReferencedDate', // System-calculated
        'MasterRecordId', // Only used in merge scenarios
      ]);
      
      // Object-specific compound fields
      const objectCompoundFields: Record<string, Set<string>> = {
        'Contact': new Set(['Name', 'MailingAddress', 'OtherAddress']),
        'Lead': new Set(['Name', 'Address']),
        'Account': new Set(['BillingAddress', 'ShippingAddress']),
        'User': new Set(['Name', 'Address']),
      };
      
      const objectSpecificExclusions = objectCompoundFields[objectName] || new Set();
      
      // Build set of fields to skip based on relationshipConfig
      const fieldsToSkip = new Set<string>();
      if (relationshipConfig) {
        for (const config of relationshipConfig) {
          if (config.action === 'skip') {
            fieldsToSkip.add(config.fieldName);
          }
        }
      }
      
      // Prepare records: remap relationship IDs and remove internal fields
      const preparedRecords = records.map(record => {
        const prepared: Record<string, any> = {};
        
        for (const [key, value] of Object.entries(record)) {
          // Skip internal tracking fields
          if (key === '_originalId' || key === '_tempId') {
            continue;
          }
          
          // Skip compound/read-only fields
          if (compoundReadOnlyFields.has(key) || objectSpecificExclusions.has(key)) {
            continue;
          }
          
          // Skip relationship fields marked as "skip" in config
          if (fieldsToSkip.has(key)) {
            continue;
          }
          
          // Special handling for RecordTypeId - use our RecordType mapping
          // RecordTypes are matched by SObjectType + DeveloperName, not by ID
          if (key === 'RecordTypeId' && value) {
            if (recordTypeMapping.has(value as string)) {
              prepared[key] = recordTypeMapping.get(value as string);
            } else {
              // RecordType not found in target - set to null to use default
              // This is better than passing the source ID which would fail
              prepared[key] = null;
              console.warn(`RecordTypeId ${value} not found in target org, using default`);
            }
          }
          // Check if this is a relationship field that needs remapping
          else if (value && typeof value === 'string' && idMapping.has(value)) {
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

ipcMain.handle('migration:getExternalIdFields', async (_event, objectName: string) => {
  try {
    const connection = salesforceService.getConnection();
    if (!connection) {
      return { success: false, error: 'Not connected to source org' };
    }
    
    const description = await connection.describe(objectName);
    
    // Find fields that are external IDs (idLookup = true, externalId = true) or unique identifiers
    const externalIdFields = description.fields
      .filter((field: any) => 
        field.externalId === true || 
        (field.idLookup === true && field.name !== 'Id') || // Id is idLookup but not useful here
        field.name === 'Name' // Always include Name as a common matching field
      )
      .map((field: any) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        isExternalId: field.externalId === true,
        isUnique: field.unique === true,
      }));
    
    return { success: true, data: externalIdFields };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
