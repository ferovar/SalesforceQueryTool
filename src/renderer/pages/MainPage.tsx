import React, { useState, useEffect, useMemo } from 'react';
import type { UserSession } from '../App';
import type { SalesforceObject, SalesforceField, ObjectDescription } from '../types/electron.d';
import ObjectList from '../components/ObjectList';
import QueryBuilder from '../components/QueryBuilder';
import ResultsTable from '../components/ResultsTable';
import QueryHistory from '../components/QueryHistory';

interface MainPageProps {
  session: UserSession;
}

const MainPage: React.FC<MainPageProps> = ({ session }) => {
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
    setSelectedObject(obj);
    setIsLoadingDescription(true);
    setObjectDescription(null);
    setQueryError(null);

    try {
      const result = await window.electronAPI.salesforce.describeObject(obj.name);
      if (result.success && result.data) {
        setObjectDescription(result.data);
        // Build default query
        const defaultFields = result.data.fields
          .slice(0, 10)
          .map((f: SalesforceField) => f.name)
          .join(', ');
        setQuery(`SELECT ${defaultFields}\nFROM ${obj.name}\nLIMIT 100`);
      } else {
        console.error('Failed to describe object:', result.error);
      }
    } catch (err) {
      console.error('Error describing object:', err);
    } finally {
      setIsLoadingDescription(false);
    }
  };

  const handleExecuteQuery = async (includeDeleted: boolean = false) => {
    if (!query.trim()) return;

    setIsExecutingQuery(true);
    setQueryError(null);
    setQueryResults(null);

    // Extract object name from query for history
    const objectMatch = query.match(/FROM\s+(\w+)/i);
    const objectName = objectMatch ? objectMatch[1] : selectedObject?.name || 'Unknown';

    try {
      const result = await window.electronAPI.salesforce.executeQuery(query, includeDeleted);
      if (result.success && result.data) {
        setQueryResults(result.data);
        setTotalRecords(result.data.length);
        
        // Add to history
        await window.electronAPI.history.add({
          query: query.trim(),
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
          query: query.trim(),
          objectName,
          recordCount: 0,
          success: false,
          error: errorMsg,
        });
        setHistoryRefreshTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'An unexpected error occurred';
      setQueryError(errorMsg);
      
      // Add failed query to history
      await window.electronAPI.history.add({
        query: query.trim(),
        objectName,
        recordCount: 0,
        success: false,
        error: errorMsg,
      });
      setHistoryRefreshTrigger(prev => prev + 1);
    } finally {
      setIsExecutingQuery(false);
    }
  };

  // Handle selecting a query from history
  const handleSelectHistoryQuery = async (historyQuery: string, objectName: string) => {
    // Find and select the object if it exists
    const obj = objects.find(o => o.name.toLowerCase() === objectName.toLowerCase());
    if (obj && obj !== selectedObject) {
      await handleObjectSelect(obj);
    }
    setQuery(historyQuery);
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
      {/* Left Sidebar - Object List */}
      <div className="w-72 flex-shrink-0 bg-discord-dark border-r border-discord-darker">
        <ObjectList
          objects={objects}
          selectedObject={selectedObject}
          onSelectObject={handleObjectSelect}
          isLoading={isLoadingObjects}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
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
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-24 h-24 mx-auto mb-4 text-discord-lighter" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h2 className="text-xl font-semibold text-discord-text mb-2">
                Select an Object
              </h2>
              <p className="text-discord-text-muted max-w-md">
                Choose an object from the sidebar to start building your SOQL query.
                You can search for objects using the filter above.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar - Query History */}
      {showHistory && (
        <div className="w-80 flex-shrink-0 bg-discord-dark border-l border-discord-darker">
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
    </div>
  );
};

export default MainPage;
