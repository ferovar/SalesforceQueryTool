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
    
    loginOAuth: (isSandbox: boolean) => Promise<{ success: boolean; data?: any; error?: string }>;
    
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
  username: string;
  password: string;
  securityToken: string;
  isSandbox: boolean;
}

export interface SavedLogin {
  username: string;
  isSandbox: boolean;
  lastUsed: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
