import React, { useState, useEffect } from 'react';

export interface AppSettings {
  // Performance
  showPerformanceMonitor: boolean;
  
  // Safety
  preventProductionEdits: boolean;
  disableInlineEditing: boolean;
  disableMigrationFeature: boolean;
  
  // Query defaults
  defaultQueryLimit: number; // 0 means no limit
  autoSaveToHistory: boolean;
  
  // UI preferences
  showRelationshipFields: boolean;
  compactResultsView: boolean;
  showRecentObjectsFirst: boolean;
}

export const defaultSettings: AppSettings = {
  showPerformanceMonitor: false,
  preventProductionEdits: true,
  disableInlineEditing: false,
  disableMigrationFeature: false,
  defaultQueryLimit: 0, // 0 means no limit
  autoSaveToHistory: true,
  showRelationshipFields: true,
  compactResultsView: false,
  showRecentObjectsFirst: true,
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  isLoggedIn?: boolean;
  isProduction?: boolean;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  isLoggedIn = false,
  isProduction,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  if (!isOpen) return null;

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSettingsChange(localSettings);
    onClose();
  };

  const handleCancel = () => {
    setLocalSettings(settings);
    onClose();
  };

  const handleReset = () => {
    setLocalSettings(defaultSettings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-discord-dark rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col animate-slide-in">
        {/* Header */}
        <div className="p-4 border-b border-discord-lighter flex items-center justify-between">
          <h3 className="text-lg font-semibold text-discord-text flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </h3>
          <button onClick={handleCancel} className="p-1 hover:bg-discord-light rounded">
            <svg className="w-5 h-5 text-discord-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Performance Section */}
          <section>
            <h4 className="text-sm font-semibold text-discord-text mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-discord-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Performance
            </h4>
            <div className="space-y-3">
              <SettingToggle
                label="Show Performance Monitor"
                description="Display memory usage and performance stats. Toggle anytime with F12."
                checked={localSettings.showPerformanceMonitor}
                onChange={(v) => handleChange('showPerformanceMonitor', v)}
              />
            </div>
          </section>

          {/* Safety Section */}
          <section>
            <h4 className="text-sm font-semibold text-discord-text mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-discord-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Safety
            </h4>
            <div className="space-y-3">
              <SettingToggle
                label="Prevent Inline Editing in Production"
                description="Disable inline record editing when connected to production orgs."
                checked={localSettings.preventProductionEdits}
                onChange={(v) => handleChange('preventProductionEdits', v)}
              />
              <SettingToggle
                label="Disable Inline Editing"
                description="Completely disable inline record editing to prevent accidental changes."
                checked={localSettings.disableInlineEditing}
                onChange={(v) => handleChange('disableInlineEditing', v)}
              />
              <SettingToggle
                label="Disable Migration Feature"
                description="Hide migration buttons and prevent pushing records to other orgs."
                checked={localSettings.disableMigrationFeature}
                onChange={(v) => handleChange('disableMigrationFeature', v)}
              />
              {isLoggedIn && isProduction !== undefined && (
                <div className={`text-xs px-3 py-1.5 rounded ${isProduction ? 'bg-discord-danger/20 text-discord-danger' : 'bg-green-500/20 text-green-400'}`}>
                  Currently connected to: {isProduction ? 'Production' : 'Sandbox'}
                </div>
              )}
            </div>
          </section>

          {/* Query Defaults Section */}
          <section>
            <h4 className="text-sm font-semibold text-discord-text mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              Query Defaults
            </h4>
            <div className="space-y-3">
              <SettingSelect
                label="Default Query Limit"
                description="Default LIMIT value for new queries. 'No Limit' returns all matching records."
                value={localSettings.defaultQueryLimit}
                options={[
                  { value: 0, label: 'No Limit' },
                  { value: 50, label: '50 records' },
                  { value: 100, label: '100 records' },
                  { value: 200, label: '200 records' },
                  { value: 500, label: '500 records' },
                  { value: 1000, label: '1000 records' },
                  { value: 2000, label: '2000 records' },
                ]}
                onChange={(v) => handleChange('defaultQueryLimit', v)}
              />
              <SettingToggle
                label="Auto-Save to History"
                description="Automatically save executed queries to history."
                checked={localSettings.autoSaveToHistory}
                onChange={(v) => handleChange('autoSaveToHistory', v)}
              />
            </div>
          </section>

          {/* UI Preferences Section */}
          <section>
            <h4 className="text-sm font-semibold text-discord-text mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              UI Preferences
            </h4>
            <div className="space-y-3">
              <SettingToggle
                label="Show Recent Objects First"
                description="Sort recently used objects to the top of the object list."
                checked={localSettings.showRecentObjectsFirst}
                onChange={(v) => handleChange('showRecentObjectsFirst', v)}
              />
              <SettingToggle
                label="Show Relationship Fields"
                description="Display related object fields (e.g., Account.Name) in field picker."
                checked={localSettings.showRelationshipFields}
                onChange={(v) => handleChange('showRelationshipFields', v)}
              />
              <SettingToggle
                label="Compact Results View"
                description="Use smaller row height in query results table."
                checked={localSettings.compactResultsView}
                onChange={(v) => handleChange('compactResultsView', v)}
              />
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <h4 className="text-sm font-semibold text-discord-text mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
              </svg>
              Keyboard Shortcuts
            </h4>
            <div className="bg-discord-darker rounded p-3 space-y-2 text-sm">
              <ShortcutRow keys={['Ctrl', 'Enter']} description="Execute query" />
              <ShortcutRow keys={['F12']} description="Toggle performance monitor" />
              <ShortcutRow keys={['Escape']} description="Cancel inline edit" />
              <ShortcutRow keys={['Enter']} description="Save inline edit" />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-discord-lighter flex items-center justify-between">
          <button
            onClick={handleReset}
            className="btn btn-ghost text-sm text-discord-text-muted hover:text-discord-text"
          >
            Reset to Defaults
          </button>
          <div className="flex gap-2">
            <button onClick={handleCancel} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={handleSave} className="btn btn-primary">
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Toggle component
interface SettingToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const SettingToggle: React.FC<SettingToggleProps> = ({ label, description, checked, onChange }) => (
  <label className="flex items-start gap-3 cursor-pointer group">
    <div className="relative mt-0.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <div className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-discord-accent' : 'bg-discord-lighter'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </div>
    </div>
    <div className="flex-1">
      <p className="text-sm text-discord-text group-hover:text-white transition-colors">{label}</p>
      <p className="text-xs text-discord-text-muted">{description}</p>
    </div>
  </label>
);

// Select component
interface SettingSelectProps {
  label: string;
  description: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (value: number) => void;
}

const SettingSelect: React.FC<SettingSelectProps> = ({ label, description, value, options, onChange }) => (
  <div className="flex items-start gap-3">
    <div className="flex-1">
      <p className="text-sm text-discord-text">{label}</p>
      <p className="text-xs text-discord-text-muted">{description}</p>
    </div>
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="bg-discord-darker border border-discord-lighter rounded px-3 py-1.5 text-sm text-discord-text focus:outline-none focus:border-discord-accent"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

// Shortcut row component
interface ShortcutRowProps {
  keys: string[];
  description: string;
}

const ShortcutRow: React.FC<ShortcutRowProps> = ({ keys, description }) => (
  <div className="flex items-center justify-between">
    <span className="text-discord-text-muted">{description}</span>
    <div className="flex gap-1">
      {keys.map((key, i) => (
        <span key={key} className="flex items-center gap-1">
          <kbd className="px-2 py-0.5 bg-discord-light rounded text-xs font-mono text-discord-text">
            {key}
          </kbd>
          {i < keys.length - 1 && <span className="text-discord-text-muted">+</span>}
        </span>
      ))}
    </div>
  </div>
);

export default SettingsModal;
