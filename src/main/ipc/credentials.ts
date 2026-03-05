/**
 * IPC handlers for credential management.
 */

import { CredentialsStore } from '../services/credentials';
import { handleIpc, handleIpcRaw } from './handler';
import { requireString } from './validate';

export function registerCredentialsHandlers(
  credentialsStore: CredentialsStore,
): void {
  handleIpcRaw('credentials:get', () => {
    return credentialsStore.getCredentials();
  });

  handleIpc('credentials:clear', () => {
    credentialsStore.clearCredentials();
  });

  handleIpcRaw('credentials:getSavedLogins', () => {
    return credentialsStore.getSavedLogins();
  });

  handleIpc('credentials:deleteSavedLogin', (username: string) => {
    requireString(username, 'username');
    credentialsStore.deleteSavedLogin(username);
  });

  handleIpc('credentials:updateLoginMetadata', (username: string, label: string, color: string, sandboxType?: string) => {
    requireString(username, 'username');
    requireString(label, 'label');
    credentialsStore.updateLoginMetadata(username, label, color ?? '', sandboxType);
  });

  handleIpcRaw('credentials:getLoginByUsername', (username: string) => {
    requireString(username, 'username');
    return credentialsStore.getLoginByUsername(username);
  });

  handleIpcRaw('credentials:getSavedOAuthLogins', () => {
    return credentialsStore.getSavedOAuthLogins();
  });

  handleIpc('credentials:deleteOAuthLogin', (id: string) => {
    requireString(id, 'OAuth login ID');
    credentialsStore.deleteOAuthLogin(id);
  });

  handleIpc('credentials:updateOAuthMetadata', (id: string, label: string, color: string, sandboxType?: string) => {
    requireString(id, 'OAuth login ID');
    requireString(label, 'label');
    credentialsStore.updateOAuthMetadata(id, label, color ?? '', sandboxType);
  });
}
