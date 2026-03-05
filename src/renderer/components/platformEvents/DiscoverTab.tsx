import React, { useState, useMemo } from 'react';
import type { PlatformEventInfo, PlatformEventDescribe } from '../../types/electron.d';

interface DiscoverTabProps {
  events: PlatformEventInfo[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectEvent: (eventName: string) => void;
  selectedEventName: string;
  selectedEventDescribe: PlatformEventDescribe | null;
  onUseInPublish: (eventName: string) => void;
  includeNamespaces: boolean;
  onToggleNamespaces: (value: boolean) => void;
}

const DiscoverTab: React.FC<DiscoverTabProps> = ({
  events,
  isLoading,
  onRefresh,
  onSelectEvent,
  selectedEventName,
  selectedEventDescribe,
  onUseInPublish,
  includeNamespaces,
  onToggleNamespaces,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEvents = useMemo(() => {
    if (!searchTerm) return events;
    const lower = searchTerm.toLowerCase();
    return events.filter(
      (e) => e.name.toLowerCase().includes(lower) || e.label.toLowerCase().includes(lower),
    );
  }, [events, searchTerm]);

  return (
    <div className="flex h-full">
      {/* Event List */}
      <div className="w-80 flex-shrink-0 border-r border-discord-darker flex flex-col">
        <div className="p-3 border-b border-discord-darker">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-semibold text-discord-text">Platform Events</h3>
            <button
              onClick={onRefresh}
              className="ml-auto p-1 text-discord-text-muted hover:text-discord-text rounded transition-colors"
              title="Refresh"
            >
              <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search events..."
            className="w-full px-3 py-1.5 bg-discord-medium border border-discord-darker rounded text-sm text-discord-text placeholder-discord-text-muted focus:outline-none focus:border-discord-accent"
          />
          <label className="flex items-center gap-1.5 text-xs text-discord-text-muted cursor-pointer mt-1.5 whitespace-nowrap">
            <input
              type="checkbox"
              checked={includeNamespaces}
              onChange={(e) => onToggleNamespaces(e.target.checked)}
              className="rounded"
            />
            Include Namespaces
          </label>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-discord-text-muted text-sm">Loading events...</div>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex items-center justify-center py-8 px-4">
              <div className="text-discord-text-muted text-sm text-center">
                {events.length === 0
                  ? 'No Platform Events found in this org'
                  : 'No events match your search'}
              </div>
            </div>
          ) : (
            filteredEvents.map((event) => (
              <button
                key={event.name}
                onClick={() => onSelectEvent(event.name)}
                className={`w-full text-left px-4 py-2.5 border-b border-discord-darker/50 transition-colors ${
                  selectedEventName === event.name
                    ? 'bg-discord-accent/20 text-discord-accent'
                    : 'text-discord-text hover:bg-discord-medium/50'
                }`}
              >
                <div className="text-sm font-medium truncate">{event.label}</div>
                <div className="text-xs text-discord-text-muted truncate">{event.name}</div>
              </button>
            ))
          )}
        </div>

        <div className="p-2 border-t border-discord-darker text-xs text-discord-text-muted text-center">
          {events.length} event{events.length !== 1 ? 's' : ''} found
        </div>
      </div>

      {/* Event Details */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedEventDescribe ? (
          <>
            <div className="px-6 py-4 border-b border-discord-darker">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-discord-text">{selectedEventDescribe.label}</h3>
                  <p className="text-sm text-discord-text-muted">{selectedEventDescribe.name}</p>
                </div>
                <button
                  onClick={() => onUseInPublish(selectedEventName)}
                  className="px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover text-white text-sm rounded transition-colors"
                >
                  Use in Publish
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <h4 className="text-sm font-semibold text-discord-text mb-3">
                Fields ({selectedEventDescribe.fields.length})
              </h4>
              <div className="border border-discord-darker rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-discord-darker/50">
                      <th className="text-left px-4 py-2 text-discord-text-muted font-medium">Field</th>
                      <th className="text-left px-4 py-2 text-discord-text-muted font-medium">API Name</th>
                      <th className="text-left px-4 py-2 text-discord-text-muted font-medium">Type</th>
                      <th className="text-left px-4 py-2 text-discord-text-muted font-medium">Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEventDescribe.fields.map((field) => (
                      <tr key={field.name} className="border-t border-discord-darker/50 hover:bg-discord-medium/30">
                        <td className="px-4 py-2 text-discord-text">{field.label}</td>
                        <td className="px-4 py-2 text-discord-text-muted font-mono text-xs">{field.name}</td>
                        <td className="px-4 py-2">
                          <span className="px-2 py-0.5 bg-discord-medium rounded text-xs text-discord-text">
                            {field.type}
                            {field.length > 0 ? `(${field.length})` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {!field.nillable ? (
                            <span className="text-red-400 text-xs">Required</span>
                          ) : (
                            <span className="text-discord-text-muted text-xs">Optional</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-discord-lighter" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p className="text-discord-text-muted">
                Select a Platform Event to view its fields
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverTab;
