/**
 * Persistence layer for Platform Events — saved payloads and publish history.
 * Uses electron-store, following the same pattern as ApexScriptsStore.
 */

import Store from 'electron-store';

export interface SavedPayload {
  id: string;
  eventName: string;
  name: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PublishHistoryEntry {
  id: string;
  eventName: string;
  payload: Record<string, unknown>;
  publishedAt: string;
  success: boolean;
  resultId?: string;
  error?: string;
}

interface PlatformEventsStoreSchema {
  savedPayloads: SavedPayload[];
  publishHistory: PublishHistoryEntry[];
}

const MAX_PUBLISH_HISTORY = 100;

export class PlatformEventsStore {
  private store: Store<PlatformEventsStoreSchema>;

  constructor() {
    this.store = new Store<PlatformEventsStoreSchema>({
      name: 'salesforce-platform-events',
      defaults: {
        savedPayloads: [],
        publishHistory: [],
      },
    });
  }

  // ── Saved Payloads ──────────────────────────────────────────────────────────

  savePayload(
    eventName: string,
    name: string,
    payload: Record<string, unknown>,
    existingId?: string,
  ): SavedPayload {
    const payloads = this.store.get('savedPayloads') || [];
    const now = new Date().toISOString();

    if (existingId) {
      const index = payloads.findIndex((p) => p.id === existingId);
      if (index !== -1) {
        payloads[index] = {
          ...payloads[index],
          eventName,
          name,
          payload,
          updatedAt: now,
        };
        this.store.set('savedPayloads', payloads);
        return payloads[index];
      }
    }

    const newPayload: SavedPayload = {
      id: `payload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      eventName,
      name,
      payload,
      createdAt: now,
      updatedAt: now,
    };

    payloads.unshift(newPayload);
    this.store.set('savedPayloads', payloads);
    return newPayload;
  }

  getPayloads(): SavedPayload[] {
    return this.store.get('savedPayloads') || [];
  }

  getPayloadsForEvent(eventName: string): SavedPayload[] {
    const payloads = this.store.get('savedPayloads') || [];
    return payloads.filter((p) => p.eventName === eventName);
  }

  deletePayload(id: string): void {
    const payloads = this.store.get('savedPayloads') || [];
    this.store.set(
      'savedPayloads',
      payloads.filter((p) => p.id !== id),
    );
  }

  // ── Publish History ─────────────────────────────────────────────────────────

  addPublishLog(
    entry: Omit<PublishHistoryEntry, 'id' | 'publishedAt'>,
  ): PublishHistoryEntry {
    const history = this.store.get('publishHistory') || [];

    const newEntry: PublishHistoryEntry = {
      ...entry,
      id: `pub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      publishedAt: new Date().toISOString(),
    };

    history.unshift(newEntry);
    if (history.length > MAX_PUBLISH_HISTORY) {
      history.splice(MAX_PUBLISH_HISTORY);
    }

    this.store.set('publishHistory', history);
    return newEntry;
  }

  getPublishHistory(): PublishHistoryEntry[] {
    return this.store.get('publishHistory') || [];
  }

  clearPublishHistory(): void {
    this.store.set('publishHistory', []);
  }

  deletePublishLog(id: string): void {
    const history = this.store.get('publishHistory') || [];
    this.store.set(
      'publishHistory',
      history.filter((h) => h.id !== id),
    );
  }
}
