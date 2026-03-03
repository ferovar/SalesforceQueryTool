/**
 * IPC handlers for saved queries and query history.
 */

import { QueriesStore } from '../services/queries';
import { QueryHistoryStore } from '../services/queryHistory';
import { handleIpc, handleIpcRaw } from './handler';
import { requireString } from './validate';

export function registerQueryHandlers(
  queriesStore: QueriesStore,
  queryHistoryStore: QueryHistoryStore,
): void {
  // Saved queries
  handleIpc('queries:save', (objectName: string, name: string, query: string) => {
    requireString(objectName, 'object name');
    requireString(name, 'query name');
    requireString(query, 'query');
    return queriesStore.saveQuery(objectName, name, query);
  });

  handleIpcRaw('queries:getForObject', (objectName: string) => {
    requireString(objectName, 'object name');
    return queriesStore.getQueriesForObject(objectName);
  });

  handleIpc('queries:delete', (queryId: string) => {
    requireString(queryId, 'query ID');
    queriesStore.deleteQuery(queryId);
  });

  handleIpc('queries:updateLastRun', (queryId: string) => {
    requireString(queryId, 'query ID');
    queriesStore.updateLastRunAt(queryId);
  });

  // Query history
  handleIpc('history:add', (entry: { query: string; objectName: string; recordCount: number; success: boolean; error?: string }) => {
    requireString(entry.query, 'query');
    return queryHistoryStore.addEntry(entry);
  });

  handleIpcRaw('history:getAll', () => {
    return queryHistoryStore.getHistory();
  });

  handleIpc('history:clear', () => {
    queryHistoryStore.clearHistory();
  });

  handleIpc('history:delete', (entryId: string) => {
    requireString(entryId, 'entry ID');
    queryHistoryStore.deleteEntry(entryId);
  });
}
