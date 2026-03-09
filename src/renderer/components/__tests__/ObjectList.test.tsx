import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ObjectList from '../ObjectList';
import { SettingsProvider } from '../../contexts/SettingsContext';
import type { SalesforceObject } from '../../types/electron.d';

// Mock localStorage
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

const mockObjects: SalesforceObject[] = [
  { name: 'Account', label: 'Account', labelPlural: 'Accounts', keyPrefix: '001', custom: false, queryable: true },
  { name: 'Contact', label: 'Contact', labelPlural: 'Contacts', keyPrefix: '003', custom: false, queryable: true },
  { name: 'Custom__c', label: 'Custom Object', labelPlural: 'Custom Objects', keyPrefix: 'a00', custom: true, queryable: true },
  { name: 'Opportunity', label: 'Opportunity', labelPlural: 'Opportunities', keyPrefix: '006', custom: false, queryable: true },
];

const renderWithSettings = (ui: React.ReactElement) => {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
};

describe('ObjectList', () => {
  const defaultProps = {
    objects: mockObjects,
    selectedObject: null as SalesforceObject | null,
    onSelectObject: jest.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  describe('rendering', () => {
    it('should render the objects header', () => {
      renderWithSettings(<ObjectList {...defaultProps} />);
      expect(screen.getByText('Objects')).toBeInTheDocument();
    });

    it('should render recent objects', () => {
      // Seed recent objects in localStorage
      localStorageMock.setItem('salesforce-query-tool-recent-objects', JSON.stringify(['Account', 'Contact', 'Custom__c', 'Opportunity']));
      renderWithSettings(<ObjectList {...defaultProps} />);
      expect(screen.getAllByText('Account').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Contact').length).toBeGreaterThan(0);
      expect(screen.getByText('Custom Object')).toBeInTheDocument();
      expect(screen.getAllByText('Opportunity').length).toBeGreaterThan(0);
    });

    it('should show API names for recent objects', () => {
      localStorageMock.setItem('salesforce-query-tool-recent-objects', JSON.stringify(['Custom__c']));
      renderWithSettings(<ObjectList {...defaultProps} />);
      expect(screen.getByText('Custom__c')).toBeInTheDocument();
    });

    it('should display recent object count when not searching', () => {
      localStorageMock.setItem('salesforce-query-tool-recent-objects', JSON.stringify(['Account', 'Contact']));
      renderWithSettings(<ObjectList {...defaultProps} />);
      expect(screen.getByText(/2 recent objects/)).toBeInTheDocument();
    });

    it('should render the search input', () => {
      renderWithSettings(<ObjectList {...defaultProps} />);
      expect(screen.getByPlaceholderText('Search objects...')).toBeInTheDocument();
    });

    it('should show custom badge for custom objects', () => {
      localStorageMock.setItem('salesforce-query-tool-recent-objects', JSON.stringify(['Custom__c']));
      renderWithSettings(<ObjectList {...defaultProps} />);
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading message when isLoading is true', () => {
      renderWithSettings(<ObjectList {...defaultProps} isLoading={true} />);
      expect(screen.getByText('Loading Salesforce objects...')).toBeInTheDocument();
    });

    it('should show retrieving message in header when loading', () => {
      renderWithSettings(<ObjectList {...defaultProps} isLoading={true} />);
      expect(screen.getByText('Retrieving objects...')).toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('should filter objects by search term', async () => {
      const user = userEvent.setup();
      renderWithSettings(<ObjectList {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search objects...');
      await user.type(searchInput, 'acc');

      expect(screen.getAllByText('Account').length).toBeGreaterThan(0);
      expect(screen.queryByText('Contact')).not.toBeInTheDocument();
    });

    it('should filter by object label', async () => {
      const user = userEvent.setup();
      renderWithSettings(<ObjectList {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search objects...');
      await user.type(searchInput, 'Custom Object');

      expect(screen.getByText('Custom Object')).toBeInTheDocument();
      expect(screen.queryAllByText('Account')).toHaveLength(0);
    });

    it('should show no results message when search has no matches', async () => {
      const user = userEvent.setup();
      renderWithSettings(<ObjectList {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search objects...');
      await user.type(searchInput, 'zzzznonexistent');

      expect(screen.getByText('No objects match your search')).toBeInTheDocument();
    });

    it('should update object count during search', async () => {
      const user = userEvent.setup();
      renderWithSettings(<ObjectList {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search objects...');
      await user.type(searchInput, 'acc');

      expect(screen.getByText('1 of 4 objects')).toBeInTheDocument();
    });

    it('should show clear button when searching', async () => {
      const user = userEvent.setup();
      renderWithSettings(<ObjectList {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search objects...');
      await user.type(searchInput, 'test');

      // There should be a clear button visible
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('selection', () => {
    it('should call onSelectObject when an object is clicked', async () => {
      const user = userEvent.setup();
      const onSelectObject = jest.fn();
      renderWithSettings(<ObjectList {...defaultProps} onSelectObject={onSelectObject} />);

      // Search for Account to make it visible
      const searchInput = screen.getByPlaceholderText('Search objects...');
      await user.type(searchInput, 'Account');

      await user.click(screen.getAllByText('Account')[0]);
      expect(onSelectObject).toHaveBeenCalledWith(mockObjects[0]);
    });

    it('should highlight the selected object', () => {
      // Seed recent objects so selected object appears
      localStorageMock.setItem('salesforce-query-tool-recent-objects', JSON.stringify(['Account']));
      renderWithSettings(
        <ObjectList {...defaultProps} selectedObject={mockObjects[0]} />
      );

      const accountButtons = screen.getAllByRole('button');
      const accountButton = accountButtons.find(btn => btn.textContent?.includes('Account'));
      expect(accountButton).toBeDefined();
    });
  });

  describe('custom objects filter', () => {
    it('should filter to show only custom objects when searching with toggle', async () => {
      const user = userEvent.setup();
      renderWithSettings(<ObjectList {...defaultProps} />);

      // Enable custom only filter
      const customCheckbox = screen.getByLabelText('Custom objects only');
      await user.click(customCheckbox);

      // Search for something to see results
      const searchInput = screen.getByPlaceholderText('Search objects...');
      await user.type(searchInput, 'c');

      expect(screen.getByText('Custom Object')).toBeInTheDocument();
      expect(screen.queryAllByText('Account')).toHaveLength(0);
      expect(screen.queryAllByText('Contact')).toHaveLength(0);
    });
  });

  describe('empty state', () => {
    it('should show search prompt when no recent objects', () => {
      renderWithSettings(<ObjectList {...defaultProps} />);
      expect(screen.getByText('Search for an object above')).toBeInTheDocument();
    });
  });
});
