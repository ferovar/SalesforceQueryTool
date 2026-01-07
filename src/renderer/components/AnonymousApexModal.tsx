import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { SavedApexScript, ApexExecutionLog, ApexExecutionResult } from '../types/electron.d';
import ApexHighlighter from './ApexHighlighter';
import UserDebuggingTab from './UserDebuggingTab';

interface AnonymousApexModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Log line types for color coding
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

const AnonymousApexModal: React.FC<AnonymousApexModalProps> = ({ isOpen, onClose }) => {
  // Script state
  const [script, setScript] = useState('');
  const [scriptName, setScriptName] = useState('');
  const [currentScriptId, setCurrentScriptId] = useState<string | undefined>();
  const [savedScripts, setSavedScripts] = useState<SavedApexScript[]>([]);
  const [isLoadingSavedScripts, setIsLoadingSavedScripts] = useState(false);
  
  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ApexExecutionResult | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  
  // Log viewer state
  const [debugLog, setDebugLog] = useState<string | null>(null);
  const [parsedLog, setParsedLog] = useState<ParsedLogLine[]>([]);
  const [logFilter, setLogFilter] = useState('');
  const [logTypeFilters, setLogTypeFilters] = useState<Set<LogLineType>>(new Set(['user-debug', 'error', 'warning']));
  const [showAllLogTypes, setShowAllLogTypes] = useState(false);
  
  // Execution history
  const [executionHistory, setExecutionHistory] = useState<ApexExecutionLog[]>([]);
  const [selectedHistoryLog, setSelectedHistoryLog] = useState<ApexExecutionLog | null>(null);
  
  // UI state
  const [activeTab, setActiveTab] = useState<'editor' | 'history' | 'debugging'>('editor');
  const [showSavedScripts, setShowSavedScripts] = useState(true);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and highlighted code
  const handleEditorScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Load saved scripts on mount
  useEffect(() => {
    if (isOpen) {
      loadSavedScripts();
      loadExecutionHistory();
    }
  }, [isOpen]);

  const loadSavedScripts = async () => {
    setIsLoadingSavedScripts(true);
    try {
      const scripts = await window.electronAPI.apexScripts.getAll();
      setSavedScripts(scripts);
    } catch (err) {
      console.error('Failed to load saved scripts:', err);
    } finally {
      setIsLoadingSavedScripts(false);
    }
  };

  const loadExecutionHistory = async () => {
    try {
      const history = await window.electronAPI.apexHistory.getAll();
      setExecutionHistory(history);
    } catch (err) {
      console.error('Failed to load execution history:', err);
    }
  };

  // Parse debug log into structured lines
  const parseDebugLog = useCallback((log: string): ParsedLogLine[] => {
    const lines = log.split('\n');
    return lines.map(line => {
      const raw = line;
      let type: LogLineType = 'default';
      let timestamp = '';
      let category = '';
      let content = line;

      // Parse timestamp and category from log line
      // Format: HH:MM:SS.mmm (xxxxxxxx)|CATEGORY|...
      const match = line.match(/^(\d{2}:\d{2}:\d{2}\.\d+)\s*\((\d+)\)\|([^|]+)\|(.*)$/);
      if (match) {
        timestamp = match[1];
        category = match[3];
        content = match[4];

        // Determine type based on category
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
    if (debugLog) {
      setParsedLog(parseDebugLog(debugLog));
    } else {
      setParsedLog([]);
    }
  }, [debugLog, parseDebugLog]);

  const handleExecute = async () => {
    if (!script.trim()) return;

    setIsExecuting(true);
    setExecutionResult(null);
    setExecutionError(null);
    setDebugLog(null);

    try {
      const result = await window.electronAPI.apex.execute(script, currentScriptId, scriptName || undefined);
      
      if (result.success && result.data) {
        setExecutionResult(result.data);
        if (result.data.debugLog) {
          setDebugLog(result.data.debugLog);
        }
      } else {
        setExecutionError(result.error || 'Execution failed');
      }
      
      // Refresh execution history
      loadExecutionHistory();
    } catch (err: any) {
      setExecutionError(err.message || 'An unexpected error occurred');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSaveScript = async () => {
    if (!script.trim() || !scriptName.trim()) return;

    try {
      const result = await window.electronAPI.apexScripts.save(scriptName, script, currentScriptId);
      if (result.success && result.data) {
        setCurrentScriptId(result.data.id);
        loadSavedScripts();
        setIsSaveDialogOpen(false);
      }
    } catch (err) {
      console.error('Failed to save script:', err);
    }
  };

  const handleLoadScript = (savedScript: SavedApexScript) => {
    setScript(savedScript.script);
    setScriptName(savedScript.name);
    setCurrentScriptId(savedScript.id);
    setExecutionResult(null);
    setExecutionError(null);
    setDebugLog(null);
  };

  const handleDeleteScript = async (scriptId: string) => {
    try {
      await window.electronAPI.apexScripts.delete(scriptId);
      loadSavedScripts();
      if (currentScriptId === scriptId) {
        setCurrentScriptId(undefined);
        setScriptName('');
      }
    } catch (err) {
      console.error('Failed to delete script:', err);
    }
  };

  const handleNewScript = () => {
    setScript('');
    setScriptName('');
    setCurrentScriptId(undefined);
    setExecutionResult(null);
    setExecutionError(null);
    setDebugLog(null);
    textareaRef.current?.focus();
  };

  const handleViewHistoryLog = (log: ApexExecutionLog) => {
    setSelectedHistoryLog(log);
    if (log.debugLog) {
      setDebugLog(log.debugLog);
    }
  };

  const handleLoadFromHistory = (log: ApexExecutionLog) => {
    setScript(log.script);
    setScriptName(log.scriptName || '');
    setCurrentScriptId(log.scriptId);
    setActiveTab('editor');
  };

  const handleClearHistory = () => {
    setShowClearConfirm(true);
  };

  const confirmClearHistory = async () => {
    try {
      await window.electronAPI.apexHistory.clear();
      setExecutionHistory([]);
      setSelectedHistoryLog(null);
      setShowClearConfirm(false);
      setSelectedHistoryLog(null);
    } catch (err) {
      console.error('Failed to clear execution history:', err);
    }
  };

  const getLogLineColor = (type: LogLineType): string => {
    switch (type) {
      case 'user-debug':
        return 'text-cyan-400';
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      case 'dml':
        return 'text-purple-400';
      case 'soql':
        return 'text-green-400';
      case 'limit':
        return 'text-orange-400';
      case 'system':
        return 'text-gray-500';
      default:
        return 'text-discord-text-muted';
    }
  };

  const filteredLogLines = parsedLog.filter(line => {
    // Apply type filter
    if (!showAllLogTypes && !logTypeFilters.has(line.type)) {
      return false;
    }
    // Apply text filter
    if (logFilter && !line.raw.toLowerCase().includes(logFilter.toLowerCase())) {
      return false;
    }
    return true;
  });

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-discord-dark rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden border border-discord-darker">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-discord-darker bg-discord-darker/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6 text-discord-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <h2 className="text-xl font-semibold text-discord-text">Anonymous Apex</h2>
            </div>
            {currentScriptId && scriptName && (
              <span className="text-sm text-discord-text-muted bg-discord-medium px-3 py-1 rounded">
                {scriptName}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-discord-medium text-discord-text-muted hover:text-discord-text transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-discord-darker bg-discord-darker/30">
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'editor'
                ? 'text-discord-accent border-b-2 border-discord-accent'
                : 'text-discord-text-muted hover:text-discord-text'
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'text-discord-accent border-b-2 border-discord-accent'
                : 'text-discord-text-muted hover:text-discord-text'
            }`}
          >
            Execution History
          </button>
          <button
            onClick={() => setActiveTab('debugging')}
            className={`px-6 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'debugging'
                ? 'text-discord-accent border-b-2 border-discord-accent'
                : 'text-discord-text-muted hover:text-discord-text'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
            User Debugging
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'editor' ? (
            <>
              {/* Saved Scripts Sidebar */}
              {showSavedScripts && (
                <div className="w-64 flex-shrink-0 bg-discord-darker/50 border-r border-discord-darker flex flex-col">
                  <div className="p-3 border-b border-discord-darker flex items-center justify-between">
                    <span className="text-sm font-medium text-discord-text">Saved Scripts</span>
                    <button
                      onClick={handleNewScript}
                      className="p-1.5 rounded hover:bg-discord-medium text-discord-text-muted hover:text-discord-accent transition-colors"
                      title="New Script"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {isLoadingSavedScripts ? (
                      <div className="text-discord-text-muted text-sm text-center py-4">Loading...</div>
                    ) : savedScripts.length === 0 ? (
                      <div className="text-discord-text-muted text-sm text-center py-4">No saved scripts</div>
                    ) : (
                      savedScripts.map(savedScript => (
                        <div
                          key={savedScript.id}
                          className={`group p-2 rounded cursor-pointer transition-colors ${
                            currentScriptId === savedScript.id
                              ? 'bg-discord-accent/20 border border-discord-accent/50'
                              : 'hover:bg-discord-medium'
                          }`}
                          onClick={() => handleLoadScript(savedScript)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-discord-text truncate flex-1">{savedScript.name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteScript(savedScript.id);
                              }}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-discord-text-muted hover:text-red-400 transition-all"
                              title="Delete"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          {savedScript.lastRunAt && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className={`w-2 h-2 rounded-full ${savedScript.lastRunSuccess ? 'bg-green-500' : 'bg-red-500'}`} />
                              <span className="text-xs text-discord-text-muted">
                                {new Date(savedScript.lastRunAt).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Main Editor Area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center gap-2 p-3 border-b border-discord-darker bg-discord-darker/30">
                  <button
                    onClick={() => setShowSavedScripts(!showSavedScripts)}
                    className={`p-2 rounded transition-colors ${
                      showSavedScripts ? 'bg-discord-accent/20 text-discord-accent' : 'hover:bg-discord-medium text-discord-text-muted'
                    }`}
                    title={showSavedScripts ? 'Hide Saved Scripts' : 'Show Saved Scripts'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                  </button>
                  
                  <div className="flex-1" />
                  
                  <button
                    onClick={() => setIsSaveDialogOpen(true)}
                    disabled={!script.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-discord-medium hover:bg-discord-light rounded text-discord-text text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save
                  </button>
                  
                  <button
                    onClick={handleExecute}
                    disabled={isExecuting || !script.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover rounded text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExecuting ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Executing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Execute
                      </>
                    )}
                  </button>
                </div>

                {/* Editor and Results */}
                <div className="flex-1 flex overflow-hidden">
                  {/* Code Editor with Syntax Highlighting */}
                  <div className="flex-1 flex flex-col overflow-hidden relative bg-discord-medium">
                    {/* Highlighted code background */}
                    <div 
                      ref={highlightRef}
                      className="absolute inset-0 p-4 overflow-hidden pointer-events-none"
                    >
                      {script ? (
                        <ApexHighlighter code={script} />
                      ) : (
                        <span className="text-discord-text-muted font-mono text-sm whitespace-pre-wrap">
                          {"// Enter your Apex code here...\nSystem.debug('Hello World!');"}
                        </span>
                      )}
                    </div>
                    {/* Transparent textarea on top for editing */}
                    <textarea
                      ref={textareaRef}
                      value={script}
                      onChange={(e) => setScript(e.target.value)}
                      onScroll={handleEditorScroll}
                      className="flex-1 p-4 bg-transparent text-transparent caret-white font-mono text-sm resize-none focus:outline-none border-none relative z-10"
                      spellCheck={false}
                    />
                  </div>

                  {/* Results Panel */}
                  <div className="w-1/2 flex flex-col border-l border-discord-darker overflow-hidden">
                    {/* Execution Status */}
                    {(executionResult || executionError) && (
                      <div className={`p-3 border-b border-discord-darker ${
                        executionError ? 'bg-red-500/10' : executionResult?.success ? 'bg-green-500/10' : 'bg-yellow-500/10'
                      }`}>
                        <div className="flex items-center gap-2">
                          {executionError ? (
                            <>
                              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-red-400 font-medium">Error</span>
                            </>
                          ) : executionResult?.success ? (
                            <>
                              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-green-400 font-medium">Execution Successful</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <span className="text-yellow-400 font-medium">Execution Failed</span>
                            </>
                          )}
                        </div>
                        {executionError && (
                          <p className="text-red-300 text-sm mt-2">{executionError}</p>
                        )}
                        {executionResult?.compileProblem && (
                          <p className="text-yellow-300 text-sm mt-2">
                            <span className="font-medium">Compile Error:</span> {executionResult.compileProblem}
                            {executionResult.line && ` (Line ${executionResult.line}${executionResult.column ? `, Column ${executionResult.column}` : ''})`}
                          </p>
                        )}
                        {executionResult?.exceptionMessage && (
                          <div className="mt-2">
                            <p className="text-red-300 text-sm">
                              <span className="font-medium">Exception:</span> {executionResult.exceptionMessage}
                            </p>
                            {executionResult.exceptionStackTrace && (
                              <pre className="text-red-300/80 text-xs mt-1 whitespace-pre-wrap">{executionResult.exceptionStackTrace}</pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Log Viewer */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Log Filter Controls */}
                      <div className="p-2 border-b border-discord-darker bg-discord-darker/30 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={logFilter}
                            onChange={(e) => setLogFilter(e.target.value)}
                            placeholder="Filter logs..."
                            className="flex-1 px-3 py-1.5 bg-discord-medium rounded text-sm text-discord-text placeholder-discord-text-muted focus:outline-none focus:ring-1 focus:ring-discord-accent"
                          />
                          <button
                            onClick={() => setShowAllLogTypes(!showAllLogTypes)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              showAllLogTypes
                                ? 'bg-discord-accent text-white'
                                : 'bg-discord-medium text-discord-text-muted hover:text-discord-text'
                            }`}
                          >
                            All
                          </button>
                        </div>
                        {!showAllLogTypes && (
                          <div className="flex flex-wrap gap-1">
                            {(['user-debug', 'error', 'warning', 'info', 'dml', 'soql', 'limit'] as LogLineType[]).map(type => (
                              <button
                                key={type}
                                onClick={() => toggleLogTypeFilter(type)}
                                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                                  logTypeFilters.has(type)
                                    ? `${getLogLineColor(type)} bg-discord-medium`
                                    : 'text-discord-text-muted hover:text-discord-text'
                                }`}
                              >
                                {type.replace('-', ' ')}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Log Content */}
                      <div className="flex-1 overflow-auto p-3 bg-discord-medium font-mono text-xs">
                        {!debugLog ? (
                          <div className="text-discord-text-muted text-center py-8">
                            Execute a script to see debug logs here
                          </div>
                        ) : filteredLogLines.length === 0 ? (
                          <div className="text-discord-text-muted text-center py-8">
                            No matching log lines
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            {filteredLogLines.map((line, index) => (
                              <div key={index} className={`${getLogLineColor(line.type)} hover:bg-discord-dark/50 px-1 rounded`}>
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
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : activeTab === 'history' ? (
            /* Execution History Tab */
            <div className="flex-1 flex overflow-hidden">
              {/* History List */}
              <div className="w-96 flex-shrink-0 border-r border-discord-darker flex flex-col overflow-hidden">
                {/* History Header with Clear Button */}
                <div className="p-3 border-b border-discord-darker flex items-center justify-between bg-discord-darker/30">
                  <span className="text-sm font-medium text-discord-text">Execution History</span>
                  {executionHistory.length > 0 && (
                    <button
                      onClick={handleClearHistory}
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/20 transition-colors"
                      title="Clear all execution history"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {executionHistory.length === 0 ? (
                    <div className="text-discord-text-muted text-center py-8">No execution history</div>
                  ) : (
                    <div className="divide-y divide-discord-darker">
                    {executionHistory.map(log => (
                      <div
                        key={log.id}
                        onClick={() => handleViewHistoryLog(log)}
                        className={`p-4 cursor-pointer transition-colors ${
                          selectedHistoryLog?.id === log.id
                            ? 'bg-discord-accent/10'
                            : 'hover:bg-discord-medium'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 rounded-full ${log.success ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="text-sm font-medium text-discord-text">
                            {log.scriptName || 'Anonymous Script'}
                          </span>
                        </div>
                        <p className="text-xs text-discord-text-muted mb-2">
                          {new Date(log.executedAt).toLocaleString()}
                        </p>
                        <p className="text-xs text-discord-text-muted font-mono truncate">
                          {log.script.slice(0, 80)}...
                        </p>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLoadFromHistory(log);
                            }}
                            className="text-xs text-discord-accent hover:underline"
                          >
                            Load Script
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </div>

              {/* History Detail View */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {selectedHistoryLog ? (
                  <>
                    {/* Header */}
                    <div className={`p-4 border-b border-discord-darker ${
                      selectedHistoryLog.success ? 'bg-green-500/10' : 'bg-red-500/10'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-3 h-3 rounded-full ${selectedHistoryLog.success ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="font-medium text-discord-text">
                          {selectedHistoryLog.success ? 'Execution Successful' : 'Execution Failed'}
                        </span>
                      </div>
                      <p className="text-sm text-discord-text-muted">
                        {new Date(selectedHistoryLog.executedAt).toLocaleString()}
                      </p>
                      {selectedHistoryLog.compileProblem && (
                        <p className="text-sm text-yellow-400 mt-2">
                          Compile Error: {selectedHistoryLog.compileProblem}
                        </p>
                      )}
                      {selectedHistoryLog.exceptionMessage && (
                        <p className="text-sm text-red-400 mt-2">
                          Exception: {selectedHistoryLog.exceptionMessage}
                        </p>
                      )}
                    </div>

                    {/* Script Preview */}
                    <div className="p-4 border-b border-discord-darker bg-discord-darker/30">
                      <h4 className="text-sm font-medium text-discord-text mb-2">Script</h4>
                      <pre className="text-xs text-discord-text-muted font-mono bg-discord-medium p-3 rounded max-h-32 overflow-auto">
                        {selectedHistoryLog.script}
                      </pre>
                    </div>

                    {/* Log Viewer */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="p-2 border-b border-discord-darker">
                        <h4 className="text-sm font-medium text-discord-text">Debug Log</h4>
                      </div>
                      <div className="flex-1 overflow-auto p-3 bg-discord-medium font-mono text-xs">
                        {selectedHistoryLog.debugLog ? (
                          <div className="space-y-0.5">
                            {parseDebugLog(selectedHistoryLog.debugLog).map((line, index) => (
                              <div key={index} className={`${getLogLineColor(line.type)} hover:bg-discord-dark/50 px-1 rounded`}>
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
                        ) : (
                          <div className="text-discord-text-muted text-center py-8">
                            No debug log available
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-discord-text-muted">
                    Select an execution from the history
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'debugging' ? (
            <UserDebuggingTab />
          ) : null}
        </div>
      </div>
      {/* Clear History Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
          <div className="bg-discord-dark rounded-lg shadow-xl p-6 w-96 border border-discord-darker">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-full">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-discord-text">Clear History</h3>
            </div>
            <p className="text-discord-text-muted mb-6">
              Are you sure you want to clear all execution history? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 bg-discord-medium hover:bg-discord-light rounded text-discord-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearHistory}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded text-white font-medium transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Save Dialog */}
      {isSaveDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60">
          <div className="bg-discord-dark rounded-lg shadow-xl p-6 w-96 border border-discord-darker">
            <h3 className="text-lg font-semibold text-discord-text mb-4">Save Script</h3>
            <input
              type="text"
              value={scriptName}
              onChange={(e) => setScriptName(e.target.value)}
              placeholder="Script name..."
              className="w-full px-4 py-2 bg-discord-medium rounded text-discord-text placeholder-discord-text-muted focus:outline-none focus:ring-2 focus:ring-discord-accent mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsSaveDialogOpen(false)}
                className="px-4 py-2 bg-discord-medium hover:bg-discord-light rounded text-discord-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveScript}
                disabled={!scriptName.trim()}
                className="px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover rounded text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

export default AnonymousApexModal;
