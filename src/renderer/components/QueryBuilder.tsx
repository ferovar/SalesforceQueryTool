import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { SalesforceObject, ObjectDescription, SalesforceField, SavedQuery } from '../types/electron.d';
import SoqlHighlighter from './SoqlHighlighter';

// Available limit options
const LIMIT_OPTIONS = [
  { value: 0, label: 'No Limit' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 500, label: '500' },
  { value: 1000, label: '1000' },
  { value: 2000, label: '2000' },
];

interface QueryBuilderProps {
  selectedObject: SalesforceObject;
  objectDescription: ObjectDescription | null;
  query: string;
  onQueryChange: (query: string) => void;
  onExecuteQuery: (includeDeleted: boolean, limit: number) => void;
  isLoading: boolean;
  isExecuting: boolean;
  selectedLimit: number;
  onLimitChange: (limit: number) => void;
}

interface AutocompleteState {
  isVisible: boolean;
  suggestions: SalesforceField[];
  selectedIndex: number;
  position: { top: number; left: number };
  prefix: string;  // The partial text being typed
  startPos: number; // Position where the current word starts
}

const QueryBuilder: React.FC<QueryBuilderProps> = ({
  selectedObject,
  objectDescription,
  query,
  onQueryChange,
  onExecuteQuery,
  isLoading,
  isExecuting,
  selectedLimit,
  onLimitChange,
}) => {
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [fieldSearch, setFieldSearch] = useState('');
  
  // Autocomplete state
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const [autocomplete, setAutocomplete] = useState<AutocompleteState>({
    isVisible: false,
    suggestions: [],
    selectedIndex: 0,
    position: { top: 0, left: 0 },
    prefix: '',
    startPos: 0,
  });
  
  // Saved queries state
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [showSavedQueriesDropdown, setShowSavedQueriesDropdown] = useState(false);
  const [showActiveQueryDropdown, setShowActiveQueryDropdown] = useState(false);
  const [showSaveQueryModal, setShowSaveQueryModal] = useState(false);
  const [newQueryName, setNewQueryName] = useState('');
  const [savingQuery, setSavingQuery] = useState(false);
  const [activeSavedQuery, setActiveSavedQuery] = useState<SavedQuery | null>(null);

  // Load saved queries when object changes
  useEffect(() => {
    const loadSavedQueries = async () => {
      const queries = await window.electronAPI.queries.getForObject(selectedObject.name);
      setSavedQueries(queries);
    };
    loadSavedQueries();
    setActiveSavedQuery(null); // Clear active query when switching objects
  }, [selectedObject.name]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (showSavedQueriesDropdown && !target.closest('.saved-queries-dropdown')) {
        setShowSavedQueriesDropdown(false);
      }
      if (showActiveQueryDropdown && !target.closest('.active-query-dropdown')) {
        setShowActiveQueryDropdown(false);
      }
      // Close autocomplete when clicking outside
      if (autocomplete.isVisible && !target.closest('.autocomplete-dropdown') && target !== textareaRef.current) {
        setAutocomplete(prev => ({ ...prev, isVisible: false }));
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSavedQueriesDropdown, showActiveQueryDropdown, autocomplete.isVisible]);

  // Helper to get caret position in textarea
  const getCaretCoordinates = useCallback((textarea: HTMLTextAreaElement, position: number) => {
    // Create a mirror div to calculate position
    const mirror = document.createElement('div');
    const computed = getComputedStyle(textarea);
    
    mirror.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: break-word;
      font-family: ${computed.fontFamily};
      font-size: ${computed.fontSize};
      line-height: ${computed.lineHeight};
      padding: ${computed.padding};
      width: ${textarea.clientWidth}px;
      border: ${computed.border};
    `;
    
    document.body.appendChild(mirror);
    
    const textBeforeCaret = textarea.value.substring(0, position);
    mirror.textContent = textBeforeCaret;
    
    // Add a span at the end to measure position
    const span = document.createElement('span');
    span.textContent = '|';
    mirror.appendChild(span);
    
    const rect = textarea.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    
    document.body.removeChild(mirror);
    
    return {
      top: rect.top + (spanRect.top - mirrorRect.top) + 24, // 24px offset for dropdown below cursor
      left: rect.left + (spanRect.left - mirrorRect.left),
    };
  }, []);

  // Check if we're in a position where field autocomplete should trigger
  const shouldShowAutocomplete = useCallback((text: string, cursorPos: number): { show: boolean; prefix: string; startPos: number } => {
    if (!objectDescription?.fields) return { show: false, prefix: '', startPos: 0 };
    
    // Get text before cursor
    const textBeforeCursor = text.substring(0, cursorPos);
    
    // Find the start of the current word
    const wordMatch = textBeforeCursor.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
    if (!wordMatch) return { show: false, prefix: '', startPos: 0 };
    
    const prefix = wordMatch[0];
    const startPos = cursorPos - prefix.length;
    const textBeforeWord = textBeforeCursor.substring(0, startPos).trimEnd();
    
    // Check if we're after SELECT, a comma in the SELECT clause, or a dot (relationship)
    const upperText = textBeforeWord.toUpperCase();
    
    // Check for SELECT context - after SELECT keyword or after commas before FROM
    const selectMatch = upperText.match(/SELECT\s*$/);
    const commaMatch = textBeforeWord.match(/,\s*$/);
    const dotMatch = textBeforeWord.match(/\.\s*$/);
    
    // Check if we're before FROM (still in SELECT clause)
    const fromIndex = text.toUpperCase().indexOf('FROM');
    const inSelectClause = fromIndex === -1 || cursorPos < fromIndex;
    
    // Also allow in WHERE clause for conditions
    const whereMatch = upperText.match(/WHERE\s+$/i);
    const andOrMatch = upperText.match(/\b(AND|OR)\s+$/i);
    const operatorMatch = textBeforeWord.match(/[=<>!]+\s*$/);
    
    if (selectMatch || (commaMatch && inSelectClause) || dotMatch || whereMatch || andOrMatch) {
      return { show: true, prefix, startPos };
    }
    
    return { show: false, prefix: '', startPos: 0 };
  }, [objectDescription?.fields]);

  // Filter fields based on prefix
  const getFilteredSuggestions = useCallback((prefix: string): SalesforceField[] => {
    if (!objectDescription?.fields || !prefix) return [];
    
    const lowerPrefix = prefix.toLowerCase();
    return objectDescription.fields
      .filter(field => 
        field.name.toLowerCase().startsWith(lowerPrefix) ||
        field.label.toLowerCase().startsWith(lowerPrefix)
      )
      .slice(0, 10); // Limit to 10 suggestions
  }, [objectDescription?.fields]);

  // Handle input change in textarea with autocomplete
  const handleQueryInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    onQueryChange(newValue);
    
    // Check if we should show autocomplete
    const { show, prefix, startPos } = shouldShowAutocomplete(newValue, cursorPos);
    
    if (show && prefix.length >= 1) {
      const suggestions = getFilteredSuggestions(prefix);
      if (suggestions.length > 0) {
        const coords = getCaretCoordinates(e.target, startPos);
        setAutocomplete({
          isVisible: true,
          suggestions,
          selectedIndex: 0,
          position: coords,
          prefix,
          startPos,
        });
      } else {
        setAutocomplete(prev => ({ ...prev, isVisible: false }));
      }
    } else {
      setAutocomplete(prev => ({ ...prev, isVisible: false }));
    }
  }, [onQueryChange, shouldShowAutocomplete, getFilteredSuggestions, getCaretCoordinates]);

  // Apply autocomplete suggestion
  const applySuggestion = useCallback((field: SalesforceField) => {
    const before = query.substring(0, autocomplete.startPos);
    const after = query.substring(autocomplete.startPos + autocomplete.prefix.length);
    const newQuery = before + field.name + after;
    
    onQueryChange(newQuery);
    setAutocomplete(prev => ({ ...prev, isVisible: false }));
    
    // Focus textarea and set cursor position after the inserted field
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = autocomplete.startPos + field.name.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [query, autocomplete.startPos, autocomplete.prefix, onQueryChange]);

  // Handle keyboard navigation in autocomplete
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (autocomplete.isVisible) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setAutocomplete(prev => ({
            ...prev,
            selectedIndex: Math.min(prev.selectedIndex + 1, prev.suggestions.length - 1),
          }));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setAutocomplete(prev => ({
            ...prev,
            selectedIndex: Math.max(prev.selectedIndex - 1, 0),
          }));
          break;
        case 'Tab':
        case 'Enter':
          if (autocomplete.suggestions.length > 0) {
            e.preventDefault();
            applySuggestion(autocomplete.suggestions[autocomplete.selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setAutocomplete(prev => ({ ...prev, isVisible: false }));
          break;
      }
    } else if (e.key === 'Enter' && e.ctrlKey) {
      // Keep Ctrl+Enter to run query
      e.preventDefault();
      if (query.trim()) {
        onExecuteQuery(false, selectedLimit);
      }
    }
  }, [autocomplete, applySuggestion, query, selectedLimit, onExecuteQuery]);

  // Scroll selected item into view
  useEffect(() => {
    if (autocomplete.isVisible && autocompleteRef.current) {
      const selected = autocompleteRef.current.querySelector('.autocomplete-selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [autocomplete.selectedIndex, autocomplete.isVisible]);

  // Format relative time
  const formatRelativeTime = (dateStr: string | null): string => {
    if (!dateStr) return 'Never run';
    
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

  // Handle save query (for Save As New)
  const handleSaveQuery = async () => {
    if (!newQueryName.trim() || !query.trim()) return;
    
    setSavingQuery(true);
    try {
      const result = await window.electronAPI.queries.save(
        selectedObject.name,
        newQueryName.trim(),
        query
      );
      
      if (result.success && result.data) {
        // Update or add to saved queries list
        setSavedQueries(prev => {
          const existingIndex = prev.findIndex(q => q.id === result.data!.id);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = result.data!;
            return updated;
          }
          return [result.data!, ...prev];
        });
        setActiveSavedQuery(result.data);
        setShowSaveQueryModal(false);
        setNewQueryName('');
      }
    } finally {
      setSavingQuery(false);
    }
  };

  // Handle immediate update of existing query
  const handleUpdateQuery = async () => {
    if (!activeSavedQuery || !query.trim()) return;
    
    const result = await window.electronAPI.queries.save(
      selectedObject.name,
      activeSavedQuery.name,
      query
    );
    
    if (result.success && result.data) {
      setSavedQueries(prev => prev.map(q => 
        q.id === result.data!.id ? result.data! : q
      ));
      setActiveSavedQuery(result.data);
    }
    setShowActiveQueryDropdown(false);
  };

  // Handle delete from active query dropdown
  const handleDeleteActiveQuery = async () => {
    if (!activeSavedQuery) return;
    
    await window.electronAPI.queries.delete(activeSavedQuery.id);
    setSavedQueries(prev => prev.filter(q => q.id !== activeSavedQuery.id));
    setActiveSavedQuery(null);
    setShowActiveQueryDropdown(false);
  };

  // Parse LIMIT from a query string
  const parseLimitFromQuery = (queryStr: string): number | null => {
    const limitMatch = queryStr.match(/\bLIMIT\s+(\d+)\s*$/i);
    if (limitMatch) {
      return parseInt(limitMatch[1], 10);
    }
    return null;
  };

  // Remove LIMIT clause from a query string
  const removeLimitFromQuery = (queryStr: string): string => {
    return queryStr.replace(/\s*\bLIMIT\s+\d+\s*$/i, '');
  };

  // Handle load saved query
  const handleLoadQuery = (savedQuery: SavedQuery) => {
    // Parse limit from saved query and update dropdown
    const limit = parseLimitFromQuery(savedQuery.query);
    if (limit !== null) {
      // Find closest matching limit option
      const matchingOption = LIMIT_OPTIONS.find(opt => opt.value === limit);
      if (matchingOption) {
        onLimitChange(limit);
      } else {
        // If exact limit not in options, keep current selection
        onLimitChange(limit);
      }
      // Remove LIMIT from query text
      onQueryChange(removeLimitFromQuery(savedQuery.query));
    } else {
      onLimitChange(0); // No limit
      onQueryChange(savedQuery.query);
    }
    setActiveSavedQuery(savedQuery);
    setShowSavedQueriesDropdown(false);
  };

  // Handle delete saved query
  const handleDeleteQuery = async (e: React.MouseEvent, queryId: string) => {
    e.stopPropagation();
    await window.electronAPI.queries.delete(queryId);
    setSavedQueries(prev => prev.filter(q => q.id !== queryId));
    // Clear active query if the deleted one was active
    if (activeSavedQuery?.id === queryId) {
      setActiveSavedQuery(null);
    }
  };

  // Update last run time when query is executed
  const handleExecuteWithTracking = useCallback(async (includeDeleted: boolean) => {
    // Build full query with limit for comparison
    const fullQuery = selectedLimit > 0 ? `${query}\nLIMIT ${selectedLimit}` : query;
    // Find if current query matches a saved query
    const matchingQuery = savedQueries.find(sq => sq.query === fullQuery || sq.query === query);
    if (matchingQuery) {
      await window.electronAPI.queries.updateLastRun(matchingQuery.id);
      // Update local state
      setSavedQueries(prev => prev.map(q => 
        q.id === matchingQuery.id 
          ? { ...q, lastRunAt: new Date().toISOString() }
          : q
      ));
    }
    onExecuteQuery(includeDeleted, selectedLimit);
  }, [query, selectedLimit, savedQueries, onExecuteQuery]);

  // Parse fields from current query
  const parseFieldsFromQuery = (queryStr: string): Set<string> => {
    const fields = new Set<string>();
    
    // Match SELECT ... FROM pattern (case insensitive)
    const selectMatch = queryStr.match(/SELECT\s+([\s\S]*?)\s+FROM\s+/i);
    if (selectMatch) {
      const fieldsStr = selectMatch[1];
      // Split by comma, trim whitespace, handle newlines
      const fieldNames = fieldsStr.split(',').map(f => f.trim()).filter(f => f);
      fieldNames.forEach(field => {
        // Handle field names (ignore aliases if any, just take the field name)
        const cleanField = field.split(/\s+/)[0];
        fields.add(cleanField);
      });
    }
    
    return fields;
  };

  // When opening field picker, pre-select fields from current query
  const handleOpenFieldPicker = () => {
    const currentFields = parseFieldsFromQuery(query);
    setSelectedFields(currentFields);
    setFieldSearch('');
    setShowFieldPicker(true);
  };

  const filteredFields = objectDescription?.fields.filter(
    (field) =>
      field.name.toLowerCase().includes(fieldSearch.toLowerCase()) ||
      field.label.toLowerCase().includes(fieldSearch.toLowerCase())
  ) || [];

  const handleToggleField = (fieldName: string) => {
    const newSelected = new Set(selectedFields);
    if (newSelected.has(fieldName)) {
      newSelected.delete(fieldName);
    } else {
      newSelected.add(fieldName);
    }
    setSelectedFields(newSelected);
  };

  const handleSelectAllFields = () => {
    if (objectDescription) {
      setSelectedFields(new Set(objectDescription.fields.map((f) => f.name)));
    }
  };

  const handleClearAllFields = () => {
    setSelectedFields(new Set());
  };

  const handleApplyFields = () => {
    if (selectedFields.size === 0) return;

    const fieldsStr = Array.from(selectedFields).join(', ');
    
    // Try to preserve the rest of the query (FROM clause, WHERE, ORDER BY, LIMIT, etc.)
    const fromMatch = query.match(/\s+FROM\s+[\s\S]*/i);
    const restOfQuery = fromMatch ? fromMatch[0] : `\nFROM ${selectedObject.name}\nLIMIT 100`;
    
    const newQuery = `SELECT ${fieldsStr}${restOfQuery}`;
    onQueryChange(newQuery);
    setShowFieldPicker(false);
  };

  const getFieldTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      id: 'text-purple-400',
      reference: 'text-blue-400',
      string: 'text-green-400',
      textarea: 'text-green-400',
      boolean: 'text-yellow-400',
      int: 'text-orange-400',
      double: 'text-orange-400',
      currency: 'text-orange-400',
      percent: 'text-orange-400',
      date: 'text-pink-400',
      datetime: 'text-pink-400',
      picklist: 'text-cyan-400',
      multipicklist: 'text-cyan-400',
      email: 'text-red-400',
      phone: 'text-red-400',
      url: 'text-red-400',
    };
    return colors[type] || 'text-discord-text-muted';
  };

  return (
    <div className="p-4 bg-discord-medium">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-discord-text">
            {selectedObject.label}
          </h2>
          <p className="text-sm text-discord-text-muted">
            {selectedObject.name}
            {selectedObject.custom && (
              <span className="ml-2 text-xs px-1.5 py-0.5 bg-discord-warning/20 text-discord-warning rounded">
                Custom Object
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Active Query Dropdown */}
          <div className="relative active-query-dropdown">
            <button
              onClick={() => setShowActiveQueryDropdown(!showActiveQueryDropdown)}
              disabled={!query.trim()}
              className="btn btn-secondary text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Active Query
              {activeSavedQuery && (
                <span className="text-xs bg-discord-blurple/30 text-discord-blurple px-1.5 py-0.5 rounded">
                  {activeSavedQuery.name.length > 12 ? activeSavedQuery.name.slice(0, 12) + '...' : activeSavedQuery.name}
                </span>
              )}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {showActiveQueryDropdown && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-discord-dark rounded-lg shadow-xl border border-discord-lighter z-50 animate-slide-in">
                {activeSavedQuery && (
                  <button
                    onClick={handleUpdateQuery}
                    className="w-full px-3 py-2 text-left text-sm text-discord-text hover:bg-discord-light flex items-center gap-2 rounded-t-lg"
                  >
                    <svg className="w-4 h-4 text-discord-blurple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Update Query
                  </button>
                )}
                <button
                  onClick={() => {
                    setNewQueryName('');
                    setShowSaveQueryModal(true);
                    setShowActiveQueryDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm text-discord-text hover:bg-discord-light flex items-center gap-2 ${!activeSavedQuery ? 'rounded-t-lg' : ''}`}
                >
                  <svg className="w-4 h-4 text-discord-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Save As New Query
                </button>
                {activeSavedQuery && (
                  <>
                    <div className="border-t border-discord-lighter" />
                    <button
                      onClick={handleDeleteActiveQuery}
                      className="w-full px-3 py-2 text-left text-sm text-discord-danger hover:bg-discord-light flex items-center gap-2 rounded-b-lg"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Query
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Saved Queries Dropdown */}
          <div className="relative saved-queries-dropdown">
            <button
              onClick={() => setShowSavedQueriesDropdown(!showSavedQueriesDropdown)}
              className="btn btn-secondary text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              Saved Queries
              {savedQueries.length > 0 && (
                <span className="text-xs bg-discord-lighter px-1.5 py-0.5 rounded">
                  {savedQueries.length}
                </span>
              )}
            </button>

            {/* Dropdown menu */}
            {showSavedQueriesDropdown && (
              <div className="absolute top-full left-0 mt-1 w-80 bg-discord-dark rounded-lg shadow-xl border border-discord-lighter z-50 animate-slide-in">
                <div className="p-2 border-b border-discord-lighter">
                  <p className="text-xs text-discord-text-muted uppercase font-semibold">
                    Saved Queries for {selectedObject.name}
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {savedQueries.length === 0 ? (
                    <div className="p-4 text-center text-discord-text-muted text-sm">
                      No saved queries yet
                    </div>
                  ) : (
                    savedQueries.map((sq) => (
                      <div
                        key={sq.id}
                        onClick={() => handleLoadQuery(sq)}
                        className="px-3 py-2 hover:bg-discord-light cursor-pointer group flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-discord-text truncate">{sq.name}</p>
                          <p className="text-xs text-discord-text-muted">
                            {formatRelativeTime(sq.lastRunAt)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDeleteQuery(e, sq.id)}
                          className="p-1 text-discord-text-muted hover:text-discord-error opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete query"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleOpenFieldPicker}
            disabled={isLoading}
            className="btn btn-secondary text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
            Fields
          </button>
        </div>
      </div>

      {/* Field Picker Modal */}
      {showFieldPicker && objectDescription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-discord-dark rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-slide-in">
            {/* Header */}
            <div className="p-4 border-b border-discord-lighter flex items-center justify-between">
              <h3 className="text-lg font-semibold text-discord-text">Select Fields</h3>
              <button
                onClick={() => setShowFieldPicker(false)}
                className="p-1 hover:bg-discord-light rounded"
              >
                <svg className="w-5 h-5 text-discord-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search and actions */}
            <div className="p-4 border-b border-discord-lighter">
              <input
                type="text"
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="Search fields..."
                className="input mb-3"
              />
              <div className="flex items-center gap-2">
                <button onClick={handleSelectAllFields} className="btn btn-ghost text-xs">
                  Select All
                </button>
                <button onClick={handleClearAllFields} className="btn btn-ghost text-xs">
                  Clear All
                </button>
                <span className="text-xs text-discord-text-muted ml-auto">
                  {selectedFields.size} selected
                </span>
              </div>
            </div>

            {/* Fields list */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredFields.map((field) => (
                <label
                  key={field.name}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-discord-light rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedFields.has(field.name)}
                    onChange={() => handleToggleField(field.name)}
                    className="custom-checkbox w-4 h-4"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-discord-text truncate">{field.label}</p>
                    <p className="text-xs text-discord-text-muted truncate">{field.name}</p>
                  </div>
                  <span className={`text-xs font-mono ${getFieldTypeColor(field.type)}`}>
                    {field.type}
                  </span>
                </label>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-discord-lighter flex justify-end gap-2">
              <button
                onClick={() => setShowFieldPicker(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyFields}
                disabled={selectedFields.size === 0}
                className="btn btn-primary"
              >
                Apply Fields
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Query Modal */}
      {showSaveQueryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-discord-dark rounded-lg shadow-xl w-full max-w-md animate-slide-in">
            {/* Header */}
            <div className="p-4 border-b border-discord-lighter flex items-center justify-between">
              <h3 className="text-lg font-semibold text-discord-text">Save Query</h3>
              <button
                onClick={() => setShowSaveQueryModal(false)}
                className="p-1 hover:bg-discord-light rounded"
              >
                <svg className="w-5 h-5 text-discord-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              <label className="block text-sm font-medium text-discord-text-muted mb-2">
                Query Name
              </label>
              <input
                type="text"
                value={newQueryName}
                onChange={(e) => setNewQueryName(e.target.value)}
                placeholder="e.g., Active Contacts, Open Opportunities"
                className="input w-full"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newQueryName.trim()) {
                    handleSaveQuery();
                  }
                }}
              />
              <p className="mt-2 text-xs text-discord-text-muted">
                This query will be saved for {selectedObject.label}
              </p>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-discord-lighter flex justify-end gap-2">
              <button
                onClick={() => setShowSaveQueryModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuery}
                disabled={!newQueryName.trim() || savingQuery}
                className="btn btn-primary flex items-center gap-2"
              >
                {savingQuery ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Query'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Query Editor */}
      <div className="mb-4 relative">
        <label className="block text-sm font-medium text-discord-text-muted mb-2">
          SOQL Query
        </label>
        <div className="relative">
          {/* Syntax highlighting layer */}
          <SoqlHighlighter query={query} />
          {/* Transparent textarea on top */}
          <textarea
            ref={textareaRef}
            value={query}
            onChange={handleQueryInputChange}
            onKeyDown={handleKeyDown}
            placeholder="SELECT Id, Name FROM Account LIMIT 100"
            className="query-editor query-editor-transparent w-full"
            rows={6}
            spellCheck={false}
          />
        </div>
        
        {/* Autocomplete Dropdown */}
        {autocomplete.isVisible && autocomplete.suggestions.length > 0 && (
          <div
            ref={autocompleteRef}
            className="autocomplete-dropdown fixed z-50 bg-discord-dark border border-discord-lighter rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto"
            style={{
              top: autocomplete.position.top,
              left: autocomplete.position.left,
              minWidth: '280px',
            }}
          >
            {autocomplete.suggestions.map((field, index) => (
              <div
                key={field.name}
                className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-4 ${
                  index === autocomplete.selectedIndex 
                    ? 'bg-discord-accent text-white autocomplete-selected' 
                    : 'hover:bg-discord-light text-discord-text'
                }`}
                onClick={() => applySuggestion(field)}
                onMouseEnter={() => setAutocomplete(prev => ({ ...prev, selectedIndex: index }))}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{field.name}</div>
                  <div className={`text-xs truncate ${index === autocomplete.selectedIndex ? 'text-white/70' : 'text-discord-text-muted'}`}>
                    {field.label}
                  </div>
                </div>
                <span className={`text-xs font-mono flex-shrink-0 ${
                  index === autocomplete.selectedIndex ? 'text-white/70' : getFieldTypeColor(field.type)
                }`}>
                  {field.type}
                </span>
              </div>
            ))}
            <div className="px-3 py-1.5 border-t border-discord-lighter bg-discord-darker text-xs text-discord-text-muted flex items-center gap-3">
              <span><kbd className="px-1 py-0.5 bg-discord-light rounded text-[10px]">↑↓</kbd> navigate</span>
              <span><kbd className="px-1 py-0.5 bg-discord-light rounded text-[10px]">Tab</kbd> complete</span>
              <span><kbd className="px-1 py-0.5 bg-discord-light rounded text-[10px]">Esc</kbd> close</span>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons and Limit selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => handleExecuteWithTracking(false)}
          disabled={isExecuting || !query.trim()}
          className="btn btn-primary flex items-center gap-2"
        >
          {isExecuting ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Running...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run Query
            </>
          )}
        </button>

        <button
          onClick={() => handleExecuteWithTracking(true)}
          disabled={isExecuting || !query.trim()}
          className="btn btn-secondary flex items-center gap-2"
          title="Include deleted records (queryAll)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Include Deleted
        </button>

        {/* Limit Dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-discord-text-muted">Limit:</label>
          <select
            value={selectedLimit}
            onChange={(e) => onLimitChange(parseInt(e.target.value, 10))}
            className="bg-discord-dark border border-discord-lighter rounded px-2 py-1.5 text-sm text-discord-text focus:outline-none focus:border-discord-accent"
          >
            {LIMIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1" />

        <span className="text-xs text-discord-text-muted">
          Press Ctrl+Enter to run query
        </span>
      </div>

      {/* Loading indicator for description */}
      {isLoading && (
        <div className="mt-4 flex items-center gap-2 text-discord-text-muted">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading object details...</span>
        </div>
      )}
    </div>
  );
};

export default QueryBuilder;
