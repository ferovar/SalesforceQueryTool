// Main process test setup
// Mock Electron modules
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/path'),
    isPackaged: false,
  },
  dialog: {
    showSaveDialog: jest.fn(),
  },
  shell: {
    showItemInFolder: jest.fn(),
    openExternal: jest.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn(() => false),
    encryptString: jest.fn((str: string) => Buffer.from(str)),
    decryptString: jest.fn((buf: Buffer) => buf.toString()),
  },
  BrowserWindow: jest.fn(),
  ipcMain: {
    handle: jest.fn(),
  },
}));

// Mock electron-store
jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
  }));
});

// Mock jsforce
jest.mock('jsforce', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    login: jest.fn(),
    logout: jest.fn(),
    query: jest.fn(),
    queryMore: jest.fn(),
    sobject: jest.fn(() => ({
      update: jest.fn(),
      describe: jest.fn(),
    })),
    describeGlobal: jest.fn(),
    oauth2: {
      getAuthorizationUrl: jest.fn(),
    },
  })),
}));
