import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Salesforce operations
  salesforce: {
    login: (credentials: {
      username: string;
      password: string;
      securityToken: string;
      isSandbox: boolean;
      saveCredentials: boolean;
    }) => ipcRenderer.invoke('salesforce:login', credentials),
    
    loginOAuth: (isSandbox: boolean) => ipcRenderer.invoke('salesforce:loginOAuth', isSandbox),
    
    logout: () => ipcRenderer.invoke('salesforce:logout'),
    
    getObjects: () => ipcRenderer.invoke('salesforce:getObjects'),
    
    describeObject: (objectName: string) => ipcRenderer.invoke('salesforce:describeObject', objectName),
    
    executeQuery: (query: string, includeDeleted: boolean) => 
      ipcRenderer.invoke('salesforce:executeQuery', query, includeDeleted),
    
    exportToCsv: (data: any[], filename: string) => 
      ipcRenderer.invoke('salesforce:exportToCsv', data, filename),
  },

  // Credentials management
  credentials: {
    get: () => ipcRenderer.invoke('credentials:get'),
    clear: () => ipcRenderer.invoke('credentials:clear'),
    getSavedLogins: () => ipcRenderer.invoke('credentials:getSavedLogins'),
    deleteSavedLogin: (username: string) => ipcRenderer.invoke('credentials:deleteSavedLogin', username),
  },
});
