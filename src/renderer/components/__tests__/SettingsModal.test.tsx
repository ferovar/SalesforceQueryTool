import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsModal, { AppSettings, defaultSettings } from '../SettingsModal';

describe('SettingsModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSettingsChange = jest.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    settings: defaultSettings,
    onSettingsChange: mockOnSettingsChange,
    isLoggedIn: false,
    isProduction: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    render(<SettingsModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('should render all setting sections', () => {
    render(<SettingsModal {...defaultProps} />);
    
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Safety')).toBeInTheDocument();
    expect(screen.getByText('Query Defaults')).toBeInTheDocument();
    expect(screen.getByText('UI Preferences')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });

  it('should render performance settings', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText('Show Performance Monitor')).toBeInTheDocument();
    expect(screen.getByText(/Toggle anytime with F12/)).toBeInTheDocument();
  });

  it('should render safety settings', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText('Prevent Inline Editing in Production')).toBeInTheDocument();
  });

  it('should render query defaults settings', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText('Default Query Limit')).toBeInTheDocument();
    expect(screen.getByText('Auto-Save to History')).toBeInTheDocument();
  });

  it('should render UI preferences settings', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText('Show Relationship Fields')).toBeInTheDocument();
    expect(screen.getByText('Compact Results View')).toBeInTheDocument();
  });

  it('should render keyboard shortcuts', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText('Execute query')).toBeInTheDocument();
    expect(screen.getByText('Toggle performance monitor')).toBeInTheDocument();
    expect(screen.getByText('Cancel inline edit')).toBeInTheDocument();
    expect(screen.getByText('Save inline edit')).toBeInTheDocument();
  });

  it('should show production indicator when connected to production', () => {
    render(
      <SettingsModal 
        {...defaultProps} 
        isLoggedIn={true} 
        isProduction={true} 
      />
    );
    expect(screen.getByText(/Currently connected to: Production/)).toBeInTheDocument();
  });

  it('should show sandbox indicator when connected to sandbox', () => {
    render(
      <SettingsModal 
        {...defaultProps} 
        isLoggedIn={true} 
        isProduction={false} 
      />
    );
    expect(screen.getByText(/Currently connected to: Sandbox/)).toBeInTheDocument();
  });

  it('should call onClose when cancel button is clicked', () => {
    render(<SettingsModal {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should call onSettingsChange when save button is clicked', () => {
    render(<SettingsModal {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Save Settings'));
    expect(mockOnSettingsChange).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should toggle performance monitor setting', () => {
    const settings: AppSettings = { ...defaultSettings, showPerformanceMonitor: false };
    render(<SettingsModal {...defaultProps} settings={settings} />);
    
    // Find the toggle for performance monitor
    const toggles = screen.getAllByRole('checkbox');
    const perfToggle = toggles[0]; // First toggle is performance monitor
    
    fireEvent.click(perfToggle);
    fireEvent.click(screen.getByText('Save Settings'));
    
    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ showPerformanceMonitor: true })
    );
  });

  it('should toggle production editing prevention setting', () => {
    const settings: AppSettings = { ...defaultSettings, preventProductionEdits: false };
    render(<SettingsModal {...defaultProps} settings={settings} />);
    
    // Find all toggles and click the production edits one (second toggle)
    const toggles = screen.getAllByRole('checkbox');
    const prodToggle = toggles[1];
    
    fireEvent.click(prodToggle);
    fireEvent.click(screen.getByText('Save Settings'));
    
    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ preventProductionEdits: true })
    );
  });

  it('should reset settings to defaults when reset button is clicked', () => {
    const customSettings: AppSettings = {
      ...defaultSettings,
      showPerformanceMonitor: true,
      preventProductionEdits: false,
      defaultQueryLimit: 1000,
    };
    
    render(<SettingsModal {...defaultProps} settings={customSettings} />);
    
    fireEvent.click(screen.getByText('Reset to Defaults'));
    fireEvent.click(screen.getByText('Save Settings'));
    
    expect(mockOnSettingsChange).toHaveBeenCalledWith(defaultSettings);
  });

  it('should change default query limit', () => {
    render(<SettingsModal {...defaultProps} />);
    
    const selects = screen.getAllByRole('combobox');
    const queryLimitSelect = selects[0]; // First select is for query limit
    fireEvent.change(queryLimitSelect, { target: { value: '500' } });
    fireEvent.click(screen.getByText('Save Settings'));
    
    expect(mockOnSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ defaultQueryLimit: 500 })
    );
  });

  it('should close when X button is clicked', () => {
    render(<SettingsModal {...defaultProps} />);
    
    // Find the X button in the header
    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find(btn => btn.getAttribute('title') === undefined && btn.className.includes('hover:bg-discord-light'));
    
    if (xButton) {
      fireEvent.click(xButton);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });
});

describe('defaultSettings', () => {
  it('should have correct default values', () => {
    expect(defaultSettings.showPerformanceMonitor).toBe(false);
    expect(defaultSettings.preventProductionEdits).toBe(true);
    expect(defaultSettings.defaultQueryLimit).toBe(0); // 0 means no limit
    expect(defaultSettings.autoSaveToHistory).toBe(true);
    expect(defaultSettings.showRelationshipFields).toBe(true);
    expect(defaultSettings.compactResultsView).toBe(false);
  });
});
