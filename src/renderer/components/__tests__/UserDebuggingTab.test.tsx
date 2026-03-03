import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserDebuggingTab from '../UserDebuggingTab';

// Get the mock from setup
const mockElectronAPI = (window as any).electronAPI;

describe('UserDebuggingTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('rendering', () => {
    it('should render the user search input', () => {
      render(<UserDebuggingTab />);
      expect(screen.getByPlaceholderText(/search by name/i)).toBeInTheDocument();
    });

    it('should render the select user label', () => {
      render(<UserDebuggingTab />);
      expect(screen.getByText('Select User to Debug')).toBeInTheDocument();
    });

    it('should show initial placeholder when no user selected', () => {
      render(<UserDebuggingTab />);
      expect(screen.getByText(/search and select a user/i)).toBeInTheDocument();
    });
  });

  describe('user search', () => {
    it('should call searchUsers API after typing', async () => {
      jest.useRealTimers();
      const user = userEvent.setup();
      
      const mockUsers = [
        { id: 'user-1', name: 'John Doe', username: 'john@example.com', email: 'john@test.com', isActive: true, profileName: 'System Administrator' },
      ];
      mockElectronAPI.debug.searchUsers.mockResolvedValue({ success: true, data: mockUsers });

      render(<UserDebuggingTab />);

      const searchInput = screen.getByPlaceholderText(/search by name/i);
      await user.type(searchInput, 'John');

      await waitFor(() => {
        expect(mockElectronAPI.debug.searchUsers).toHaveBeenCalledWith('John');
      }, { timeout: 2000 });
    });

    it('should not search with less than 2 characters', async () => {
      jest.useRealTimers();
      const user = userEvent.setup();

      render(<UserDebuggingTab />);

      const searchInput = screen.getByPlaceholderText(/search by name/i);
      await user.type(searchInput, 'J');

      // Wait a bit and verify no API call
      await new Promise(r => setTimeout(r, 500));
      expect(mockElectronAPI.debug.searchUsers).not.toHaveBeenCalled();
    });

    it('should display search results', async () => {
      jest.useRealTimers();
      const user = userEvent.setup();
      
      const mockUsers = [
        { id: 'user-1', name: 'John Doe', username: 'john@example.com', email: 'john@test.com', isActive: true, profileName: 'System Administrator' },
        { id: 'user-2', name: 'Jane Smith', username: 'jane@example.com', email: 'jane@test.com', isActive: true, profileName: 'Standard User' },
      ];
      mockElectronAPI.debug.searchUsers.mockResolvedValue({ success: true, data: mockUsers });

      render(<UserDebuggingTab />);

      const searchInput = screen.getByPlaceholderText(/search by name/i);
      await user.type(searchInput, 'Jo');

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });

  describe('user selection', () => {
    it('should show selected user card after selecting', async () => {
      jest.useRealTimers();
      const user = userEvent.setup();
      
      const mockUsers = [
        { id: 'user-1', name: 'John Doe', username: 'john@example.com', email: 'john@test.com', isActive: true, profileName: 'System Administrator' },
      ];
      mockElectronAPI.debug.searchUsers.mockResolvedValue({ success: true, data: mockUsers });
      mockElectronAPI.debug.getActiveTraceFlags.mockResolvedValue({ success: true, data: [] });

      render(<UserDebuggingTab />);

      const searchInput = screen.getByPlaceholderText(/search by name/i);
      await user.type(searchInput, 'John');

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      }, { timeout: 2000 });

      await user.click(screen.getByText('John Doe'));

      await waitFor(() => {
        expect(screen.getByText('Debug Duration')).toBeInTheDocument();
        expect(screen.getByText('Start Debugging')).toBeInTheDocument();
      });
    });

    it('should show debug duration selector after user selected', async () => {
      jest.useRealTimers();
      const user = userEvent.setup();
      
      const mockUsers = [
        { id: 'user-1', name: 'John Doe', username: 'john@example.com', email: 'john@test.com', isActive: true, profileName: 'System Administrator' },
      ];
      mockElectronAPI.debug.searchUsers.mockResolvedValue({ success: true, data: mockUsers });
      mockElectronAPI.debug.getActiveTraceFlags.mockResolvedValue({ success: true, data: [] });

      render(<UserDebuggingTab />);

      const searchInput = screen.getByPlaceholderText(/search by name/i);
      await user.type(searchInput, 'John');

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      }, { timeout: 2000 });

      await user.click(screen.getByText('John Doe'));

      await waitFor(() => {
        expect(screen.getByText('Debug Duration')).toBeInTheDocument();
        // Should have duration options
        expect(screen.getByDisplayValue('30 minutes')).toBeInTheDocument();
      });
    });
  });

  describe('debugging controls', () => {
    const setupWithUser = async () => {
      jest.useRealTimers();
      const user = userEvent.setup();
      
      const mockUsers = [
        { id: 'user-1', name: 'John Doe', username: 'john@example.com', email: 'john@test.com', isActive: true, profileName: 'System Administrator' },
      ];
      mockElectronAPI.debug.searchUsers.mockResolvedValue({ success: true, data: mockUsers });
      mockElectronAPI.debug.getActiveTraceFlags.mockResolvedValue({ success: true, data: [] });

      render(<UserDebuggingTab />);

      const searchInput = screen.getByPlaceholderText(/search by name/i);
      await user.type(searchInput, 'John');

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      }, { timeout: 2000 });

      await user.click(screen.getByText('John Doe'));

      await waitFor(() => {
        expect(screen.getByText('Start Debugging')).toBeInTheDocument();
      });

      return user;
    };

    it('should call createTraceFlag when Start Debugging is clicked', async () => {
      const user = await setupWithUser();
      
      mockElectronAPI.debug.createTraceFlag.mockResolvedValue({
        success: true,
        data: { traceFlagId: 'tf-1', expirationDate: new Date(Date.now() + 1800000).toISOString() },
      });

      await user.click(screen.getByText('Start Debugging'));

      await waitFor(() => {
        expect(mockElectronAPI.debug.createTraceFlag).toHaveBeenCalledWith('user-1', 30);
      });
    });

    it('should show Stop Debugging button after starting', async () => {
      const user = await setupWithUser();
      
      mockElectronAPI.debug.createTraceFlag.mockResolvedValue({
        success: true,
        data: { traceFlagId: 'tf-1', expirationDate: new Date(Date.now() + 1800000).toISOString() },
      });
      mockElectronAPI.debug.getLogsForUser.mockResolvedValue({ success: true, data: [] });

      await user.click(screen.getByText('Start Debugging'));

      await waitFor(() => {
        expect(screen.getByText('Stop Debugging')).toBeInTheDocument();
      });
    });

    it('should show monitoring active status after starting', async () => {
      const user = await setupWithUser();
      
      mockElectronAPI.debug.createTraceFlag.mockResolvedValue({
        success: true,
        data: { traceFlagId: 'tf-1', expirationDate: new Date(Date.now() + 1800000).toISOString() },
      });
      mockElectronAPI.debug.getLogsForUser.mockResolvedValue({ success: true, data: [] });

      await user.click(screen.getByText('Start Debugging'));

      await waitFor(() => {
        expect(screen.getByText('Monitoring Active')).toBeInTheDocument();
      });
    });
  });

  describe('empty states', () => {
    it('should show "No logs yet" when no logs and not monitoring', async () => {
      jest.useRealTimers();
      const user = userEvent.setup();
      
      const mockUsers = [
        { id: 'user-1', name: 'John Doe', username: 'john@example.com', email: 'john@test.com', isActive: true, profileName: 'System Administrator' },
      ];
      mockElectronAPI.debug.searchUsers.mockResolvedValue({ success: true, data: mockUsers });
      mockElectronAPI.debug.getActiveTraceFlags.mockResolvedValue({ success: true, data: [] });

      render(<UserDebuggingTab />);

      const searchInput = screen.getByPlaceholderText(/search by name/i);
      await user.type(searchInput, 'John');

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      }, { timeout: 2000 });

      await user.click(screen.getByText('John Doe'));

      await waitFor(() => {
        expect(screen.getByText('No logs yet')).toBeInTheDocument();
      });
    });
  });
});
