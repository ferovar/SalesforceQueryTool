import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { UserSession } from '../App';
import type { SalesforceObject, SalesforceField, ObjectDescription } from '../types/electron.d';
import ObjectList from '../components/ObjectList';
import QueryBuilder from '../components/QueryBuilder';
import ResultsTable from '../components/ResultsTable';
import QueryHistory from '../components/QueryHistory';
import AmbientStarfield from '../components/AmbientStarfield';
import { useSettings } from '../contexts/SettingsContext';

interface MainPageProps {
  session: UserSession;
  onOpenSettings: () => void;
}

const MainPage: React.FC<MainPageProps> = ({ session, onOpenSettings }) => {
  const { settings, isProduction } = useSettings();
  const [objects, setObjects] = useState<SalesforceObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<SalesforceObject | null>(null);
  const [objectDescription, setObjectDescription] = useState<ObjectDescription | null>(null);
  const [isLoadingObjects, setIsLoadingObjects] = useState(true);
  const [isLoadingDescription, setIsLoadingDescription] = useState(false);
  const [query, setQuery] = useState('');
  const [queryResults, setQueryResults] = useState<any[] | null>(null);
  const [isExecutingQuery, setIsExecutingQuery] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [showHistory, setShowHistory] = useState(true);
  const [queryStartTime, setQueryStartTime] = useState<number | null>(null);
  const queryCancelledRef = useRef(false);
  const isManualSelectionRef = useRef(false); // Track manual object selection to prevent auto-detect loops
  const [selectedLimit, setSelectedLimit] = useState<number>(settings.defaultQueryLimit);

  // Load objects on mount
  useEffect(() => {
    loadObjects();
  }, []);

  const loadObjects = async () => {
    setIsLoadingObjects(true);
    try {
      const result = await window.electronAPI.salesforce.getObjects();
      if (result.success && result.data) {
        setObjects(result.data);
      } else {
        console.error('Failed to load objects:', result.error);
      }
    } catch (err) {
      console.error('Error loading objects:', err);
    } finally {
      setIsLoadingObjects(false);
    }
  };

  const handleObjectSelect = async (obj: SalesforceObject) => {
    // Set flag to prevent auto-detection from interfering
    isManualSelectionRef.current = true;
    
    setSelectedObject(obj);
    setIsLoadingDescription(true);
    setObjectDescription(null);
    setQueryError(null);

    try {
      const result = await window.electronAPI.salesforce.describeObject(obj.name);
      if (result.success && result.data) {
        setObjectDescription(result.data);
        // Build default query (without LIMIT - limit is controlled by dropdown)
        const defaultFields = result.data.fields
          .slice(0, 10)
          .map((f: SalesforceField) => f.name)
          .join(', ');
        setQuery(`SELECT ${defaultFields}\nFROM ${obj.name}`);
        // Reset limit to default from settings when selecting new object
        setSelectedLimit(settings.defaultQueryLimit);
      } else {
        console.error('Failed to describe object:', result.error);
      }
    } catch (err) {
      console.error('Error describing object:', err);
    } finally {
      setIsLoadingDescription(false);
      // Clear the flag after a short delay to allow state to settle
      setTimeout(() => {
        isManualSelectionRef.current = false;
      }, 100);
    }
  };

  const handleExecuteQuery = async (includeDeleted: boolean = false, limit: number = 0) => {
    if (!query.trim()) return;

    setIsExecutingQuery(true);
    setQueryError(null);
    setQueryResults(null);
    setQueryStartTime(Date.now());
    queryCancelledRef.current = false;

    // Extract object name from query for history
    const objectMatch = query.match(/FROM\s+(\w+)/i);
    const objectName = objectMatch ? objectMatch[1] : selectedObject?.name || 'Unknown';

    // Handle SELECT * by expanding to all fields
    let expandedQuery = query.trim();
    const selectStarMatch = expandedQuery.match(/^SELECT\s+\*\s+FROM/i);
    
    if (selectStarMatch && objectName !== 'Unknown') {
      try {
        // Get object description (use cached if available for the same object)
        let fields: SalesforceField[] = [];
        
        if (objectDescription && objectDescription.name.toLowerCase() === objectName.toLowerCase()) {
          fields = objectDescription.fields;
        } else {
          // Fetch the object description
          const descResult = await window.electronAPI.salesforce.describeObject(objectName);
          if (descResult.success && descResult.data) {
            fields = descResult.data.fields;
          } else {
            throw new Error(`Could not describe object ${objectName}: ${descResult.error}`);
          }
        }
        
        // Get all queryable field names (exclude compound fields and user-configured excluded fields)
        const excludedFieldsLower = new Set(settings.excludedFields.map(f => f.toLowerCase()));
        const fieldNames = fields
          .filter(f => !['address', 'location'].includes(f.type.toLowerCase()))
          .filter(f => !excludedFieldsLower.has(f.name.toLowerCase()))
          .map(f => f.name)
          .join(', ');
        
        // Replace SELECT * with the field list
        expandedQuery = expandedQuery.replace(/^SELECT\s+\*\s+FROM/i, `SELECT ${fieldNames} FROM`);
      } catch (err: any) {
        setQueryError(`Failed to expand SELECT *: ${err.message}`);
        setIsExecutingQuery(false);
        setQueryStartTime(null);
        return;
      }
    }

    // Build full query with limit if specified
    const fullQuery = limit > 0 ? `${expandedQuery}\nLIMIT ${limit}` : expandedQuery;
    
    // For history, store the original query (with SELECT * if used) for readability
    const originalQueryWithLimit = limit > 0 ? `${query.trim()}\nLIMIT ${limit}` : query.trim();

    try {
      const result = await window.electronAPI.salesforce.executeQuery(fullQuery, includeDeleted);
      
      // Check if query was cancelled while executing
      if (queryCancelledRef.current) {
        return; // Don't process results if cancelled
      }
      
      if (result.success && result.data) {
        setQueryResults(result.data);
        setTotalRecords(result.data.length);
        
        // Add to history (save the original query for readability)
        await window.electronAPI.history.add({
          query: originalQueryWithLimit,
          objectName,
          recordCount: result.data.length,
          success: true,
        });
        setHistoryRefreshTrigger(prev => prev + 1);
      } else {
        const errorMsg = result.error || 'Query execution failed';
        setQueryError(errorMsg);
        
        // Add failed query to history
        await window.electronAPI.history.add({
          query: originalQueryWithLimit,
          objectName,
          recordCount: 0,
          success: false,
          error: errorMsg,
        });
        setHistoryRefreshTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      // Check if query was cancelled while executing
      if (queryCancelledRef.current) {
        return; // Don't show error if cancelled
      }
      
      const errorMsg = err.message || 'An unexpected error occurred';
      setQueryError(errorMsg);
      
      // Add failed query to history
      await window.electronAPI.history.add({
        query: originalQueryWithLimit,
        objectName,
        recordCount: 0,
        success: false,
        error: errorMsg,
      });
      setHistoryRefreshTrigger(prev => prev + 1);
    } finally {
      setIsExecutingQuery(false);
      setQueryStartTime(null);
    }
  };

  const handleCancelQuery = () => {
    queryCancelledRef.current = true;
    setIsExecutingQuery(false);
    setQueryStartTime(null);
    setQueryError('Query cancelled by user');
  };

  // Handle auto-detection of object from pasted query
  const handleObjectDetected = async (objectName: string) => {
    // Don't auto-detect if manual selection is in progress
    if (isManualSelectionRef.current) return;
    
    // Find the object in the list (case-insensitive)
    const obj = objects.find(o => o.name.toLowerCase() === objectName.toLowerCase());
    if (obj && (!selectedObject || obj.name !== selectedObject.name)) {
      // Select the object but keep the current query
      const currentQuery = query;
      setSelectedObject(obj);
      setIsLoadingDescription(true);
      setObjectDescription(null);
      
      try {
        const result = await window.electronAPI.salesforce.describeObject(obj.name);
        if (result.success && result.data) {
          setObjectDescription(result.data);
          // Keep the pasted query, don't replace with default
          setQuery(currentQuery);
        }
      } catch (err) {
        console.error('Error describing object:', err);
      } finally {
        setIsLoadingDescription(false);
      }
    }
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

  // Handle selecting a query from history
  const handleSelectHistoryQuery = async (historyQuery: string, objectName: string) => {
    // Find and select the object if it exists
    const obj = objects.find(o => o.name.toLowerCase() === objectName.toLowerCase());
    if (obj && obj !== selectedObject) {
      await handleObjectSelect(obj);
    }
    
    // Parse limit from history query and update dropdown
    const limit = parseLimitFromQuery(historyQuery);
    if (limit !== null) {
      setSelectedLimit(limit);
      // Remove LIMIT from query text since it's now in the dropdown
      setQuery(removeLimitFromQuery(historyQuery));
    } else {
      setSelectedLimit(0); // No limit
      setQuery(historyQuery);
    }
  };

  const handleExportCsv = async () => {
    if (!queryResults || queryResults.length === 0) return;

    try {
      const filename = `${selectedObject?.name || 'export'}_${new Date().toISOString().split('T')[0]}.csv`;
      const result = await window.electronAPI.salesforce.exportToCsv(queryResults, filename);
      if (!result.success) {
        console.error('Export failed:', result.error);
      }
    } catch (err) {
      console.error('Error exporting CSV:', err);
    }
  };

  return (
    <div className="h-full flex bg-discord-medium relative">
      {/* Ambient Starfield Background */}
      <AmbientStarfield opacity={0.35} starCount={120} shootingStarInterval={12000} />
      
      {/* Left Sidebar - Object List */}
      <div className="w-72 flex-shrink-0 bg-discord-dark/90 backdrop-blur-sm border-r border-discord-darker relative z-10">
        <ObjectList
          objects={objects}
          selectedObject={selectedObject}
          onSelectObject={handleObjectSelect}
          isLoading={isLoadingObjects}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {selectedObject ? (
          <>
            {/* Query Builder */}
            <div className="flex-shrink-0 border-b border-discord-darker">
              <QueryBuilder
                selectedObject={selectedObject}
                objectDescription={objectDescription}
                query={query}
                onQueryChange={setQuery}
                onExecuteQuery={handleExecuteQuery}
                isLoading={isLoadingDescription}
                isExecuting={isExecutingQuery}
                selectedLimit={selectedLimit}
                onLimitChange={setSelectedLimit}
                onObjectDetected={handleObjectDetected}
              />
            </div>

            {/* Results Table */}
            <div className="flex-1 overflow-hidden">
              <ResultsTable
                results={queryResults}
                isLoading={isExecutingQuery}
                error={queryError}
                totalRecords={totalRecords}
                onExportCsv={handleExportCsv}
                objectDescription={objectDescription}
                disableEditing={settings.preventProductionEdits && isProduction === true}
                editingDisabledReason={
                  settings.preventProductionEdits && isProduction === true
                    ? 'Inline editing disabled for production'
                    : undefined
                }
                sourceOrgUrl={session.instanceUrl}
                sourceUsername={session.username}
                executionStartTime={queryStartTime}
                onCancelQuery={handleCancelQuery}
                onRecordUpdate={(recordId, field, newValue) => {
                  // Update local results to reflect the change
                  setQueryResults(prev => {
                    if (!prev) return prev;
                    return prev.map(record => 
                      record.Id === recordId 
                        ? { ...record, [field]: newValue }
                        : record
                    );
                  });
                }}
              />
            </div>
          </>
        ) : (
          <>
            {/* Query Builder - shown even without object selected */}
            <div className="flex-shrink-0 border-b border-discord-darker">
              <QueryBuilder
                selectedObject={null}
                objectDescription={null}
                query={query}
                onQueryChange={setQuery}
                onExecuteQuery={handleExecuteQuery}
                isLoading={false}
                isExecuting={isExecutingQuery}
                selectedLimit={selectedLimit}
                onLimitChange={setSelectedLimit}
                onObjectDetected={handleObjectDetected}
              />
            </div>

            {/* Results Table or Placeholder */}
            <div className="flex-1 overflow-hidden">
              {queryResults !== null || queryError ? (
                <ResultsTable
                  results={queryResults}
                  isLoading={isExecutingQuery}
                  error={queryError}
                  totalRecords={totalRecords}
                  onExportCsv={handleExportCsv}
                  objectDescription={null}
                  disableEditing={true}
                  editingDisabledReason="Select an object for inline editing"
                  sourceOrgUrl={session.instanceUrl}
                  sourceUsername={session.username}
                  executionStartTime={queryStartTime}
                  onCancelQuery={handleCancelQuery}
                  onRecordUpdate={() => {}}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center">
                    <svg className="w-24 h-24 mx-auto mb-4 text-discord-lighter" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <h2 className="text-xl font-semibold text-discord-text mb-2">
                      Paste a Query or Select an Object
                    </h2>
                    <p className="text-discord-text-muted max-w-md">
                      Paste a SOQL query above to auto-detect the object, or choose
                      an object from the sidebar to start building your query.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right Sidebar - Query History */}
      {showHistory && (
        <div className="w-80 flex-shrink-0 bg-discord-dark/90 backdrop-blur-sm border-l border-discord-darker relative z-10">
          <QueryHistory
            onSelectQuery={handleSelectHistoryQuery}
            refreshTrigger={historyRefreshTrigger}
          />
        </div>
      )}

      {/* History Toggle Button */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className={`absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-l-lg transition-all z-10 ${
          showHistory 
            ? 'bg-discord-dark text-discord-text-muted hover:text-discord-text mr-80' 
            : 'bg-discord-accent text-white hover:bg-discord-accent-hover'
        }`}
        title={showHistory ? 'Hide History' : 'Show History'}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {/* Settings Floating Button */}
      <button
        onClick={onOpenSettings}
        className="absolute bottom-4 right-4 p-3 rounded-full bg-discord-dark hover:bg-discord-light border border-discord-lighter shadow-lg transition-all z-10 group"
        style={{ right: showHistory ? 'calc(320px + 16px)' : '16px' }}
        title="Settings"
      >
        <svg className="w-5 h-5 text-discord-text-muted group-hover:text-discord-text transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  );
};

export default MainPage;
