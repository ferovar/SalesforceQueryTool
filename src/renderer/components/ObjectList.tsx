import React, { useState, useMemo } from 'react';
import type { SalesforceObject } from '../types/electron.d';

interface ObjectListProps {
  objects: SalesforceObject[];
  selectedObject: SalesforceObject | null;
  onSelectObject: (obj: SalesforceObject) => void;
  isLoading: boolean;
}

const ObjectList: React.FC<ObjectListProps> = ({
  objects,
  selectedObject,
  onSelectObject,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCustomOnly, setShowCustomOnly] = useState(false);

  const filteredObjects = useMemo(() => {
    let filtered = objects;

    if (showCustomOnly) {
      filtered = filtered.filter((obj) => obj.custom);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (obj) =>
          obj.name.toLowerCase().includes(term) ||
          obj.label.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [objects, searchTerm, showCustomOnly]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-discord-darker">
        <h2 className="text-sm font-semibold text-discord-text-muted uppercase tracking-wide mb-3">
          Objects
        </h2>

        {/* Search */}
        <div className="relative mb-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search objects..."
            className="w-full px-3 py-2 pl-9 text-sm bg-discord-darker rounded text-discord-text placeholder-discord-text-muted border border-transparent focus:border-discord-accent"
          />
          <svg
            className="absolute left-3 top-2.5 w-4 h-4 text-discord-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-2 p-1 hover:bg-discord-light rounded"
            >
              <svg className="w-3 h-3 text-discord-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showCustomOnly}
            onChange={(e) => setShowCustomOnly(e.target.checked)}
            className="custom-checkbox w-4 h-4"
          />
          <span className="text-xs text-discord-text-muted">Custom objects only</span>
        </label>
      </div>

      {/* Object count */}
      <div className="px-3 py-2 text-xs text-discord-text-muted border-b border-discord-darker">
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Retrieving objects...
          </span>
        ) : (
          <>
            {filteredObjects.length} of {objects.length} objects
          </>
        )}
      </div>

      {/* Object list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 flex flex-col items-center justify-center text-discord-text-muted">
            <svg className="animate-spin w-8 h-8 mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-sm">Loading Salesforce objects...</p>
            <p className="text-xs mt-1">This may take a moment</p>
          </div>
        ) : filteredObjects.length === 0 ? (
          <div className="p-4 text-center text-discord-text-muted text-sm">
            {searchTerm ? 'No objects match your search' : 'No objects found'}
          </div>
        ) : (
          <div className="p-2">
            {filteredObjects.map((obj) => (
              <button
                key={obj.name}
                onClick={() => onSelectObject(obj)}
                className={`w-full text-left px-3 py-2 rounded-md mb-0.5 transition-colors group ${
                  selectedObject?.name === obj.name
                    ? 'bg-discord-accent/20 text-discord-text'
                    : 'text-discord-text-muted hover:bg-discord-lighter hover:text-discord-text'
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* Icon */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    obj.custom ? 'bg-discord-warning' : 'bg-discord-accent'
                  }`} />
                  
                  {/* Object info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {obj.label}
                    </p>
                    <p className="text-xs text-discord-text-muted truncate">
                      {obj.name}
                    </p>
                  </div>

                  {/* Custom badge */}
                  {obj.custom && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-discord-warning/20 text-discord-warning rounded flex-shrink-0">
                      Custom
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ObjectList;
