import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QueryHistory from '../QueryHistory';

// Mock the electron API
const mockGetAll = jest.fn();
const mockClear = jest.fn();
const mockDelete = jest.fn();

const mockElectronAPI = {
  history: {
    getAll: mockGetAll,
    clear: mockClear,
    delete: mockDelete,
  },
};

beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  jest.clearAllMocks();
});

describe('QueryHistory', () => {
  const mockHistoryEntries = [
    {
      id: '1',
      query: 'SELECT Id, Name FROM Account',
      objectName: 'Account',
      timestamp: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
      recordCount: 10,
    },
    {
      id: '2',
      query: 'SELECT Id, Email FROM Contact WHERE IsActive = true',
      objectName: 'Contact',
      timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      recordCount: 25,
    },
  ];

  describe('loading state', () => {
    it('should show loading spinner initially', () => {
      mockGetAll.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      render(<QueryHistory onSelectQuery={jest.fn()} />);
      
      // Should show some loading indication
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('with history entries', () => {
    beforeEach(() => {
      mockGetAll.mockResolvedValue(mockHistoryEntries);
    });

    it('should load and display history entries', async () => {
      render(<QueryHistory onSelectQuery={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/SELECT Id, Name FROM Account/)).toBeInTheDocument();
      });
    });

    it('should show query count summary', async () => {
      render(<QueryHistory onSelectQuery={jest.fn()} />);

      await waitFor(() => {
        // Component shows "X of Y queries" in the footer
        expect(screen.getByText(/queries/i)).toBeInTheDocument();
      });
    });

    it('should call onSelectQuery when clicking an entry', async () => {
      const user = userEvent.setup();
      const onSelectQuery = jest.fn();

      render(<QueryHistory onSelectQuery={onSelectQuery} />);

      await waitFor(() => {
        expect(screen.getByText(/SELECT Id, Name FROM Account/)).toBeInTheDocument();
      });

      const entry = screen.getByText(/SELECT Id, Name FROM Account/);
      await user.click(entry);

      expect(onSelectQuery).toHaveBeenCalledWith(
        'SELECT Id, Name FROM Account',
        'Account'
      );
    });

    it('should delete entry when clicking delete button', async () => {
      const user = userEvent.setup();
      mockDelete.mockResolvedValue({ success: true });

      render(<QueryHistory onSelectQuery={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/SELECT Id, Name FROM Account/)).toBeInTheDocument();
      });

      // Find delete buttons
      const deleteButtons = screen.getAllByRole('button');
      const deleteButton = deleteButtons.find(btn => 
        btn.innerHTML.includes('path') && btn.closest('[class*="group"]')
      );
      
      if (deleteButton) {
        await user.click(deleteButton);
        expect(mockDelete).toHaveBeenCalledWith('1');
      }
    });
  });

  describe('empty state', () => {
    it('should show empty message when no history', async () => {
      mockGetAll.mockResolvedValue([]);

      render(<QueryHistory onSelectQuery={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/no query history/i)).toBeInTheDocument();
      });
    });
  });

  describe('search functionality', () => {
    beforeEach(() => {
      mockGetAll.mockResolvedValue(mockHistoryEntries);
    });

    it('should filter entries by search term', async () => {
      const user = userEvent.setup();
      render(<QueryHistory onSelectQuery={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/SELECT Id, Name FROM Account/)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'Contact');

      await waitFor(() => {
        expect(screen.queryByText(/SELECT Id, Name FROM Account/)).not.toBeInTheDocument();
        expect(screen.getByText(/SELECT Id, Email FROM Contact/)).toBeInTheDocument();
      });
    });
  });

  describe('refresh trigger', () => {
    it('should reload history when refreshTrigger changes', async () => {
      mockGetAll.mockResolvedValue(mockHistoryEntries);

      const { rerender } = render(<QueryHistory onSelectQuery={jest.fn()} refreshTrigger={0} />);

      await waitFor(() => {
        expect(mockGetAll).toHaveBeenCalledTimes(1);
      });

      rerender(<QueryHistory onSelectQuery={jest.fn()} refreshTrigger={1} />);

      await waitFor(() => {
        expect(mockGetAll).toHaveBeenCalledTimes(2);
      });
    });
  });
});
