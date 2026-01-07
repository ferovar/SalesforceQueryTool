import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { DebugUser, UserDebugLog } from '../types/electron.d';

interface UserDebuggingTabProps {
  // Optional callback when a log is viewed (for potential future use)
  onViewLog?: (logBody: string) => void;
}

// Log line types for color coding (reused from main modal)
type LogLineType = 
  | 'debug' 
  | 'error' 
  | 'warning' 
  | 'info' 
  | 'user-debug' 
  | 'system' 
  | 'dml' 
  | 'soql'
  | 'limit'
  | 'default';

interface ParsedLogLine {
  timestamp: string;
  type: LogLineType;
  category: string;
  content: string;
  raw: string;
}

const DURATION_OPTIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 480, label: '8 hours' },
];

const UserDebuggingTab: React.FC<UserDebuggingTabProps> = () => {
  // User search state
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<DebugUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DebugUser | null>(null);
  
  // Trace flag state
  const [duration, setDuration] = useState(30);
  const [isCreatingTraceFlag, setIsCreatingTraceFlag] = useState(false);
  const [activeTraceFlag, setActiveTraceFlag] = useState<{
    id: string;
    expirationDate: string;
  } | null>(null);
  
  // Log monitoring state
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [logs, setLogs] = useState<UserDebugLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<UserDebugLog | null>(null);
  const [logBody, setLogBody] = useState<string | null>(null);
  const [parsedLog, setParsedLog] = useState<ParsedLogLine[]>([]);
  const [isLoadingLog, setIsLoadingLog] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<string | null>(null);
  
  // Filter state
  const [logFilter, setLogFilter] = useState('');
  const [logTypeFilters, setLogTypeFilters] = useState<Set<LogLineType>>(new Set(['user-debug', 'error', 'warning']));
  const [showAllLogTypes, setShowAllLogTypes] = useState(false);
  
  // Refs
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  // Check for active trace flags when user is selected
  useEffect(() => {
    if (selectedUser) {
      checkActiveTraceFlag();
    }
  }, [selectedUser]);

  // Start/stop monitoring based on state
  useEffect(() => {
    if (isMonitoring && selectedUser && activeTraceFlag) {
      startPolling();
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [isMonitoring, selectedUser, activeTraceFlag]);

  // Parse debug log
  const parseDebugLog = useCallback((log: string): ParsedLogLine[] => {
    const lines = log.split('\n');
    return lines.map(line => {
      const raw = line;
      let type: LogLineType = 'default';
      let timestamp = '';
      let category = '';
      let content = line;

      const match = line.match(/^(\d{2}:\d{2}:\d{2}\.\d+)\s*\((\d+)\)\|([^|]+)\|(.*)$/);
      if (match) {
        timestamp = match[1];
        category = match[3];
        content = match[4];

        if (category === 'USER_DEBUG') {
          type = 'user-debug';
        } else if (category.includes('ERROR') || category.includes('FATAL') || category.includes('EXCEPTION')) {
          type = 'error';
        } else if (category.includes('WARN')) {
          type = 'warning';
        } else if (category === 'SYSTEM_MODE_ENTER' || category === 'SYSTEM_MODE_EXIT' || category.includes('SYSTEM')) {
          type = 'system';
        } else if (category.includes('DML') || category.includes('INSERT') || category.includes('UPDATE') || category.includes('DELETE')) {
          type = 'dml';
        } else if (category.includes('SOQL') || category.includes('QUERY')) {
          type = 'soql';
        } else if (category.includes('LIMIT') || category.includes('CUMULATIVE')) {
          type = 'limit';
        } else if (category === 'CODE_UNIT_STARTED' || category === 'CODE_UNIT_FINISHED') {
          type = 'info';
        }
      } else if (line.includes('DEBUG|') || line.includes('System.debug')) {
        type = 'user-debug';
      } else if (line.toLowerCase().includes('error') || line.toLowerCase().includes('exception')) {
        type = 'error';
      }

      return { timestamp, type, category, content, raw };
    });
  }, []);

  useEffect(() => {
    if (logBody) {
      setParsedLog(parseDebugLog(logBody));
    } else {
      setParsedLog([]);
    }
  }, [logBody, parseDebugLog]);

  const getLogLineColor = (type: LogLineType): string => {
    switch (type) {
      case 'user-debug': return 'text-cyan-400';
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      case 'dml': return 'text-purple-400';
      case 'soql': return 'text-green-400';
      case 'limit': return 'text-orange-400';
      case 'system': return 'text-gray-500';
      default: return 'text-discord-text-muted';
    }
  };

  const handleUserSearch = async (term: string) => {
    setUserSearch(term);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await window.electronAPI.debug.searchUsers(term);
        if (result.success && result.data) {
          setSearchResults(result.data);
        }
      } catch (err) {
        console.error('Failed to search users:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleSelectUser = (user: DebugUser) => {
    setSelectedUser(user);
    setSearchResults([]);
    setUserSearch('');
    setLogs([]);
    setSelectedLog(null);
    setLogBody(null);
    setActiveTraceFlag(null);
  };

  const checkActiveTraceFlag = async () => {
    if (!selectedUser) return;
    
    try {
      const result = await window.electronAPI.debug.getActiveTraceFlags();
      if (result.success && result.data) {
        const userTraceFlag = result.data.find(tf => tf.tracedEntityId === selectedUser.id);
        if (userTraceFlag) {
          setActiveTraceFlag({
            id: userTraceFlag.id,
            expirationDate: userTraceFlag.expirationDate,
          });
        }
      }
    } catch (err) {
      console.error('Failed to check trace flags:', err);
    }
  };

  const handleStartDebugging = async () => {
    if (!selectedUser) return;
    
    setIsCreatingTraceFlag(true);
    try {
      const result = await window.electronAPI.debug.createTraceFlag(selectedUser.id, duration);
      if (result.success && result.data) {
        setActiveTraceFlag({
          id: result.data.traceFlagId,
          expirationDate: result.data.expirationDate,
        });
        setIsMonitoring(true);
        setLastPollTime(new Date().toISOString());
      }
    } catch (err) {
      console.error('Failed to create trace flag:', err);
    } finally {
      setIsCreatingTraceFlag(false);
    }
  };

  const handleStopDebugging = async () => {
    setIsMonitoring(false);
    
    if (activeTraceFlag) {
      try {
        await window.electronAPI.debug.deleteTraceFlag(activeTraceFlag.id);
      } catch (err) {
        console.error('Failed to delete trace flag:', err);
      }
      setActiveTraceFlag(null);
    }
  };

  const startPolling = () => {
    if (pollingIntervalRef.current) return;
    
    // Initial poll
    pollForLogs();
    
    // Poll every 5 seconds
    pollingIntervalRef.current = setInterval(pollForLogs, 5000);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const pollForLogs = async () => {
    if (!selectedUser) return;
    
    try {
      const result = await window.electronAPI.debug.getLogsForUser(
        selectedUser.id,
        lastPollTime || undefined,
        50
      );
      
      if (result.success && result.data) {
        setLogs(prevLogs => {
          const existingIds = new Set(prevLogs.map(l => l.id));
          const newLogs = result.data!.filter(l => !existingIds.has(l.id));
          if (newLogs.length > 0) {
            return [...newLogs, ...prevLogs].slice(0, 100);
          }
          return prevLogs;
        });
      }
    } catch (err) {
      console.error('Failed to poll logs:', err);
    }
  };

  const handleViewLog = async (log: UserDebugLog) => {
    setSelectedLog(log);
    setIsLoadingLog(true);
    
    try {
      const result = await window.electronAPI.apex.getDebugLogBody(log.id);
      if (result.success && result.data) {
        setLogBody(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch log body:', err);
    } finally {
      setIsLoadingLog(false);
    }
  };

  const formatLogSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getTimeRemaining = (): string => {
    if (!activeTraceFlag) return '';
    const expiration = new Date(activeTraceFlag.expirationDate);
    const now = new Date();
    const diff = expiration.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    }
    
    return `${minutes}m ${seconds}s`;
  };

  const toggleLogTypeFilter = (type: LogLineType) => {
    setLogTypeFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const filteredLogLines = parsedLog.filter(line => {
    if (!showAllLogTypes && !logTypeFilters.has(line.type)) return false;
    if (logFilter && !line.raw.toLowerCase().includes(logFilter.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Panel - User Selection & Controls */}
      <div className="w-80 flex-shrink-0 border-r border-discord-darker flex flex-col bg-discord-darker/30">
        {/* User Search */}
        <div className="p-4 border-b border-discord-darker">
          <label className="block text-sm font-medium text-discord-text mb-2">
            Select User to Debug
          </label>
          <div className="relative">
            <input
              type="text"
              value={selectedUser ? selectedUser.name : userSearch}
              onChange={(e) => handleUserSearch(e.target.value)}
              onFocus={() => selectedUser && setSelectedUser(null)}
              placeholder="Search by name, username, or email..."
              className="w-full px-3 py-2 bg-discord-medium rounded text-discord-text text-sm placeholder-discord-text-muted focus:outline-none focus:ring-2 focus:ring-discord-accent"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="w-4 h-4 animate-spin text-discord-text-muted" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
          </div>
          
          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-72 bg-discord-dark border border-discord-darker rounded-lg shadow-xl max-h-60 overflow-y-auto">
              {searchResults.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className="w-full px-3 py-2 text-left hover:bg-discord-medium transition-colors"
                >
                  <div className="text-sm font-medium text-discord-text">{user.name}</div>
                  <div className="text-xs text-discord-text-muted">{user.username}</div>
                  <div className="text-xs text-discord-text-muted">{user.profileName}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected User Card */}
        {selectedUser && (
          <div className="p-4 border-b border-discord-darker">
            <div className="bg-discord-medium rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-discord-accent/20 flex items-center justify-center">
                  <span className="text-discord-accent font-semibold">
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-discord-text truncate">{selectedUser.name}</div>
                  <div className="text-xs text-discord-text-muted truncate">{selectedUser.username}</div>
                </div>
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setActiveTraceFlag(null);
                    setIsMonitoring(false);
                    setLogs([]);
                  }}
                  className="p-1 hover:bg-discord-dark rounded text-discord-text-muted hover:text-discord-text"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-2 text-xs text-discord-text-muted">
                {selectedUser.profileName}
              </div>
            </div>
          </div>
        )}

        {/* Debug Controls */}
        {selectedUser && (
          <div className="p-4 border-b border-discord-darker">
            <label className="block text-sm font-medium text-discord-text mb-2">
              Debug Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={isMonitoring}
              className="w-full px-3 py-2 bg-discord-medium rounded text-discord-text text-sm focus:outline-none focus:ring-2 focus:ring-discord-accent disabled:opacity-50"
            >
              {DURATION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <div className="mt-4">
              {!isMonitoring ? (
                <button
                  onClick={handleStartDebugging}
                  disabled={isCreatingTraceFlag}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white font-medium transition-colors disabled:opacity-50"
                >
                  {isCreatingTraceFlag ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Enabling...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Start Debugging
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleStopDebugging}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white font-medium transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  Stop Debugging
                </button>
              )}
            </div>

            {/* Active Monitoring Status */}
            {isMonitoring && activeTraceFlag && (
              <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  <span className="text-green-400 font-medium text-sm">Monitoring Active</span>
                </div>
                <div className="text-xs text-discord-text-muted">
                  Time remaining: {getTimeRemaining()}
                </div>
                <div className="text-xs text-discord-text-muted mt-1">
                  Polling every 5 seconds
                </div>
              </div>
            )}
          </div>
        )}

        {/* Logs List */}
        {selectedUser && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-discord-darker flex items-center justify-between">
              <span className="text-sm font-medium text-discord-text">
                Debug Logs ({logs.length})
              </span>
              {logs.length > 0 && (
                <button
                  onClick={() => setLogs([])}
                  className="text-xs text-discord-text-muted hover:text-discord-text"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="p-4 text-center text-discord-text-muted text-sm">
                  {isMonitoring ? 'Waiting for logs...' : 'No logs yet'}
                </div>
              ) : (
                <div className="divide-y divide-discord-darker">
                  {logs.map(log => (
                    <button
                      key={log.id}
                      onClick={() => handleViewLog(log)}
                      className={`w-full p-3 text-left transition-colors ${
                        selectedLog?.id === log.id
                          ? 'bg-discord-accent/10'
                          : 'hover:bg-discord-medium'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          log.status === 'Success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {log.status}
                        </span>
                        <span className="text-xs text-discord-text-muted">
                          {formatLogSize(log.logLength)}
                        </span>
                      </div>
                      <div className="text-sm text-discord-text truncate">
                        {log.operation || log.request || 'Unknown Operation'}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-discord-text-muted">
                        <span>{new Date(log.startTime).toLocaleTimeString()}</span>
                        <span>•</span>
                        <span>{formatDuration(log.durationMs)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - Log Viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedLog && logBody ? (
          <>
            {/* Log Header */}
            <div className="p-3 border-b border-discord-darker bg-discord-darker/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    selectedLog.status === 'Success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {selectedLog.status}
                  </span>
                  <span className="text-sm text-discord-text font-medium">
                    {selectedLog.operation || 'Debug Log'}
                  </span>
                </div>
                <div className="text-xs text-discord-text-muted">
                  {formatLogSize(selectedLog.logLength)} • {formatDuration(selectedLog.durationMs)}
                </div>
              </div>
              
              {/* Filters */}
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  placeholder="Filter logs..."
                  className="flex-1 px-3 py-1.5 bg-discord-medium rounded text-discord-text text-sm placeholder-discord-text-muted focus:outline-none focus:ring-1 focus:ring-discord-accent"
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowAllLogTypes(!showAllLogTypes)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      showAllLogTypes ? 'bg-discord-accent text-white' : 'bg-discord-medium text-discord-text-muted hover:text-discord-text'
                    }`}
                  >
                    All
                  </button>
                  {(['user-debug', 'error', 'warning', 'soql', 'dml'] as LogLineType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => toggleLogTypeFilter(type)}
                      className={`px-2 py-1 rounded text-xs transition-colors ${
                        logTypeFilters.has(type) ? getLogLineColor(type) + ' bg-discord-medium' : 'text-discord-text-muted hover:text-discord-text'
                      }`}
                    >
                      {type.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Log Content */}
            <div className="flex-1 overflow-auto p-3 bg-discord-medium font-mono text-xs">
              {isLoadingLog ? (
                <div className="flex items-center justify-center h-full">
                  <svg className="w-6 h-6 animate-spin text-discord-accent" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredLogLines.map((line, index) => (
                    <div key={index} className={`${getLogLineColor(line.type)} hover:bg-discord-dark/50 px-1 rounded whitespace-pre-wrap break-all`}>
                      {line.timestamp && (
                        <span className="text-discord-text-muted mr-2">{line.timestamp}</span>
                      )}
                      {line.category && (
                        <span className="text-discord-text-muted mr-2">[{line.category}]</span>
                      )}
                      <span>{line.content || line.raw}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-discord-text-muted">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">
                {selectedUser 
                  ? 'Select a log to view its contents' 
                  : 'Search and select a user to start debugging'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDebuggingTab;
