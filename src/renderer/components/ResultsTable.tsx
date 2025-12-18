import React, { useMemo, useState } from 'react';

interface ResultsTableProps {
  results: any[] | null;
  isLoading: boolean;
  error: string | null;
  totalRecords: number;
  onExportCsv: () => void;
}

const ResultsTable: React.FC<ResultsTableProps> = ({
  results,
  isLoading,
  error,
  totalRecords,
  onExportCsv,
}) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
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
              {columns.map((column) => (
                <th
                  key={column}
                  onClick={() => handleSort(column)}
                  className="cursor-pointer hover:bg-discord-light select-none"
                >
                  <div className="flex items-center gap-1">
                    <span className="truncate">{column}</span>
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
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedResults?.map((record, index) => (
              <tr key={record.Id || index}>
                <td className="text-center text-discord-text-muted text-xs">
                  {index + 1}
                </td>
                {columns.map((column) => (
                  <td key={column} className="max-w-xs truncate" title={formatValue(record[column])}>
                    {formatValue(record[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsTable;
