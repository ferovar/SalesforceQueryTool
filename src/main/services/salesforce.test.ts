import { SalesforceService } from '../services/salesforce';

// Mock jsforce
jest.mock('jsforce', () => {
  const mockConnection = {
    login: jest.fn(),
    logout: jest.fn(),
    query: jest.fn(),
    queryMore: jest.fn(),
    sobject: jest.fn(),
    describe: jest.fn(),
    describeGlobal: jest.fn(),
    accessToken: 'mock-token',
    instanceUrl: 'https://test.salesforce.com',
  };

  return {
    Connection: jest.fn().mockImplementation(() => mockConnection),
    __mockConnection: mockConnection,
  };
});

// Mock electron modules
jest.mock('electron', () => ({
  dialog: {
    showSaveDialog: jest.fn(),
    showOpenDialog: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(),
    showItemInFolder: jest.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn(() => false),
    encryptString: jest.fn((str: string) => Buffer.from(str)),
    decryptString: jest.fn((buf: Buffer) => buf.toString()),
  },
  BrowserWindow: jest.fn(),
}));

// Get the mock connection instance
const jsforce = require('jsforce');
const mockConnection = jsforce.__mockConnection;

describe('SalesforceService', () => {
  let service: SalesforceService;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create a new service instance
    service = new SalesforceService();
  });

  describe('login', () => {
    it('should successfully log in with valid credentials', async () => {
      mockConnection.login.mockResolvedValue({
        id: 'user-123',
        organizationId: 'org-456',
      });

      const result = await service.login(
        'test@example.com',
        'password123',
        'securityToken',
        false
      );

      expect(result).toEqual({
        userId: 'user-123',
        organizationId: 'org-456',
        instanceUrl: 'https://test.salesforce.com',
      });
      expect(mockConnection.login).toHaveBeenCalledWith(
        'test@example.com',
        'password123securityToken'
      );
    });

    it('should throw error on invalid credentials', async () => {
      mockConnection.login.mockRejectedValue(new Error('INVALID_LOGIN'));

      await expect(
        service.login('bad@example.com', 'wrong', 'token', false)
      ).rejects.toThrow('INVALID_LOGIN');
    });
  });

  describe('logout', () => {
    it('should successfully log out', async () => {
      // First login
      mockConnection.login.mockResolvedValue({ id: 'user-123', organizationId: 'org-456' });
      await service.login('test@example.com', 'password', 'token', false);

      mockConnection.logout.mockResolvedValue(undefined);

      await service.logout();

      expect(mockConnection.logout).toHaveBeenCalled();
    });

    it('should not throw error if not connected', async () => {
      // logout should be safe to call even when not connected
      await expect(service.logout()).resolves.not.toThrow();
    });
  });

  describe('executeQuery', () => {
    beforeEach(async () => {
      // Login first
      mockConnection.login.mockResolvedValue({ id: 'user-123', organizationId: 'org-456' });
      await service.login('test@example.com', 'password', 'token', false);
    });

    it('should execute a simple query', async () => {
      mockConnection.query.mockResolvedValue({
        done: true,
        records: [
          { Id: '001', Name: 'Account 1' },
          { Id: '002', Name: 'Account 2' },
        ],
      });

      const results = await service.executeQuery('SELECT Id, Name FROM Account');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ Id: '001', Name: 'Account 1' });
      expect(mockConnection.query).toHaveBeenCalledWith(
        'SELECT Id, Name FROM Account'
      );
    });

    it('should handle pagination', async () => {
      mockConnection.query.mockResolvedValue({
        done: false,
        nextRecordsUrl: '/next-page',
        records: [{ Id: '001', Name: 'Account 1' }],
      });
      mockConnection.queryMore.mockResolvedValue({
        done: true,
        records: [{ Id: '002', Name: 'Account 2' }],
      });

      const results = await service.executeQuery('SELECT Id, Name FROM Account');

      expect(results).toHaveLength(2);
      expect(mockConnection.queryMore).toHaveBeenCalledWith('/next-page');
    });

    it('should use query with scanAll when includeDeleted is true', async () => {
      mockConnection.query.mockResolvedValue({
        done: true,
        records: [{ Id: '001', Name: 'Deleted Account', IsDeleted: true }],
      });

      const results = await service.executeQuery(
        'SELECT Id, Name FROM Account',
        true
      );

      expect(results).toHaveLength(1);
      expect(mockConnection.query).toHaveBeenCalledWith(
        'SELECT Id, Name FROM Account',
        { scanAll: true }
      );
    });

    it('should throw error if not connected', async () => {
      const newService = new SalesforceService();
      
      await expect(
        newService.executeQuery('SELECT Id FROM Account')
      ).rejects.toThrow('Not connected to Salesforce');
    });
  });

  describe('updateRecord', () => {
    let mockSobject: any;

    beforeEach(async () => {
      mockSobject = {
        update: jest.fn(),
      };
      mockConnection.sobject.mockReturnValue(mockSobject);
      mockConnection.login.mockResolvedValue({ id: 'user-123', organizationId: 'org-456' });
      await service.login('test@example.com', 'password', 'token', false);
    });

    it('should successfully update a record', async () => {
      mockSobject.update.mockResolvedValue({
        success: true,
        id: '001abc123',
      });

      const result = await service.updateRecord('Account', '001abc123', {
        Name: 'Updated Account Name',
      });

      expect(result).toEqual({ success: true, id: '001abc123' });
      expect(mockConnection.sobject).toHaveBeenCalledWith('Account');
      expect(mockSobject.update).toHaveBeenCalledWith({
        Id: '001abc123',
        Name: 'Updated Account Name',
      });
    });

    it('should throw error on update failure', async () => {
      mockSobject.update.mockResolvedValue({
        success: false,
        errors: [{ message: 'FIELD_CUSTOM_VALIDATION_EXCEPTION' }],
      });

      await expect(
        service.updateRecord('Account', '001abc123', { Name: 'Bad Name' })
      ).rejects.toThrow('FIELD_CUSTOM_VALIDATION_EXCEPTION');
    });

    it('should throw error if not connected', async () => {
      const newService = new SalesforceService();
      
      await expect(
        newService.updateRecord('Account', '001abc123', { Name: 'Test' })
      ).rejects.toThrow('Not connected to Salesforce');
    });

    it('should handle multiple field updates', async () => {
      mockSobject.update.mockResolvedValue({
        success: true,
        id: '001abc123',
      });

      await service.updateRecord('Account', '001abc123', {
        Name: 'New Name',
        Description: 'New Description',
        Phone: '555-1234',
      });

      expect(mockSobject.update).toHaveBeenCalledWith({
        Id: '001abc123',
        Name: 'New Name',
        Description: 'New Description',
        Phone: '555-1234',
      });
    });

    it('should handle null field values', async () => {
      mockSobject.update.mockResolvedValue({
        success: true,
        id: '001abc123',
      });

      await service.updateRecord('Account', '001abc123', {
        Description: null,
      });

      expect(mockSobject.update).toHaveBeenCalledWith({
        Id: '001abc123',
        Description: null,
      });
    });

    it('should throw generic error when no error messages provided', async () => {
      mockSobject.update.mockResolvedValue({
        success: false,
        errors: [],
      });

      await expect(
        service.updateRecord('Account', '001abc123', { Name: 'Test' })
      ).rejects.toThrow('Update failed');
    });
  });

  describe('isConnected', () => {
    it('should return false when not logged in', () => {
      expect(service.isConnected()).toBe(false);
    });

    it('should return true when logged in', async () => {
      mockConnection.login.mockResolvedValue({ id: 'user-123', organizationId: 'org-456' });
      await service.login('test@example.com', 'password', 'token', false);
      
      expect(service.isConnected()).toBe(true);
    });
  });

  describe('searchUsers', () => {
    beforeEach(async () => {
      mockConnection.login.mockResolvedValue({ id: 'user-123', organizationId: 'org-456' });
      await service.login('test@example.com', 'password', 'token', false);
    });

    it('should search users by name', async () => {
      mockConnection.query.mockResolvedValue({
        done: true,
        records: [
          {
            Id: '005abc123',
            Name: 'John Doe',
            Username: 'john@example.com',
            Email: 'john@example.com',
            IsActive: true,
            Profile: { Name: 'System Administrator' },
          },
        ],
      });

      const results = await service.searchUsers('John');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: '005abc123',
        name: 'John Doe',
        username: 'john@example.com',
        email: 'john@example.com',
        isActive: true,
        profileName: 'System Administrator',
      });
      expect(mockConnection.query).toHaveBeenCalled();
      const queryArg = mockConnection.query.mock.calls[0][0];
      expect(queryArg).toContain("Name LIKE '%John%'");
    });

    it('should search users by email', async () => {
      mockConnection.query.mockResolvedValue({
        done: true,
        records: [
          {
            Id: '005abc123',
            Name: 'John Doe',
            Username: 'john@example.com',
            Email: 'john@example.com',
            IsActive: true,
            Profile: { Name: 'Standard User' },
          },
        ],
      });

      await service.searchUsers('john@example.com');

      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining("Email LIKE '%john@example.com%'")
      );
    });

    it('should return empty array when no users found', async () => {
      mockConnection.query.mockResolvedValue({
        done: true,
        records: [],
      });

      const results = await service.searchUsers('nonexistent');

      expect(results).toHaveLength(0);
    });

    it('should throw error if not connected', async () => {
      const newService = new SalesforceService();

      await expect(newService.searchUsers('test')).rejects.toThrow(
        'Not connected to Salesforce'
      );
    });
  });

  describe('createUserTraceFlag', () => {
    let mockTooling: any;

    beforeEach(async () => {
      mockTooling = {
        query: jest.fn(),
        sobject: jest.fn(),
      };
      mockConnection.tooling = mockTooling;
      mockConnection.login.mockResolvedValue({ id: 'user-123', organizationId: 'org-456' });
      await service.login('test@example.com', 'password', 'token', false);
    });

    it('should create a new trace flag with debug level', async () => {
      // Mock debug level query - not found
      mockTooling.query.mockResolvedValueOnce({
        done: true,
        records: [],
      });

      // Mock debug level creation
      const mockDebugLevelSobject = {
        create: jest.fn().mockResolvedValue({
          success: true,
          id: '7dl123',
        }),
      };
      mockTooling.sobject.mockReturnValueOnce(mockDebugLevelSobject);

      // Mock existing trace flag query
      mockTooling.query.mockResolvedValueOnce({
        done: true,
        records: [],
      });

      // Mock trace flag creation
      const mockTraceFlagSobject = {
        create: jest.fn().mockResolvedValue({
          success: true,
          id: '7tf123',
        }),
      };
      mockTooling.sobject.mockReturnValueOnce(mockTraceFlagSobject);

      const result = await service.createUserTraceFlag('005abc123', 60);

      expect(result.traceFlagId).toBe('7tf123');
      expect(mockDebugLevelSobject.create).toHaveBeenCalledWith({
        DeveloperName: 'SFQueryToolUserDebug',
        MasterLabel: 'SF Query Tool User Debug',
        ApexCode: 'FINEST',
        ApexProfiling: 'INFO',
        Callout: 'INFO',
        Database: 'FINEST',
        System: 'DEBUG',
        Validation: 'INFO',
        Visualforce: 'INFO',
        Workflow: 'INFO',
        Nba: 'INFO',
        Wave: 'INFO',
      });
    });

    it('should reuse existing debug level', async () => {
      // Mock debug level query - found
      mockTooling.query.mockResolvedValueOnce({
        done: true,
        records: [{ Id: '7dl123' }],
      });

      // Mock existing trace flag query
      mockTooling.query.mockResolvedValueOnce({
        done: true,
        records: [],
      });

      // Mock trace flag creation
      const mockTraceFlagSobject = {
        create: jest.fn().mockResolvedValue({
          success: true,
          id: '7tf123',
        }),
      };
      mockTooling.sobject.mockReturnValueOnce(mockTraceFlagSobject);

      await service.createUserTraceFlag('005abc123', 30);

      // Should not try to create debug level
      expect(mockTooling.sobject).toHaveBeenCalledTimes(1); // Only for trace flag
    });

    it('should update existing trace flag', async () => {
      // Mock debug level query
      mockTooling.query.mockResolvedValueOnce({
        done: true,
        records: [{ Id: '7dl123' }],
      });

      // Mock existing trace flag query - found
      mockTooling.query.mockResolvedValueOnce({
        done: true,
        records: [{ Id: '7tf456' }],
      });

      // Mock trace flag update
      const mockTraceFlagSobject = {
        update: jest.fn().mockResolvedValue({
          success: true,
          id: '7tf456',
        }),
      };
      mockTooling.sobject.mockReturnValueOnce(mockTraceFlagSobject);

      const result = await service.createUserTraceFlag('005abc123', 120);

      expect(result.traceFlagId).toBe('7tf456');
      expect(mockTraceFlagSobject.update).toHaveBeenCalled();
    });

    it('should throw error if not connected', async () => {
      const newService = new SalesforceService();

      await expect(
        newService.createUserTraceFlag('005abc123', 60)
      ).rejects.toThrow('Not connected to Salesforce');
    });
  });

  describe('deleteTraceFlag', () => {
    let mockTooling: any;

    beforeEach(async () => {
      mockTooling = {
        sobject: jest.fn(),
      };
      mockConnection.tooling = mockTooling;
      mockConnection.login.mockResolvedValue({ id: 'user-123', organizationId: 'org-456' });
      await service.login('test@example.com', 'password', 'token', false);
    });

    it('should delete a trace flag', async () => {
      const mockTraceFlagSobject = {
        delete: jest.fn().mockResolvedValue({
          success: true,
          id: '7tf123',
        }),
      };
      mockTooling.sobject.mockReturnValue(mockTraceFlagSobject);

      await service.deleteTraceFlag('7tf123');

      expect(mockTraceFlagSobject.delete).toHaveBeenCalledWith('7tf123');
    });

    it('should throw error if not connected', async () => {
      const newService = new SalesforceService();

      await expect(newService.deleteTraceFlag('7tf123')).rejects.toThrow(
        'Not connected to Salesforce'
      );
    });
  });

  describe('getActiveTraceFlags', () => {
    let mockTooling: any;

    beforeEach(async () => {
      mockTooling = {
        query: jest.fn(),
      };
      mockConnection.tooling = mockTooling;
      mockConnection.login.mockResolvedValue({ id: 'user-123', organizationId: 'org-456' });
      await service.login('test@example.com', 'password', 'token', false);
    });

    it('should get active trace flags with user names', async () => {
      // Mock the trace flag query
      mockTooling.query.mockResolvedValueOnce({
        done: true,
        records: [
          {
            Id: '7tf123',
            TracedEntityId: '005abc123',
            LogType: 'USER_DEBUG',
            ExpirationDate: '2024-12-31T23:59:59Z',
            DebugLevel: { DeveloperName: 'SFQueryToolUserDebug' },
          },
        ],
      });

      // Mock the user query
      mockConnection.query.mockResolvedValueOnce({
        done: true,
        records: [
          {
            Id: '005abc123',
            Name: 'John Doe',
          },
        ],
      });

      const results = await service.getActiveTraceFlags();

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: '7tf123',
        tracedEntityId: '005abc123',
        tracedEntityName: 'John Doe',
        logType: 'USER_DEBUG',
        expirationDate: '2024-12-31T23:59:59Z',
        debugLevelName: 'SFQueryToolUserDebug',
      });
    });

    it('should return empty array when no active flags', async () => {
      mockTooling.query.mockResolvedValue({
        done: true,
        records: [],
      });

      const results = await service.getActiveTraceFlags();

      expect(results).toHaveLength(0);
    });

    it('should throw error if not connected', async () => {
      const newService = new SalesforceService();

      await expect(newService.getActiveTraceFlags()).rejects.toThrow(
        'Not connected to Salesforce'
      );
    });
  });

  describe('getDebugLogsForUser', () => {
    let mockTooling: any;

    beforeEach(async () => {
      mockTooling = {
        query: jest.fn(),
      };
      mockConnection.tooling = mockTooling;
      mockConnection.login.mockResolvedValue({ id: 'user-123', organizationId: 'org-456' });
      await service.login('test@example.com', 'password', 'token', false);
    });

    it('should get debug logs for a user', async () => {
      mockTooling.query.mockResolvedValue({
        done: true,
        records: [
          {
            Id: '07L123',
            LogLength: 5000,
            Operation: 'API',
            Status: 'Success',
            DurationMilliseconds: 250,
            StartTime: '2024-01-01T12:00:00Z',
            Request: 'POST /services/apexrest/MyService',
          },
        ],
      });

      const results = await service.getDebugLogsForUser('005abc123');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: '07L123',
        logLength: 5000,
        operation: 'API',
        status: 'Success',
        durationMs: 250,
        startTime: '2024-01-01T12:00:00Z',
        request: 'POST /services/apexrest/MyService',
      });
    });

    it('should filter logs by time range', async () => {
      mockTooling.query.mockResolvedValue({
        done: true,
        records: [],
      });

      const sinceTime = '2024-01-01T12:00:00Z';
      await service.getDebugLogsForUser('005abc123', sinceTime);

      expect(mockTooling.query).toHaveBeenCalledWith(
        expect.stringContaining(`StartTime > ${sinceTime}`)
      );
    });

    it('should return empty array when no logs found', async () => {
      mockTooling.query.mockResolvedValue({
        done: true,
        records: [],
      });

      const results = await service.getDebugLogsForUser('005abc123');

      expect(results).toHaveLength(0);
    });

    it('should throw error if not connected', async () => {
      const newService = new SalesforceService();

      await expect(
        newService.getDebugLogsForUser('005abc123')
      ).rejects.toThrow('Not connected to Salesforce');
    });
  });
});
