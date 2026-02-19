import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Performance data
  getPerformanceData: () => ipcRenderer.invoke('app:getPerformanceData'),

  // Salesforce operations
  salesforce: {
    login: (credentials: {
      label: string;
      username: string;
      password: string;
      securityToken: string;
      isSandbox: boolean;
      saveCredentials: boolean;
    }) => ipcRenderer.invoke('salesforce:login', credentials),
    
    loginOAuth: (options: { isSandbox: boolean; saveConnection: boolean; label: string; clientId?: string }) => 
      ipcRenderer.invoke('salesforce:loginOAuth', options),
    
    loginWithSavedOAuth: (id: string) => ipcRenderer.invoke('salesforce:loginWithSavedOAuth', id),
    
    logout: () => ipcRenderer.invoke('salesforce:logout'),
    
    getObjects: () => ipcRenderer.invoke('salesforce:getObjects'),
    
    describeObject: (objectName: string) => ipcRenderer.invoke('salesforce:describeObject', objectName),
    
    executeQuery: (query: string, includeDeleted: boolean) => 
      ipcRenderer.invoke('salesforce:executeQuery', query, includeDeleted),
    
    updateRecord: (objectName: string, recordId: string, fields: Record<string, any>) =>
      ipcRenderer.invoke('salesforce:updateRecord', objectName, recordId, fields),
    
    exportToCsv: (data: any[], filename: string) => 
      ipcRenderer.invoke('salesforce:exportToCsv', data, filename),
  },

  // Anonymous Apex operations
  apex: {
    execute: (script: string, scriptId?: string, scriptName?: string) =>
      ipcRenderer.invoke('apex:execute', script, scriptId, scriptName),
    
    getDebugLogs: (limit?: number) => ipcRenderer.invoke('apex:getDebugLogs', limit),
    
    getDebugLogBody: (logId: string) => ipcRenderer.invoke('apex:getDebugLogBody', logId),
  },

  // Saved Apex scripts
  apexScripts: {
    save: (name: string, script: string, existingId?: string) =>
      ipcRenderer.invoke('apexScripts:save', name, script, existingId),
    
    getAll: () => ipcRenderer.invoke('apexScripts:getAll'),
    
    get: (id: string) => ipcRenderer.invoke('apexScripts:get', id),
    
    delete: (id: string) => ipcRenderer.invoke('apexScripts:delete', id),
  },

  // Apex execution history
  apexHistory: {
    getAll: () => ipcRenderer.invoke('apexHistory:getAll'),
    get: (id: string) => ipcRenderer.invoke('apexHistory:get', id),
    clear: () => ipcRenderer.invoke('apexHistory:clear'),
    delete: (id: string) => ipcRenderer.invoke('apexHistory:delete', id),
  },

  // User debugging
  debug: {
    searchUsers: (searchTerm: string) => ipcRenderer.invoke('debug:searchUsers', searchTerm),
    
    createTraceFlag: (userId: string, durationMinutes: number) =>
      ipcRenderer.invoke('debug:createTraceFlag', userId, durationMinutes),
    
    deleteTraceFlag: (traceFlagId: string) =>
      ipcRenderer.invoke('debug:deleteTraceFlag', traceFlagId),
    
    getActiveTraceFlags: () => ipcRenderer.invoke('debug:getActiveTraceFlags'),
    
    getLogsForUser: (userId: string, sinceTime?: string, limit?: number) =>
      ipcRenderer.invoke('debug:getLogsForUser', userId, sinceTime, limit),
  },

  // Credentials management
  credentials: {
    get: () => ipcRenderer.invoke('credentials:get'),
    clear: () => ipcRenderer.invoke('credentials:clear'),
    getSavedLogins: () => ipcRenderer.invoke('credentials:getSavedLogins'),
    deleteSavedLogin: (username: string) => ipcRenderer.invoke('credentials:deleteSavedLogin', username),
    updateLoginMetadata: (username: string, label: string, color: string) => 
      ipcRenderer.invoke('credentials:updateLoginMetadata', username, label, color),
    getLoginByUsername: (username: string) => ipcRenderer.invoke('credentials:getLoginByUsername', username),
    getSavedOAuthLogins: () => ipcRenderer.invoke('credentials:getSavedOAuthLogins'),
    deleteOAuthLogin: (id: string) => ipcRenderer.invoke('credentials:deleteOAuthLogin', id),
    updateOAuthMetadata: (id: string, label: string, color: string) => 
      ipcRenderer.invoke('credentials:updateOAuthMetadata', id, label, color),
  },

  // Saved queries management
  queries: {
    save: (objectName: string, name: string, query: string) => 
      ipcRenderer.invoke('queries:save', objectName, name, query),
    getForObject: (objectName: string) => ipcRenderer.invoke('queries:getForObject', objectName),
    delete: (queryId: string) => ipcRenderer.invoke('queries:delete', queryId),
    updateLastRun: (queryId: string) => ipcRenderer.invoke('queries:updateLastRun', queryId),
  },

  // Query history management
  history: {
    add: (entry: { query: string; objectName: string; recordCount: number; success: boolean; error?: string }) =>
      ipcRenderer.invoke('history:add', entry),
    getAll: () => ipcRenderer.invoke('history:getAll'),
    clear: () => ipcRenderer.invoke('history:clear'),
    delete: (entryId: string) => ipcRenderer.invoke('history:delete', entryId),
  },

  // Data migration operations
  migration: {
    connectTargetOrg: (options: { isSandbox: boolean; label: string; clientId?: string }) =>
      ipcRenderer.invoke('migration:connectTargetOrg', options),
    
    connectWithSavedOAuth: (savedOAuthId: string) =>
      ipcRenderer.invoke('migration:connectWithSavedOAuth', savedOAuthId),
    connectWithSavedCredentials: (username: string) =>
      ipcRenderer.invoke('migration:connectWithSavedCredentials', username),
    
    getTargetOrgs: () => ipcRenderer.invoke('migration:getTargetOrgs'),
    
    disconnectTargetOrg: (connectionId: string) =>
      ipcRenderer.invoke('migration:disconnectTargetOrg', connectionId),
    
    getRelationships: (objectName: string) =>
      ipcRenderer.invoke('migration:getRelationships', objectName),
    
    analyzeRecords: (params: {
      objectName: string;
      records: Record<string, any>[];
      relationshipConfig: { fieldName: string; action: 'include' | 'skip' | 'matchByExternalId'; referenceTo: string; externalIdField?: string }[];
    }) => ipcRenderer.invoke('migration:analyzeRecords', params),
    
    executeMigration: (params: {
      targetOrgId: string;
      objectOrder: string[];
      recordsByObject: Record<string, Record<string, any>[]>;
      relationshipRemapping: { objectName: string; fieldName: string; originalId: string; recordIndex: number }[];
      relationshipConfig?: { fieldName: string; action: 'include' | 'skip' | 'matchByExternalId'; referenceTo: string; externalIdField?: string }[];
    }) => ipcRenderer.invoke('migration:executeMigration', params),
    
    getChildRelationships: (objectName: string) =>
      ipcRenderer.invoke('migration:getChildRelationships', objectName),
    
    getExternalIdFields: (objectName: string) =>
      ipcRenderer.invoke('migration:getExternalIdFields', objectName),
  },
});
