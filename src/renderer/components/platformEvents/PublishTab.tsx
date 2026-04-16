import React, { useState, useEffect, useMemo } from 'react';
import type {
  PlatformEventInfo,
  PlatformEventDescribe,
  PlatformEventField,
  SavedEventPayload,
} from '../../types/electron.d';

interface PublishTabProps {
  events: PlatformEventInfo[];
  selectedEventName: string;
  selectedEventDescribe: PlatformEventDescribe | null;
  onSelectEvent: (eventName: string) => void;
  includeNamespaces: boolean;
  onToggleNamespaces: (value: boolean) => void;
}

const PublishTab: React.FC<PublishTabProps> = ({
  events,
  selectedEventName,
  selectedEventDescribe,
  onSelectEvent,
  includeNamespaces,
  onToggleNamespaces,
}) => {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savedPayloads, setSavedPayloads] = useState<SavedEventPayload[]>([]);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [savePayloadName, setSavePayloadName] = useState('');
  const [showSavedPayloads, setShowSavedPayloads] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkJson, setBulkJson] = useState('');

  // Load saved payloads when event changes
  useEffect(() => {
    if (selectedEventName) {
      loadSavedPayloads();
    }
  }, [selectedEventName]);

  // Reset field values when event description changes
  useEffect(() => {
    if (selectedEventDescribe) {
      const defaults: Record<string, string> = {};
      selectedEventDescribe.fields.forEach((f) => {
        defaults[f.name] = f.defaultValue != null ? String(f.defaultValue) : '';
      });
      setFieldValues(defaults);
      setPublishResult(null);
    }
  }, [selectedEventDescribe]);

  // Sync form <-> JSON
  useEffect(() => {
    if (isJsonMode && selectedEventDescribe) {
      const payload = buildPayload();
      setJsonText(JSON.stringify(payload, null, 2));
    }
  }, [isJsonMode]);

  const loadSavedPayloads = async () => {
    try {
      const payloads = await window.electronAPI.platformEvents.getPayloadsForEvent(selectedEventName);
      setSavedPayloads(payloads);
    } catch {
      // ignore
    }
  };

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};
    if (!selectedEventDescribe) return payload;

    for (const field of selectedEventDescribe.fields) {
      const value = fieldValues[field.name];
      if (value !== undefined && value !== '') {
        payload[field.name] = coerceValue(value, field);
      }
    }
    return payload;
  };

  const coerceValue = (value: string, field: PlatformEventField): unknown => {
    switch (field.type.toLowerCase()) {
      case 'boolean':
        return value === 'true';
      case 'double':
      case 'currency':
      case 'percent':
        return parseFloat(value);
      case 'int':
      case 'long':
        return parseInt(value, 10);
      default:
        return value;
    }
  };

  const handlePublish = async () => {
    if (!selectedEventName) return;

    setIsPublishing(true);
    setPublishResult(null);

    try {
      if (isBulkMode) {
        const payloads = JSON.parse(bulkJson);
        if (!Array.isArray(payloads)) {
          throw new Error('Bulk payload must be a JSON array');
        }
        const result = await window.electronAPI.platformEvents.publishBulk(selectedEventName, payloads);
        if (result.success && result.data) {
          const successCount = result.data.filter((r) => r.success).length;
          const failCount = result.data.length - successCount;
          setPublishResult({
            success: failCount === 0,
            message: `${successCount} event${successCount !== 1 ? 's' : ''} published${failCount > 0 ? `, ${failCount} failed` : ''}`,
          });
        } else {
          setPublishResult({ success: false, message: result.error || 'Publish failed' });
        }
      } else {
        let payload: Record<string, unknown>;
        if (isJsonMode) {
          payload = JSON.parse(jsonText);
        } else {
          payload = buildPayload();
        }

        const result = await window.electronAPI.platformEvents.publish(selectedEventName, payload);
        if (result.success && result.data) {
          if (result.data.success) {
            setPublishResult({ success: true, message: `Event published (ID: ${result.data.id})` });
          } else {
            setPublishResult({ success: false, message: result.data.errors.join('; ') || 'Publish failed' });
          }
        } else {
          setPublishResult({ success: false, message: result.error || 'Publish failed' });
        }
      }
    } catch (err: unknown) {
      setPublishResult({ success: false, message: err instanceof Error ? err.message : 'Publish failed' });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSavePayload = async () => {
    if (!savePayloadName.trim() || !selectedEventName) return;

    try {
      const payload = isJsonMode ? JSON.parse(jsonText) : buildPayload();
      await window.electronAPI.platformEvents.savePayload(
        selectedEventName,
        savePayloadName.trim(),
        payload,
      );
      setIsSaveDialogOpen(false);
      setSavePayloadName('');
      loadSavedPayloads();
    } catch (err: unknown) {
      console.error('Failed to save payload:', err);
    }
  };

  const handleLoadPayload = (payload: SavedEventPayload) => {
    if (isJsonMode) {
      setJsonText(JSON.stringify(payload.payload, null, 2));
    } else {
      const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(payload.payload)) {
        values[key] = value != null ? String(value) : '';
      }
      setFieldValues(values);
    }
    setShowSavedPayloads(false);
    setPublishResult(null);
  };

  const handleDeletePayload = async (id: string) => {
    await window.electronAPI.platformEvents.deletePayload(id);
    loadSavedPayloads();
  };

  const publishableFields = useMemo(() => {
    if (!selectedEventDescribe) return [];
    return selectedEventDescribe.fields.filter((f) => f.createable);
  }, [selectedEventDescribe]);

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Controls bar */}
        <div className="px-6 py-3 border-b border-discord-darker flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-discord-text-muted">Event:</label>
            <select
              value={selectedEventName}
              onChange={(e) => onSelectEvent(e.target.value)}
              className="px-3 py-1.5 bg-discord-medium border border-discord-darker rounded text-sm text-discord-text focus:outline-none focus:border-discord-accent"
            >
              <option value="">Select an event...</option>
              {events.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.label} ({e.name})
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-discord-text-muted cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={includeNamespaces}
                onChange={(e) => onToggleNamespaces(e.target.checked)}
                className="rounded"
              />
              Include Namespaces
            </label>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-2 text-sm text-discord-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={isBulkMode}
                onChange={(e) => setIsBulkMode(e.target.checked)}
                className="rounded"
              />
              Bulk
            </label>
            {!isBulkMode && (
              <label className="flex items-center gap-2 text-sm text-discord-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={isJsonMode}
                  onChange={(e) => setIsJsonMode(e.target.checked)}
                  className="rounded"
                />
                JSON
              </label>
            )}
            <button
              onClick={() => setShowSavedPayloads(!showSavedPayloads)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                showSavedPayloads
                  ? 'bg-discord-accent text-white'
                  : 'bg-discord-medium text-discord-text-muted hover:text-discord-text'
              }`}
            >
              Saved ({savedPayloads.length})
            </button>
            <button
              onClick={() => setIsSaveDialogOpen(true)}
              disabled={!selectedEventName}
              className="px-3 py-1.5 text-sm bg-discord-medium text-discord-text-muted hover:text-discord-text rounded transition-colors disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>

        {/* Form / JSON editor */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedEventName ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-discord-text-muted">Select a Platform Event to publish</p>
            </div>
          ) : isBulkMode ? (
            <div className="flex flex-col h-full">
              <label className="text-sm text-discord-text-muted mb-2">
                Paste a JSON array of payloads to publish in bulk:
              </label>
              <textarea
                value={bulkJson}
                onChange={(e) => setBulkJson(e.target.value)}
                placeholder={'[\n  { "Field__c": "value1" },\n  { "Field__c": "value2" }\n]'}
                className="flex-1 w-full px-4 py-3 bg-discord-medium border border-discord-darker rounded font-mono text-sm text-discord-text placeholder-discord-text-muted focus:outline-none focus:border-discord-accent resize-none"
                spellCheck={false}
              />
            </div>
          ) : isJsonMode ? (
            <div className="flex flex-col h-full">
              <label className="text-sm text-discord-text-muted mb-2">
                JSON payload for {selectedEventDescribe?.label ?? selectedEventName}:
              </label>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                className="flex-1 w-full px-4 py-3 bg-discord-medium border border-discord-darker rounded font-mono text-sm text-discord-text focus:outline-none focus:border-discord-accent resize-none"
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {publishableFields.length === 0 ? (
                <p className="text-discord-text-muted text-sm">
                  No publishable fields found for this event.
                </p>
              ) : (
                publishableFields.map((field) => (
                  <div key={field.name}>
                    <label className="block mb-1">
                      <span className="text-sm text-discord-text">{field.label}</span>
                      <span className="text-xs text-discord-text-muted ml-2 font-mono">{field.name}</span>
                      {!field.nillable && <span className="text-red-400 text-xs ml-1">*</span>}
                    </label>
                    {field.type === 'boolean' ? (
                      <select
                        value={fieldValues[field.name] || ''}
                        onChange={(e) =>
                          setFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        className="w-full px-3 py-2 bg-discord-medium border border-discord-darker rounded text-sm text-discord-text focus:outline-none focus:border-discord-accent"
                      >
                        <option value="">-- Select --</option>
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    ) : field.picklistValues && field.picklistValues.length > 0 ? (
                      <select
                        value={fieldValues[field.name] || ''}
                        onChange={(e) =>
                          setFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        className="w-full px-3 py-2 bg-discord-medium border border-discord-darker rounded text-sm text-discord-text focus:outline-none focus:border-discord-accent"
                      >
                        <option value="">-- Select --</option>
                        {field.picklistValues
                          .filter((pv) => pv.active)
                          .map((pv) => (
                            <option key={pv.value} value={pv.value}>
                              {pv.label}
                            </option>
                          ))}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        value={fieldValues[field.name] || ''}
                        onChange={(e) =>
                          setFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        rows={3}
                        className="w-full px-3 py-2 bg-discord-medium border border-discord-darker rounded text-sm text-discord-text focus:outline-none focus:border-discord-accent resize-none"
                      />
                    ) : (
                      <input
                        type={
                          field.type === 'double' || field.type === 'int' || field.type === 'long' || field.type === 'currency' || field.type === 'percent'
                            ? 'number'
                            : 'text'
                        }
                        value={fieldValues[field.name] || ''}
                        onChange={(e) =>
                          setFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        placeholder={field.type}
                        className="w-full px-3 py-2 bg-discord-medium border border-discord-darker rounded text-sm text-discord-text placeholder-discord-text-muted focus:outline-none focus:border-discord-accent"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Publish button and result */}
        <div className="px-6 py-3 border-t border-discord-darker flex items-center gap-4">
          <button
            onClick={handlePublish}
            disabled={isPublishing || !selectedEventName}
            className="px-6 py-2 bg-discord-accent hover:bg-discord-accent-hover text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
          >
            {isPublishing ? 'Publishing...' : isBulkMode ? 'Publish All' : 'Publish Event'}
          </button>

          {publishResult && (
            <div
              className={`flex items-center gap-2 text-sm ${
                publishResult.success ? 'text-green-400' : 'text-red-400'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {publishResult.success ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                )}
              </svg>
              {publishResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Saved Payloads Sidebar */}
      {showSavedPayloads && (
        <div className="w-72 flex-shrink-0 border-l border-discord-darker flex flex-col">
          <div className="p-3 border-b border-discord-darker">
            <h4 className="text-sm font-semibold text-discord-text">Saved Payloads</h4>
          </div>
          <div className="flex-1 overflow-y-auto">
            {savedPayloads.length === 0 ? (
              <div className="p-4 text-sm text-discord-text-muted text-center">
                No saved payloads for this event
              </div>
            ) : (
              savedPayloads.map((payload) => (
                <div
                  key={payload.id}
                  className="px-3 py-2 border-b border-discord-darker/50 hover:bg-discord-medium/30"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-discord-text font-medium truncate">
                      {payload.name}
                    </span>
                    <button
                      onClick={() => handleDeletePayload(payload.id)}
                      className="p-1 text-discord-text-muted hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-xs text-discord-text-muted mb-1 truncate">
                    {new Date(payload.updatedAt).toLocaleString()}
                  </div>
                  <button
                    onClick={() => handleLoadPayload(payload)}
                    className="text-xs text-discord-accent hover:underline"
                  >
                    Load payload
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Save Dialog */}
      {isSaveDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-discord-dark rounded-lg shadow-xl p-6 w-96 border border-discord-darker">
            <h3 className="text-lg font-semibold text-discord-text mb-4">Save Payload</h3>
            <input
              type="text"
              value={savePayloadName}
              onChange={(e) => setSavePayloadName(e.target.value)}
              placeholder="Enter a name for this payload"
              className="w-full px-3 py-2 bg-discord-medium border border-discord-darker rounded text-sm text-discord-text placeholder-discord-text-muted focus:outline-none focus:border-discord-accent mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSavePayload();
                if (e.key === 'Escape') setIsSaveDialogOpen(false);
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsSaveDialogOpen(false)}
                className="px-4 py-2 text-sm text-discord-text-muted hover:text-discord-text bg-discord-medium rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePayload}
                disabled={!savePayloadName.trim()}
                className="px-4 py-2 text-sm text-white bg-discord-accent hover:bg-discord-accent-hover rounded transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublishTab;
