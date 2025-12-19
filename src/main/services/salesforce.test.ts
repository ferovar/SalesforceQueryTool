import { SalesforceService } from '../services/salesforce';

// Mock jsforce
jest.mock('jsforce', () => {
  const mockConnection = {
    login: jest.fn(),
    logout: jest.fn(),
    query: jest.fn(),
    queryAll: jest.fn(),
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

    it('should use queryAll when includeDeleted is true', async () => {
      mockConnection.queryAll.mockResolvedValue({
        done: true,
        records: [{ Id: '001', Name: 'Deleted Account', IsDeleted: true }],
      });

      const results = await service.executeQuery(
        'SELECT Id, Name FROM Account',
        true
      );

      expect(results).toHaveLength(1);
      expect(mockConnection.queryAll).toHaveBeenCalled();
      expect(mockConnection.query).not.toHaveBeenCalled();
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
});
