import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { SalesforceService } from './services/salesforce';
import { CredentialsStore } from './services/credentials';
import { QueriesStore } from './services/queries';
import { QueryHistoryStore } from './services/queryHistory';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
const salesforceService = new SalesforceService();
const credentialsStore = new CredentialsStore();
const queriesStore = new QueriesStore();
const queryHistoryStore = new QueryHistoryStore();

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
