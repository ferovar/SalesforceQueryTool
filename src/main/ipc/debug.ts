/**
 * IPC handlers for User Debugging — trace flags, debug logs.
 */

import { SalesforceService } from '../services/salesforce';
import { handleIpc } from './handler';
import { requireString, requireSalesforceId, requireNumber, optionalString, optionalNumber } from './validate';

export function registerDebugHandlers(
  salesforceService: SalesforceService,
): void {
  handleIpc('debug:searchUsers', async (searchTerm: string) => {
    requireString(searchTerm, 'search term');
    return salesforceService.searchUsers(searchTerm);
  });

  handleIpc('debug:createTraceFlag', async (userId: string, durationMinutes: number) => {
    requireSalesforceId(userId, 'user ID');
    requireNumber(durationMinutes, 'duration');
    return salesforceService.createUserTraceFlag(userId, durationMinutes);
  });

  handleIpc('debug:deleteTraceFlag', async (traceFlagId: string) => {
    requireSalesforceId(traceFlagId, 'trace flag ID');
    await salesforceService.deleteTraceFlag(traceFlagId);
  });

  handleIpc('debug:getActiveTraceFlags', async () => {
    return salesforceService.getActiveTraceFlags();
  });

  handleIpc('debug:getLogsForUser', async (userId: string, sinceTime?: string, limit?: number) => {
    requireSalesforceId(userId, 'user ID');
    return salesforceService.getDebugLogsForUser(userId, sinceTime, limit ?? 50);
  });
}
