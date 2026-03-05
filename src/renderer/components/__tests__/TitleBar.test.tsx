import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TitleBar from '../TitleBar';

describe('TitleBar', () => {
  const defaultProps = {
    isLoggedIn: false,
    onLogout: jest.fn(),
    onOpenSettings: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the app title', () => {
      render(<TitleBar {...defaultProps} />);
      expect(screen.getByText('Salesforce Studio')).toBeInTheDocument();
    });

    it('should render window control buttons', () => {
      render(<TitleBar {...defaultProps} />);
      expect(screen.getByTitle('Minimize')).toBeInTheDocument();
      expect(screen.getByTitle('Maximize')).toBeInTheDocument();
      expect(screen.getByTitle('Close')).toBeInTheDocument();
    });

    it('should render settings button', () => {
      render(<TitleBar {...defaultProps} />);
      expect(screen.getByTitle('Settings')).toBeInTheDocument();
    });
  });

  describe('window controls', () => {
    it('should call minimizeWindow when minimize is clicked', async () => {
      const user = userEvent.setup();
      render(<TitleBar {...defaultProps} />);

      await user.click(screen.getByTitle('Minimize'));
      expect(window.electronAPI.minimizeWindow).toHaveBeenCalled();
    });

    it('should call maximizeWindow when maximize is clicked', async () => {
      const user = userEvent.setup();
      render(<TitleBar {...defaultProps} />);

      await user.click(screen.getByTitle('Maximize'));
      expect(window.electronAPI.maximizeWindow).toHaveBeenCalled();
    });

    it('should call closeWindow when close is clicked', async () => {
      const user = userEvent.setup();
      render(<TitleBar {...defaultProps} />);

      await user.click(screen.getByTitle('Close'));
      expect(window.electronAPI.closeWindow).toHaveBeenCalled();
    });
  });

  describe('settings button', () => {
    it('should call onOpenSettings when settings is clicked', async () => {
      const user = userEvent.setup();
      const onOpenSettings = jest.fn();
      render(<TitleBar {...defaultProps} onOpenSettings={onOpenSettings} />);

      await user.click(screen.getByTitle('Settings'));
      expect(onOpenSettings).toHaveBeenCalled();
    });
  });

  describe('logged in state', () => {
    it('should show connection info when logged in', () => {
      render(
        <TitleBar
          {...defaultProps}
          isLoggedIn={true}
          instanceUrl="https://myorg.my.salesforce.com"
          username="admin@example.com"
        />
      );

      expect(screen.getByText(/myorg.my.salesforce.com/)).toBeInTheDocument();
      expect(screen.getByText(/admin@example.com/)).toBeInTheDocument();
    });

    it('should show logout button when logged in', () => {
      render(
        <TitleBar
          {...defaultProps}
          isLoggedIn={true}
          instanceUrl="https://myorg.my.salesforce.com"
        />
      );

      expect(screen.getByText('Logout')).toBeInTheDocument();
    });

    it('should call onLogout when logout is clicked', async () => {
      const user = userEvent.setup();
      const onLogout = jest.fn();
      render(
        <TitleBar
          {...defaultProps}
          isLoggedIn={true}
          instanceUrl="https://myorg.my.salesforce.com"
          onLogout={onLogout}
        />
      );

      await user.click(screen.getByText('Logout'));
      expect(onLogout).toHaveBeenCalled();
    });

    it('should not show connection info when logged out', () => {
      render(<TitleBar {...defaultProps} />);

      expect(screen.queryByText('Logout')).not.toBeInTheDocument();
      expect(screen.queryByText(/Connected to/)).not.toBeInTheDocument();
    });
  });

  describe('theme color', () => {
    it('should apply theme color when provided and logged in', () => {
      const { container } = render(
        <TitleBar
          {...defaultProps}
          isLoggedIn={true}
          instanceUrl="https://myorg.my.salesforce.com"
          themeColor="#ff0000"
        />
      );

      const titleBar = container.firstElementChild as HTMLElement;
      expect(titleBar.style.backgroundColor).toBe('rgb(255, 0, 0)');
    });

    it('should detect sandbox from URL', () => {
      render(
        <TitleBar
          {...defaultProps}
          isLoggedIn={true}
          instanceUrl="https://myorg--sandbox.my.salesforce.com"
          themeColor="#ff0000"
        />
      );

      expect(screen.getByText('Sandbox')).toBeInTheDocument();
    });

    it('should show Org badge for non-sandbox URLs', () => {
      render(
        <TitleBar
          {...defaultProps}
          isLoggedIn={true}
          instanceUrl="https://myorg.my.salesforce.com"
          themeColor="#ff0000"
        />
      );

      expect(screen.getByText('Org')).toBeInTheDocument();
    });
  });
});
