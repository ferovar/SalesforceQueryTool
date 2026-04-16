/**
 * Settings persistence via electron-store.
 *
 * Consolidates all application settings into a single store,
 * replacing the renderer-side localStorage approach.
 */

import Store from 'electron-store';
import { getStoreEncryptionKey } from './storeKey';

export type ThemeType = 'nature' | 'starfield';

export interface AppSettings {
  showPerformanceMonitor: boolean;
  preventProductionEdits: boolean;
  disableInlineEditing: boolean;
  disableMigrationFeature: boolean;
  defaultQueryLimit: number;
  autoSaveToHistory: boolean;
  excludedFields: string[];
  showRelationshipFields: boolean;
  compactResultsView: boolean;
  showRecentObjectsFirst: boolean;
  theme: ThemeType;
}

export const defaultSettings: AppSettings = {
  showPerformanceMonitor: false,
  preventProductionEdits: true,
  disableInlineEditing: false,
  disableMigrationFeature: false,
  defaultQueryLimit: 0,
  autoSaveToHistory: true,
  excludedFields: [
    'SystemModstamp',
    'LastReferencedDate',
    'LastViewedDate',
    'ConnectionReceivedId',
    'ConnectionSentId',
  ],
  showRelationshipFields: true,
  compactResultsView: false,
  showRecentObjectsFirst: true,
  theme: 'nature',
};

interface SettingsStoreSchema {
  settings: AppSettings;
}

export class SettingsStore {
  private store: Store<SettingsStoreSchema>;

  constructor() {
    this.store = new Store<SettingsStoreSchema>({
      name: 'salesforce-settings',
      encryptionKey: getStoreEncryptionKey(),
      defaults: {
        settings: defaultSettings,
      },
    });
  }

  getSettings(): AppSettings {
    const stored = this.store.get('settings');
    // Merge with defaults to handle newly added settings keys
    return { ...defaultSettings, ...stored };
  }

  saveSettings(settings: AppSettings): void {
    this.store.set('settings', settings);
  }
}
