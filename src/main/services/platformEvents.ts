/**
 * Platform Events service — discover, publish, and subscribe to Salesforce Platform Events.
 */

import * as jsforce from 'jsforce';
import { Subscription } from 'faye';
import { isValidApiName } from './soqlUtils';

// Re-export the StreamingExtension for replay support
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StreamingExtensionModule = require('jsforce/lib/api/streaming/extension');

export interface PlatformEventInfo {
  name: string;
  label: string;
  keyPrefix: string | null;
}

export interface PlatformEventField {
  name: string;
  label: string;
  type: string;
  length: number;
  nillable: boolean;
  createable: boolean;
  defaultValue: unknown;
  picklistValues?: { value: string; label: string; active: boolean }[];
}

export interface PlatformEventDescribe {
  name: string;
  label: string;
  fields: PlatformEventField[];
}

export interface PublishResult {
  id: string | null;
  success: boolean;
  errors: string[];
}

export interface ActiveSubscription {
  id: string;
  eventName: string;
  startedAt: string;
  eventCount: number;
}

interface SubscriptionEntry {
  id: string;
  eventName: string;
  startedAt: string;
  eventCount: number;
  fayeSubscription: Subscription;
  fayeClient: any;
}

export class PlatformEventsService {
  private subscriptions = new Map<string, SubscriptionEntry>();

  /**
   * List all Platform Event objects in the org (names ending in __e).
   */
  async getEvents(connection: jsforce.Connection): Promise<PlatformEventInfo[]> {
    const result = await connection.describeGlobal();
    return result.sobjects
      .filter((obj: any) => obj.name.endsWith('__e'))
      .map((obj: any) => ({
        name: obj.name,
        label: obj.label,
        keyPrefix: obj.keyPrefix ?? null,
      }))
      .sort((a: PlatformEventInfo, b: PlatformEventInfo) => a.label.localeCompare(b.label));
  }

  /**
   * Describe a single Platform Event — returns publishable fields.
   */
  async describeEvent(connection: jsforce.Connection, eventName: string): Promise<PlatformEventDescribe> {
    if (!isValidApiName(eventName)) {
      throw new Error('Invalid event name');
    }

    const result = await connection.describe(eventName);
    const fields: PlatformEventField[] = (result.fields as any[])
      .filter((f: any) => {
        // Exclude system fields that cannot be set when publishing
        const systemFields = new Set([
          'Id', 'ReplayId', 'CreatedById', 'CreatedDate', 'EventUuid',
        ]);
        return !systemFields.has(f.name);
      })
      .map((f: any) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        length: f.length ?? 0,
        nillable: f.nillable ?? true,
        createable: f.createable ?? false,
        defaultValue: f.defaultValue ?? null,
        picklistValues: f.picklistValues?.length
          ? f.picklistValues.map((pv: any) => ({
              value: pv.value,
              label: pv.label,
              active: pv.active,
            }))
          : undefined,
      }));

    return {
      name: result.name,
      label: result.label,
      fields,
    };
  }

  /**
   * Publish a single Platform Event.
   */
  async publishEvent(
    connection: jsforce.Connection,
    eventName: string,
    payload: Record<string, unknown>,
  ): Promise<PublishResult> {
    if (!isValidApiName(eventName)) {
      throw new Error('Invalid event name');
    }

    const result: any = await connection.sobject(eventName).create(payload);
    return {
      id: result.id ?? null,
      success: result.success ?? false,
      errors: result.errors?.map((e: any) => (typeof e === 'string' ? e : e.message ?? JSON.stringify(e))) ?? [],
    };
  }

  /**
   * Publish multiple Platform Events in a single call.
   */
  async publishBulk(
    connection: jsforce.Connection,
    eventName: string,
    payloads: Record<string, unknown>[],
  ): Promise<PublishResult[]> {
    if (!isValidApiName(eventName)) {
      throw new Error('Invalid event name');
    }
    if (payloads.length === 0) {
      return [];
    }

    const results: any = await connection.sobject(eventName).create(payloads);
    const resultArray = Array.isArray(results) ? results : [results];

    return resultArray.map((r: any) => ({
      id: r.id ?? null,
      success: r.success ?? false,
      errors: r.errors?.map((e: any) => (typeof e === 'string' ? e : e.message ?? JSON.stringify(e))) ?? [],
    }));
  }

  /**
   * Subscribe to a Platform Event channel via CometD streaming.
   * Returns a subscription ID that can be used to unsubscribe.
   * The callback is invoked for each received event.
   */
  subscribe(
    connection: jsforce.Connection,
    eventName: string,
    replayId: number,
    callback: (data: any) => void,
  ): string {
    if (!isValidApiName(eventName)) {
      throw new Error('Invalid event name');
    }

    const channel = `/event/${eventName}`;
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build extensions for replay support
    const extensions: any[] = [];
    const replayExt = new StreamingExtensionModule.Replay(channel, replayId);
    extensions.push(replayExt);

    const authFailureExt = new StreamingExtensionModule.AuthFailure(() => {
      console.error(`[PlatformEvents] Auth failure on subscription ${subscriptionId}`);
      this.unsubscribe(subscriptionId);
    });
    extensions.push(authFailureExt);

    const fayeClient = connection.streaming.createClient(extensions);

    const fayeSubscription = fayeClient.subscribe(channel, (data: any) => {
      const entry = this.subscriptions.get(subscriptionId);
      if (entry) {
        entry.eventCount++;
      }
      callback(data);
    });

    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      eventName,
      startedAt: new Date().toISOString(),
      eventCount: 0,
      fayeSubscription,
      fayeClient,
    });

    return subscriptionId;
  }

  /**
   * Unsubscribe a single subscription.
   */
  unsubscribe(subscriptionId: string): void {
    const entry = this.subscriptions.get(subscriptionId);
    if (!entry) return;

    try {
      entry.fayeSubscription.cancel();
    } catch (err) {
      console.error(`[PlatformEvents] Error cancelling subscription ${subscriptionId}:`, err);
    }
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Unsubscribe all active subscriptions (called on logout).
   */
  unsubscribeAll(): void {
    for (const [id] of this.subscriptions) {
      this.unsubscribe(id);
    }
  }

  /**
   * Get info about active subscriptions (without internal references).
   */
  getActiveSubscriptions(): ActiveSubscription[] {
    return Array.from(this.subscriptions.values()).map((entry) => ({
      id: entry.id,
      eventName: entry.eventName,
      startedAt: entry.startedAt,
      eventCount: entry.eventCount,
    }));
  }
}
