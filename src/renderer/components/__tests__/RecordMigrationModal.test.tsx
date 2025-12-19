import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RecordMigrationModal from '../RecordMigrationModal';

// Mock the electronAPI
const mockElectronAPI = {
  migration: {
    connectTargetOrg: jest.fn(),
    connectWithSavedOAuth: jest.fn(),
    connectWithSavedCredentials: jest.fn(),
    getTargetOrgs: jest.fn(),
    disconnectTargetOrg: jest.fn(),
    getRelationships: jest.fn(),
    analyzeRecords: jest.fn(),
    executeMigration: jest.fn(),
    getChildRelationships: jest.fn(),
  },
  credentials: {
    getSavedOAuthLogins: jest.fn(),
    getSavedLogins: jest.fn(),
  },
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

describe('RecordMigrationModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    selectedRecords: [
      { Id: '001xxx1', Name: 'Test Account 1', Industry: 'Technology' },
      { Id: '001xxx2', Name: 'Test Account 2', Industry: 'Finance' },
    ],
    objectName: 'Account',
    sourceOrgUrl: 'https://test.salesforce.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockElectronAPI.migration.getTargetOrgs.mockResolvedValue([]);
    mockElectronAPI.credentials.getSavedOAuthLogins.mockResolvedValue([]);
    mockElectronAPI.credentials.getSavedLogins.mockResolvedValue([]);
    mockElectronAPI.migration.getRelationships.mockResolvedValue({
      success: true,
      data: {
        relationships: [
          {
            fieldName: 'ParentId',
            fieldLabel: 'Parent Account',
            referenceTo: ['Account'],
            relationshipName: 'Parent',
            isRequired: false,
            isCreateable: true,
          },
          {
            fieldName: 'OwnerId',
            fieldLabel: 'Owner',
            referenceTo: ['User'],
            relationshipName: 'Owner',
            isRequired: true,
            isCreateable: true,
          },
        ],
        defaultConfig: [
          { fieldName: 'ParentId', include: true, referenceTo: 'Account' },
          { fieldName: 'OwnerId', include: false, referenceTo: 'User' },
        ],
        excludedFields: ['OwnerId', 'CreatedById', 'LastModifiedById'],
        excludedObjects: ['User', 'Group'],
      },
    });
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('should not render when isOpen is false', () => {
    render(<RecordMigrationModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Push Records to Another Org')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', async () => {
    render(<RecordMigrationModal {...defaultProps} />);
    expect(screen.getByText('Push Records to Another Org')).toBeInTheDocument();
    expect(screen.getByText(/Migrating 2 Account records/)).toBeInTheDocument();
  });

  it('should show step indicator', async () => {
    render(<RecordMigrationModal {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Select Target Org')).toBeInTheDocument();
    });
  });

  it('should show empty state when no saved connections', async () => {
    render(<RecordMigrationModal {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('No saved connections found')).toBeInTheDocument();
    });
  });

  it('should show saved OAuth connections when available', async () => {
    mockElectronAPI.credentials.getSavedOAuthLogins.mockResolvedValue([
      {
        id: 'oauth_1',
        label: 'QA Sandbox',
        username: 'admin@qa.sandbox',
        isSandbox: true,
        lastUsed: new Date().toISOString(),
        loginType: 'oauth' as const,
      },
    ]);

    render(<RecordMigrationModal {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('QA Sandbox')).toBeInTheDocument();
      expect(screen.getByText('admin@qa.sandbox')).toBeInTheDocument();
    });
  });

  it('should connect using saved OAuth when clicking Connect button', async () => {
    mockElectronAPI.credentials.getSavedOAuthLogins.mockResolvedValue([
      {
        id: 'oauth_1',
        label: 'QA Sandbox',
        username: 'admin@qa.sandbox',
        isSandbox: true,
        lastUsed: new Date().toISOString(),
        loginType: 'oauth' as const,
      },
    ]);
    mockElectronAPI.migration.connectWithSavedOAuth.mockResolvedValue({
      success: true,
      data: {
        id: 'target_1',
        data: {
          userId: 'user123',
          organizationId: 'org123',
          instanceUrl: 'https://qa.salesforce.com',
          username: 'admin@qa.sandbox',
        },
      },
    });

    render(<RecordMigrationModal {...defaultProps} />);
    
    // Wait for saved connection to appear and click it
    await waitFor(() => {
      expect(screen.getByText('QA Sandbox')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('QA Sandbox'));
    
    // Click the connect button
    const connectButton = await screen.findByText('Connect to QA Sandbox');
    fireEvent.click(connectButton);
    
    await waitFor(() => {
      expect(mockElectronAPI.migration.connectWithSavedOAuth).toHaveBeenCalledWith('oauth_1');
    });
  });

  it('should display connected target orgs', async () => {
    mockElectronAPI.migration.getTargetOrgs.mockResolvedValue([
      {
        id: 'target_1',
        label: 'QA Sandbox',
        instanceUrl: 'https://qa.salesforce.com',
        username: 'admin@qa.sandbox',
        isSandbox: true,
      },
    ]);

    render(<RecordMigrationModal {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('QA Sandbox')).toBeInTheDocument();
      expect(screen.getByText('admin@qa.sandbox')).toBeInTheDocument();
    });
  });

  it('should allow selecting a connected org', async () => {
    mockElectronAPI.migration.getTargetOrgs.mockResolvedValue([
      {
        id: 'target_1',
        label: 'QA Sandbox',
        instanceUrl: 'https://qa.salesforce.com',
        username: 'admin@qa.sandbox',
        isSandbox: true,
      },
    ]);

    render(<RecordMigrationModal {...defaultProps} />);
    
    await waitFor(() => {
      const orgOption = screen.getByText('QA Sandbox').closest('div[class*="cursor-pointer"]');
      expect(orgOption).toBeInTheDocument();
    });
  });

  it('should show Next button when target org is selected', async () => {
    mockElectronAPI.migration.getTargetOrgs.mockResolvedValue([
      {
        id: 'target_1',
        label: 'QA Sandbox',
        instanceUrl: 'https://qa.salesforce.com',
        username: 'admin@qa.sandbox',
        isSandbox: true,
      },
    ]);

    render(<RecordMigrationModal {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('Next: Configure Relationships')).toBeInTheDocument();
    });
  });

  it('should call onClose when close button is clicked', async () => {
    const onClose = jest.fn();
    render(<RecordMigrationModal {...defaultProps} onClose={onClose} />);
    
    const closeButton = screen.getByRole('button', { name: '' }); // X button
    fireEvent.click(closeButton);
    
    expect(onClose).toHaveBeenCalled();
  });

  it('should call onClose when Cancel is clicked', async () => {
    const onClose = jest.fn();
    render(<RecordMigrationModal {...defaultProps} onClose={onClose} />);
    
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    
    expect(onClose).toHaveBeenCalled();
  });

  it('should disconnect org when X is clicked on connected org', async () => {
    mockElectronAPI.migration.getTargetOrgs.mockResolvedValue([
      {
        id: 'target_1',
        label: 'QA Sandbox',
        instanceUrl: 'https://qa.salesforce.com',
        username: 'admin@qa.sandbox',
        isSandbox: true,
      },
    ]);
    mockElectronAPI.migration.disconnectTargetOrg.mockResolvedValue({ success: true });

    render(<RecordMigrationModal {...defaultProps} />);
    
    await waitFor(() => {
      const orgCard = screen.getByText('QA Sandbox').closest('div[class*="cursor-pointer"]');
      const disconnectButton = orgCard?.querySelector('button');
      if (disconnectButton) {
        fireEvent.click(disconnectButton);
      }
    });
    
    await waitFor(() => {
      expect(mockElectronAPI.migration.disconnectTargetOrg).toHaveBeenCalledWith('target_1');
    });
  });

  it('should load relationships on mount', async () => {
    render(<RecordMigrationModal {...defaultProps} />);
    
    await waitFor(() => {
      expect(mockElectronAPI.migration.getRelationships).toHaveBeenCalledWith('Account');
    });
  });

  it('should show record count in header', async () => {
    render(<RecordMigrationModal {...defaultProps} />);
    expect(screen.getByText(/Migrating 2 Account records/)).toBeInTheDocument();
  });

  it('should show source org URL in header', async () => {
    render(<RecordMigrationModal {...defaultProps} />);
    expect(screen.getByText(/from https:\/\/test.salesforce.com/)).toBeInTheDocument();
  });
});

describe('RecordMigrationModal - Configure Relationships Step', () => {
  const connectedOrg = {
    id: 'target_1',
    label: 'QA Sandbox',
    instanceUrl: 'https://qa.salesforce.com',
    username: 'admin@qa.sandbox',
    isSandbox: true,
  };

  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    selectedRecords: [
      { Id: '001xxx1', Name: 'Test Account 1' },
    ],
    objectName: 'Account',
    sourceOrgUrl: 'https://test.salesforce.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockElectronAPI.migration.getTargetOrgs.mockResolvedValue([connectedOrg]);
    mockElectronAPI.credentials.getSavedOAuthLogins.mockResolvedValue([]);
    mockElectronAPI.migration.getRelationships.mockResolvedValue({
      success: true,
      data: {
        relationships: [
          {
            fieldName: 'ParentId',
            fieldLabel: 'Parent Account',
            referenceTo: ['Account'],
            relationshipName: 'Parent',
            isRequired: false,
            isCreateable: true,
          },
        ],
        defaultConfig: [
          { fieldName: 'ParentId', include: true, referenceTo: 'Account' },
        ],
        excludedFields: ['OwnerId'],
        excludedObjects: ['User'],
      },
    });
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('should navigate to configure step when Next is clicked', async () => {
    render(<RecordMigrationModal {...defaultProps} />);
    
    // Wait for the component to load and auto-select the target org
    await waitFor(() => {
      expect(screen.getByText('QA Sandbox')).toBeInTheDocument();
    });

    // Wait for the Next button to be enabled and click it
    const nextButton = await screen.findByText('Next: Configure Relationships');
    expect(nextButton).not.toBeDisabled();
    fireEvent.click(nextButton);
    
    // Wait for the configure step to appear
    await waitFor(() => {
      expect(screen.getByText('Configure Relationships')).toBeInTheDocument();
    });
  });

  it('should show Back button on configure step', async () => {
    render(<RecordMigrationModal {...defaultProps} />);
    
    // Wait for the component to load and auto-select the target org
    await waitFor(() => {
      expect(screen.getByText('QA Sandbox')).toBeInTheDocument();
    });

    // Wait for the Next button and click it
    const nextButton = await screen.findByText('Next: Configure Relationships');
    fireEvent.click(nextButton);
    
    // Wait for the Back button to appear on configure step
    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
    });
  });
});
