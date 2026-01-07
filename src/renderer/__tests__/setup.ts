// Renderer process test setup
import '@testing-library/jest-dom';

// Suppress React act() warnings and other test-related console noise
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = jest.fn((...args: any[]) => {
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
  });

  console.warn = jest.fn((...args: any[]) => {
    const message = args[0];
    if (typeof message === 'string' && message.includes('act(')) {
      return;
    }
    originalWarn.call(console, ...args);
  });
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

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
