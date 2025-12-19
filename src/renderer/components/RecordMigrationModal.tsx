import React, { useState, useEffect } from 'react';
import type { 
  TargetOrg, 
  FieldRelationship, 
  RelationshipConfig, 
  MigrationPlanSummary,
  MigrationResult,
  SavedOAuthLogin,
  SavedLogin,
  ExternalIdField
} from '../types/electron.d';

// Unified saved connection type
interface UnifiedSavedConnection {
  id: string;
  label: string;
  username: string;
  isSandbox: boolean;
  lastUsed: string;
  loginType: 'oauth' | 'credentials';
}

interface RecordMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRecords: Record<string, any>[];
  objectName: string;
  sourceOrgUrl: string;
  sourceUsername?: string;
}

type MigrationStep = 'connect' | 'configure' | 'review' | 'migrate' | 'complete';

const RecordMigrationModal: React.FC<RecordMigrationModalProps> = ({
  isOpen,
  onClose,
  selectedRecords,
  objectName,
  sourceOrgUrl,
  sourceUsername,
}) => {
  const [step, setStep] = useState<MigrationStep>('connect');
  const [targetOrgs, setTargetOrgs] = useState<TargetOrg[]>([]);
  const [selectedTargetOrg, setSelectedTargetOrg] = useState<TargetOrg | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Saved connections (both OAuth and password-based)
  const [savedConnections, setSavedConnections] = useState<UnifiedSavedConnection[]>([]);
  const [selectedSavedConnection, setSelectedSavedConnection] = useState<UnifiedSavedConnection | null>(null);
  
  // Relationship configuration
  const [relationships, setRelationships] = useState<FieldRelationship[]>([]);
  const [relationshipConfig, setRelationshipConfig] = useState<RelationshipConfig[]>([]);
  const [excludedFields, setExcludedFields] = useState<string[]>([]);
  const [excludedObjects, setExcludedObjects] = useState<string[]>([]);
  const [isLoadingRelationships, setIsLoadingRelationships] = useState(false);
  const [externalIdFieldsCache, setExternalIdFieldsCache] = useState<Record<string, ExternalIdField[]>>({});
  
  // Migration plan
  const [migrationPlan, setMigrationPlan] = useState<MigrationPlanSummary | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Migration execution
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<string>('');
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  // Load saved connections and relationships when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSavedConnections();
      loadTargetOrgs();
      loadRelationships();
    }
  }, [isOpen, objectName]);

  const loadSavedConnections = async () => {
    try {
      // Load both OAuth and password-based saved connections
      const [oauthConnections, passwordConnections] = await Promise.all([
        window.electronAPI.credentials.getSavedOAuthLogins(),
        window.electronAPI.credentials.getSavedLogins()
      ]);
      
      // Convert to unified format
      const unified: UnifiedSavedConnection[] = [
        ...oauthConnections.map(c => ({
          id: c.id,
          label: c.label,
          username: c.username,
          isSandbox: c.isSandbox,
          lastUsed: c.lastUsed,
          loginType: 'oauth' as const
        })),
        ...passwordConnections.map(c => ({
          id: `pwd_${c.username}`,
          label: c.label,
          username: c.username,
          isSandbox: c.isSandbox,
          lastUsed: c.lastUsed,
          loginType: 'credentials' as const
        }))
      ];
      
      // Sort by last used date, most recent first
      unified.sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());
      
      setSavedConnections(unified);
    } catch (err) {
      console.error('Error loading saved connections:', err);
    }
  };

  const loadTargetOrgs = async () => {
    const orgs = await window.electronAPI.migration.getTargetOrgs();
    setTargetOrgs(orgs);
    if (orgs.length > 0 && !selectedTargetOrg) {
      setSelectedTargetOrg(orgs[0]);
    }
  };

  const loadRelationships = async () => {
    setIsLoadingRelationships(true);
    try {
      const result = await window.electronAPI.migration.getRelationships(objectName);
      if (result.success && result.data) {
        setRelationships(result.data.relationships);
        setExcludedFields(result.data.excludedFields);
        setExcludedObjects(result.data.excludedObjects);
        
        // Convert default config to use new action format and auto-skip blank fields
        const configWithActions = result.data.defaultConfig.map(config => {
          // Check if this field is blank across all selected records
          const allBlank = selectedRecords.every(record => {
            const value = record[config.fieldName];
            return value === null || value === undefined || value === '';
          });
          
          // Convert include boolean to action
          // If blank, skip. Otherwise use 'include' if it was included, 'skip' if not
          const action: 'include' | 'skip' | 'matchByExternalId' = 
            allBlank ? 'skip' : 
            (config.action === 'include' || (config as any).include === true) ? 'include' : 'skip';
          
          return {
            fieldName: config.fieldName,
            action,
            referenceTo: config.referenceTo,
            externalIdField: config.externalIdField,
          };
        });
        
        setRelationshipConfig(configWithActions);
      }
    } catch (err) {
      console.error('Error loading relationships:', err);
    } finally {
      setIsLoadingRelationships(false);
    }
  };

  const handleConnectWithSavedConnection = async (savedConnection: UnifiedSavedConnection) => {
    setSelectedSavedConnection(savedConnection);
    setIsConnecting(true);
    setConnectionError(null);

    try {
      let result;
      
      if (savedConnection.loginType === 'oauth') {
        result = await window.electronAPI.migration.connectWithSavedOAuth(savedConnection.id);
      } else {
        result = await window.electronAPI.migration.connectWithSavedCredentials(savedConnection.username);
      }

      if (result.success && result.data) {
        await loadTargetOrgs();
        setSelectedTargetOrg({
          id: result.data.id,
          label: savedConnection.label,
          instanceUrl: result.data.data.instanceUrl,
          username: result.data.data.username,
          isSandbox: savedConnection.isSandbox,
        });
        setSelectedSavedConnection(null);
      } else {
        setConnectionError(result.error || 'Failed to connect');
      }
    } catch (err: any) {
      setConnectionError(err.message || 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectOrg = async (orgId: string) => {
    await window.electronAPI.migration.disconnectTargetOrg(orgId);
    await loadTargetOrgs();
    if (selectedTargetOrg?.id === orgId) {
      setSelectedTargetOrg(null);
    }
  };

  const handleRelationshipToggle = (fieldName: string) => {
    // Legacy toggle - cycle through skip -> include
    setRelationshipConfig(prev => 
      prev.map(config => 
        config.fieldName === fieldName 
          ? { ...config, action: config.action === 'include' ? 'skip' : 'include' }
          : config
      )
    );
  };

  const handleActionChange = async (fieldName: string, action: 'include' | 'skip' | 'matchByExternalId') => {
    const rel = relationships.find(r => r.fieldName === fieldName);
    const config = relationshipConfig.find(c => c.fieldName === fieldName);
    
    if (action === 'matchByExternalId' && rel && config) {
      // Load external ID fields for this object if not cached
      const targetObject = config.referenceTo || rel.referenceTo[0];
      if (!externalIdFieldsCache[targetObject]) {
        const result = await window.electronAPI.migration.getExternalIdFields(targetObject);
        if (result.success && result.data) {
          setExternalIdFieldsCache(prev => ({ ...prev, [targetObject]: result.data! }));
        }
      }
    }
    
    setRelationshipConfig(prev => 
      prev.map(c => 
        c.fieldName === fieldName 
          ? { ...c, action, externalIdField: action === 'matchByExternalId' ? c.externalIdField : undefined }
          : c
      )
    );
  };

  const handleExternalIdFieldChange = (fieldName: string, externalIdField: string) => {
    setRelationshipConfig(prev => 
      prev.map(c => 
        c.fieldName === fieldName 
          ? { ...c, externalIdField }
          : c
      )
    );
  };

  const handleAnalyzeRecords = async () => {
    setIsAnalyzing(true);
    try {
      const result = await window.electronAPI.migration.analyzeRecords({
        objectName,
        records: selectedRecords,
        relationshipConfig,
      });

      if (result.success && result.data) {
        setMigrationPlan(result.data);
        setStep('review');
      } else {
        setConnectionError(result.error || 'Failed to analyze records');
      }
    } catch (err: any) {
      setConnectionError(err.message || 'Failed to analyze records');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExecuteMigration = async () => {
    if (!selectedTargetOrg || !migrationPlan) return;

    setIsMigrating(true);
    setMigrationProgress('Starting migration...');
    setStep('migrate');

    try {
      const result = await window.electronAPI.migration.executeMigration({
        targetOrgId: selectedTargetOrg.id,
        objectOrder: migrationPlan.objectOrder,
        recordsByObject: migrationPlan.recordsByObject,
        relationshipRemapping: migrationPlan.relationshipRemapping,
        relationshipConfig, // Pass config for matchByExternalId lookups
      });

      if (result.success && result.data) {
        setMigrationResult(result.data);
        setStep('complete');
      } else {
        setConnectionError(result.error || 'Migration failed');
      }
    } catch (err: any) {
      setConnectionError(err.message || 'Migration failed');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleClose = () => {
    setStep('connect');
    setMigrationPlan(null);
    setMigrationResult(null);
    setConnectionError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-discord-dark rounded-lg shadow-2xl w-[800px] max-h-[85vh] flex flex-col border border-discord-darker">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-discord-darker">
          <div>
            <h2 className="text-xl font-semibold text-white">Push Records to Another Org</h2>
            <p className="text-sm text-discord-text-muted mt-1">
              Migrating {selectedRecords.length} {objectName} record{selectedRecords.length !== 1 ? 's' : ''} from {sourceOrgUrl}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-discord-text-muted hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b border-discord-darker bg-discord-darker/50">
          <div className="flex items-center gap-2">
            {['connect', 'configure', 'review', 'migrate', 'complete'].map((s, index) => (
              <span key={s} className="contents">
                <div className={`flex items-center gap-2 ${
                  step === s ? 'text-discord-accent' : 
                  ['connect', 'configure', 'review', 'migrate', 'complete'].indexOf(step) > index 
                    ? 'text-green-400' 
                    : 'text-discord-text-muted'
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    step === s ? 'bg-discord-accent text-white' :
                    ['connect', 'configure', 'review', 'migrate', 'complete'].indexOf(step) > index
                      ? 'bg-green-500 text-white'
                      : 'bg-discord-medium text-discord-text-muted'
                  }`}>
                    {['connect', 'configure', 'review', 'migrate', 'complete'].indexOf(step) > index ? '✓' : index + 1}
                  </div>
                  <span className="text-sm capitalize hidden sm:inline">{s}</span>
                </div>
                {index < 4 && (
                  <div className={`flex-1 h-0.5 ${
                    ['connect', 'configure', 'review', 'migrate', 'complete'].indexOf(step) > index
                      ? 'bg-green-500'
                      : 'bg-discord-medium'
                  }`} />
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {connectionError && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {connectionError}
            </div>
          )}

          {/* Step 1: Connect to Target Org */}
          {step === 'connect' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Select Target Org</h3>
                
                {/* Already connected target orgs for this session */}
                {targetOrgs.length > 0 && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-discord-text-muted mb-2">
                      Connected This Session
                    </label>
                    <div className="space-y-2">
                      {targetOrgs.map(org => (
                        <div 
                          key={org.id}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedTargetOrg?.id === org.id
                              ? 'bg-discord-accent/20 border-discord-accent'
                              : 'bg-discord-medium border-discord-darker hover:border-discord-muted'
                          }`}
                          onClick={() => setSelectedTargetOrg(org)}
                        >
                          <div>
                            <div className="text-white font-medium">{org.label}</div>
                            <div className="text-sm text-discord-text-muted">{org.username}</div>
                            <div className="text-xs text-discord-text-muted">{org.instanceUrl}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              org.isSandbox ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
                            }`}>
                              {org.isSandbox ? 'Sandbox' : 'Production'}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDisconnectOrg(org.id);
                              }}
                              className="text-discord-text-muted hover:text-red-400 transition-colors p-1"
                              title="Disconnect"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Saved connections from main app (OAuth and password-based) */}
                <div>
                  <label className="block text-sm font-medium text-discord-text-muted mb-2">
                    {targetOrgs.length > 0 ? 'Or select from saved connections' : 'Saved Connections'}
                  </label>
                  
                  {/* Filter out connections that match the current source org or are already connected */}
                  {savedConnections.filter(c => {
                    // Compare usernames directly if available
                    if (sourceUsername && c.username.toLowerCase() === sourceUsername.toLowerCase()) {
                      return false;
                    }
                    // Filter out already connected target orgs
                    if (targetOrgs.some(org => org.username.toLowerCase() === c.username.toLowerCase())) {
                      return false;
                    }
                    return true;
                  }).length === 0 && savedConnections.length > 0 ? (
                    <div className="p-6 bg-discord-medium rounded-lg border border-discord-darker text-center">
                      <svg className="w-12 h-12 mx-auto text-discord-text-muted mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <p className="text-discord-text mb-2">No other connections available</p>
                      <p className="text-sm text-discord-text-muted">
                        All saved connections are either your current org or already connected above.
                      </p>
                    </div>
                  ) : savedConnections.length === 0 ? (
                    <div className="p-6 bg-discord-medium rounded-lg border border-discord-darker text-center">
                      <svg className="w-12 h-12 mx-auto text-discord-text-muted mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <p className="text-discord-text mb-2">No saved connections found</p>
                      <p className="text-sm text-discord-text-muted">
                        Log in to other Salesforce orgs from the login page and save them to use here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {savedConnections
                        .filter(connection => {
                          // Filter out the current source org by username
                          if (sourceUsername) {
                            if (connection.username.toLowerCase() === sourceUsername.toLowerCase()) {
                              return false;
                            }
                          }
                          // Filter out already connected target orgs
                          if (targetOrgs.some(org => org.username.toLowerCase() === connection.username.toLowerCase())) {
                            return false;
                          }
                          return true;
                        })
                        .map(connection => (
                        <div 
                          key={connection.id}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                            isConnecting
                              ? 'opacity-50 cursor-not-allowed bg-discord-medium border-discord-darker'
                              : 'bg-discord-medium border-discord-darker hover:border-discord-accent hover:bg-discord-accent/10'
                          }`}
                          onClick={() => !isConnecting && handleConnectWithSavedConnection(connection)}
                        >
                          <div>
                            <div className="text-white font-medium">{connection.label}</div>
                            <div className="text-sm text-discord-text-muted">{connection.username}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isConnecting && selectedSavedConnection?.id === connection.id && (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-discord-accent"></div>
                            )}
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              connection.loginType === 'oauth' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                            }`}>
                              {connection.loginType === 'oauth' ? 'OAuth' : 'Password'}
                            </span>
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              connection.isSandbox ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
                            }`}>
                              {connection.isSandbox ? 'Sandbox' : 'Production'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Configure Relationships */}
          {step === 'configure' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Configure Relationships</h3>
                <p className="text-sm text-discord-text-muted mb-4">
                  For each relationship field, choose how to handle related records:
                  <span className="text-discord-accent"> Include</span> to create new records,
                  <span className="text-yellow-400"> Match by External ID</span> to lookup existing records, or
                  <span className="text-discord-text-muted"> Skip</span> to ignore.
                </p>

                {isLoadingRelationships ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-discord-accent"></div>
                  </div>
                ) : relationships.length === 0 ? (
                  <div className="text-center py-8 text-discord-text-muted">
                    No lookup relationships found for {objectName}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {relationshipConfig.map(config => {
                      const rel = relationships.find(r => r.fieldName === config.fieldName);
                      if (!rel) return null;
                      
                      const isExcludedField = excludedFields.includes(config.fieldName);
                      const isExcludedObject = rel.referenceTo.every(obj => excludedObjects.includes(obj));
                      const isAutoExcluded = isExcludedField || isExcludedObject;
                      
                      // Special handling for RecordTypeId - always enabled, auto-matched
                      const isRecordTypeId = config.fieldName === 'RecordTypeId';

                      // Check if this field is blank for all selected records
                      const allBlank = selectedRecords.every(record => {
                        const value = record[config.fieldName];
                        return value === null || value === undefined || value === '';
                      });

                      const targetObject = config.referenceTo || rel.referenceTo[0];
                      const externalIdFields = externalIdFieldsCache[targetObject] || [];

                      // RecordTypeId gets special treatment - always included with auto-matching
                      if (isRecordTypeId) {
                        return (
                          <div 
                            key={config.fieldName}
                            className="p-4 rounded-lg border bg-green-500/10 border-green-500/30"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="text-white font-medium flex items-center gap-2">
                                  {rel.fieldLabel}
                                  <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">Auto-Matched</span>
                                </div>
                                <div className="text-sm text-discord-text-muted">
                                  {config.fieldName} → RecordType
                                </div>
                                <div className="text-xs text-green-400 mt-2">
                                  ✓ RecordTypes are automatically matched by ID. If not found, matches by SObjectType + DeveloperName.
                                </div>
                                {allBlank && (
                                  <div className="text-xs text-discord-text-muted mt-1">
                                    Empty for all selected records
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div 
                          key={config.fieldName}
                          className={`p-4 rounded-lg border transition-colors ${
                            config.action === 'include' 
                              ? 'bg-discord-accent/10 border-discord-accent/30' 
                              : config.action === 'matchByExternalId'
                              ? 'bg-yellow-500/10 border-yellow-500/30'
                              : 'bg-discord-medium border-discord-darker'
                          } ${isAutoExcluded ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="text-white font-medium">{rel.fieldLabel}</div>
                              <div className="text-sm text-discord-text-muted">
                                {config.fieldName} → {rel.referenceTo.join(', ')}
                              </div>
                              {isAutoExcluded && (
                                <div className="text-xs text-yellow-400 mt-1">
                                  {isExcludedField 
                                    ? 'System field - excluded by default' 
                                    : 'References excluded object type'}
                                </div>
                              )}
                              {allBlank && !isAutoExcluded && (
                                <div className="text-xs text-discord-text-muted mt-1">
                                  Empty for all selected records
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {rel.isRequired && (
                                <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">
                                  Required
                                </span>
                              )}
                              {/* Action selector */}
                              <select
                                value={config.action}
                                onChange={(e) => handleActionChange(config.fieldName, e.target.value as 'include' | 'skip' | 'matchByExternalId')}
                                disabled={isAutoExcluded}
                                className="px-2 py-1 bg-discord-darker border border-discord-darker rounded text-sm text-white focus:border-discord-accent [&>option]:bg-discord-darker [&>option]:text-white"
                              >
                                <option value="skip">Skip</option>
                                <option value="include">Include (Create New)</option>
                                <option value="matchByExternalId">Match by External ID</option>
                              </select>
                            </div>
                          </div>
                          
                          {/* Extra options based on action */}
                          {config.action !== 'skip' && !isAutoExcluded && (
                            <div className="mt-3 pt-3 border-t border-discord-darker/50 flex flex-wrap gap-3">
                              {/* Object selector for polymorphic relationships */}
                              {rel.referenceTo.length > 1 && (
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-discord-text-muted">Object:</label>
                                  <select
                                    value={config.referenceTo}
                                    onChange={(e) => {
                                      setRelationshipConfig(prev =>
                                        prev.map(c =>
                                          c.fieldName === config.fieldName
                                            ? { ...c, referenceTo: e.target.value, externalIdField: undefined }
                                            : c
                                        )
                                      );
                                      // Clear cache for new object type if matchByExternalId
                                      if (config.action === 'matchByExternalId') {
                                        handleActionChange(config.fieldName, 'matchByExternalId');
                                      }
                                    }}
                                    className="px-2 py-1 bg-discord-darker border border-discord-darker rounded text-sm text-white [&>option]:bg-discord-darker [&>option]:text-white"
                                  >
                                    {rel.referenceTo.map(obj => (
                                      <option key={obj} value={obj}>{obj}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              
                              {/* External ID field selector */}
                              {config.action === 'matchByExternalId' && (
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-discord-text-muted">Match on:</label>
                                  {externalIdFields.length === 0 ? (
                                    <div className="text-xs text-yellow-400">Loading fields...</div>
                                  ) : (
                                    <select
                                      value={config.externalIdField || ''}
                                      onChange={(e) => handleExternalIdFieldChange(config.fieldName, e.target.value)}
                                      className="px-2 py-1 bg-discord-darker border border-discord-darker rounded text-sm text-white [&>option]:bg-discord-darker [&>option]:text-white"
                                    >
                                      <option value="">Select field...</option>
                                      {externalIdFields.map(field => (
                                        <option key={field.name} value={field.name}>
                                          {field.label} ({field.name})
                                          {field.isExternalId ? ' ⭐' : ''}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Review Migration Plan */}
          {step === 'review' && migrationPlan && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Review Migration Plan</h3>
                <p className="text-sm text-discord-text-muted mb-4">
                  Review the records that will be created in the target org.
                </p>

                <div className="bg-discord-medium rounded-lg p-4 border border-discord-darker mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-discord-text-muted">Total Records</div>
                      <div className="text-2xl font-bold text-white">{migrationPlan.totalRecords}</div>
                    </div>
                    <div>
                      <div className="text-sm text-discord-text-muted">Object Types</div>
                      <div className="text-2xl font-bold text-white">{migrationPlan.objectOrder.length}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-discord-text-muted">Insertion Order:</h4>
                  {migrationPlan.objectOrder.map((objName, index) => (
                    <div 
                      key={objName}
                      className="flex items-center justify-between p-3 bg-discord-medium rounded-lg border border-discord-darker"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 flex items-center justify-center bg-discord-accent/20 text-discord-accent rounded-full text-sm font-medium">
                          {index + 1}
                        </span>
                        <span className="text-white font-medium">{objName}</span>
                      </div>
                      <span className="text-discord-text-muted">
                        {migrationPlan.objectCounts[objName]} record{migrationPlan.objectCounts[objName] !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div className="text-sm text-yellow-400">
                      <strong>Note:</strong> Records will be created with new IDs in the target org. 
                      Relationship fields will be automatically remapped to the new IDs.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Migration in Progress */}
          {step === 'migrate' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-discord-accent mb-4"></div>
              <h3 className="text-lg font-medium text-white mb-2">Migrating Records...</h3>
              <p className="text-sm text-discord-text-muted">{migrationProgress}</p>
            </div>
          )}

          {/* Step 5: Complete */}
          {step === 'complete' && migrationResult && (
            <div className="space-y-6">
              <div className="text-center">
                {migrationResult.totalFailed === 0 ? (
                  <div className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-16 h-16 mx-auto mb-4 bg-yellow-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <h3 className="text-xl font-medium text-white mb-2">
                  Migration {migrationResult.totalFailed === 0 ? 'Complete!' : 'Completed with Errors'}
                </h3>
              </div>

              <div className="bg-discord-medium rounded-lg p-4 border border-discord-darker">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-400">{migrationResult.totalInserted}</div>
                    <div className="text-sm text-discord-text-muted">Records Created</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-400">{migrationResult.totalFailed}</div>
                    <div className="text-sm text-discord-text-muted">Failed</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {migrationResult.results.map(result => (
                  <div 
                    key={result.objectName}
                    className="p-3 bg-discord-medium rounded-lg border border-discord-darker"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-medium">{result.objectName}</span>
                      <span className="text-sm">
                        <span className="text-green-400">{result.inserted} inserted</span>
                        {result.failed > 0 && (
                          <span className="text-red-400 ml-2">{result.failed} failed</span>
                        )}
                      </span>
                    </div>
                    {result.errors.length > 0 && (
                      <div className="mt-2 text-sm text-red-400">
                        {result.errors.slice(0, 3).map((err, i) => (
                          <div key={i}>{err}</div>
                        ))}
                        {result.errors.length > 3 && (
                          <div className="text-discord-text-muted">...and {result.errors.length - 3} more errors</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-discord-darker bg-discord-darker/50">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-discord-text-muted hover:text-white transition-colors"
          >
            {step === 'complete' ? 'Close' : 'Cancel'}
          </button>

          <div className="flex items-center gap-3">
            {step !== 'connect' && step !== 'complete' && step !== 'migrate' && (
              <button
                onClick={() => {
                  if (step === 'configure') setStep('connect');
                  else if (step === 'review') setStep('configure');
                }}
                className="px-4 py-2 bg-discord-medium hover:bg-discord-light text-white rounded-md transition-colors"
              >
                Back
              </button>
            )}

            {step === 'connect' && (
              <button
                onClick={() => setStep('configure')}
                disabled={!selectedTargetOrg}
                className="px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors font-medium"
              >
                Next: Configure Relationships
              </button>
            )}

            {step === 'configure' && (
              <button
                onClick={handleAnalyzeRecords}
                disabled={isAnalyzing}
                className="px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors font-medium"
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze & Review'}
              </button>
            )}

            {step === 'review' && (
              <button
                onClick={handleExecuteMigration}
                disabled={isMigrating}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors font-medium"
              >
                Start Migration
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecordMigrationModal;
