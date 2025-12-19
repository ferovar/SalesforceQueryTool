export interface ElectronAPI {
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  
  salesforce: {
    login: (credentials: {
      username: string;
      password: string;
      securityToken: string;
      isSandbox: boolean;
      saveCredentials: boolean;
    }) => Promise<{ success: boolean; data?: any; error?: string }>;
    
    loginOAuth: (options: { isSandbox: boolean; saveConnection: boolean; label: string; clientId: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
    
    loginWithSavedOAuth: (id: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    
    logout: () => Promise<{ success: boolean; error?: string }>;
    
    getObjects: () => Promise<{ success: boolean; data?: SalesforceObject[]; error?: string }>;
    
    describeObject: (objectName: string) => Promise<{ success: boolean; data?: ObjectDescription; error?: string }>;
    
    executeQuery: (query: string, includeDeleted: boolean) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    
    exportToCsv: (data: any[], filename: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  };
  
  credentials: {
    get: () => Promise<StoredCredentials | null>;
    clear: () => Promise<{ success: boolean }>;
    getSavedLogins: () => Promise<SavedLogin[]>;
    deleteSavedLogin: (username: string) => Promise<{ success: boolean }>;
    getLoginByUsername: (username: string) => Promise<StoredCredentials | null>;
    getSavedOAuthLogins: () => Promise<SavedOAuthLogin[]>;
    deleteOAuthLogin: (id: string) => Promise<{ success: boolean }>;
  };

  queries: {
    save: (objectName: string, name: string, query: string) => Promise<{ success: boolean; data?: SavedQuery; error?: string }>;
    getForObject: (objectName: string) => Promise<SavedQuery[]>;
    delete: (queryId: string) => Promise<{ success: boolean }>;
    updateLastRun: (queryId: string) => Promise<{ success: boolean }>;
  };

  history: {
    add: (entry: { query: string; objectName: string; recordCount: number; success: boolean; error?: string }) => Promise<{ success: boolean; data?: QueryHistoryEntry; error?: string }>;
    getAll: () => Promise<QueryHistoryEntry[]>;
    clear: () => Promise<{ success: boolean }>;
    delete: (entryId: string) => Promise<{ success: boolean }>;
  };
}

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

export interface StoredCredentials {
  label: string;
  username: string;
  password: string;
  securityToken: string;
  isSandbox: boolean;
}

export interface SavedLogin {
  label: string;
  username: string;
  isSandbox: boolean;
  lastUsed: string;
}

export interface SavedOAuthLogin {
  id: string;
  label: string;
  username: string;
  isSandbox: boolean;
  lastUsed: string;
  loginType: 'oauth';
}

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  objectName: string;
  createdAt: string;
  lastRunAt: string | null;
}

export interface QueryHistoryEntry {
  id: string;
  query: string;
  objectName: string;
  executedAt: string;
  recordCount: number;
  success: boolean;
  error?: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
