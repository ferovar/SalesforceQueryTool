import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MainPage from '../MainPage';
import { SettingsProvider } from '../../contexts/SettingsContext';
import type { UserSession } from '../../App';

// Mock canvas-based background components to avoid jsdom canvas issues
jest.mock('../../components/AmbientStarfield', () => {
  return function MockAmbientStarfield() {
    return <div data-testid="ambient-starfield" />;
  };
});
jest.mock('../../components/AmbientWaves', () => {
  return function MockAmbientWaves() {
    return <div data-testid="ambient-waves" />;
  };
});

const mockElectronAPI = (window as any).electronAPI;

// Mock localStorage for ObjectList's recent objects
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const renderWithSettings = (ui: React.ReactElement) => {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
};

const mockSession: UserSession = {
  userId: 'user-1',
  organizationId: 'org-1',
  instanceUrl: 'https://myorg.my.salesforce.com',
  username: 'admin@test.com',
};

const mockObjects = [
  { name: 'Account', label: 'Account', labelPlural: 'Accounts', keyPrefix: '001', custom: false, queryable: true },
  { name: 'Contact', label: 'Contact', labelPlural: 'Contacts', keyPrefix: '003', custom: false, queryable: true },
];

const mockObjectDescription = {
  name: 'Account',
  label: 'Account',
  fields: [
    { name: 'Id', label: 'Account ID', type: 'id', length: 18, referenceTo: [], relationshipName: null, nillable: false, createable: false, updateable: false, custom: false },
    { name: 'Name', label: 'Account Name', type: 'string', length: 255, referenceTo: [], relationshipName: null, nillable: false, createable: true, updateable: true, custom: false },
  ],
  childRelationships: [],
};

describe('MainPage', () => {
  const defaultProps = {
    session: mockSession,
    onOpenSettings: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    // Seed recent objects so they appear in sidebar
    localStorageMock.setItem('salesforce-query-tool-recent-objects', JSON.stringify(['Account', 'Contact']));
    mockElectronAPI.salesforce.getObjects.mockResolvedValue({ success: true, data: mockObjects });
    mockElectronAPI.salesforce.describeObject.mockResolvedValue({ success: true, data: mockObjectDescription });
    mockElectronAPI.salesforce.executeQuery.mockResolvedValue({ success: true, data: [] });
    mockElectronAPI.history.getAll.mockResolvedValue([]);
    mockElectronAPI.queries.getForObject.mockResolvedValue([]);
  });

  describe('rendering', () => {
    it('should render the main page layout', async () => {
      renderWithSettings(<MainPage {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Objects')).toBeInTheDocument();
      });
    });

    it('should load objects on mount', async () => {
      renderWithSettings(<MainPage {...defaultProps} />);

      await waitFor(() => {
        expect(mockElectronAPI.salesforce.getObjects).toHaveBeenCalled();
      });
    });

    it('should display objects in the sidebar', async () => {
      renderWithSettings(<MainPage {...defaultProps} />);

      await waitFor(() => {
        // Account label and API name are both "Account", so use getAllByText
        expect(screen.getAllByText('Account').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Contact').length).toBeGreaterThan(0);
      });
    });

    it('should show placeholder when no object is selected', async () => {
      renderWithSettings(<MainPage {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Paste a Query or Select an Object/)).toBeInTheDocument();
      });
    });

    it('should render the Apex button', async () => {
      renderWithSettings(<MainPage {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Apex')).toBeInTheDocument();
      });
    });

    it('should render the history toggle', async () => {
      renderWithSettings(<MainPage {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTitle(/History/i)).toBeInTheDocument();
      });
    });
  });

  describe('object selection', () => {
    it('should describe object when selected', async () => {
      const user = userEvent.setup();
      renderWithSettings(<MainPage {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getAllByText('Account').length).toBeGreaterThan(0);
      });

      await user.click(screen.getAllByText('Account')[0]);

      await waitFor(() => {
        expect(mockElectronAPI.salesforce.describeObject).toHaveBeenCalledWith('Account');
      });
    });

    it('should generate default query when object is selected', async () => {
      const user = userEvent.setup();
      renderWithSettings(<MainPage {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getAllByText('Account').length).toBeGreaterThan(0);
      });

      await user.click(screen.getAllByText('Account')[0]);

      await waitFor(() => {
        // Query text should appear in the textarea
        const textarea = screen.getByPlaceholderText(/SELECT Id, Name FROM Account/);
        expect((textarea as HTMLTextAreaElement).value).toContain('Account');
      });
    });
  });

  describe('query execution', () => {
    it('should execute query and display results', async () => {
      const user = userEvent.setup();
      const queryResults = [
        { Id: '001ABC', Name: 'Test Account', attributes: { type: 'Account' } },
      ];
      mockElectronAPI.salesforce.executeQuery.mockResolvedValue({ success: true, data: queryResults });

      renderWithSettings(<MainPage {...defaultProps} />);

      // Select an object first
      await waitFor(() => {
        expect(screen.getAllByText('Account').length).toBeGreaterThan(0);
      });

      await user.click(screen.getAllByText('Account')[0]);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run query/i })).toBeInTheDocument();
      });

      // Click run query
      await user.click(screen.getByRole('button', { name: /run query/i }));

      await waitFor(() => {
        expect(mockElectronAPI.salesforce.executeQuery).toHaveBeenCalled();
      });
    });

    it('should show error when query fails', async () => {
      const user = userEvent.setup();
      mockElectronAPI.salesforce.executeQuery.mockResolvedValue({
        success: false,
        error: 'MALFORMED_QUERY: unexpected token',
      });

      renderWithSettings(<MainPage {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getAllByText('Account').length).toBeGreaterThan(0);
      });

      await user.click(screen.getAllByText('Account')[0]);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run query/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /run query/i }));

      await waitFor(() => {
        expect(screen.getByText(/MALFORMED_QUERY/)).toBeInTheDocument();
      });
    });
  });

  describe('settings button', () => {
    it('should call onOpenSettings when settings button is clicked', async () => {
      const user = userEvent.setup();
      const onOpenSettings = jest.fn();
      renderWithSettings(<MainPage {...defaultProps} onOpenSettings={onOpenSettings} />);

      await waitFor(() => {
        expect(screen.getByTitle('Settings')).toBeInTheDocument();
      });

      await user.click(screen.getByTitle('Settings'));
      expect(onOpenSettings).toHaveBeenCalled();
    });
  });

  describe('history panel', () => {
    it('should toggle history panel visibility', async () => {
      const user = userEvent.setup();
      renderWithSettings(<MainPage {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTitle(/History/)).toBeInTheDocument();
      });

      // Click to hide history
      await user.click(screen.getByTitle(/Hide History/));

      // Click again to show
      await waitFor(() => {
        expect(screen.getByTitle(/Show History/)).toBeInTheDocument();
      });
    });
  });
});
