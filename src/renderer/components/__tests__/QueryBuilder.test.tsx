import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QueryBuilder from '../QueryBuilder';

// Mock the electron API
const mockGetForObject = jest.fn();
const mockSave = jest.fn();
const mockDelete = jest.fn();
const mockUpdateLastRun = jest.fn();

const mockElectronAPI = {
  queries: {
    getForObject: mockGetForObject,
    save: mockSave,
    delete: mockDelete,
    updateLastRun: mockUpdateLastRun,
  },
};

beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  jest.clearAllMocks();
  mockGetForObject.mockResolvedValue([]);
});

describe('QueryBuilder', () => {
  const mockObject = {
    name: 'Account',
    label: 'Account',
    labelPlural: 'Accounts',
    keyPrefix: '001',
    custom: false,
    queryable: true,
  };

  const mockObjectDescription = {
    name: 'Account',
    label: 'Account',
    fields: [
      { name: 'Id', label: 'Account ID', type: 'id', length: 18, referenceTo: [], relationshipName: null, nillable: false, createable: false, updateable: false, custom: false },
      { name: 'Name', label: 'Account Name', type: 'string', length: 255, referenceTo: [], relationshipName: null, nillable: false, createable: true, updateable: true, custom: false },
      { name: 'Industry', label: 'Industry', type: 'picklist', length: 255, referenceTo: [], relationshipName: null, nillable: true, createable: true, updateable: true, custom: false },
      { name: 'Phone', label: 'Phone', type: 'phone', length: 40, referenceTo: [], relationshipName: null, nillable: true, createable: true, updateable: true, custom: false },
    ],
    childRelationships: [],
  };

  const defaultProps = {
    selectedObject: mockObject,
    objectDescription: mockObjectDescription,
    query: 'SELECT Id, Name FROM Account',
    onQueryChange: jest.fn(),
    onExecuteQuery: jest.fn(),
    isLoading: false,
    isExecuting: false,
  };

  describe('rendering', () => {
    it('should render the query textarea', () => {
      render(<QueryBuilder {...defaultProps} />);

      // The query should be displayed
      expect(screen.getByText(/SELECT Id, Name FROM Account/)).toBeInTheDocument();
    });

    it('should render the execute button', () => {
      render(<QueryBuilder {...defaultProps} />);

      expect(screen.getByRole('button', { name: /run query/i })).toBeInTheDocument();
    });

    it('should render the field picker button', () => {
      render(<QueryBuilder {...defaultProps} />);

      expect(screen.getByRole('button', { name: /fields/i })).toBeInTheDocument();
    });
  });

  describe('query execution', () => {
    it('should call onExecuteQuery when execute button is clicked', async () => {
      const user = userEvent.setup();
      const onExecuteQuery = jest.fn();

      render(<QueryBuilder {...defaultProps} onExecuteQuery={onExecuteQuery} />);

      const executeButton = screen.getByRole('button', { name: /run query/i });
      await user.click(executeButton);

      expect(onExecuteQuery).toHaveBeenCalled();
    });

    it('should disable execute button when isExecuting is true', () => {
      render(<QueryBuilder {...defaultProps} isExecuting={true} />);

      const executeButton = screen.getByRole('button', { name: /running|run/i });
      expect(executeButton).toBeDisabled();
    });

    it('should execute query with Ctrl+Enter', async () => {
      const user = userEvent.setup();
      const onExecuteQuery = jest.fn();

      render(<QueryBuilder {...defaultProps} onExecuteQuery={onExecuteQuery} />);

      const textarea = screen.getByRole('textbox');
      await user.click(textarea);
      await user.keyboard('{Control>}{Enter}{/Control}');

      expect(onExecuteQuery).toHaveBeenCalled();
    });
  });

  describe('query editing', () => {
    it('should call onQueryChange when query is modified', async () => {
      const user = userEvent.setup();
      const onQueryChange = jest.fn();

      render(<QueryBuilder {...defaultProps} onQueryChange={onQueryChange} />);

      const textarea = screen.getByRole('textbox');
      await user.click(textarea);
      await user.type(textarea, ' LIMIT 10');

      expect(onQueryChange).toHaveBeenCalled();
    });
  });

  describe('field picker', () => {
    it('should open field picker when button is clicked', async () => {
      const user = userEvent.setup();

      render(<QueryBuilder {...defaultProps} />);

      const fieldPickerButton = screen.getByRole('button', { name: /fields/i });
      await user.click(fieldPickerButton);

      // Should show the field picker modal - look for the modal title
      await waitFor(() => {
        expect(screen.getByText('Select Fields')).toBeInTheDocument();
      });
    });

    it('should show fields in the picker', async () => {
      const user = userEvent.setup();

      render(<QueryBuilder {...defaultProps} />);

      const fieldPickerButton = screen.getByRole('button', { name: /fields/i });
      await user.click(fieldPickerButton);

      // Should show field labels
      await waitFor(() => {
        expect(screen.getByText('Account Name')).toBeInTheDocument();
        expect(screen.getByText('Account ID')).toBeInTheDocument();
      });
    });
  });

  describe('saved queries', () => {
    const mockSavedQueries = [
      { id: '1', name: 'All Accounts', query: 'SELECT Id, Name FROM Account', objectName: 'Account' },
      { id: '2', name: 'Large Accounts', query: 'SELECT Id, Name FROM Account WHERE NumberOfEmployees > 100', objectName: 'Account' },
    ];

    beforeEach(() => {
      mockGetForObject.mockResolvedValue(mockSavedQueries);
    });

    it('should load saved queries for the selected object', async () => {
      render(<QueryBuilder {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetForObject).toHaveBeenCalledWith('Account');
      });
    });

    it('should show saved queries dropdown', async () => {
      const user = userEvent.setup();

      render(<QueryBuilder {...defaultProps} />);

      // Find and click the saved queries button
      const savedQueriesButton = await screen.findByRole('button', { name: /saved|queries/i });
      await user.click(savedQueriesButton);

      await waitFor(() => {
        expect(screen.getByText('All Accounts')).toBeInTheDocument();
        expect(screen.getByText('Large Accounts')).toBeInTheDocument();
      });
    });
  });

  describe('include deleted button', () => {
    it('should pass includeDeleted when executing query with button click', async () => {
      const user = userEvent.setup();
      const onExecuteQuery = jest.fn();

      render(<QueryBuilder {...defaultProps} onExecuteQuery={onExecuteQuery} />);

      // The "Include Deleted" is a button that toggles state, then we run query
      const includeDeletedButton = screen.getByRole('button', { name: /include deleted/i });
      await user.click(includeDeletedButton);

      // Execute query
      const executeButton = screen.getByRole('button', { name: /run query/i });
      await user.click(executeButton);

      // Should have been called with true for includeDeleted
      expect(onExecuteQuery).toHaveBeenCalledWith(true);
    });
  });
});
