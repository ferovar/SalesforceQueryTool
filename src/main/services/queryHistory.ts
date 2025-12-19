import Store from 'electron-store';

export interface QueryHistoryEntry {
  id: string;
  query: string;
  objectName: string;
  executedAt: string;
  recordCount: number;
  success: boolean;
  error?: string;
}

interface QueryHistoryStoreSchema {
  history: QueryHistoryEntry[];
}

const MAX_HISTORY_ENTRIES = 50;

export class QueryHistoryStore {
  private store: Store<QueryHistoryStoreSchema>;

  constructor() {
    this.store = new Store<QueryHistoryStoreSchema>({
      name: 'salesforce-query-history',
      defaults: {
        history: [],
      },
    });
  }

  addEntry(entry: Omit<QueryHistoryEntry, 'id' | 'executedAt'>): QueryHistoryEntry {
    const history = this.store.get('history') || [];
    
    const newEntry: QueryHistoryEntry = {
      ...entry,
      id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      executedAt: new Date().toISOString(),
    };

    // Add to beginning of array
    history.unshift(newEntry);

    // Keep only the last MAX_HISTORY_ENTRIES entries
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.splice(MAX_HISTORY_ENTRIES);
    }

    this.store.set('history', history);
    return newEntry;
  }

  getHistory(): QueryHistoryEntry[] {
    return this.store.get('history') || [];
  }

  clearHistory(): void {
    this.store.set('history', []);
  }

  deleteEntry(entryId: string): void {
    const history = this.store.get('history') || [];
    const filtered = history.filter((h) => h.id !== entryId);
    this.store.set('history', filtered);
  }
}
