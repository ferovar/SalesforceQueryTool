import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../LoginPage';
import { SettingsProvider } from '../../contexts/SettingsContext';

// Mock the canvas-based background components to avoid jsdom canvas issues
jest.mock('../../components/StarfieldBackground', () => {
  return function MockStarfieldBackground() {
    return <div data-testid="starfield-background" />;
  };
});
jest.mock('../../components/NatureBackground', () => ({
  WavesBackground: function MockWavesBackground() {
    return <div data-testid="waves-background" />;
  },
}));

const mockElectronAPI = (window as any).electronAPI;

const renderWithSettings = (ui: React.ReactElement) => {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
};

describe('LoginPage', () => {
  const defaultProps = {
    onLoginSuccess: jest.fn(),
    onOpenSettings: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockElectronAPI.credentials.getSavedLogins.mockResolvedValue([]);
    mockElectronAPI.credentials.getSavedOAuthLogins.mockResolvedValue([]);
  });

  describe('rendering', () => {
    it('should render the login page with environment toggle', () => {
      renderWithSettings(<LoginPage {...defaultProps} />);
      expect(screen.getByText('Production')).toBeInTheDocument();
      expect(screen.getByText('Sandbox')).toBeInTheDocument();
    });

    it('should render OAuth as default login method', () => {
      renderWithSettings(<LoginPage {...defaultProps} />);
      expect(screen.getByText('OAuth')).toBeInTheDocument();
    });

    it('should render the Username & Password login tab', () => {
      renderWithSettings(<LoginPage {...defaultProps} />);
      // Text appears in both the tab and in help text, so use getAllByText
      expect(screen.getAllByText(/Username & Password/).length).toBeGreaterThan(0);
    });

    it('should load saved logins on mount', async () => {
      renderWithSettings(<LoginPage {...defaultProps} />);
      
      await waitFor(() => {
        expect(mockElectronAPI.credentials.getSavedLogins).toHaveBeenCalled();
        expect(mockElectronAPI.credentials.getSavedOAuthLogins).toHaveBeenCalled();
      });
    });
  });

  describe('environment selection', () => {
    it('should switch to sandbox environment', async () => {
      const user = userEvent.setup();
      renderWithSettings(<LoginPage {...defaultProps} />);

      await user.click(screen.getByText('Sandbox'));
      expect(screen.getByText('Sandbox')).toBeInTheDocument();
    });
  });

  describe('credentials login', () => {
    it('should show credential fields when Username & Password tab is selected', async () => {
      const user = userEvent.setup();
      renderWithSettings(<LoginPage {...defaultProps} />);

      // Click on Username & Password tab (first match is the tab)
      await user.click(screen.getAllByText(/Username & Password/)[0]);

      await waitFor(() => {
        expect(screen.getByLabelText('Username')).toBeInTheDocument();
        expect(screen.getByLabelText('Password')).toBeInTheDocument();
      });
    });

    it('should call login API with credentials', async () => {
      const user = userEvent.setup();
      mockElectronAPI.salesforce.login.mockResolvedValue({
        success: true,
        data: { userId: 'user-1', organizationId: 'org-1', instanceUrl: 'https://test.salesforce.com' },
      });

      renderWithSettings(<LoginPage {...defaultProps} />);

      // Switch to credentials tab
      await user.click(screen.getAllByText(/Username & Password/)[0]);

      await waitFor(() => {
        expect(screen.getByLabelText('Username')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('Username'), 'admin@test.com');
      await user.type(screen.getByLabelText('Password'), 'password123');

      // Submit button says "Login"
      const loginButton = screen.getByRole('button', { name: /^Login$/i });
      await user.click(loginButton);

      await waitFor(() => {
        expect(mockElectronAPI.salesforce.login).toHaveBeenCalled();
      });
    });

    it('should show error message on login failure', async () => {
      const user = userEvent.setup();
      mockElectronAPI.salesforce.login.mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      });

      renderWithSettings(<LoginPage {...defaultProps} />);

      // Switch to credentials tab
      await user.click(screen.getAllByText(/Username & Password/)[0]);

      await waitFor(() => {
        expect(screen.getByLabelText('Username')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('Username'), 'admin@test.com');
      await user.type(screen.getByLabelText('Password'), 'password123');

      const loginButton = screen.getByRole('button', { name: /^Login$/i });
      await user.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });

    it('should call onLoginSuccess on successful login', async () => {
      const user = userEvent.setup();
      const onLoginSuccess = jest.fn();
      const sessionData = { userId: 'user-1', organizationId: 'org-1', instanceUrl: 'https://test.salesforce.com' };
      mockElectronAPI.salesforce.login.mockResolvedValue({
        success: true,
        data: sessionData,
      });

      renderWithSettings(<LoginPage {...defaultProps} onLoginSuccess={onLoginSuccess} />);

      // Switch to credentials tab
      await user.click(screen.getAllByText(/Username & Password/)[0]);

      await waitFor(() => {
        expect(screen.getByLabelText('Username')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('Username'), 'admin@test.com');
      await user.type(screen.getByLabelText('Password'), 'password123');

      const loginButton = screen.getByRole('button', { name: /^Login$/i });
      await user.click(loginButton);

      await waitFor(() => {
        expect(onLoginSuccess).toHaveBeenCalledWith(sessionData);
      });
    });
  });

  describe('OAuth login', () => {
    it('should call OAuth login API when Login with Salesforce button is clicked', async () => {
      const user = userEvent.setup();
      mockElectronAPI.salesforce.loginOAuth.mockResolvedValue({
        success: true,
        data: { userId: 'user-1', organizationId: 'org-1', instanceUrl: 'https://test.salesforce.com' },
      });

      renderWithSettings(<LoginPage {...defaultProps} />);

      // OAuth is default, find the "Login with Salesforce" button
      const oauthButton = screen.getByRole('button', { name: /login with salesforce/i });
      await user.click(oauthButton);

      await waitFor(() => {
        expect(mockElectronAPI.salesforce.loginOAuth).toHaveBeenCalled();
      });
    });
  });

  describe('saved logins', () => {
    it('should display saved OAuth logins as connection cards', async () => {
      const savedOAuthLogins = [
        { id: 'oauth-1', label: 'My Org', username: 'admin@myorg.com', isSandbox: false, lastUsed: '2024-01-01', loginType: 'oauth' as const, color: '#5865f2' },
      ];
      mockElectronAPI.credentials.getSavedOAuthLogins.mockResolvedValue(savedOAuthLogins);

      renderWithSettings(<LoginPage {...defaultProps} />);

      // Connection picker should show the saved connection as a card
      await waitFor(() => {
        expect(screen.getByText('My Org')).toBeInTheDocument();
        expect(screen.getByText('admin@myorg.com')).toBeInTheDocument();
      });

      // Should show "New Connection" button
      expect(screen.getByText('New Connection')).toBeInTheDocument();
    });

    it('should login with saved OAuth login when card is clicked', async () => {
      const user = userEvent.setup();
      const savedOAuthLogins = [
        { id: 'oauth-1', label: 'My Org', username: 'admin@myorg.com', isSandbox: false, lastUsed: '2024-01-01', loginType: 'oauth' as const, color: '#5865f2' },
      ];
      mockElectronAPI.credentials.getSavedOAuthLogins.mockResolvedValue(savedOAuthLogins);
      mockElectronAPI.salesforce.loginWithSavedOAuth.mockResolvedValue({
        success: true,
        data: { userId: 'user-1', organizationId: 'org-1', instanceUrl: 'https://myorg.salesforce.com' },
      });

      renderWithSettings(<LoginPage {...defaultProps} />);

      // Wait for the connection card to appear
      await waitFor(() => {
        expect(screen.getByText('My Org')).toBeInTheDocument();
      });

      // Click on the connection card
      await user.click(screen.getByText('My Org'));

      await waitFor(() => {
        expect(mockElectronAPI.salesforce.loginWithSavedOAuth).toHaveBeenCalledWith('oauth-1');
      });
    });
  });
});
