// Renderer process test setup
import '@testing-library/jest-dom';

// Suppress React act() warnings and other test-related console noise
const originalError = console.error;
const originalWarn = console.warn;

// Override immediately, not in beforeAll
console.error = (...args: any[]) => {
  const message = args[0];
  if (
    typeof message === 'string' &&
    (message.includes('Warning: An update to') ||
     message.includes('inside a test was not wrapped in act') ||
     message.includes('Not implemented: HTMLFormElement.prototype.submit'))
  ) {
    return;
  }
  originalError.call(console, ...args);
};

console.warn = (...args: any[]) => {
  const message = args[0];
  if (typeof message === 'string' && message.includes('act(')) {
    return;
  }
  originalWarn.call(console, ...args);
};

// Mock window.electronAPI
const mockElectronAPI = {
  minimizeWindow: jest.fn(),
  maximizeWindow: jest.fn(),
  closeWindow: jest.fn(),
  isMaximized: jest.fn(() => Promise.resolve(false)),
  
  salesforce: {
    login: jest.fn(() => Promise.resolve({ success: true, data: { userId: 'test-user' } })),
    loginOAuth: jest.fn(() => Promise.resolve({ success: true })),
    loginWithSavedOAuth: jest.fn(() => Promise.resolve({ success: true })),
    logout: jest.fn(() => Promise.resolve({ success: true })),
    getObjects: jest.fn(() => Promise.resolve({ success: true, data: [] })),
    describeObject: jest.fn(() => Promise.resolve({ success: true, data: null })),
    executeQuery: jest.fn(() => Promise.resolve({ success: true, data: [] })),
    updateRecord: jest.fn(() => Promise.resolve({ success: true, data: { success: true, id: 'test-id' } })),
    exportToCsv: jest.fn(() => Promise.resolve({ success: true, data: '/path/to/file.csv' })),
  },
  
  credentials: {
    get: jest.fn(() => Promise.resolve(null)),
    clear: jest.fn(() => Promise.resolve({ success: true })),
    getSavedLogins: jest.fn(() => Promise.resolve([])),
    deleteSavedLogin: jest.fn(() => Promise.resolve({ success: true })),
    getLoginByUsername: jest.fn(() => Promise.resolve(null)),
    getSavedOAuthLogins: jest.fn(() => Promise.resolve([])),
    deleteOAuthLogin: jest.fn(() => Promise.resolve({ success: true })),
  },
  
  queries: {
    save: jest.fn(() => Promise.resolve({ success: true, data: { id: 'query-1' } })),
    getForObject: jest.fn(() => Promise.resolve([])),
    delete: jest.fn(() => Promise.resolve({ success: true })),
    updateLastRun: jest.fn(() => Promise.resolve({ success: true })),
  },
  
  history: {
    add: jest.fn(() => Promise.resolve({ success: true })),
    getAll: jest.fn(() => Promise.resolve([])),
    clear: jest.fn(() => Promise.resolve({ success: true })),
    delete: jest.fn(() => Promise.resolve({ success: true })),
  },

  apex: {
    execute: jest.fn(() => Promise.resolve({ success: true, data: { success: true, compiled: true, debugLog: '' } })),
    getDebugLogs: jest.fn(() => Promise.resolve({ success: true, data: [] })),
    getDebugLogBody: jest.fn(() => Promise.resolve({ success: true, data: '' })),
  },

  apexScripts: {
    save: jest.fn(() => Promise.resolve({ success: true, data: { id: 'script-1', name: 'Test', script: '', createdAt: '', updatedAt: '' } })),
    getAll: jest.fn(() => Promise.resolve([])),
    get: jest.fn(() => Promise.resolve(undefined)),
    delete: jest.fn(() => Promise.resolve({ success: true })),
  },

  apexHistory: {
    getAll: jest.fn(() => Promise.resolve([])),
    get: jest.fn(() => Promise.resolve(undefined)),
    clear: jest.fn(() => Promise.resolve({ success: true })),
    delete: jest.fn(() => Promise.resolve({ success: true })),
  },

  debug: {
    searchUsers: jest.fn(() => Promise.resolve({ success: true, data: [] })),
    createTraceFlag: jest.fn(() => Promise.resolve({ success: true, data: { traceFlagId: 'tf-1', expirationDate: new Date(Date.now() + 3600000).toISOString() } })),
    deleteTraceFlag: jest.fn(() => Promise.resolve({ success: true })),
    getActiveTraceFlags: jest.fn(() => Promise.resolve({ success: true, data: [] })),
    getLogsForUser: jest.fn(() => Promise.resolve({ success: true, data: [] })),
  },

  migration: {
    connectTargetOrg: jest.fn(() => Promise.resolve({ success: true })),
    connectWithSavedOAuth: jest.fn(() => Promise.resolve({ success: true })),
    connectWithSavedCredentials: jest.fn(() => Promise.resolve({ success: true })),
    getTargetOrgs: jest.fn(() => Promise.resolve([])),
    disconnectTargetOrg: jest.fn(() => Promise.resolve({ success: true })),
    getRelationships: jest.fn(() => Promise.resolve({ success: true, data: { relationships: [], defaultConfig: [], excludedFields: [], excludedObjects: [] } })),
    analyzeRecords: jest.fn(() => Promise.resolve({ success: true })),
    executeMigration: jest.fn(() => Promise.resolve({ success: true })),
    getChildRelationships: jest.fn(() => Promise.resolve({ success: true, data: [] })),
    getExternalIdFields: jest.fn(() => Promise.resolve({ success: true, data: [] })),
  },

  getPerformanceData: jest.fn(() => Promise.resolve({ heapUsed: 1000000, heapTotal: 2000000, external: 500000, uptime: 100 })),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Export for use in tests
export { mockElectronAPI };
