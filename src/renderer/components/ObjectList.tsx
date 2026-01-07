import React, { useState, useMemo, useEffect } from 'react';
import type { SalesforceObject } from '../types/electron.d';
import { useSettings } from '../contexts/SettingsContext';

const RECENT_OBJECTS_KEY = 'salesforce-query-tool-recent-objects';
const MAX_RECENT_OBJECTS = 5;

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
  const { settings, updateSettings } = useSettings();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCustomOnly, setShowCustomOnly] = useState(false);
  const [recentObjects, setRecentObjects] = useState<string[]>([]);

  // Load recent objects from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_OBJECTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate it's an array of strings
        if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
          // Trim to MAX_RECENT_OBJECTS in case the limit was reduced
          const trimmed = parsed.slice(0, MAX_RECENT_OBJECTS);
          setRecentObjects(trimmed);
          // Save trimmed list back if it was longer
          if (parsed.length > MAX_RECENT_OBJECTS) {
            localStorage.setItem(RECENT_OBJECTS_KEY, JSON.stringify(trimmed));
          }
        } else {
          // Reset if corrupted
          localStorage.removeItem(RECENT_OBJECTS_KEY);
        }
      }
    } catch (e) {
      console.error('Error loading recent objects:', e);
      localStorage.removeItem(RECENT_OBJECTS_KEY);
    }
  }, []);

  // Track when selectedObject changes (e.g., from pasted query auto-detection)
  useEffect(() => {
    if (selectedObject && !recentObjects.includes(selectedObject.name)) {
      const updated = [selectedObject.name, ...recentObjects.filter(name => name !== selectedObject.name)].slice(0, MAX_RECENT_OBJECTS);
      setRecentObjects(updated);
      try {
        localStorage.setItem(RECENT_OBJECTS_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving recent objects:', e);
      }
    }
  }, [selectedObject?.name]);

  // Track when an object is selected
  const handleObjectSelect = (obj: SalesforceObject) => {
    // Update recent objects
    const updated = [obj.name, ...recentObjects.filter(name => name !== obj.name)].slice(0, MAX_RECENT_OBJECTS);
    setRecentObjects(updated);
    try {
      localStorage.setItem(RECENT_OBJECTS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving recent objects:', e);
    }
    onSelectObject(obj);
  };

  // Computed: filter and optionally sort objects
  const filteredObjects = useMemo(() => {
    let filtered = [...objects]; // Create a copy to avoid mutating

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

    // Sort with recent objects first if enabled (only when not searching)
    if (settings.showRecentObjectsFirst && recentObjects.length > 0 && !searchTerm) {
      const recentSet = new Set(recentObjects);
      filtered.sort((a, b) => {
        const aIsRecent = recentSet.has(a.name);
        const bIsRecent = recentSet.has(b.name);
        if (aIsRecent && !bIsRecent) return -1;
        if (!aIsRecent && bIsRecent) return 1;
        if (aIsRecent && bIsRecent) {
          return recentObjects.indexOf(a.name) - recentObjects.indexOf(b.name);
        }
        return 0;
      });
    }

    return filtered;
  }, [objects, searchTerm, showCustomOnly, settings.showRecentObjectsFirst, recentObjects]);

  // Compute the index where recent objects end (for separator)
  const recentObjectsEndIndex = useMemo(() => {
    if (!settings.showRecentObjectsFirst || searchTerm || recentObjects.length === 0) {
      return -1;
    }
    const recentSet = new Set(recentObjects);
    for (let i = 0; i < filteredObjects.length; i++) {
      if (!recentSet.has(filteredObjects[i].name)) {
        return i;
      }
    }
    return filteredObjects.length; // All objects are recent
  }, [filteredObjects, settings.showRecentObjectsFirst, searchTerm, recentObjects]);

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

        {/* Filter toggles */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showRecentObjectsFirst}
              onChange={(e) => updateSettings({ ...settings, showRecentObjectsFirst: e.target.checked })}
              className="custom-checkbox w-4 h-4"
            />
            <span className="text-xs text-discord-text-muted">Recent objects first</span>
          </label>
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
            {filteredObjects.map((obj, index) => {
              const isRecent = settings.showRecentObjectsFirst && !searchTerm && index < recentObjectsEndIndex;
              const showSeparator = recentObjectsEndIndex > 0 && index === recentObjectsEndIndex;
              
              return (
                <React.Fragment key={obj.name}>
                  {showSeparator && (
                    <div className="border-t border-discord-darker my-2 pt-2">
                      <span className="text-[10px] text-discord-text-muted uppercase tracking-wide px-3">All Objects</span>
                    </div>
                  )}
                  <button
                    onClick={() => handleObjectSelect(obj)}
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

                      {/* Recent indicator */}
                      {isRecent && (
                        <svg className="w-3 h-3 text-discord-accent flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                      )}

                      {/* Custom badge */}
                      {obj.custom && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-discord-warning/20 text-discord-warning rounded flex-shrink-0">
                          Custom
                        </span>
                      )}
                    </div>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ObjectList;
