import { ApexScriptsStore } from '../apexScripts';
import Store from 'electron-store';

jest.mock('electron-store');

describe('ApexScriptsStore', () => {
  let store: ApexScriptsStore;
  let mockStoreInstance: any;

  beforeEach(() => {
    mockStoreInstance = {
      get: jest.fn(),
      set: jest.fn(),
    };
    (Store as jest.MockedClass<typeof Store>).mockImplementation(() => mockStoreInstance);
    store = new ApexScriptsStore();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveScript', () => {
    it('should save a new script', () => {
      mockStoreInstance.get.mockReturnValue([]);

      const result = store.saveScript('Test Script', 'System.debug("Hello");');

      expect(result).toMatchObject({
        name: 'Test Script',
        script: 'System.debug("Hello");',
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(mockStoreInstance.set).toHaveBeenCalled();
    });

    it('should update an existing script', () => {
      const existingScript = {
        id: 'test-id',
        name: 'Old Name',
        script: 'Old Script',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      mockStoreInstance.get.mockReturnValue([existingScript]);

      const result = store.saveScript('New Name', 'New Script', 'test-id');

      expect(result).toMatchObject({
        id: 'test-id',
        name: 'New Name',
        script: 'New Script',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      expect(result.updatedAt).not.toBe(existingScript.updatedAt);
      expect(mockStoreInstance.set).toHaveBeenCalled();
    });
  });

  describe('getScripts', () => {
    it('should return all scripts', () => {
      const scripts = [
        { id: '1', name: 'Script 1', script: 'code1', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        { id: '2', name: 'Script 2', script: 'code2', createdAt: '2024-01-02', updatedAt: '2024-01-02' },
      ];
      mockStoreInstance.get.mockReturnValue(scripts);

      const result = store.getScripts();

      expect(result).toEqual(scripts);
      expect(mockStoreInstance.get).toHaveBeenCalledWith('scripts');
    });

    it('should return empty array when no scripts exist', () => {
      mockStoreInstance.get.mockReturnValue([]);

      const result = store.getScripts();

      expect(result).toEqual([]);
    });
  });

  describe('getScript', () => {
    it('should return a specific script by id', () => {
      const scripts = [
        { id: '1', name: 'Script 1', script: 'code1', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        { id: '2', name: 'Script 2', script: 'code2', createdAt: '2024-01-02', updatedAt: '2024-01-02' },
      ];
      mockStoreInstance.get.mockReturnValue(scripts);

      const result = store.getScript('2');

      expect(result).toEqual(scripts[1]);
    });

    it('should return undefined for non-existent script', () => {
      mockStoreInstance.get.mockReturnValue([]);

      const result = store.getScript('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('deleteScript', () => {
    it('should delete a script by id', () => {
      const scripts = [
        { id: '1', name: 'Script 1', script: 'code1', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        { id: '2', name: 'Script 2', script: 'code2', createdAt: '2024-01-02', updatedAt: '2024-01-02' },
      ];
      mockStoreInstance.get.mockReturnValue(scripts);

      store.deleteScript('1');

      expect(mockStoreInstance.set).toHaveBeenCalledWith('scripts', [scripts[1]]);
    });
  });

  describe('updateScriptLastRun', () => {
    it('should update last run information for a script', () => {
      const script = {
        id: 'test-id',
        name: 'Test Script',
        script: 'code',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      mockStoreInstance.get.mockReturnValue([script]);

      store.updateLastRun('test-id', true);

      expect(mockStoreInstance.set).toHaveBeenCalledWith(
        'scripts',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'test-id',
            lastRunSuccess: true,
            lastRunAt: expect.any(String),
          }),
        ])
      );
    });
  });

  describe('addExecutionLog', () => {
    it('should add an execution log', () => {
      mockStoreInstance.get.mockReturnValue([]);

      const result = store.addExecutionLog({
        script: 'System.debug("test");',
        success: true,
        compileProblem: undefined,
        exceptionMessage: undefined,
        debugLog: 'Debug log content',
        scriptId: 'script-id',
        scriptName: 'Test Script',
      });

      expect(result).toMatchObject({
        script: 'System.debug("test");',
        success: true,
        scriptName: 'Test Script',
      });
      expect(result.id).toBeDefined();
      expect(result.executedAt).toBeDefined();
      expect(mockStoreInstance.set).toHaveBeenCalled();
    });

    it('should maintain maximum history limit', () => {
      const existingLogs = Array(100).fill(null).map((_, i) => ({
        id: `log-${i}`,
        script: 'test',
        success: true,
        executedAt: '2024-01-01',
      }));
      mockStoreInstance.get.mockReturnValue(existingLogs);

      store.addExecutionLog({
        script: 'new script',
        success: true,
        compileProblem: undefined,
        exceptionMessage: undefined,
        debugLog: undefined,
      });

      const setCall = mockStoreInstance.set.mock.calls[0];
      expect(setCall[1]).toHaveLength(100); // Should still be 100
    });
  });

  describe('getExecutionHistory', () => {
    it('should return execution history', () => {
      const logs = [
        { id: '1', script: 'code1', success: true, executedAt: '2024-01-01' },
        { id: '2', script: 'code2', success: false, executedAt: '2024-01-02' },
      ];
      mockStoreInstance.get.mockReturnValue(logs);

      const result = store.getExecutionHistory();

      expect(result).toEqual(logs);
      expect(mockStoreInstance.get).toHaveBeenCalledWith('executionHistory');
    });
  });

  describe('clearExecutionHistory', () => {
    it('should clear all execution history', () => {
      store.clearExecutionHistory();

      expect(mockStoreInstance.set).toHaveBeenCalledWith('executionHistory', []);
    });
  });

  describe('deleteExecutionLog', () => {
    it('should delete a specific execution log', () => {
      const logs = [
        { id: '1', script: 'code1', success: true, executedAt: '2024-01-01' },
        { id: '2', script: 'code2', success: false, executedAt: '2024-01-02' },
      ];
      mockStoreInstance.get.mockReturnValue(logs);

      store.deleteExecutionLog('1');

      expect(mockStoreInstance.set).toHaveBeenCalledWith('executionHistory', [logs[1]]);
    });
  });
});
