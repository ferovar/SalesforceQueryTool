import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { UserSession } from '../App';
import type { SavedLogin, SavedOAuthLogin } from '../types/electron.d';
import StarfieldBackground from '../components/StarfieldBackground';
import { WavesBackground } from '../components/NatureBackground';
import PunchoutBackground from '../components/PunchoutBackground';
import { useSettings } from '../contexts/SettingsContext';

interface LoginPageProps {
  onLoginSuccess: (session: UserSession) => void;
  onOpenSettings: () => void;
}

type LoginMethod = 'credentials' | 'oauth';
type Environment = 'production' | 'sandbox';

interface ConnectionEntry {
  type: 'credential' | 'oauth';
  id: string;
  label: string;
  username: string;
  isSandbox: boolean;
  color?: string;
  raw: SavedLogin | SavedOAuthLogin;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onOpenSettings }) => {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('oauth');
  const [environment, setEnvironment] = useState<Environment>('production');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#5865f2');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [securityToken, setSecurityToken] = useState('');
  const [saveCredentials, setSaveCredentials] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLogins, setSavedLogins] = useState<SavedLogin[]>([]);
  const [savedOAuthLogins, setSavedOAuthLogins] = useState<SavedOAuthLogin[]>([]);
  const [oauthClientId, setOauthClientId] = useState('');
  const [useDefaultClientId, setUseDefaultClientId] = useState(true);
  const [showOAuthSetup, setShowOAuthSetup] = useState(false);
  const [showSignInForm, setShowSignInForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('#5865f2');
  const [productionOrder, setProductionOrder] = useState<ConnectionEntry[]>([]);
  const [sandboxOrder, setSandboxOrder] = useState<ConnectionEntry[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragColumn, setDragColumn] = useState<'production' | 'sandbox' | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    loadSavedLogins();
    loadSavedOAuthLogins();
  }, []);

  const loadSavedLogins = async () => {
    try {
      const logins = await window.electronAPI.credentials.getSavedLogins();
      setSavedLogins(logins);
    } catch (err) {
      console.error('Error loading saved logins:', err);
    }
  };

  const loadSavedOAuthLogins = async () => {
    try {
      const logins = await window.electronAPI.credentials.getSavedOAuthLogins();
      setSavedOAuthLogins(logins);
    } catch (err) {
      console.error('Error loading saved OAuth logins:', err);
    }
  };

  // Combine saved credential + OAuth logins into a single list
  const allConnections: ConnectionEntry[] = useMemo(() => {
    const creds: ConnectionEntry[] = savedLogins.map((login) => ({
      type: 'credential',
      id: `cred-${login.username}`,
      label: login.label,
      username: login.username,
      isSandbox: login.isSandbox,
      color: login.color,
      raw: login,
    }));
    const oauths: ConnectionEntry[] = savedOAuthLogins.map((login) => ({
      type: 'oauth',
      id: `oauth-${login.id}`,
      label: login.label,
      username: login.username,
      isSandbox: login.isSandbox,
      color: login.color,
      raw: login,
    }));
    return [...creds, ...oauths];
  }, [savedLogins, savedOAuthLogins]);

  const hasSavedConnections = allConnections.length > 0;

  // Sync ordered column lists when allConnections changes, preserving drag reorder
  useEffect(() => {
    const syncList = (
      prev: ConnectionEntry[],
      filtered: ConnectionEntry[],
    ): ConnectionEntry[] => {
      const newIds = new Set(filtered.map((c) => c.id));
      const prevIds = new Set(prev.map((c) => c.id));
      // Keep existing order, update data for items that still exist
      const kept = prev
        .filter((c) => newIds.has(c.id))
        .map((c) => filtered.find((n) => n.id === c.id)!);
      // Append any new items
      const added = filtered.filter((c) => !prevIds.has(c.id));
      return [...kept, ...added];
    };
    setProductionOrder((prev) =>
      syncList(prev, allConnections.filter((c) => !c.isSandbox)),
    );
    setSandboxOrder((prev) =>
      syncList(prev, allConnections.filter((c) => c.isSandbox)),
    );
  }, [allConnections]);

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (index: number, column: 'production' | 'sandbox') => {
      setDragIndex(index);
      setDragColumn(column);
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDragOverIndex(index);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number, column: 'production' | 'sandbox') => {
      e.preventDefault();
      if (dragIndex === null || dragColumn !== column) return;

      const setter = column === 'production' ? setProductionOrder : setSandboxOrder;
      setter((prev) => {
        const items = [...prev];
        const [dragged] = items.splice(dragIndex, 1);
        items.splice(dropIndex, 0, dragged);
        return items;
      });

      setDragIndex(null);
      setDragColumn(null);
      setDragOverIndex(null);
    },
    [dragIndex, dragColumn],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragColumn(null);
    setDragOverIndex(null);
  }, []);

  const handleSelectSavedLogin = async (login: SavedLogin) => {
    setIsLoading(true);
    setError(null);

    try {
      const fullCredentials = await window.electronAPI.credentials.getLoginByUsername(login.username);

      if (!fullCredentials) {
        setError('Could not load saved credentials');
        setIsLoading(false);
        return;
      }

      const result = await window.electronAPI.salesforce.login({
        label: fullCredentials.label,
        username: fullCredentials.username,
        password: fullCredentials.password,
        securityToken: fullCredentials.securityToken,
        isSandbox: fullCredentials.isSandbox,
        saveCredentials: false,
        color: fullCredentials.color,
      });

      if (result.success) {
        onLoginSuccess({ ...result.data, color: fullCredentials.color });
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSavedOAuthLogin = async (login: SavedOAuthLogin) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.salesforce.loginWithSavedOAuth(login.id);

      if (result.success) {
        onLoginSuccess(result.data);
      } else {
        setError(result.error || 'OAuth session expired. Please log in again.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectionClick = (conn: ConnectionEntry) => {
    if (editingConnection) return;
    if (conn.type === 'credential') {
      handleSelectSavedLogin(conn.raw as SavedLogin);
    } else {
      handleSelectSavedOAuthLogin(conn.raw as SavedOAuthLogin);
    }
  };

  const handleDeleteConnection = async (conn: ConnectionEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (conn.type === 'credential') {
        await window.electronAPI.credentials.deleteSavedLogin((conn.raw as SavedLogin).username);
        loadSavedLogins();
      } else {
        await window.electronAPI.credentials.deleteOAuthLogin((conn.raw as SavedOAuthLogin).id);
        loadSavedOAuthLogins();
      }
    } catch (err) {
      console.error('Error deleting connection:', err);
    }
  };

  const handleEditConnection = (conn: ConnectionEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConnection(conn.id);
    setEditLabel(conn.label);
    setEditColor(conn.color || '#5865f2');
  };

  const handleSaveConnectionEdit = async (conn: ConnectionEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (conn.type === 'credential') {
        await window.electronAPI.credentials.updateLoginMetadata(
          (conn.raw as SavedLogin).username,
          editLabel,
          editColor,
        );
        await loadSavedLogins();
      } else {
        await window.electronAPI.credentials.updateOAuthMetadata(
          (conn.raw as SavedOAuthLogin).id,
          editLabel,
          editColor,
        );
        await loadSavedOAuthLogins();
      }
      setEditingConnection(null);
    } catch (err) {
      console.error('Error updating connection metadata:', err);
    }
  };

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.salesforce.login({
        label: label || username,
        username,
        password,
        securityToken,
        isSandbox: environment === 'sandbox',
        saveCredentials,
        color,
      });

      if (result.success) {
        onLoginSuccess(result.data);
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = async () => {
    if (!useDefaultClientId && !oauthClientId.trim()) {
      setError('Please enter your Connected App Client ID or use the default');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.salesforce.loginOAuth({
        isSandbox: environment === 'sandbox',
        saveConnection: false,
        label: '',
        clientId: useDefaultClientId ? undefined : oauthClientId.trim(),
      });

      if (result.success) {
        onLoginSuccess(result.data);
      } else {
        setError(result.error || 'OAuth login failed');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const { settings } = useSettings();

  const colorSwatches = [
    { color: '#ef4444', name: 'Red' },
    { color: '#f97316', name: 'Orange' },
    { color: '#f59e0b', name: 'Amber' },
    { color: '#eab308', name: 'Yellow' },
    { color: '#84cc16', name: 'Lime' },
    { color: '#10b981', name: 'Green' },
    { color: '#14b8a6', name: 'Teal' },
    { color: '#3b82f6', name: 'Blue' },
    { color: '#8b5cf6', name: 'Purple' },
    { color: '#ec4899', name: 'Pink' },
  ];

  // Show connection picker when there are saved connections and user hasn't clicked "New Connection"
  const showPicker = hasSavedConnections && !showSignInForm;

  return (
    <div className="h-full flex items-center justify-center bg-discord-darker relative overflow-hidden">
      {/* Animated background */}
      {settings.theme === 'nature' ? (
        <WavesBackground key="waves-bg" />
      ) : settings.theme === 'punchout' ? (
        <PunchoutBackground key="punchout-bg" />
      ) : (
        <StarfieldBackground key="starfield-bg" />
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-discord-darker/95 backdrop-blur-sm">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-discord-accent/20 animate-ping" style={{ animationDuration: '1.5s' }}></div>
            <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-discord-accent/10">
              <svg className="w-14 h-14 animate-pulse" viewBox="0 0 50 35" fill="none">
                <path d="M20.68 7.32c2.1-2.18 5.02-3.53 8.24-3.53 4.3 0 8.04 2.4 9.98 5.94a10.47 10.47 0 0 1 3.6-.64c5.8 0 10.5 4.7 10.5 10.5S48.3 30.1 42.5 30.1h-31C5.7 30.1.9 25.3.9 19.5c0-4.98 3.47-9.14 8.12-10.22A12.3 12.3 0 0 1 20.68 7.32z" fill="#00A1E0"/>
              </svg>
            </div>
          </div>

          <div className="mt-8 text-center">
            <h2 className="text-xl font-semibold text-discord-text mb-2">Connecting to Salesforce</h2>
            <p className="text-discord-text-muted text-sm">Authenticating your credentials...</p>
          </div>

          <div className="mt-6 w-48 h-1 bg-discord-lighter rounded-full overflow-hidden">
            <div className="h-full bg-discord-accent rounded-full animate-loading-bar"></div>
          </div>
        </div>
      )}

      {/* Main Content — Centered */}
      <div className={`w-full px-8 relative z-10 ${showPicker ? 'max-w-2xl' : 'max-w-md'}`}>
        {showPicker ? (
          /* ========== CONNECTION PICKER VIEW ========== */
          <div>
            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-discord-accent/20 to-discord-accent/5 mb-4">
                <svg className="w-10 h-10" viewBox="0 0 50 35" fill="none">
                  <path d="M20.68 7.32c2.1-2.18 5.02-3.53 8.24-3.53 4.3 0 8.04 2.4 9.98 5.94a10.47 10.47 0 0 1 3.6-.64c5.8 0 10.5 4.7 10.5 10.5S48.3 30.1 42.5 30.1h-31C5.7 30.1.9 25.3.9 19.5c0-4.98 3.47-9.14 8.12-10.22A12.3 12.3 0 0 1 20.68 7.32z" fill="#00A1E0"/>
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-discord-text mb-1">Salesforce Studio</h1>
              <p className="text-sm text-discord-text-muted">Choose a connection</p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-discord-danger/20 border border-discord-danger rounded-lg">
                <p className="text-sm text-discord-danger">{error}</p>
              </div>
            )}

            {/* Two-column grid: Sandbox | Production */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Sandbox Column */}
              <div>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  <h3 className="text-xs font-semibold text-discord-text-muted uppercase tracking-wider">Sandbox</h3>
                  <span className="text-xs text-discord-text-muted/50">({sandboxOrder.length})</span>
                </div>
                <div className="space-y-1.5">
                  {sandboxOrder.map((conn, index) => (
                    <div
                      key={conn.id}
                      draggable={!editingConnection}
                      onDragStart={() => handleDragStart(index, 'sandbox')}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index, 'sandbox')}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleConnectionClick(conn)}
                      className={`bg-discord-dark rounded-lg border-l-[3px] border-r border-t border-b transition-all ${
                        dragColumn === 'sandbox' && dragOverIndex === index && dragIndex !== index
                          ? 'border-t-discord-accent border-r-discord-lighter/30 border-b-discord-lighter/30'
                          : 'border-r-discord-lighter/30 border-t-discord-lighter/30 border-b-discord-lighter/30'
                      } ${
                        !editingConnection ? 'hover:bg-discord-medium cursor-pointer' : ''
                      } ${
                        dragColumn === 'sandbox' && dragIndex === index ? 'opacity-40' : ''
                      }`}
                      style={{ borderLeftColor: conn.color || '#5865f2' }}
                    >
                      {editingConnection === conn.id ? (
                        <div className="p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            placeholder="Connection label"
                            className="w-full px-3 py-2 text-sm bg-discord-lighter rounded-lg border border-discord-lighter text-discord-text focus:outline-none focus:border-discord-accent"
                            autoFocus
                          />
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {colorSwatches.map(({ color: c, name }) => (
                              <button
                                key={c}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditColor(c); }}
                                className={`w-5 h-5 rounded-full border-2 transition-all ${
                                  editColor === c ? 'border-white ring-2 ring-discord-accent' : 'border-discord-lighter hover:scale-110'
                                }`}
                                style={{ backgroundColor: c }}
                                title={name}
                              />
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={(e) => handleSaveConnectionEdit(conn, e)} className="flex-1 px-3 py-1.5 text-xs bg-discord-accent text-white rounded-lg hover:bg-opacity-80 font-medium">Save</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setEditingConnection(null); }} className="px-3 py-1.5 text-xs bg-discord-lighter text-discord-text rounded-lg hover:bg-discord-light">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-2 py-2.5 flex items-center gap-2 group">
                          {/* Drag handle */}
                          <div className="cursor-grab active:cursor-grabbing text-discord-text-muted/30 hover:text-discord-text-muted flex-shrink-0" title="Drag to reorder">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                              <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                            </svg>
                          </div>

                          {/* Connection info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-discord-text font-medium truncate">{conn.label}</p>
                            <div className="flex items-center gap-1.5 text-xs text-discord-text-muted">
                              <span className="truncate">{conn.username}</span>
                              <span className="text-discord-text-muted/40">
                                {conn.type === 'oauth' ? 'OAuth' : 'Creds'}
                              </span>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => handleEditConnection(conn, e)} className="p-1 hover:bg-discord-lighter rounded transition-colors" title="Edit">
                              <svg className="w-3.5 h-3.5 text-discord-text-muted hover:text-discord-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={(e) => handleDeleteConnection(conn, e)} className="p-1 hover:bg-discord-danger/20 rounded transition-colors" title="Delete">
                              <svg className="w-3.5 h-3.5 text-discord-text-muted hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {sandboxOrder.length === 0 && (
                    <p className="text-xs text-discord-text-muted/50 text-center py-4">No sandbox connections</p>
                  )}
                </div>
              </div>

              {/* Production Column */}
              <div>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <h3 className="text-xs font-semibold text-discord-text-muted uppercase tracking-wider">Production</h3>
                  <span className="text-xs text-discord-text-muted/50">({productionOrder.length})</span>
                </div>
                <div className="space-y-1.5">
                  {productionOrder.map((conn, index) => (
                    <div
                      key={conn.id}
                      draggable={!editingConnection}
                      onDragStart={() => handleDragStart(index, 'production')}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index, 'production')}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleConnectionClick(conn)}
                      className={`bg-discord-dark rounded-lg border-l-[3px] border-r border-t border-b transition-all ${
                        dragColumn === 'production' && dragOverIndex === index && dragIndex !== index
                          ? 'border-t-discord-accent border-r-discord-lighter/30 border-b-discord-lighter/30'
                          : 'border-r-discord-lighter/30 border-t-discord-lighter/30 border-b-discord-lighter/30'
                      } ${
                        !editingConnection ? 'hover:bg-discord-medium cursor-pointer' : ''
                      } ${
                        dragColumn === 'production' && dragIndex === index ? 'opacity-40' : ''
                      }`}
                      style={{ borderLeftColor: conn.color || '#5865f2' }}
                    >
                      {editingConnection === conn.id ? (
                        <div className="p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            placeholder="Connection label"
                            className="w-full px-3 py-2 text-sm bg-discord-lighter rounded-lg border border-discord-lighter text-discord-text focus:outline-none focus:border-discord-accent"
                            autoFocus
                          />
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {colorSwatches.map(({ color: c, name }) => (
                              <button
                                key={c}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditColor(c); }}
                                className={`w-5 h-5 rounded-full border-2 transition-all ${
                                  editColor === c ? 'border-white ring-2 ring-discord-accent' : 'border-discord-lighter hover:scale-110'
                                }`}
                                style={{ backgroundColor: c }}
                                title={name}
                              />
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={(e) => handleSaveConnectionEdit(conn, e)} className="flex-1 px-3 py-1.5 text-xs bg-discord-accent text-white rounded-lg hover:bg-opacity-80 font-medium">Save</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setEditingConnection(null); }} className="px-3 py-1.5 text-xs bg-discord-lighter text-discord-text rounded-lg hover:bg-discord-light">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-2 py-2.5 flex items-center gap-2 group">
                          {/* Drag handle */}
                          <div className="cursor-grab active:cursor-grabbing text-discord-text-muted/30 hover:text-discord-text-muted flex-shrink-0" title="Drag to reorder">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                              <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                            </svg>
                          </div>

                          {/* Connection info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-discord-text font-medium truncate">{conn.label}</p>
                            <div className="flex items-center gap-1.5 text-xs text-discord-text-muted">
                              <span className="truncate">{conn.username}</span>
                              <span className="text-discord-text-muted/40">
                                {conn.type === 'oauth' ? 'OAuth' : 'Creds'}
                              </span>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => handleEditConnection(conn, e)} className="p-1 hover:bg-discord-lighter rounded transition-colors" title="Edit">
                              <svg className="w-3.5 h-3.5 text-discord-text-muted hover:text-discord-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={(e) => handleDeleteConnection(conn, e)} className="p-1 hover:bg-discord-danger/20 rounded transition-colors" title="Delete">
                              <svg className="w-3.5 h-3.5 text-discord-text-muted hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {productionOrder.length === 0 && (
                    <p className="text-xs text-discord-text-muted/50 text-center py-4">No production connections</p>
                  )}
                </div>
              </div>
            </div>

            {/* New Connection Button */}
            <button
              onClick={() => {
                setShowSignInForm(true);
                setError(null);
              }}
              className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium text-discord-text-muted hover:text-discord-text bg-discord-dark/50 hover:bg-discord-dark border border-dashed border-discord-lighter/30 hover:border-discord-accent/40 rounded-lg transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Connection
            </button>

            {/* Footer */}
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={onOpenSettings}
                className="flex items-center gap-1.5 text-xs text-discord-text-muted hover:text-discord-text transition-colors"
                title="Settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
              <p className="text-xs text-discord-text-muted">
                Credentials are encrypted and stored locally.
              </p>
            </div>
          </div>
        ) : (
          /* ========== SIGN-IN FORM VIEW ========== */
          <div>
            {/* Back button (only when coming from connection picker) */}
            {hasSavedConnections && (
              <button
                onClick={() => {
                  setShowSignInForm(false);
                  setError(null);
                }}
                className="flex items-center gap-1.5 text-sm text-discord-text-muted hover:text-discord-text mb-4 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to connections
              </button>
            )}

            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-discord-accent/10 mb-3">
                <svg className="w-8 h-8" viewBox="0 0 50 35" fill="none">
                  <path d="M20.68 7.32c2.1-2.18 5.02-3.53 8.24-3.53 4.3 0 8.04 2.4 9.98 5.94a10.47 10.47 0 0 1 3.6-.64c5.8 0 10.5 4.7 10.5 10.5S48.3 30.1 42.5 30.1h-31C5.7 30.1.9 25.3.9 19.5c0-4.98 3.47-9.14 8.12-10.22A12.3 12.3 0 0 1 20.68 7.32z" fill="#00A1E0"/>
                </svg>
              </div>
              <h1 className="text-xl font-bold text-discord-text">Salesforce Studio</h1>
            </div>

            {/* Login Card */}
            <div className="bg-discord-dark rounded-lg p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-discord-text mb-6">Sign in to continue</h2>

              {/* Environment Selection */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-discord-text mb-2">
                  Environment
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEnvironment('production')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      environment === 'production'
                        ? 'bg-discord-accent text-white'
                        : 'bg-discord-lighter text-discord-text-muted hover:text-discord-text'
                    }`}
                  >
                    Production
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnvironment('sandbox')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      environment === 'sandbox'
                        ? 'bg-discord-accent text-white'
                        : 'bg-discord-lighter text-discord-text-muted hover:text-discord-text'
                    }`}
                  >
                    Sandbox
                  </button>
                </div>
              </div>

              {/* Login Method Tabs */}
              <div className="flex border-b border-discord-lighter mb-5">
                <button
                  type="button"
                  onClick={() => setLoginMethod('credentials')}
                  className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                    loginMethod === 'credentials'
                      ? 'border-discord-accent text-discord-text'
                      : 'border-transparent text-discord-text-muted hover:text-discord-text'
                  }`}
                >
                  Username & Password
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMethod('oauth')}
                  className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                    loginMethod === 'oauth'
                      ? 'border-discord-accent text-discord-text'
                      : 'border-transparent text-discord-text-muted hover:text-discord-text'
                  }`}
                >
                  OAuth
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-discord-danger/20 border border-discord-danger rounded-lg">
                  <p className="text-sm text-discord-danger">{error}</p>
                </div>
              )}

              {loginMethod === 'credentials' ? (
                <form onSubmit={handleCredentialsLogin}>
                  {/* Username */}
                  <div className="mb-4">
                    <label htmlFor="username" className="block text-sm font-medium text-discord-text mb-2">
                      Username
                    </label>
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="user@company.com"
                      className="input"
                      required
                    />
                  </div>

                  {/* Password */}
                  <div className="mb-4">
                    <label htmlFor="password" className="block text-sm font-medium text-discord-text mb-2">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="input"
                      required
                    />
                  </div>

                  {/* Security Token */}
                  <div className="mb-4">
                    <label htmlFor="securityToken" className="block text-sm font-medium text-discord-text mb-2">
                      Security Token
                      <span className="text-discord-text-muted font-normal ml-1">(optional)</span>
                    </label>
                    <input
                      id="securityToken"
                      type="password"
                      value={securityToken}
                      onChange={(e) => setSecurityToken(e.target.value)}
                      placeholder="Your security token"
                      className="input"
                    />
                  </div>

                  {/* Save Credentials & Label */}
                  <div className="mb-5 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveCredentials}
                        onChange={(e) => setSaveCredentials(e.target.checked)}
                        className="custom-checkbox"
                      />
                      <span className="text-sm text-discord-text-muted">
                        Remember my credentials
                      </span>
                    </label>

                    {saveCredentials && (
                      <>
                        <input
                          id="label"
                          type="text"
                          value={label}
                          onChange={(e) => setLabel(e.target.value)}
                          placeholder="Label (e.g., Production - Main Org)"
                          className="input"
                        />
                        <div className="space-y-2">
                          <label className="text-sm text-discord-text-muted">
                            Theme Color:
                          </label>
                          <div className="flex items-center gap-2 flex-wrap">
                            {colorSwatches.map(({ color: colorValue, name }) => (
                              <button
                                key={colorValue}
                                type="button"
                                onClick={() => setColor(colorValue)}
                                className={`w-8 h-8 rounded-full border-2 transition-all ${
                                  color === colorValue ? 'border-white ring-2 ring-discord-accent' : 'border-discord-lighter hover:scale-110'
                                }`}
                                style={{ backgroundColor: colorValue }}
                                title={name}
                              />
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full btn btn-primary py-3 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Connecting...
                      </>
                    ) : (
                      'Login'
                    )}
                  </button>
                </form>
              ) : (
                <div className="py-2">
                  {/* Connected App Client ID */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-discord-text">
                        Connected App
                      </label>
                    </div>

                    {/* Default / Custom toggle */}
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => setUseDefaultClientId(true)}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                          useDefaultClientId
                            ? 'bg-discord-accent text-white'
                            : 'bg-discord-lighter text-discord-text-muted hover:text-discord-text'
                        }`}
                      >
                        Use Default (Recommended)
                      </button>
                      <button
                        type="button"
                        onClick={() => setUseDefaultClientId(false)}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                          !useDefaultClientId
                            ? 'bg-discord-accent text-white'
                            : 'bg-discord-lighter text-discord-text-muted hover:text-discord-text'
                        }`}
                      >
                        Custom Client ID
                      </button>
                    </div>

                    {useDefaultClientId ? (
                      <div className="p-3 bg-discord-lighter/50 rounded-lg border border-discord-lighter">
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-discord-success mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <p className="text-xs text-discord-text">Uses the Salesforce Platform CLI connected app — no setup required.</p>
                            <p className="text-xs text-discord-text-muted mt-1">Works with any org. Your browser will open to authenticate.</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={oauthClientId}
                          onChange={(e) => setOauthClientId(e.target.value)}
                          placeholder="3MVG9..."
                          className="input font-mono text-sm"
                        />
                        <div className="mt-1 flex items-center justify-between">
                          <p className="text-xs text-discord-text-muted">
                            Consumer Key from your Connected App
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowOAuthSetup(!showOAuthSetup)}
                            className="text-xs text-discord-accent hover:underline"
                          >
                            {showOAuthSetup ? 'Hide guide' : 'Setup guide'}
                          </button>
                        </div>

                        {showOAuthSetup && (
                          <div className="mt-2 p-3 bg-discord-lighter rounded-lg text-xs text-discord-text-muted space-y-2">
                            <p className="font-medium text-discord-text">Create an External Client App in Salesforce:</p>
                            <ol className="list-decimal list-inside space-y-1 ml-2">
                              <li>Log into the org you want to connect to</li>
                              <li>Go to Setup → search "External Client App Manager"</li>
                              <li>Click "New External Client App"</li>
                              <li>Enter a name (e.g., "Salesforce Studio")</li>
                              <li>Under "Distribution State", select "Local"</li>
                              <li>Click "Create" then go to the "OAuth Settings" tab</li>
                              <li>Click "Add a Consumer Key & Secret" → "Add"</li>
                              <li>Enable "User Authorization" flow</li>
                              <li>Add Callback URL: <code className="bg-discord-darker px-1 rounded">http://localhost:1717/OauthRedirect</code></li>
                              <li>Add scopes: "Manage user data via APIs (api)" and "Perform requests at any time (refresh_token, offline_access)"</li>
                              <li>Copy the Consumer Key (Client ID)</li>
                            </ol>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* OAuth session note */}
                  <div className="mb-4 p-3 bg-discord-lighter/50 rounded-lg border border-discord-lighter">
                    <p className="text-xs text-discord-text-muted">
                      OAuth sessions are not saved. You'll re-authenticate each time you open the app.
                      Use <span className="text-discord-text">Username & Password</span> login to save connections.
                    </p>
                  </div>

                  <button
                    onClick={handleOAuthLogin}
                    disabled={isLoading || (!useDefaultClientId && !oauthClientId.trim())}
                    className="w-full btn btn-primary py-3 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Waiting...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Login with Salesforce
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={onOpenSettings}
                className="flex items-center gap-1.5 text-xs text-discord-text-muted hover:text-discord-text transition-colors"
                title="Settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
              <p className="text-xs text-discord-text-muted">
                Credentials are encrypted and stored locally.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
