import React, { useState } from 'react';
import type { SalesforceObject, ObjectDescription, SalesforceField } from '../types/electron.d';

interface QueryBuilderProps {
  selectedObject: SalesforceObject;
  objectDescription: ObjectDescription | null;
  query: string;
  onQueryChange: (query: string) => void;
  onExecuteQuery: (includeDeleted: boolean) => void;
  isLoading: boolean;
  isExecuting: boolean;
}

const QueryBuilder: React.FC<QueryBuilderProps> = ({
  selectedObject,
  objectDescription,
  query,
  onQueryChange,
  onExecuteQuery,
  isLoading,
  isExecuting,
}) => {
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [fieldSearch, setFieldSearch] = useState('');

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

      {/* Query Editor */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-discord-text-muted mb-2">
          SOQL Query
        </label>
        <textarea
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="SELECT Id, Name FROM Account LIMIT 100"
          className="query-editor w-full"
          rows={6}
          spellCheck={false}
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onExecuteQuery(false)}
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
          onClick={() => onExecuteQuery(true)}
          disabled={isExecuting || !query.trim()}
          className="btn btn-secondary flex items-center gap-2"
          title="Include deleted records (queryAll)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Include Deleted
        </button>

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
