import React, { useState, useEffect } from 'react';
import type { QueryHistoryEntry } from '../types/electron.d';

interface QueryHistoryProps {
  onSelectQuery: (query: string, objectName: string) => void;
  refreshTrigger?: number;
}

const QueryHistory: React.FC<QueryHistoryProps> = ({ onSelectQuery, refreshTrigger }) => {
  const [history, setHistory] = useState<QueryHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Load history on mount and when refreshTrigger changes
  useEffect(() => {
    loadHistory();
  }, [refreshTrigger]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const entries = await window.electronAPI.history.getAll();
      setHistory(entries);
    } catch (error) {
      console.error('Failed to load query history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (confirm('Are you sure you want to clear all query history?')) {
      await window.electronAPI.history.clear();
      setHistory([]);
    }
  };

  const handleDeleteEntry = async (e: React.MouseEvent, entryId: string) => {
    e.stopPropagation();
    await window.electronAPI.history.delete(entryId);
    setHistory(prev => prev.filter(h => h.id !== entryId));
  };

  const formatRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const truncateQuery = (query: string, maxLength: number = 100): string => {
    // Normalize whitespace and truncate
    const normalized = query.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return normalized.substring(0, maxLength) + '...';
  };

  const filteredHistory = history.filter(entry => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      entry.query.toLowerCase().includes(term) ||
      entry.objectName.toLowerCase().includes(term)
    );
  });

  return (
    <div className="h-full flex flex-col bg-discord-dark">
      {/* Header */}
      <div className="p-3 border-b border-discord-lighter">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-discord-text flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Query History
          </h3>
          {history.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="text-xs text-discord-text-muted hover:text-discord-danger transition-colors"
              title="Clear all history"
            >
              Clear
            </button>
          )}
        </div>
        
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search history..."
            className="w-full px-3 py-1.5 pl-8 text-sm bg-discord-darker border border-discord-lighter rounded text-discord-text placeholder-discord-text-muted focus:outline-none focus:border-discord-accent"
          />
          <svg 
            className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-discord-text-muted" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="animate-spin w-5 h-5 text-discord-text-muted" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-8 px-4">
            <svg className="w-10 h-10 mx-auto mb-2 text-discord-lighter" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-discord-text-muted">
              {searchTerm ? 'No matching queries found' : 'No query history yet'}
            </p>
            <p className="text-xs text-discord-text-muted mt-1">
              {!searchTerm && 'Run some queries to see them here'}
            </p>
          </div>
        ) : (
          <div className="py-1">
            {filteredHistory.map((entry) => (
              <div
                key={entry.id}
                onClick={() => onSelectQuery(entry.query, entry.objectName)}
                className="px-3 py-2 hover:bg-discord-light cursor-pointer group border-b border-discord-lighter/50 last:border-b-0"
              >
                {/* Object name and time */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-discord-accent">
                    {entry.objectName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-discord-text-muted">
                      {formatRelativeTime(entry.executedAt)}
                    </span>
                    <button
                      onClick={(e) => handleDeleteEntry(e, entry.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-discord-text-muted hover:text-discord-danger transition-opacity"
                      title="Remove from history"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                {/* Query preview */}
                <p className="text-xs text-discord-text font-mono leading-relaxed break-all">
                  {truncateQuery(entry.query)}
                </p>
                
                {/* Result info */}
                <div className="flex items-center gap-2 mt-1.5">
                  {entry.success ? (
                    <span className="text-xs text-discord-success flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {entry.recordCount} record{entry.recordCount !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-discord-danger flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Error
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Footer with count */}
      {history.length > 0 && (
        <div className="px-3 py-2 border-t border-discord-lighter text-xs text-discord-text-muted text-center">
          {filteredHistory.length} of {history.length} queries
        </div>
      )}
    </div>
  );
};

export default QueryHistory;
