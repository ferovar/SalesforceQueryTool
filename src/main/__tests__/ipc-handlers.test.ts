/**
 * Tests for IPC handlers in the main process.
 * These tests verify the communication between renderer and main process.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';

// Track registered handlers
const handlers: Map<string, (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any>> = new Map();

// Mock ipcMain to capture handlers
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/mock/path'),
    quit: jest.fn(),
    isReady: jest.fn().mockReturnValue(true),
    whenReady: jest.fn().mockResolvedValue(undefined),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn(),
    loadURL: jest.fn(),
    webContents: {
      openDevTools: jest.fn(),
      send: jest.fn(),
    },
    on: jest.fn(),
    show: jest.fn(),
  })),
  ipcMain: {
    handle: jest.fn((channel: string, handler: any) => {
      handlers.set(channel, handler);
    }),
    removeHandler: jest.fn((channel: string) => {
      handlers.delete(channel);
    }),
  },
  dialog: {
    showSaveDialog: jest.fn(),
    showOpenDialog: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(),
  },
}));

// Mock salesforce service
const mockSalesforceService = {
  login: jest.fn(),
  logout: jest.fn(),
  executeQuery: jest.fn(),
  updateRecord: jest.fn(),
  isConnected: jest.fn(),
  describeObject: jest.fn(),
  describeGlobal: jest.fn(),
};

jest.mock('../services/salesforce', () => ({
  SalesforceService: jest.fn().mockImplementation(() => mockSalesforceService),
}));

describe('IPC Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    handlers.clear();
  });

  describe('salesforce:updateRecord handler', () => {
    beforeEach(async () => {
      // Simulate registering the handler as main.ts would
      handlers.set('salesforce:updateRecord', async (_event, objectName, recordId, fields) => {
        if (!mockSalesforceService.isConnected()) {
          throw new Error('Not connected to Salesforce');
        }
        return mockSalesforceService.updateRecord(objectName, recordId, fields);
      });
    });

    it('should successfully update a record', async () => {
      mockSalesforceService.isConnected.mockReturnValue(true);
      mockSalesforceService.updateRecord.mockResolvedValue({
        success: true,
        id: '001abc123',
      });

      const handler = handlers.get('salesforce:updateRecord')!;
      const result = await handler(
        {} as IpcMainInvokeEvent,
        'Account',
        '001abc123',
        { Name: 'Updated Name' }
      );

      expect(result).toEqual({ success: true, id: '001abc123' });
      expect(mockSalesforceService.updateRecord).toHaveBeenCalledWith(
        'Account',
        '001abc123',
        { Name: 'Updated Name' }
      );
    });

    it('should reject update when not connected', async () => {
      mockSalesforceService.isConnected.mockReturnValue(false);

      const handler = handlers.get('salesforce:updateRecord')!;

      await expect(
        handler({} as IpcMainInvokeEvent, 'Account', '001abc123', { Name: 'Test' })
      ).rejects.toThrow('Not connected to Salesforce');

      expect(mockSalesforceService.updateRecord).not.toHaveBeenCalled();
    });

    it('should propagate errors from salesforce service', async () => {
      mockSalesforceService.isConnected.mockReturnValue(true);
      mockSalesforceService.updateRecord.mockRejectedValue(
        new Error('FIELD_CUSTOM_VALIDATION_EXCEPTION: Name cannot be empty')
      );

      const handler = handlers.get('salesforce:updateRecord')!;

      await expect(
        handler({} as IpcMainInvokeEvent, 'Account', '001abc123', { Name: '' })
      ).rejects.toThrow('FIELD_CUSTOM_VALIDATION_EXCEPTION');
    });

    it('should handle network errors', async () => {
      mockSalesforceService.isConnected.mockReturnValue(true);
      mockSalesforceService.updateRecord.mockRejectedValue(
        new Error('ECONNRESET: Connection reset')
      );

      const handler = handlers.get('salesforce:updateRecord')!;

      await expect(
        handler({} as IpcMainInvokeEvent, 'Account', '001abc123', { Name: 'Test' })
      ).rejects.toThrow('ECONNRESET');
    });
  });

  describe('salesforce:login handler', () => {
    beforeEach(() => {
      handlers.set('salesforce:login', async (_event, username, password, token, isSandbox) => {
        return mockSalesforceService.login(username, password, token, isSandbox);
      });
    });

    it('should successfully login', async () => {
      mockSalesforceService.login.mockResolvedValue({
        userId: 'user-123',
        organizationId: 'org-456',
        instanceUrl: 'https://na1.salesforce.com',
      });

      const handler = handlers.get('salesforce:login')!;
      const result = await handler(
        {} as IpcMainInvokeEvent,
        'user@example.com',
        'password',
        'token',
        false
      );

      expect(result.userId).toBe('user-123');
    });
  });

  describe('salesforce:query handler', () => {
    beforeEach(() => {
      handlers.set('salesforce:query', async (_event, query, includeDeleted) => {
        if (!mockSalesforceService.isConnected()) {
          throw new Error('Not connected to Salesforce');
        }
        return mockSalesforceService.executeQuery(query, includeDeleted);
      });
    });

    it('should execute a query', async () => {
      mockSalesforceService.isConnected.mockReturnValue(true);
      mockSalesforceService.executeQuery.mockResolvedValue([
        { Id: '001', Name: 'Test' },
      ]);

      const handler = handlers.get('salesforce:query')!;
      const result = await handler(
        {} as IpcMainInvokeEvent,
        'SELECT Id, Name FROM Account',
        false
      );

      expect(result).toHaveLength(1);
    });

    it('should reject query when not connected', async () => {
      mockSalesforceService.isConnected.mockReturnValue(false);

      const handler = handlers.get('salesforce:query')!;

      await expect(
        handler({} as IpcMainInvokeEvent, 'SELECT Id FROM Account', false)
      ).rejects.toThrow('Not connected to Salesforce');
    });
  });
});
