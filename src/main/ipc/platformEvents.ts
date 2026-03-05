/**
 * IPC handlers for Platform Events — discover, publish, subscribe, saved payloads, history.
 */

import { SalesforceService } from '../services/salesforce';
import { PlatformEventsService } from '../services/platformEvents';
import { PlatformEventsStore } from '../services/platformEventsStore';
import { handleIpc, handleIpcRaw } from './handler';
import { requireString, requireApiName, requireArray, requireObject, optionalString, optionalNumber } from './validate';
import { getMainWindow } from './window';

export function registerPlatformEventsHandlers(
  platformEventsService: PlatformEventsService,
  platformEventsStore: PlatformEventsStore,
  salesforceService: SalesforceService,
): void {
  // ── Discover ──────────────────────────────────────────────────────────────

  handleIpc('platformEvents:getEvents', async () => {
    const conn = salesforceService.getConnection();
    if (!conn) throw new Error('Not connected to Salesforce');
    return platformEventsService.getEvents(conn);
  });

  handleIpc('platformEvents:describe', async (eventName: string) => {
    requireApiName(eventName, 'event name');
    const conn = salesforceService.getConnection();
    if (!conn) throw new Error('Not connected to Salesforce');
    return platformEventsService.describeEvent(conn, eventName);
  });

  // ── Publish ───────────────────────────────────────────────────────────────

  handleIpc('platformEvents:publish', async (eventName: string, payload: Record<string, unknown>) => {
    requireApiName(eventName, 'event name');
    requireObject(payload, 'payload');
    const conn = salesforceService.getConnection();
    if (!conn) throw new Error('Not connected to Salesforce');

    const result = await platformEventsService.publishEvent(conn, eventName, payload);

    // Log to history
    platformEventsStore.addPublishLog({
      eventName,
      payload,
      success: result.success,
      resultId: result.id ?? undefined,
      error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
    });

    return result;
  });

  handleIpc('platformEvents:publishBulk', async (eventName: string, payloads: Record<string, unknown>[]) => {
    requireApiName(eventName, 'event name');
    requireArray(payloads, 'payloads');
    const conn = salesforceService.getConnection();
    if (!conn) throw new Error('Not connected to Salesforce');

    const results = await platformEventsService.publishBulk(conn, eventName, payloads);

    // Log each result to history
    for (let i = 0; i < results.length; i++) {
      platformEventsStore.addPublishLog({
        eventName,
        payload: payloads[i],
        success: results[i].success,
        resultId: results[i].id ?? undefined,
        error: results[i].errors.length > 0 ? results[i].errors.join('; ') : undefined,
      });
    }

    return results;
  });

  // ── Subscribe ─────────────────────────────────────────────────────────────

  handleIpc('platformEvents:subscribe', async (eventName: string, replayId?: number) => {
    requireApiName(eventName, 'event name');
    const conn = salesforceService.getConnection();
    if (!conn) throw new Error('Not connected to Salesforce');

    const replay = typeof replayId === 'number' ? replayId : -1;

    const subscriptionId = platformEventsService.subscribe(
      conn,
      eventName,
      replay,
      (data: any) => {
        // Push event to renderer
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('platformEvents:event', {
            subscriptionId,
            eventName,
            data,
            receivedAt: new Date().toISOString(),
          });
        }
      },
    );

    return { subscriptionId };
  });

  handleIpc('platformEvents:unsubscribe', async (subscriptionId: string) => {
    requireString(subscriptionId, 'subscription ID');
    platformEventsService.unsubscribe(subscriptionId);
  });

  handleIpc('platformEvents:unsubscribeAll', async () => {
    platformEventsService.unsubscribeAll();
  });

  handleIpcRaw('platformEvents:getSubscriptions', () => {
    return platformEventsService.getActiveSubscriptions();
  });

  // ── Saved Payloads ────────────────────────────────────────────────────────

  handleIpc('platformEvents:savePayload', (
    eventName: string,
    name: string,
    payload: Record<string, unknown>,
    existingId?: string,
  ) => {
    requireApiName(eventName, 'event name');
    requireString(name, 'payload name');
    requireObject(payload, 'payload');
    return platformEventsStore.savePayload(eventName, name, payload, existingId);
  });

  handleIpcRaw('platformEvents:getPayloads', () => {
    return platformEventsStore.getPayloads();
  });

  handleIpcRaw('platformEvents:getPayloadsForEvent', (eventName: string) => {
    requireApiName(eventName, 'event name');
    return platformEventsStore.getPayloadsForEvent(eventName);
  });

  handleIpc('platformEvents:deletePayload', (id: string) => {
    requireString(id, 'payload ID');
    platformEventsStore.deletePayload(id);
  });

  // ── Publish History ───────────────────────────────────────────────────────

  handleIpcRaw('platformEvents:getHistory', () => {
    return platformEventsStore.getPublishHistory();
  });

  handleIpc('platformEvents:clearHistory', () => {
    platformEventsStore.clearPublishHistory();
  });

  handleIpc('platformEvents:deleteHistoryEntry', (id: string) => {
    requireString(id, 'history entry ID');
    platformEventsStore.deletePublishLog(id);
  });
}
