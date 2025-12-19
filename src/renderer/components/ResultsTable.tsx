import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { ObjectDescription, SalesforceField } from '../types/electron.d';

interface ResultsTableProps {
  results: any[] | null;
  isLoading: boolean;
  error: string | null;
  totalRecords: number;
  onExportCsv: () => void;
  objectDescription: ObjectDescription | null;
  onRecordUpdate?: (recordId: string, field: string, newValue: any) => void;
  disableEditing?: boolean;
  editingDisabledReason?: string;
}

interface EditingCell {
  recordId: string;
  column: string;
  value: string;
}

interface CellStatus {
  recordId: string;
  column: string;
  status: 'saving' | 'success' | 'error';
  message?: string;
}

const ResultsTable: React.FC<ResultsTableProps> = ({
  results,
  isLoading,
  error,
  totalRecords,
  onExportCsv,
  objectDescription,
  onRecordUpdate,
  disableEditing = false,
  editingDisabledReason,
}) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [cellStatuses, setCellStatuses] = useState<Map<string, CellStatus>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);
  const prevEditingCellRef = useRef<string | null>(null);

  // Focus and select input only when starting to edit a NEW cell
  useEffect(() => {
    if (editingCell && inputRef.current) {
      const currentCellKey = `${editingCell.recordId}-${editingCell.column}`;
      // Only focus and select if this is a different cell than before
      if (prevEditingCellRef.current !== currentCellKey) {
        inputRef.current.focus();
        inputRef.current.select();
        prevEditingCellRef.current = currentCellKey;
      }
    } else {
      prevEditingCellRef.current = null;
    }
  }, [editingCell]);

  // Clear success statuses after a delay
  useEffect(() => {
    const successStatuses = Array.from(cellStatuses.entries()).filter(
      ([_, status]) => status.status === 'success'
    );
    
    if (successStatuses.length > 0) {
      const timeout = setTimeout(() => {
        setCellStatuses(prev => {
          const newMap = new Map(prev);
          successStatuses.forEach(([key]) => {
            if (newMap.get(key)?.status === 'success') {
              newMap.delete(key);
            }
          });
          return newMap;
        });
      }, 2000);
      
      return () => clearTimeout(timeout);
    }
  }, [cellStatuses]);

  // Get field metadata for a column
  const getFieldMetadata = useCallback((column: string): SalesforceField | undefined => {
    if (!objectDescription?.fields) return undefined;
    return objectDescription.fields.find(f => f.name === column);
  }, [objectDescription?.fields]);

  // Check if a field is editable
  const isFieldEditable = useCallback((column: string): boolean => {
    // Can't edit Id or system fields
    if (column === 'Id' || column === 'attributes') return false;
    
    const field = getFieldMetadata(column);
    if (!field) return false;
    
    // Check if the field is updateable
    return field.updateable;
  }, [getFieldMetadata]);

  // Extract columns from the first result (excluding metadata)
  const columns = useMemo(() => {
    if (!results || results.length === 0) return [];
    const firstRecord = results[0];
    return Object.keys(firstRecord).filter((key) => key !== 'attributes');
  }, [results]);

  // Sort results
  const sortedResults = useMemo(() => {
    if (!results || !sortColumn) return results;

    return [...results].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === null || aVal === undefined) return sortDirection === 'asc' ? 1 : -1;
      if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? -1 : 1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [results, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const formatValue = (value: any, column?: string): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') {
      // Handle Salesforce relationship objects (e.g., CreatedBy.Name returns { Name: "..." })
      // Check if it's a simple relationship object with an 'attributes' key (Salesforce metadata)
      if (value.attributes && typeof value.attributes === 'object') {
        // This is a full related record - extract meaningful values
        const { attributes, ...rest } = value;
        const keys = Object.keys(rest);
        if (keys.length === 1) {
          // Single field from relationship (most common case)
          return formatValue(rest[keys[0]]);
        }
        // Multiple fields - show as readable format
        return keys.map(k => `${k}: ${formatValue(rest[k])}`).join(', ');
      }
      // Check for simple nested value without attributes (less common)
      const keys = Object.keys(value);
      if (keys.length === 1 && typeof value[keys[0]] !== 'object') {
        return String(value[keys[0]]);
      }
      // Fallback to JSON for complex nested objects
      return JSON.stringify(value);
    }
    return String(value);
  };

  // Get the object name from the results
  const getObjectName = (): string => {
    if (!results || results.length === 0) return '';
    const firstRecord = results[0];
    return firstRecord.attributes?.type || '';
  };

  // Handle cell click to start editing
  const handleCellClick = (recordId: string, column: string, currentValue: any) => {
    if (disableEditing) return; // Editing is disabled globally
    if (!isFieldEditable(column)) return;
    if (!recordId) return; // Can't edit without an Id
    
    setEditingCell({
      recordId,
      column,
      value: formatValue(currentValue),
    });
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingCell) return;
    setEditingCell({ ...editingCell, value: e.target.value });
  };

  // Convert input value to appropriate type based on field metadata
  const convertValue = (value: string, column: string): any => {
    const field = getFieldMetadata(column);
    if (!field) return value;

    // Handle empty values
    if (value === '' || value === null) {
      return null;
    }

    switch (field.type) {
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'int':
      case 'double':
      case 'currency':
      case 'percent':
        const num = parseFloat(value);
        return isNaN(num) ? value : num;
      case 'date':
      case 'datetime':
        // Return as-is for date types, Salesforce expects ISO format
        return value;
      default:
        return value;
    }
  };

  // Save the edited value
  const handleSave = async () => {
    if (!editingCell) return;
    
    const { recordId, column, value } = editingCell;
    const objectName = getObjectName();
    
    if (!objectName) {
      console.error('Could not determine object name');
      return;
    }

    const cellKey = `${recordId}-${column}`;
    
    // Set saving status
    setCellStatuses(prev => new Map(prev).set(cellKey, { 
      recordId, 
      column, 
      status: 'saving' 
    }));
    
    setEditingCell(null);

    try {
      const convertedValue = convertValue(value, column);
      const result = await window.electronAPI.salesforce.updateRecord(
        objectName,
        recordId,
        { [column]: convertedValue }
      );

      if (result.success) {
        setCellStatuses(prev => new Map(prev).set(cellKey, { 
          recordId, 
          column, 
          status: 'success' 
        }));
        
        // Notify parent to update the local data
        if (onRecordUpdate) {
          onRecordUpdate(recordId, column, convertedValue);
        }
      } else {
        setCellStatuses(prev => new Map(prev).set(cellKey, { 
          recordId, 
          column, 
          status: 'error',
          message: result.error || 'Update failed'
        }));
      }
    } catch (err: any) {
      setCellStatuses(prev => new Map(prev).set(cellKey, { 
        recordId, 
        column, 
        status: 'error',
        message: err.message || 'Update failed'
      }));
    }
  };

  // Handle keyboard events in input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingCell(null);
    }
  };

  // Handle blur (clicking outside)
  const handleBlur = () => {
    // Small delay to allow click events to fire first
    setTimeout(() => {
      if (editingCell) {
        handleSave();
      }
    }, 100);
  };

  // Get cell status styling
  const getCellStatusClass = (recordId: string, column: string): string => {
    const cellKey = `${recordId}-${column}`;
    const status = cellStatuses.get(cellKey);
    
    if (!status) return '';
    
    switch (status.status) {
      case 'saving':
        return 'bg-discord-accent/20 animate-pulse';
      case 'success':
        return 'bg-green-500/20';
      case 'error':
        return 'bg-red-500/20';
      default:
        return '';
    }
  };

  // Get cell error message
  const getCellError = (recordId: string, column: string): string | undefined => {
    const cellKey = `${recordId}-${column}`;
    const status = cellStatuses.get(cellKey);
    return status?.status === 'error' ? status.message : undefined;
  };

  // Get value from a record, handling dot notation for nested fields
  const getValue = (record: any, column: string): any => {
    // Check if this might be a relationship field (contains a dot in the query)
    // Salesforce returns relationship data as nested objects
    const value = record[column];
    
    // If value is an object with attributes, it's a relationship record
    if (value && typeof value === 'object') {
      return value;
    }
    
    return value;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-discord-medium">
        <div className="text-center">
          <svg className="animate-spin w-8 h-8 mx-auto mb-4 text-discord-accent" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-discord-text-muted">Executing query...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-discord-medium p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-discord-danger/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-discord-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-discord-text mb-2">Query Error</h3>
          <p className="text-discord-text-muted text-sm break-words">{error}</p>
        </div>
      </div>
    );
  }

  // No results state
  if (!results) {
    return (
      <div className="h-full flex items-center justify-center bg-discord-medium">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-discord-lighter" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 className="text-lg font-semibold text-discord-text mb-2">No Results Yet</h3>
          <p className="text-discord-text-muted text-sm">Run a query to see results here</p>
        </div>
      </div>
    );
  }

  // Empty results
  if (results.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-discord-medium">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-discord-lighter" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <h3 className="text-lg font-semibold text-discord-text mb-2">No Records Found</h3>
          <p className="text-discord-text-muted text-sm">The query returned zero records</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-discord-medium">
      {/* Results header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-discord-darker bg-discord-dark">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold text-discord-text">
            Results
          </h3>
          <span className="text-sm text-discord-text-muted">
            {totalRecords.toLocaleString()} record{totalRecords !== 1 ? 's' : ''}
          </span>
          {objectDescription && !disableEditing && (
            <span className="text-xs text-discord-text-muted bg-discord-lighter px-2 py-0.5 rounded">
              Double-click editable cells to edit inline
            </span>
          )}
          {objectDescription && disableEditing && editingDisabledReason && (
            <span className="text-xs text-discord-warning bg-discord-warning/10 px-2 py-0.5 rounded flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {editingDisabledReason}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onExportCsv}
            className="btn btn-secondary text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-12 text-center">#</th>
              {columns.map((column) => {
                const canEdit = !disableEditing && isFieldEditable(column);
                return (
                  <th
                    key={column}
                    onClick={() => handleSort(column)}
                    className="cursor-pointer hover:bg-discord-light select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate">{column}</span>
                      {canEdit && (
                        <svg className="w-3 h-3 text-discord-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      )}
                      {sortColumn === column && (
                        <svg
                          className={`w-4 h-4 flex-shrink-0 transition-transform ${
                            sortDirection === 'desc' ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedResults?.map((record, index) => (
              <tr key={record.Id || index}>
                <td className="text-center text-discord-text-muted text-xs">
                  {index + 1}
                </td>
                {columns.map((column) => {
                  const canEdit = !disableEditing && isFieldEditable(column) && record.Id;
                  const isEditing = editingCell?.recordId === record.Id && editingCell?.column === column;
                  const cellError = getCellError(record.Id, column);
                  const statusClass = getCellStatusClass(record.Id, column);
                  
                  return (
                    <td 
                      key={column} 
                      className={`max-w-xs relative ${statusClass} ${
                        canEdit ? 'cursor-pointer hover:bg-discord-light' : ''
                      }`}
                      onDoubleClick={() => !isEditing && canEdit && handleCellClick(record.Id, column, record[column])}
                      title={cellError || formatValue(record[column])}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={editingCell.value}
                          onChange={handleInputChange}
                          onKeyDown={handleKeyDown}
                          onBlur={handleBlur}
                          className="w-full bg-discord-darker text-discord-text px-2 py-1 rounded border border-discord-accent focus:outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className={`truncate block ${cellError ? 'text-red-400' : ''}`}>
                          {formatValue(record[column])}
                        </span>
                      )}
                      {cellError && !isEditing && (
                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsTable;
