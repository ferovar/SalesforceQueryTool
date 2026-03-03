/**
 * IPC handlers for application settings.
 */

import { SettingsStore } from '../services/settings';
import { handleIpcRaw } from './handler';

export function registerSettingsHandlers(settingsStore: SettingsStore): void {
  handleIpcRaw('settings:get', () => {
    return settingsStore.getSettings();
  });

  handleIpcRaw('settings:save', (settings: unknown) => {
    if (settings && typeof settings === 'object') {
      settingsStore.saveSettings(settings as any);
    }
  });
}
