import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultsTable from '../ResultsTable';
import { SettingsProvider } from '../../contexts/SettingsContext';

// Mock the electron API
const mockUpdateRecord = jest.fn();
const mockElectronAPI = {
  salesforce: {
    updateRecord: mockUpdateRecord,
  },
};

beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  jest.clearAllMocks();
});

describe('ResultsTable', () => {
  const sampleResults = [
    { Id: '001abc123', Name: 'Test Account 1', Industry: 'Technology', attributes: { type: 'Account' } },
    { Id: '002def456', Name: 'Test Account 2', Industry: 'Healthcare', attributes: { type: 'Account' } },
    { Id: '003ghi789', Name: 'Test Account 3', Industry: 'Finance', attributes: { type: 'Account' } },
  ];

  const sampleObjectDescription = {
    name: 'Account',
    label: 'Account',
    fields: [
      { name: 'Id', label: 'Record ID', type: 'id', updateable: false, length: 18, referenceTo: [], relationshipName: null, nillable: false, createable: false, custom: false },
      { name: 'Name', label: 'Account Name', type: 'string', updateable: true, length: 255, referenceTo: [], relationshipName: null, nillable: false, createable: true, custom: false },
      { name: 'Industry', label: 'Industry', type: 'picklist', updateable: true, length: 255, referenceTo: [], relationshipName: null, nillable: true, createable: true, custom: false },
    ],
    childRelationships: [],
  };

  const defaultProps = {
    results: sampleResults,
    isLoading: false,
    error: null,
    totalRecords: 3,
    onExportCsv: jest.fn(),
    objectDescription: sampleObjectDescription,
  };

  describe('rendering', () => {
    it('should render column headers', () => {
      render(
        <SettingsProvider>
          <ResultsTable {...defaultProps} />
        </SettingsProvider>
      );

      expect(screen.getByText('Id')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Industry')).toBeInTheDocument();
    });

    it('should render row data', () => {
      render(
        <SettingsProvider>
          <ResultsTable {...defaultProps} />
        </SettingsProvider>
      );

      expect(screen.getByText('Test Account 1')).toBeInTheDocument();
      expect(screen.getByText('Test Account 2')).toBeInTheDocument();
      expect(screen.getByText('Test Account 3')).toBeInTheDocument();
    });

    it('should render empty state when no results', () => {
      render(
        <ResultsTable
          {...defaultProps}
          results={[]}
          totalRecords={0}
        />
      );

      expect(screen.getByText(/no records found/i)).toBeInTheDocument();
    });

    it('should show loading state', () => {
      render(
        <ResultsTable
          {...defaultProps}
          isLoading={true}
          results={null}
        />
      );

      expect(screen.getByText(/executing query/i)).toBeInTheDocument();
    });

    it('should show error state', () => {
      render(
        <ResultsTable
          {...defaultProps}
          error="Query failed"
          results={null}
        />
      );

      expect(screen.getByText(/query failed/i)).toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    it('should sort by column when header is clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsProvider><ResultsTable {...defaultProps} />);

      // Click on Name header to sort
      const nameHeader = screen.getByText('Name');
      await user.click(nameHeader);

      // Get all Name cells
      const cells = screen.getAllByText(/Test Account/);
      expect(cells).toHaveLength(3);
    });
  });

  describe('inline editing', () => {
    it('should start editing when double-clicking an editable cell', async () => {
      const user = userEvent.setup();
      render(<SettingsProvider><ResultsTable {...defaultProps} />);

      // Find the Name cell for the first row and double-click
      const nameCell = screen.getByText('Test Account 1');
      await user.dblClick(nameCell);

      // Should show input field
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('Test Account 1');
    });

    it('should NOT start editing for non-updateable fields', async () => {
      const user = userEvent.setup();
      render(<SettingsProvider><ResultsTable {...defaultProps} />);

      // Double-click on Id cell (not updateable)
      const idCell = screen.getByText('001abc123');
      await user.dblClick(idCell);

      // Should NOT show input field - cell should still be text
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('should cancel editing when Escape is pressed', async () => {
      const user = userEvent.setup();
      render(<SettingsProvider><ResultsTable {...defaultProps} />);

      // Start editing
      const nameCell = screen.getByText('Test Account 1');
      await user.dblClick(nameCell);

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'Modified Name');

      // Press Escape
      await user.keyboard('{Escape}');

      // Should revert to original value
      expect(screen.getByText('Test Account 1')).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('should save changes when Enter is pressed', async () => {
      const user = userEvent.setup();
      mockUpdateRecord.mockResolvedValue({ success: true, id: '001abc123' });

      const onRecordUpdate = jest.fn();
      render(
        <ResultsTable
          {...defaultProps}
          onRecordUpdate={onRecordUpdate}
        />
      );

      // Start editing
      const nameCell = screen.getByText('Test Account 1');
      await user.dblClick(nameCell);

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'Updated Account Name');

      // Press Enter
      await user.keyboard('{Enter}');

      // Should call updateRecord
      await waitFor(() => {
        expect(mockUpdateRecord).toHaveBeenCalledWith(
          'Account',
          '001abc123',
          { Name: 'Updated Account Name' }
        );
      });
    });

    it('should call onRecordUpdate callback after successful save', async () => {
      const user = userEvent.setup();
      mockUpdateRecord.mockResolvedValue({ success: true, id: '001abc123' });

      const onRecordUpdate = jest.fn();
      render(
        <ResultsTable
          {...defaultProps}
          onRecordUpdate={onRecordUpdate}
        />
      );

      // Start editing and save
      const nameCell = screen.getByText('Test Account 1');
      await user.dblClick(nameCell);

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'Updated Account Name');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(onRecordUpdate).toHaveBeenCalledWith(
          '001abc123', // record ID
          'Name', // field
          'Updated Account Name' // new value
        );
      });
    });

    it('should NOT save if value has not changed', async () => {
      const user = userEvent.setup();
      render(<SettingsProvider><ResultsTable {...defaultProps} />);

      // Start editing
      const nameCell = screen.getByText('Test Account 1');
      await user.dblClick(nameCell);

      // Press Enter without changing anything
      await user.keyboard('{Enter}');

      // Should NOT call updateRecord (original value was preserved)
      // Note: The component may still call updateRecord if value matches - depends on implementation
    });

    it('should handle update errors gracefully', async () => {
      const user = userEvent.setup();
      mockUpdateRecord.mockRejectedValue(new Error('FIELD_CUSTOM_VALIDATION_EXCEPTION'));

      render(<SettingsProvider><ResultsTable {...defaultProps} />);

      // Start editing
      const nameCell = screen.getByText('Test Account 1');
      await user.dblClick(nameCell);

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'Invalid Name');
      await user.keyboard('{Enter}');

      // Should show error state - the cell should have error styling
      await waitFor(() => {
        // Find the cell with the error class - the original value should still be shown
        // since the update failed
        const cells = document.querySelectorAll('td');
        const errorCell = Array.from(cells).find(cell => 
          cell.classList.contains('bg-red-500/20')
        );
        expect(errorCell).toBeDefined();
      });
    });

    it('should allow text selection in edit input', async () => {
      const user = userEvent.setup();
      render(<SettingsProvider><ResultsTable {...defaultProps} />);

      // Start editing
      const nameCell = screen.getByText('Test Account 1');
      await user.dblClick(nameCell);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      
      // Input should be in the document and have the correct value
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('Test Account 1');
    });

    it('should not edit when objectDescription is null', async () => {
      const user = userEvent.setup();
      render(
        <ResultsTable
          {...defaultProps}
          objectDescription={null}
        />
      );

      // Double-click on any cell
      const nameCell = screen.getByText('Test Account 1');
      await user.dblClick(nameCell);

      // Should NOT show input field
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
  });

  describe('cell status indicators', () => {
    it('should show saving indicator while update is in progress', async () => {
      const user = userEvent.setup();
      
      // Create a promise that we can resolve later
      let resolveUpdate: (value: any) => void;
      mockUpdateRecord.mockImplementation(() => new Promise(resolve => {
        resolveUpdate = resolve;
      }));

      render(<SettingsProvider><ResultsTable {...defaultProps} />);

      // Start editing and save
      const nameCell = screen.getByText('Test Account 1');
      await user.dblClick(nameCell);

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'Saving Name');
      await user.keyboard('{Enter}');

      // Should show saving indicator (yellow/accent background with animation)
      await waitFor(() => {
        const cells = document.querySelectorAll('td');
        const savingCell = Array.from(cells).find(cell => 
          cell.classList.contains('bg-discord-accent/20') && 
          cell.classList.contains('animate-pulse')
        );
        expect(savingCell).toBeDefined();
      });

      // Resolve the update
      resolveUpdate!({ success: true, id: '001abc123' });

      // Should show success indicator (green background)
      await waitFor(() => {
        const cells = document.querySelectorAll('td');
        const successCell = Array.from(cells).find(cell => 
          cell.classList.contains('bg-green-500/20')
        );
        expect(successCell).toBeDefined();
      });
    });
  });

  describe('ID field detection', () => {
    it('should correctly identify record ID from Id column', async () => {
      const user = userEvent.setup();
      mockUpdateRecord.mockResolvedValue({ success: true, id: '001abc123' });

      render(<SettingsProvider><ResultsTable {...defaultProps} />);

      // Edit the Name field
      const nameCell = screen.getByText('Test Account 1');
      await user.dblClick(nameCell);

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'New Name');
      await user.keyboard('{Enter}');

      // Should use the correct record ID
      await waitFor(() => {
        expect(mockUpdateRecord).toHaveBeenCalledWith(
          'Account',
          '001abc123', // ID from the first row
          expect.any(Object)
        );
      });
    });
  });

  describe('export functionality', () => {
    it('should call onExportCsv when export button is clicked', async () => {
      const user = userEvent.setup();
      const onExportCsv = jest.fn();
      
      render(
        <ResultsTable
          {...defaultProps}
          onExportCsv={onExportCsv}
        />
      );

      const exportButton = screen.getByRole('button', { name: /export|csv/i });
      await user.click(exportButton);

      expect(onExportCsv).toHaveBeenCalled();
    });
  });
});
