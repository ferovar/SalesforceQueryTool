import React, { useState, useEffect, useMemo } from 'react';
import type { SalesforceField } from '../types/electron.d';

interface RecordInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRecordId?: string;
  instanceUrl?: string;
}

const RecordInspectorModal: React.FC<RecordInspectorModalProps> = ({ isOpen, onClose, initialRecordId, instanceUrl }) => {
  const [recordIdInput, setRecordIdInput] = useState(initialRecordId || '');
  const [record, setRecord] = useState<Record<string, any> | null>(null);
  const [fields, setFields] = useState<SalesforceField[]>([]);
  const [objectName, setObjectName] = useState('');
  const [objectLabel, setObjectLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'populated' | 'editable'>('populated');

  useEffect(() => {
    if (isOpen && initialRecordId && initialRecordId !== recordIdInput) {
      setRecordIdInput(initialRecordId);
      loadRecord(initialRecordId);
    }
  }, [isOpen, initialRecordId]);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setRecord(null);
      setFields([]);
      setObjectName('');
      setObjectLabel('');
      setError(null);
      setSearchTerm('');
      setEditingField(null);
      setSaveSuccess(null);
      setFilter('populated');
    }
  }, [isOpen]);

  const loadRecord = async (id?: string) => {
    const recordId = (id || recordIdInput).trim();
    if (!recordId) return;

    // Basic validation: Salesforce IDs are 15 or 18 chars
    if (recordId.length !== 15 && recordId.length !== 18) {
      setError('Record ID must be 15 or 18 characters');
      return;
    }

    setIsLoading(true);
    setError(null);
    setEditingField(null);
    setSaveSuccess(null);

    try {
      const result = await window.electronAPI.salesforce.getRecordById(recordId);
      if (result.success && result.data) {
        setRecord(result.data.record);
        setFields(result.data.fields);
        setObjectName(result.data.objectName);
        setObjectLabel(result.data.objectLabel);
      } else {
        setError(result.error || 'Failed to load record');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load record');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveField = async (fieldName: string) => {
    if (!record || !objectName) return;

    setIsSaving(true);
    setSaveSuccess(null);

    try {
      // Find the field metadata to handle type conversion
      const fieldMeta = fields.find(f => f.name === fieldName);
      let value: any = editValue;

      // Convert value based on field type
      if (editValue === '' && fieldMeta?.nillable) {
        value = null;
      } else if (fieldMeta) {
        switch (fieldMeta.type) {
          case 'boolean':
            value = editValue.toLowerCase() === 'true';
            break;
          case 'int':
          case 'double':
          case 'currency':
          case 'percent':
            value = Number(editValue);
            if (isNaN(value)) {
              setError(`Invalid number for ${fieldName}`);
              setIsSaving(false);
              return;
            }
            break;
        }
      }

      const result = await window.electronAPI.salesforce.updateRecord(
        objectName,
        record.Id,
        { [fieldName]: value }
      );

      if (result.success) {
        // Update local record
        setRecord(prev => prev ? { ...prev, [fieldName]: value } : prev);
        setEditingField(null);
        setSaveSuccess(fieldName);
        setTimeout(() => setSaveSuccess(null), 2000);
      } else {
        setError(result.error || 'Failed to update field');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update field');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, fieldName: string) => {
    if (e.key === 'Enter') {
      handleSaveField(fieldName);
    } else if (e.key === 'Escape') {
      setEditingField(null);
    }
  };

  const handleInspectReference = (refId: string) => {
    setRecordIdInput(refId);
    loadRecord(refId);
  };

  const handleOpenInSalesforce = () => {
    if (instanceUrl && record?.Id) {
      const url = `${instanceUrl}/${record.Id}`;
      window.open(url, '_blank');
    }
  };

  const filteredFields = useMemo(() => {
    if (!record || !fields.length) return [];

    return fields
      .filter(field => {
        // Skip compound fields
        if (['address', 'location'].includes(field.type)) return false;

        // Search filter
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          if (!field.label.toLowerCase().includes(term) &&
              !field.name.toLowerCase().includes(term)) {
            return false;
          }
        }

        // Category filter
        if (filter === 'populated') {
          const value = record[field.name];
          return value !== null && value !== undefined && value !== '';
        }
        if (filter === 'editable') {
          return field.updateable;
        }

        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [record, fields, searchTerm, filter]);

  if (!isOpen) return null;

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const getFieldTypeColor = (type: string): string => {
    switch (type) {
      case 'id':
      case 'reference': return 'text-blue-400';
      case 'string':
      case 'textarea':
      case 'url':
      case 'email':
      case 'phone': return 'text-green-400';
      case 'boolean': return 'text-yellow-400';
      case 'int':
      case 'double':
      case 'currency':
      case 'percent': return 'text-purple-400';
      case 'date':
      case 'datetime':
      case 'time': return 'text-orange-400';
      case 'picklist':
      case 'multipicklist': return 'text-pink-400';
      default: return 'text-discord-text-muted';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-discord-dark rounded-lg shadow-2xl w-[800px] max-h-[85vh] flex flex-col overflow-hidden border border-discord-darker">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-discord-darker bg-discord-darker/50">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-discord-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h2 className="text-lg font-semibold text-discord-text">Record Inspector</h2>
            {objectLabel && (
              <span className="px-2 py-0.5 bg-discord-accent/20 text-discord-accent text-xs font-medium rounded">
                {objectLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {record && instanceUrl && (
              <button
                onClick={handleOpenInSalesforce}
                className="px-3 py-1.5 text-xs font-medium rounded bg-discord-medium hover:bg-discord-light text-discord-text transition-colors"
                title="Open in Salesforce"
              >
                Open in SF
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-discord-medium text-discord-text-muted hover:text-discord-text transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Record ID Input */}
        <div className="px-6 py-3 border-b border-discord-darker flex items-center gap-3">
          <input
            type="text"
            value={recordIdInput}
            onChange={(e) => setRecordIdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadRecord()}
            placeholder="Paste a Salesforce Record ID (15 or 18 char)..."
            className="flex-1 px-3 py-2 bg-discord-medium border border-discord-darker rounded text-sm text-discord-text placeholder-discord-text-muted focus:outline-none focus:border-discord-accent font-mono"
            autoFocus
          />
          <button
            onClick={() => loadRecord()}
            disabled={isLoading || !recordIdInput.trim()}
            className="px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover disabled:bg-discord-medium disabled:text-discord-text-muted text-white text-sm font-medium rounded transition-colors"
          >
            {isLoading ? 'Loading...' : 'Inspect'}
          </button>
        </div>

        {/* Filters (only show when record is loaded) */}
        {record && (
          <div className="px-6 py-3 border-b border-discord-darker flex items-center gap-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter fields..."
              className="flex-1 px-3 py-1.5 bg-discord-medium border border-discord-darker rounded text-sm text-discord-text placeholder-discord-text-muted focus:outline-none focus:border-discord-accent"
            />
            <div className="flex gap-1">
              {(['populated', 'all', 'editable'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors capitalize ${
                    filter === f ? 'bg-discord-accent text-white' : 'bg-discord-medium text-discord-text-muted hover:text-discord-text'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {error && (
            <div className="mb-4 p-3 bg-discord-danger/20 border border-discord-danger rounded-lg">
              <p className="text-sm text-discord-danger">{error}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin w-6 h-6 text-discord-accent" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="ml-3 text-sm text-discord-text-muted">Loading record...</span>
            </div>
          ) : record ? (
            <div className="space-y-0.5">
              <div className="grid grid-cols-[200px_1fr] gap-0 text-xs">
                {/* Table header */}
                <div className="px-3 py-2 bg-discord-darker/50 font-semibold text-discord-text-muted border-b border-discord-darker">
                  Field
                </div>
                <div className="px-3 py-2 bg-discord-darker/50 font-semibold text-discord-text-muted border-b border-discord-darker">
                  Value
                </div>

                {filteredFields.map(field => {
                  const value = record[field.name];
                  const displayValue = formatValue(value);
                  const isEditing = editingField === field.name;
                  const isReference = field.type === 'reference' && value && typeof value === 'string';
                  const justSaved = saveSuccess === field.name;

                  return (
                    <React.Fragment key={field.name}>
                      {/* Field name */}
                      <div className="px-3 py-2 border-b border-discord-darker/50 hover:bg-discord-medium/30">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-discord-text font-medium">{field.label}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-discord-text-muted font-mono text-[10px]">{field.name}</span>
                            <span className={`text-[10px] ${getFieldTypeColor(field.type)}`}>{field.type}</span>
                          </div>
                        </div>
                      </div>

                      {/* Field value */}
                      <div className="px-3 py-2 border-b border-discord-darker/50 hover:bg-discord-medium/30 flex items-center gap-2">
                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, field.name)}
                              className="flex-1 px-2 py-1 bg-discord-medium border border-discord-accent rounded text-sm text-discord-text focus:outline-none font-mono"
                              autoFocus
                              disabled={isSaving}
                            />
                            <button
                              onClick={() => handleSaveField(field.name)}
                              disabled={isSaving}
                              className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                            >
                              {isSaving ? '...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingField(null)}
                              className="px-2 py-1 bg-discord-medium hover:bg-discord-light text-discord-text-muted rounded text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className={`flex-1 font-mono text-sm break-all ${
                              value === null || value === undefined ? 'text-discord-text-muted italic' : 'text-discord-text'
                            }`}>
                              {isReference ? (
                                <button
                                  onClick={() => handleInspectReference(value)}
                                  className="text-blue-400 hover:text-blue-300 hover:underline"
                                  title="Inspect this record"
                                >
                                  {displayValue}
                                </button>
                              ) : (
                                displayValue || <span className="text-discord-text-muted">null</span>
                              )}
                            </span>
                            {justSaved && (
                              <span className="text-green-400 text-[10px] font-medium">Saved</span>
                            )}
                            {field.updateable && !justSaved && (
                              <button
                                onClick={() => {
                                  setEditingField(field.name);
                                  setEditValue(displayValue);
                                  setError(null);
                                }}
                                className="p-1 rounded hover:bg-discord-medium text-discord-text-muted hover:text-discord-text transition-colors opacity-0 group-hover:opacity-100"
                                title="Edit field"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {filteredFields.length === 0 && (
                <p className="text-sm text-discord-text-muted text-center py-8">No fields match your filter</p>
              )}

              {/* Summary */}
              <div className="pt-3 text-xs text-discord-text-muted text-center">
                Showing {filteredFields.length} of {fields.filter(f => !['address', 'location'].includes(f.type)).length} fields
              </div>
            </div>
          ) : !error && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-discord-lighter" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-discord-text-muted text-sm">
                  Enter a Salesforce Record ID to inspect its fields
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecordInspectorModal;
