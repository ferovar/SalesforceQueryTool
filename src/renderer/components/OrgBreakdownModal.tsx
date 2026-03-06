import React, { useState, useEffect, useMemo } from 'react';
import type { SandboxInfo } from '../types/electron.d';

type TabName = 'limits' | 'apiUsage' | 'sandboxes';

interface OrgBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLimitsLoaded?: (limits: Record<string, { Max: number; Remaining: number }>) => void;
}

function formatLimitName(name: string): string {
  return name.replace(/([A-Z])/g, ' $1').replace(/^ /, '').replace(/M B/g, 'MB');
}

const API_LIMITS = [
  'DailyApiRequests',
  'DailyBulkApiRequests',
  'DailyBulkV2QueryJobs',
  'DailyBulkV2QueryFileJobs',
  'DailyAsyncApexExecutions',
  'DailyStreamingApiEvents',
  'DailyDurableStreamingApiEvents',
  'DailyGenericStreamingApiEvents',
  'StreamingApiConcurrentClients',
  'DurableStreamingApiConcurrentClients',
  'HourlyTimeBasedWorkflow',
  'HourlyODataCallout',
  'HourlySyncReportRuns',
  'HourlyAsyncReportRuns',
  'HourlyDashboardRefreshes',
  'HourlyDashboardStatuses',
];

const LICENSE_TYPE_LABELS: Record<string, string> = {
  DEVELOPER: 'Developer',
  DEVELOPER_PRO: 'Developer Pro',
  PARTIAL: 'Partial Data',
  FULL: 'Full Copy',
};

const OrgBreakdownModal: React.FC<OrgBreakdownModalProps> = ({ isOpen, onClose, onLimitsLoaded }) => {
  const [activeTab, setActiveTab] = useState<TabName>('limits');
  const [limits, setLimits] = useState<Record<string, { Max: number; Remaining: number }> | null>(null);
  const [isLoadingLimits, setIsLoadingLimits] = useState(false);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'usage'>('usage');

  // Sandbox state
  const [sandboxes, setSandboxes] = useState<SandboxInfo[] | null>(null);
  const [isLoadingSandboxes, setIsLoadingSandboxes] = useState(false);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  const loadLimits = async () => {
    setIsLoadingLimits(true);
    setLimitsError(null);
    try {
      const result = await window.electronAPI.salesforce.getOrgLimits();
      if (result.success && result.data) {
        setLimits(result.data);
        onLimitsLoaded?.(result.data);
      } else {
        setLimitsError(result.error || 'Failed to load org limits');
      }
    } catch (err: any) {
      setLimitsError(err.message || 'Failed to load org limits');
    } finally {
      setIsLoadingLimits(false);
    }
  };

  const loadSandboxes = async () => {
    setIsLoadingSandboxes(true);
    setSandboxError(null);
    try {
      const result = await window.electronAPI.salesforce.getSandboxes();
      if (result.success && result.data) {
        setSandboxes(result.data);
      } else {
        setSandboxError(result.error || 'Failed to load sandboxes');
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('INVALID_TYPE') || msg.includes('sObject type') || msg.includes('SandboxInfo')) {
        setSandboxError('Sandbox information is only available from production orgs.');
      } else {
        setSandboxError(msg || 'Failed to load sandboxes');
      }
    } finally {
      setIsLoadingSandboxes(false);
    }
  };

  useEffect(() => {
    if (isOpen && !limits) {
      loadLimits();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === 'sandboxes' && !sandboxes && !sandboxError) {
      loadSandboxes();
    }
  }, [isOpen, activeTab]);

  // Sorted/filtered limits for the Limits tab
  const sortedLimits = useMemo(() => {
    if (!limits) return [];

    const entries = Object.entries(limits)
      .filter(([name]) => {
        if (!searchTerm) return true;
        return formatLimitName(name).toLowerCase().includes(searchTerm.toLowerCase());
      })
      .map(([name, { Max, Remaining }]) => {
        const used = Max - Remaining;
        const percentage = Max > 0 ? (used / Max) * 100 : 0;
        return { name, max: Max, remaining: Remaining, used, percentage };
      });

    if (sortBy === 'usage') {
      return entries.sort((a, b) => b.percentage - a.percentage);
    }

    return entries.sort((a, b) => formatLimitName(a.name).localeCompare(formatLimitName(b.name)));
  }, [limits, searchTerm, sortBy]);

  // API usage entries for the API Usage tab
  const apiUsageEntries = useMemo(() => {
    if (!limits) return [];

    const apiSet = new Set(API_LIMITS);
    return Object.entries(limits)
      .filter(([name]) => apiSet.has(name))
      .map(([name, { Max, Remaining }]) => {
        const used = Max - Remaining;
        const percentage = Max > 0 ? (used / Max) * 100 : 0;
        return { name, max: Max, remaining: Remaining, used, percentage };
      })
      .filter(e => e.max > 0) // Only show limits that have a max > 0
      .sort((a, b) => b.percentage - a.percentage);
  }, [limits]);

  if (!isOpen) return null;

  const getBarColor = (pct: number) => {
    if (pct >= 80) return 'bg-red-500';
    if (pct >= 60) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getTextColor = (pct: number) => {
    if (pct >= 80) return 'text-red-400';
    if (pct >= 60) return 'text-yellow-400';
    return 'text-discord-text-muted';
  };

  const getPctColor = (pct: number) => {
    if (pct >= 80) return 'text-red-400';
    if (pct >= 60) return 'text-yellow-400';
    if (pct >= 30) return 'text-discord-text';
    return 'text-discord-text-muted';
  };

  const tabs: { id: TabName; label: string; icon: React.ReactNode }[] = [
    {
      id: 'limits',
      label: 'Org Limits',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: 'apiUsage',
      label: 'API Usage',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      id: 'sandboxes',
      label: 'Sandboxes',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      ),
    },
  ];

  const renderLimitsTab = () => (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="px-4 py-3 border-b border-discord-darker flex items-center gap-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter limits..."
          className="flex-1 px-3 py-1.5 bg-discord-medium border border-discord-darker rounded text-sm text-discord-text placeholder-discord-text-muted focus:outline-none focus:border-discord-accent"
        />
        <div className="flex gap-1">
          <button
            onClick={() => setSortBy('usage')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              sortBy === 'usage' ? 'bg-discord-accent text-white' : 'bg-discord-medium text-discord-text-muted hover:text-discord-text'
            }`}
          >
            By Usage
          </button>
          <button
            onClick={() => setSortBy('name')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              sortBy === 'name' ? 'bg-discord-accent text-white' : 'bg-discord-medium text-discord-text-muted hover:text-discord-text'
            }`}
          >
            By Name
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {limitsError && (
          <div className="mb-4 p-3 bg-discord-danger/20 border border-discord-danger rounded-lg">
            <p className="text-sm text-discord-danger">{limitsError}</p>
          </div>
        )}

        {isLoadingLimits && !limits ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin w-6 h-6 text-discord-accent" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="ml-3 text-sm text-discord-text-muted">Loading org limits...</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {sortedLimits.map(({ name, max, used, percentage }) => (
              <div key={name} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-discord-medium/50">
                <div className="w-[200px] flex-shrink-0">
                  <p className="text-sm text-discord-text truncate">{formatLimitName(name)}</p>
                </div>
                <div className="flex-1">
                  <div className="h-2 bg-discord-lighter rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getBarColor(percentage)}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                </div>
                <div className={`w-[160px] text-right text-xs flex-shrink-0 ${getTextColor(percentage)}`}>
                  {used.toLocaleString()} / {max.toLocaleString()}
                  {max > 0 && <span className="ml-1">({percentage.toFixed(1)}%)</span>}
                </div>
              </div>
            ))}
            {sortedLimits.length === 0 && limits && (
              <p className="text-sm text-discord-text-muted text-center py-8">No limits match your filter</p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderApiUsageTab = () => (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {isLoadingLimits && !limits ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin w-6 h-6 text-discord-accent" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="ml-3 text-sm text-discord-text-muted">Loading API usage...</span>
        </div>
      ) : apiUsageEntries.length === 0 ? (
        <p className="text-sm text-discord-text-muted text-center py-8">No API usage data available</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {apiUsageEntries.map(({ name, max, used, percentage }) => (
            <div
              key={name}
              className="p-4 rounded-lg bg-discord-medium/50 border border-discord-darker hover:border-discord-lighter transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-discord-text">{formatLimitName(name)}</p>
                </div>
                <span className={`text-xl font-bold tabular-nums ${getPctColor(percentage)}`}>
                  {percentage.toFixed(1)}%
                </span>
              </div>
              <div className="h-2.5 bg-discord-lighter rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(percentage)}`}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-discord-text-muted">
                <span>Used: {used.toLocaleString()}</span>
                <span>Max: {max.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSandboxesTab = () => (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-discord-darker flex items-center justify-between">
        <span className="text-xs text-discord-text-muted">
          {sandboxes ? `${sandboxes.length} sandbox${sandboxes.length !== 1 ? 'es' : ''}` : ''}
        </span>
        <button
          onClick={loadSandboxes}
          disabled={isLoadingSandboxes}
          className="p-1.5 rounded hover:bg-discord-medium text-discord-text-muted hover:text-discord-text transition-colors"
          title="Refresh"
        >
          <svg className={`w-4 h-4 ${isLoadingSandboxes ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {sandboxError && (
          <div className="mb-4 p-3 bg-discord-danger/20 border border-discord-danger rounded-lg">
            <p className="text-sm text-discord-danger">{sandboxError}</p>
          </div>
        )}

        {isLoadingSandboxes && !sandboxes ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin w-6 h-6 text-discord-accent" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="ml-3 text-sm text-discord-text-muted">Loading sandboxes...</span>
          </div>
        ) : sandboxes && sandboxes.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-discord-text-muted border-b border-discord-darker">
                <th className="pb-2 pr-3 font-medium">Name</th>
                <th className="pb-2 pr-3 font-medium">Type</th>
                <th className="pb-2 pr-3 font-medium">Description</th>
                <th className="pb-2 pr-3 font-medium">Created</th>
                <th className="pb-2 font-medium">Modified</th>
              </tr>
            </thead>
            <tbody>
              {[...sandboxes]
                .sort((a, b) => new Date(b.lastModifiedDate).getTime() - new Date(a.lastModifiedDate).getTime())
                .map((sb) => (
                <tr key={sb.id} className="border-b border-discord-darker/50 hover:bg-discord-medium/30 transition-colors">
                  <td className="py-2 pr-3 font-medium text-discord-text whitespace-nowrap">{sb.sandboxName}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-discord-accent/20 text-discord-accent">
                      {LICENSE_TYPE_LABELS[sb.licenseType] || sb.licenseType}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-discord-text-muted truncate max-w-[200px]">{sb.description || '—'}</td>
                  <td className="py-2 pr-3 text-xs text-discord-text-muted whitespace-nowrap">{new Date(sb.createdDate).toLocaleDateString()}</td>
                  <td className="py-2 text-xs text-discord-text-muted whitespace-nowrap">{new Date(sb.lastModifiedDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : sandboxes && sandboxes.length === 0 && !sandboxError ? (
          <p className="text-sm text-discord-text-muted text-center py-8">No sandboxes found</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-discord-dark rounded-lg shadow-2xl w-[900px] max-h-[85vh] flex flex-col overflow-hidden border border-discord-darker">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-discord-darker bg-discord-darker/50">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-discord-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h2 className="text-lg font-semibold text-discord-text">Org Breakdown</h2>
            {limits && (
              <span className="text-xs text-discord-text-muted">
                ({Object.keys(limits).length} limits)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadLimits();
                if (activeTab === 'sandboxes') loadSandboxes();
              }}
              disabled={isLoadingLimits}
              className="p-2 rounded-lg hover:bg-discord-medium text-discord-text-muted hover:text-discord-text transition-colors"
              title="Refresh"
            >
              <svg className={`w-4 h-4 ${isLoadingLimits ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-discord-medium text-discord-text-muted hover:text-discord-text transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body: Sidebar + Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-[160px] flex-shrink-0 bg-discord-darker/50 border-r border-discord-darker py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'text-discord-text bg-discord-medium/50 border-l-2 border-discord-accent'
                    : 'text-discord-text-muted hover:text-discord-text hover:bg-discord-medium/30 border-l-2 border-transparent'
                }`}
              >
                {tab.icon}
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'limits' && renderLimitsTab()}
            {activeTab === 'apiUsage' && renderApiUsageTab()}
            {activeTab === 'sandboxes' && renderSandboxesTab()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrgBreakdownModal;
