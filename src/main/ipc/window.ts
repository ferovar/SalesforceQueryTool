/**
 * Window lifecycle management — splash window and main application window.
 */

import { BrowserWindow, app, ipcMain, session } from 'electron';
import * as path from 'path';

const SPLASH_TIMEOUT_MS = 2000;

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

function isDev(): boolean {
  return !app.isPackaged;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function createSplashWindow(): void {
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

  if (isDev()) {
    splashWindow.loadURL('http://localhost:5173/splash.html');
  } else {
    splashWindow.loadFile(path.join(__dirname, '../renderer/splash.html'));
  }

  splashWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Splash failed to load:', errorCode, errorDescription);
  });
}

function createMainWindow(): void {
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
      preload: path.join(__dirname, '..', 'preload.js'),
      // Content Security Policy
      sandbox: true,
    },
  });

  if (isDev()) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Main window failed to load:', errorCode, errorDescription);
  });

  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow?.show();
    }, SPLASH_TIMEOUT_MS);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Register window-related IPC handlers and start the app lifecycle.
 */
export function initWindowManagement(): void {
  // Window control handlers
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

  // Performance data
  ipcMain.handle('app:getPerformanceData', () => {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      uptime: process.uptime(),
    };
  });

  // App lifecycle
  app.whenReady().then(() => {
    // Set CSP headers for all windows
    session.defaultSession.webRequest.onHeadersReceived((details: any, callback: any) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            isDev()
              ? "default-src 'self' http://localhost:5173; script-src 'self' 'unsafe-inline' http://localhost:5173; style-src 'self' 'unsafe-inline' http://localhost:5173; connect-src 'self' http://localhost:5173 ws://localhost:5173 https://*.salesforce.com https://*.force.com; img-src 'self' data:;"
              : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.salesforce.com https://*.force.com; img-src 'self' data:;",
          ],
        },
      });
    });

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
}
