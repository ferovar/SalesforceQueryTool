/**
 * IPC handlers for Salesforce operations — login, query, object browse.
 */

import { SalesforceService } from '../services/salesforce';
import { CredentialsStore } from '../services/credentials';
import { PlatformEventsService } from '../services/platformEvents';
import { handleIpc } from './handler';
import { requireString, requireBoolean, requireApiName, requireSalesforceId, requireArray, optionalString, optionalNumber } from './validate';

export function registerSalesforceHandlers(
  salesforceService: SalesforceService,
  credentialsStore: CredentialsStore,
  platformEventsService?: PlatformEventsService,
): void {
  handleIpc('salesforce:login', async (credentials: {
    label: string;
    username: string;
    password: string;
    securityToken: string;
    isSandbox: boolean;
    saveCredentials: boolean;
    color?: string;
    sandboxType?: string;
  }) => {
    requireString(credentials.username, 'username');
    requireString(credentials.password, 'password');

    const result = await salesforceService.login(
      credentials.username,
      credentials.password,
      credentials.securityToken ?? '',
      !!credentials.isSandbox
    );

    if (credentials.saveCredentials) {
      credentialsStore.saveCredentials({
        label: credentials.label || credentials.username,
        username: credentials.username,
        password: credentials.password,
        securityToken: credentials.securityToken,
        isSandbox: credentials.isSandbox,
        color: credentials.color,
        sandboxType: credentials.isSandbox ? credentials.sandboxType : undefined,
      });
    }

    return { ...result, username: credentials.username, color: credentials.color };
  });

  handleIpc('salesforce:loginOAuth', async (options: { isSandbox: boolean; clientId?: string }) => {
    return salesforceService.loginWithOAuth(!!options.isSandbox, options.clientId);
  });

  handleIpc('salesforce:loginWithSavedOAuth', async (id: string) => {
    requireString(id, 'OAuth login ID');

    const savedOAuth = credentialsStore.getOAuthLoginById(id);
    if (!savedOAuth) {
      throw new Error('Saved OAuth connection not found');
    }

    const result = await salesforceService.loginWithSavedOAuth(
      savedOAuth.instanceUrl,
      savedOAuth.accessToken,
      savedOAuth.refreshToken,
      savedOAuth.clientId,
      savedOAuth.isSandbox
    );

    if (result.accessToken) {
      credentialsStore.updateOAuthTokens(id, result.accessToken);
    }

    return { ...result, color: savedOAuth.color };
  });

  handleIpc('salesforce:logout', async () => {
    platformEventsService?.unsubscribeAll();
    await salesforceService.logout();
  });

  handleIpc('salesforce:getObjects', async () => {
    return salesforceService.getObjects();
  });

  handleIpc('salesforce:describeObject', async (objectName: string) => {
    requireApiName(objectName, 'object name');
    return salesforceService.describeObject(objectName);
  });

  handleIpc('salesforce:executeQuery', async (query: string, includeDeleted: boolean) => {
    requireString(query, 'query');
    return salesforceService.executeQuery(query, !!includeDeleted);
  });

  handleIpc('salesforce:updateRecord', async (objectName: string, recordId: string, fields: Record<string, unknown>) => {
    requireApiName(objectName, 'object name');
    requireSalesforceId(recordId, 'record ID');
    return salesforceService.updateRecord(objectName, recordId, fields as Record<string, any>);
  });

  handleIpc('salesforce:exportToCsv', async (data: unknown[], filename: string) => {
    requireArray(data, 'data');
    requireString(filename, 'filename');
    return salesforceService.exportToCsv(data as any[], filename);
  });
}
