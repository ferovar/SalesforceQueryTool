import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnonymousApexModal from '../AnonymousApexModal';

// Mock child components
jest.mock('../ApexHighlighter', () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <div data-testid="apex-highlighter">{code}</div>,
}));

jest.mock('../UserDebuggingTab', () => ({
  __esModule: true,
  default: () => <div data-testid="user-debugging-tab">User Debugging</div>,
}));

const mockExecute = jest.fn();
const mockGetDebugLogs = jest.fn();
const mockGetDebugLogBody = jest.fn();
const mockSaveScript = jest.fn();
const mockGetAllScripts = jest.fn();
const mockGetScript = jest.fn();
const mockDeleteScript = jest.fn();
const mockGetAllHistory = jest.fn();
const mockGetHistory = jest.fn();
const mockClearHistory = jest.fn();
const mockDeleteHistory = jest.fn();

const mockElectronAPI = {
  apex: {
    execute: mockExecute,
    getDebugLogs: mockGetDebugLogs,
    getDebugLogBody: mockGetDebugLogBody,
  },
  apexScripts: {
    save: mockSaveScript,
    getAll: mockGetAllScripts,
    get: mockGetScript,
    delete: mockDeleteScript,
  },
  apexHistory: {
    getAll: mockGetAllHistory,
    get: mockGetHistory,
    clear: mockClearHistory,
    delete: mockDeleteHistory,
  },
};

beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  jest.clearAllMocks();
  mockGetAllScripts.mockResolvedValue([]);
  mockGetAllHistory.mockResolvedValue([]);
});

describe('AnonymousApexModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
  };

  describe('rendering', () => {
    it('should render the modal when isOpen is true', () => {
      render(<AnonymousApexModal {...defaultProps} />);

      expect(screen.getByText('Anonymous Apex')).toBeInTheDocument();
    });

    it('should not render the modal when isOpen is false', () => {
      render(<AnonymousApexModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('Anonymous Apex')).not.toBeInTheDocument();
    });

    it('should render all three tabs', () => {
      render(<AnonymousApexModal {...defaultProps} />);

      expect(screen.getByText('Editor')).toBeInTheDocument();
      expect(screen.getByText('Execution History')).toBeInTheDocument();
      expect(screen.getByText('User Debugging')).toBeInTheDocument();
    });

    it('should show Editor tab by default', () => {
      render(<AnonymousApexModal {...defaultProps} />);

      const editorTab = screen.getByText('Editor').closest('button');
      expect(editorTab).toHaveClass('text-discord-accent');
    });
  });

  describe('tab switching', () => {
    it('should switch to Execution History tab when clicked', async () => {
      const user = userEvent.setup();
      render(<AnonymousApexModal {...defaultProps} />);

      const historyTab = screen.getByText('Execution History');
      await user.click(historyTab);

      expect(historyTab.closest('button')).toHaveClass('text-discord-accent');
    });

    it('should switch to User Debugging tab when clicked', async () => {
      const user = userEvent.setup();
      render(<AnonymousApexModal {...defaultProps} />);

      const debugTab = screen.getByText('User Debugging');
      await user.click(debugTab);

      expect(screen.getByTestId('user-debugging-tab')).toBeInTheDocument();
    });
  });

  describe('script execution', () => {
    it('should execute apex script when Execute button is clicked', async () => {
      const user = userEvent.setup();
      mockExecute.mockResolvedValue({
        success: true,
        data: {
          compiled: true,
          success: true,
          line: -1,
          column: -1,
          compileProblem: null,
          exceptionMessage: null,
          exceptionStackTrace: null,
          debugLog: 'Debug log content',
        },
      });

      render(<AnonymousApexModal {...defaultProps} />);

      // Find and type in the textarea
      const textarea = screen.getByTestId('apex-code-textarea');
      await user.clear(textarea);
      await user.type(textarea, 'System.debug("test");');

      // Click execute
      const executeButton = screen.getByText('Execute');
      
      await waitFor(async () => {
        await user.click(executeButton);
      });

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalledWith(
          'System.debug("test");',
          undefined,
          undefined
        );
      });
    });

    it('should display execution results', async () => {
      const user = userEvent.setup();
      mockExecute.mockResolvedValue({
        success: true,
        data: {
          compiled: true,
          success: true,
          line: -1,
          column: -1,
          compileProblem: null,
          exceptionMessage: null,
          exceptionStackTrace: null,
          debugLog: 'USER_DEBUG|test',
        },
      });

      render(<AnonymousApexModal {...defaultProps} />);

      const textarea = screen.getByTestId('apex-code-textarea');
      await user.type(textarea, 'System.debug("test");');

      const executeButton = screen.getByText('Execute');
      await user.click(executeButton);

      await waitFor(() => {
        expect(screen.getByText('Execution Successful')).toBeInTheDocument();
      });
    });

    it('should display execution errors', async () => {
      const user = userEvent.setup();
      mockExecute.mockResolvedValue({
        success: true,
        data: {
          compiled: false,
          success: false,
          line: 1,
          column: 1,
          compileProblem: 'Unexpected token',
          exceptionMessage: null,
          exceptionStackTrace: null,
          debugLog: null,
        },
      });

      render(<AnonymousApexModal {...defaultProps} />);

      const textarea = screen.getByTestId('apex-code-textarea');
      await user.type(textarea, 'invalid code');

      const executeButton = screen.getByText('Execute');
      await user.click(executeButton);

      await waitFor(() => {
        expect(screen.getByText('Execution Failed')).toBeInTheDocument();
      });
    });
  });

  describe('saved scripts', () => {
    it('should load saved scripts on mount', async () => {
      const savedScripts = [
        {
          id: 'script-1',
          name: 'Test Script',
          script: 'System.debug("test");',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];
      mockGetAllScripts.mockResolvedValue(savedScripts);

      render(<AnonymousApexModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Script')).toBeInTheDocument();
      });
    });

    it('should open save dialog when Save button is clicked', async () => {
      const user = userEvent.setup();
      render(<AnonymousApexModal {...defaultProps} />);

      const textarea = screen.getByTestId('apex-code-textarea');
      await user.type(textarea, 'System.debug("test");');

      const saveButton = screen.getByText('Save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Save Script')).toBeInTheDocument();
      });
    });

    it('should save a script with name', async () => {
      const user = userEvent.setup();
      mockSaveScript.mockResolvedValue({
        success: true,
        data: {
          id: 'new-id',
          name: 'My Script',
          script: 'System.debug("test");',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      });

      render(<AnonymousApexModal {...defaultProps} />);

      const textarea = screen.getByTestId('apex-code-textarea');
      await user.type(textarea, 'System.debug("test");');

      const saveButton = screen.getByText('Save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Script name...')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Script name...');
      await user.type(nameInput, 'My Script');

      const saveDialogButton = screen.getAllByText('Save')[1];
      await user.click(saveDialogButton);

      await waitFor(() => {
        expect(mockSaveScript).toHaveBeenCalledWith('My Script', 'System.debug("test");', undefined);
      });
    });

    it('should load a saved script when clicked', async () => {
      const user = userEvent.setup();
      const savedScripts = [
        {
          id: 'script-1',
          name: 'Test Script',
          script: 'System.debug("loaded");',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];
      mockGetAllScripts.mockResolvedValue(savedScripts);

      render(<AnonymousApexModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Script')).toBeInTheDocument();
      });

      const scriptItem = screen.getByText('Test Script');
      await user.click(scriptItem);

      await waitFor(() => {
        expect(screen.getByTestId('apex-highlighter')).toHaveTextContent('System.debug("loaded");');
      });
    });
  });

  describe('execution history', () => {
    it('should load execution history', async () => {
      const user = userEvent.setup();
      const history = [
        {
          id: 'log-1',
          script: 'System.debug("test");',
          success: true,
          executedAt: '2024-01-01T12:00:00Z',
          scriptName: 'Test Script',
        },
      ];
      mockGetAllHistory.mockResolvedValue(history);

      render(<AnonymousApexModal {...defaultProps} />);

      const historyTab = screen.getByText('Execution History');
      await user.click(historyTab);

      await waitFor(() => {
        expect(screen.getByText('Test Script')).toBeInTheDocument();
      });
    });

    it('should show clear history button when history exists', async () => {
      const user = userEvent.setup();
      const history = [
        {
          id: 'log-1',
          script: 'System.debug("test");',
          success: true,
          executedAt: '2024-01-01T12:00:00Z',
        },
      ];
      mockGetAllHistory.mockResolvedValue(history);

      render(<AnonymousApexModal {...defaultProps} />);

      const historyTab = screen.getByText('Execution History');
      await user.click(historyTab);

      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument();
      });
    });

    it('should show confirmation dialog when clearing history', async () => {
      const user = userEvent.setup();
      const history = [
        {
          id: 'log-1',
          script: 'System.debug("test");',
          success: true,
          executedAt: '2024-01-01T12:00:00Z',
        },
      ];
      mockGetAllHistory.mockResolvedValue(history);

      render(<AnonymousApexModal {...defaultProps} />);

      const historyTab = screen.getByText('Execution History');
      await user.click(historyTab);

      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument();
      });

      const clearButton = screen.getByText('Clear');
      await user.click(clearButton);

      await waitFor(() => {
        expect(screen.getByText('Clear History')).toBeInTheDocument();
        expect(screen.getByText(/Are you sure you want to clear all execution history/)).toBeInTheDocument();
      });
    });

    it('should clear history when confirmed', async () => {
      const user = userEvent.setup();
      const history = [
        {
          id: 'log-1',
          script: 'System.debug("test");',
          success: true,
          executedAt: '2024-01-01T12:00:00Z',
        },
      ];
      mockGetAllHistory.mockResolvedValue(history);
      mockClearHistory.mockResolvedValue({ success: true });

      render(<AnonymousApexModal {...defaultProps} />);

      const historyTab = screen.getByText('Execution History');
      await user.click(historyTab);

      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument();
      });

      const clearButton = screen.getByText('Clear');
      await user.click(clearButton);

      await waitFor(() => {
        expect(screen.getByText('Clear All')).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('Clear All');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockClearHistory).toHaveBeenCalled();
      });
    });
  });

  describe('modal closing', () => {
    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();

      render(<AnonymousApexModal {...defaultProps} onClose={onClose} />);

      const closeButton = screen.getByRole('button', { name: '' }); // X button has no text
      await user.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });
  });
});
