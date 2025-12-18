import Store from 'electron-store';

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  objectName: string;
  createdAt: string;
  lastRunAt: string | null;
}

interface QueriesStoreSchema {
  savedQueries: SavedQuery[];
}

export class QueriesStore {
  private store: Store<QueriesStoreSchema>;

  constructor() {
    this.store = new Store<QueriesStoreSchema>({
      name: 'salesforce-queries',
      defaults: {
        savedQueries: [],
      },
    });
  }

  saveQuery(objectName: string, name: string, query: string): SavedQuery {
    const savedQueries = this.store.get('savedQueries') || [];
    
    // Check if a query with this name already exists for this object
    const existingIndex = savedQueries.findIndex(
      (q) => q.objectName === objectName && q.name.toLowerCase() === name.toLowerCase()
    );

    const now = new Date().toISOString();
    const savedQuery: SavedQuery = {
      id: existingIndex >= 0 
        ? savedQueries[existingIndex].id 
        : `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      query,
      objectName,
      createdAt: existingIndex >= 0 ? savedQueries[existingIndex].createdAt : now,
      lastRunAt: existingIndex >= 0 ? savedQueries[existingIndex].lastRunAt : now,
    };

    if (existingIndex >= 0) {
      savedQueries[existingIndex] = savedQuery;
    } else {
      savedQueries.push(savedQuery);
    }

    this.store.set('savedQueries', savedQueries);
    return savedQuery;
  }

  getQueriesForObject(objectName: string): SavedQuery[] {
    const savedQueries = this.store.get('savedQueries') || [];
    return savedQueries
      .filter((q) => q.objectName === objectName)
      .sort((a, b) => {
        // Sort by last run date (most recent first), then by created date
        if (a.lastRunAt && b.lastRunAt) {
          return new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime();
        }
        if (a.lastRunAt) return -1;
        if (b.lastRunAt) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }

  updateLastRunAt(queryId: string): void {
    const savedQueries = this.store.get('savedQueries') || [];
    const index = savedQueries.findIndex((q) => q.id === queryId);
    
    if (index >= 0) {
      savedQueries[index].lastRunAt = new Date().toISOString();
      this.store.set('savedQueries', savedQueries);
    }
  }

  deleteQuery(queryId: string): void {
    const savedQueries = this.store.get('savedQueries') || [];
    const filtered = savedQueries.filter((q) => q.id !== queryId);
    this.store.set('savedQueries', filtered);
  }

  getQueryById(queryId: string): SavedQuery | null {
    const savedQueries = this.store.get('savedQueries') || [];
    return savedQueries.find((q) => q.id === queryId) || null;
  }
}
