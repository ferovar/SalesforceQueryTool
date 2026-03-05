import React, { useState, useEffect } from 'react';
import type { EventPublishHistoryEntry } from '../../types/electron.d';

interface PublishHistoryTabProps {
  onRepublish: (eventName: string, payload: Record<string, unknown>) => void;
}

const PublishHistoryTab: React.FC<PublishHistoryTabProps> = ({ onRepublish }) => {
  const [history, setHistory] = useState<EventPublishHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await window.electronAPI.platformEvents.getHistory();
      setHistory(data);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    await window.electronAPI.platformEvents.clearHistory();
    setHistory([]);
    setShowClearConfirm(false);
  };

  const handleDeleteEntry = async (id: string) => {
    await window.electronAPI.platformEvents.deleteHistoryEntry(id);
    setHistory((prev) => prev.filter((h) => h.id !== id));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-discord-text-muted text-sm">Loading history...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-3 border-b border-discord-darker flex items-center justify-between">
        <h3 className="text-sm font-semibold text-discord-text">
          Publish History ({history.length})
        </h3>
        {history.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="text-xs text-red-400 hover:underline"
          >
            Clear All
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-discord-lighter" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-discord-text-muted text-sm">No publish history yet</p>
            </div>
          </div>
        ) : (
          history.map((entry) => (
            <div
              key={entry.id}
              className="border-b border-discord-darker/50 hover:bg-discord-medium/20"
            >
              <div className="px-6 py-3 flex items-center gap-4">
                {/* Status indicator */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.success ? 'bg-green-500' : 'bg-red-500'}`} />

                {/* Event info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-discord-text font-medium">{entry.eventName}</span>
                    {entry.resultId && (
                      <span className="text-xs text-discord-text-muted font-mono">{entry.resultId}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-discord-text-muted mt-0.5">
                    <span>{new Date(entry.publishedAt).toLocaleString()}</span>
                    {entry.error && <span className="text-red-400">{entry.error}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() =>
                      setExpandedEntry(expandedEntry === entry.id ? null : entry.id)
                    }
                    className="px-2 py-1 text-xs text-discord-text-muted hover:text-discord-text bg-discord-medium rounded transition-colors"
                  >
                    {expandedEntry === entry.id ? 'Hide' : 'View'}
                  </button>
                  <button
                    onClick={() => onRepublish(entry.eventName, entry.payload)}
                    className="px-2 py-1 text-xs text-discord-accent hover:underline"
                  >
                    Re-publish
                  </button>
                  <button
                    onClick={() => handleDeleteEntry(entry.id)}
                    className="p-1 text-discord-text-muted hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded payload */}
              {expandedEntry === entry.id && (
                <div className="px-6 pb-3">
                  <pre className="text-xs text-discord-text font-mono bg-discord-darker/50 p-3 rounded overflow-x-auto">
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Clear confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
          <div className="bg-discord-dark rounded-lg shadow-xl p-6 w-96 border border-discord-darker">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-full">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-discord-text">Clear History</h3>
                <p className="text-sm text-discord-text-muted">
                  This will permanently delete all {history.length} entries.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-sm text-discord-text-muted hover:text-discord-text bg-discord-medium rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearHistory}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublishHistoryTab;
