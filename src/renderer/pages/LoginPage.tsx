import React, { useState, useEffect } from 'react';
import type { UserSession } from '../App';
import type { SavedLogin, SavedOAuthLogin } from '../types/electron.d';
import StarfieldBackground from '../components/StarfieldBackground';
import { WavesBackground } from '../components/NatureBackground';
import { useSettings } from '../contexts/SettingsContext';

interface LoginPageProps {
  onLoginSuccess: (session: UserSession) => void;
  onOpenSettings: () => void;
}

type LoginMethod = 'credentials' | 'oauth';
type Environment = 'production' | 'sandbox';

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
  const [showSavedLogins, setShowSavedLogins] = useState(false);
  const [showSavedOAuthLogins, setShowSavedOAuthLogins] = useState(false);
  const [isUsingSavedLogin, setIsUsingSavedLogin] = useState(false);
  const [oauthLabel, setOauthLabel] = useState('');
  const [oauthColor, setOauthColor] = useState('#5865f2');
  const [saveOAuthConnection, setSaveOAuthConnection] = useState(true);
  const [oauthClientId, setOauthClientId] = useState('');
  const [useDefaultClientId, setUseDefaultClientId] = useState(true);
  const [showOAuthSetup, setShowOAuthSetup] = useState(false);
  const [editingCredential, setEditingCredential] = useState<string | null>(null);
  const [editingOAuth, setEditingOAuth] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('#5865f2');

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

  const loadLastCredentials = async () => {
    try {
      const creds = await window.electronAPI.credentials.get();
      if (creds) {
        setLabel(creds.label || '');
        setUsername(creds.username);
        setPassword(creds.password);
        setSecurityToken(creds.securityToken);
        setEnvironment(creds.isSandbox ? 'sandbox' : 'production');
      }
    } catch (err) {
      console.error('Error loading last credentials:', err);
    }
  };

  const handleSelectSavedLogin = async (login: SavedLogin) => {
    setShowSavedLogins(false);
    setIsLoading(true);
    setError(null);

    try {
      // Get full credentials from secure storage
      const fullCredentials = await window.electronAPI.credentials.getLoginByUsername(login.username);
      
      if (!fullCredentials) {
        setError('Could not load saved credentials');
        setIsLoading(false);
        return;
      }

      // Immediately log in with the saved credentials
      const result = await window.electronAPI.salesforce.login({
        label: fullCredentials.label,
        username: fullCredentials.username,
        password: fullCredentials.password,
        securityToken: fullCredentials.securityToken,
        isSandbox: fullCredentials.isSandbox,
        saveCredentials: false, // Already saved
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

  const handleDeleteSavedLogin = async (username: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.electronAPI.credentials.deleteSavedLogin(username);
      loadSavedLogins();
    } catch (err) {
      console.error('Error deleting saved login:', err);
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
        saveConnection: saveOAuthConnection,
        label: oauthLabel,
        clientId: useDefaultClientId ? undefined : oauthClientId.trim(),
        color: oauthColor,
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

  const handleSelectSavedOAuthLogin = async (login: SavedOAuthLogin) => {
    setShowSavedOAuthLogins(false);
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.salesforce.loginWithSavedOAuth(login.id);

      if (result.success) {
        onLoginSuccess(result.data);
      } else {
        // If the saved OAuth token is expired, show error but keep the entry
        setError(result.error || 'OAuth session expired. Please log in again.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSavedOAuthLogin = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.electronAPI.credentials.deleteOAuthLogin(id);
      loadSavedOAuthLogins();
    } catch (err) {
      console.error('Error deleting saved OAuth login:', err);
    }
  };

  const handleEditCredential = (login: SavedLogin, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCredential(login.username);
    setEditLabel(login.label);
    setEditColor(login.color || '#5865f2');
  };

  const handleSaveCredentialEdit = async (username: string, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Saving credential edit:', username, editLabel, editColor);
    try {
      const result = await window.electronAPI.credentials.updateLoginMetadata(username, editLabel, editColor);
      console.log('Update result:', result);
      setEditingCredential(null);
      await loadSavedLogins();
    } catch (err) {
      console.error('Error updating credential metadata:', err);
      alert('Failed to save changes: ' + (err as Error).message);
    }
  };

  const handleEditOAuth = (login: SavedOAuthLogin, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingOAuth(login.id);
    setEditLabel(login.label);
    setEditColor(login.color || '#5865f2');
  };

  const handleSaveOAuthEdit = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Saving OAuth edit:', id, editLabel, editColor);
    try {
      const result = await window.electronAPI.credentials.updateOAuthMetadata(id, editLabel, editColor);
      console.log('Update result:', result);
      setEditingOAuth(null);
      await loadSavedOAuthLogins();
    } catch (err) {
      console.error('Error updating OAuth metadata:', err);
      alert('Failed to save changes: ' + (err as Error).message);
    }
  };

  const { settings } = useSettings();

  return (
    <div className="h-full flex bg-discord-darker relative overflow-hidden">
      {/* Animated background */}
      {settings.theme === 'nature' ? (
        <WavesBackground key="waves-bg" />
      ) : (
        <StarfieldBackground key="starfield-bg" />
      )}
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-discord-darker/95 backdrop-blur-sm">
          {/* Animated Logo */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-discord-accent/20 animate-ping" style={{ animationDuration: '1.5s' }}></div>
            <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-discord-accent/10">
              <svg className="w-14 h-14 animate-pulse" viewBox="0 0 100 100" fill="none">
                <path d="M80 55c0-8.284-6.716-15-15-15-.74 0-1.466.054-2.175.158C60.33 31.21 52.067 25 42.5 25 30.626 25 21 34.626 21 46.5c0 .84.048 1.67.14 2.484C14.023 51.145 9 57.817 9 65.5 9 75.165 16.835 83 26.5 83h48c10.77 0 19.5-8.73 19.5-19.5 0-4.41-1.46-8.48-3.926-11.754C83.17 50.246 80 52.284 80 55z" fill="#5865f2"/>
                <circle cx="45" cy="52" r="12" stroke="#fff" strokeWidth="3" fill="none"/>
                <path d="M54 61l10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          
          {/* Loading Text */}
          <div className="mt-8 text-center">
            <h2 className="text-xl font-semibold text-discord-text mb-2">Connecting to Salesforce</h2>
            <p className="text-discord-text-muted text-sm">Authenticating your credentials...</p>
          </div>
          
          {/* Loading Bar */}
          <div className="mt-6 w-48 h-1 bg-discord-lighter rounded-full overflow-hidden">
            <div className="h-full bg-discord-accent rounded-full animate-loading-bar"></div>
          </div>
        </div>
      )}
      
      {/* Left Side - Hero Section */}
      <div className="hidden lg:flex lg:w-2/5 relative z-10 flex-col p-8 border-r border-discord-lighter/10 overflow-y-auto">
        <div className="max-w-lg my-auto">
          {/* Animated Logo */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-discord-accent/20 to-discord-accent/5 mb-6 group hover:scale-105 transition-transform">
            <svg className="w-12 h-12 group-hover:scale-110 transition-transform" viewBox="0 0 100 100" fill="none">
              <path d="M80 55c0-8.284-6.716-15-15-15-.74 0-1.466.054-2.175.158C60.33 31.21 52.067 25 42.5 25 30.626 25 21 34.626 21 46.5c0 .84.048 1.67.14 2.484C14.023 51.145 9 57.817 9 65.5 9 75.165 16.835 83 26.5 83h48c10.77 0 19.5-8.73 19.5-19.5 0-4.41-1.46-8.48-3.926-11.754C83.17 50.246 80 52.284 80 55z" fill="#5865f2"/>
              <circle cx="45" cy="52" r="12" stroke="#fff" strokeWidth="3" fill="none"/>
              <path d="M54 61l10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </div>
          
          {/* Title & Tagline */}
          <h1 className="text-4xl font-bold text-discord-text mb-2 leading-tight">
            Salesforce<br/>Query Tool
          </h1>
          <p className="text-lg text-discord-text-muted mb-6 leading-relaxed">
            Query, Explore, and Manage<br/>Your Salesforce Data
          </p>
          
          {/* Feature Cards */}
          <div className="space-y-3">
            {/* Query Builder Feature */}
            <div className="group flex items-start gap-3 p-3 rounded-xl bg-discord-lighter/50 hover:bg-discord-lighter transition-all border border-transparent hover:border-discord-accent/20">
              <div className="w-10 h-10 rounded-lg bg-discord-accent/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-discord-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-discord-text mb-1">Advanced SOQL Builder</h3>
                <p className="text-xs text-discord-text-muted leading-relaxed">Visual query builder with autocomplete and syntax highlighting</p>
              </div>
            </div>

            {/* Export Feature */}
            <div className="group flex items-start gap-3 p-3 rounded-xl bg-discord-lighter/50 hover:bg-discord-lighter transition-all border border-transparent hover:border-discord-success/20">
              <div className="w-10 h-10 rounded-lg bg-discord-success/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-discord-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-discord-text mb-1">Export to CSV/Excel</h3>
                <p className="text-xs text-discord-text-muted leading-relaxed">Download query results with proper formatting and encoding</p>
              </div>
            </div>

            {/* Migration Feature */}
            <div className="group flex items-start gap-3 p-3 rounded-xl bg-discord-lighter/50 hover:bg-discord-lighter transition-all border border-transparent hover:border-blue-500/20">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-discord-text mb-1">Record Migration</h3>
                <p className="text-xs text-discord-text-muted leading-relaxed">Transfer records seamlessly between Salesforce orgs</p>
              </div>
            </div>

            {/* Apex Feature */}
            <div className="group flex items-start gap-3 p-3 rounded-xl bg-discord-lighter/50 hover:bg-discord-lighter transition-all border border-transparent hover:border-orange-500/20">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-discord-text mb-1">Anonymous Apex</h3>
                <p className="text-xs text-discord-text-muted leading-relaxed">Execute Apex code directly with real-time debug logs</p>
              </div>
            </div>

            {/* Query History Feature */}
            <div className="group flex items-start gap-3 p-3 rounded-xl bg-discord-lighter/50 hover:bg-discord-lighter transition-all border border-transparent hover:border-purple-500/20">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-discord-text mb-1">Query History & Saved Queries</h3>
                <p className="text-xs text-discord-text-muted leading-relaxed">Never lose your work with automatic history and bookmarks</p>
              </div>
            </div>

            {/* Multi-Org Feature */}
            <div className="group flex items-start gap-3 p-3 rounded-xl bg-discord-lighter/50 hover:bg-discord-lighter transition-all border border-transparent hover:border-pink-500/20">
              <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-discord-text mb-1">Multi-Org Color Coding</h3>
                <p className="text-xs text-discord-text-muted leading-relaxed">Visual themes prevent production mistakes</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-3/5 flex items-center justify-center p-8 relative z-10">
        <div className="w-full max-w-md">
          {/* Mobile Header - only shown on small screens */}
          <div className="lg:hidden text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-discord-accent/10 mb-3">
              <svg className="w-8 h-8" viewBox="0 0 100 100" fill="none">
                <path d="M80 55c0-8.284-6.716-15-15-15-.74 0-1.466.054-2.175.158C60.33 31.21 52.067 25 42.5 25 30.626 25 21 34.626 21 46.5c0 .84.048 1.67.14 2.484C14.023 51.145 9 57.817 9 65.5 9 75.165 16.835 83 26.5 83h48c10.77 0 19.5-8.73 19.5-19.5 0-4.41-1.46-8.48-3.926-11.754C83.17 50.246 80 52.284 80 55z" fill="#5865f2"/>
                <circle cx="45" cy="52" r="12" stroke="#fff" strokeWidth="3" fill="none"/>
                <path d="M54 61l10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </div>
            <h1 className="text-xl font-bold text-discord-text">Salesforce Query Tool</h1>
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
                {/* Saved Logins Dropdown */}
                {savedLogins.length > 0 && (
                  <div className="mb-4 relative">
                    <button
                      type="button"
                      onClick={() => setShowSavedLogins(!showSavedLogins)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-discord-lighter rounded-lg text-sm text-discord-text hover:bg-discord-light transition-colors"
                    >
                      <span>
                        {isUsingSavedLogin && savedLogins.find(l => l.username === username) 
                          ? savedLogins.find(l => l.username === username)?.label 
                          : 'Select saved login'}
                      </span>
                      <svg className={`w-4 h-4 transition-transform ${showSavedLogins ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showSavedLogins && (
                      <div className="absolute z-10 w-full mt-1 bg-discord-medium rounded-lg shadow-lg border border-discord-lighter overflow-hidden">
                        {savedLogins.map((login) => (
                          <div
                            key={login.username}
                            onClick={() => !editingCredential && handleSelectSavedLogin(login)}
                            className={`px-3 py-2 ${!editingCredential ? 'hover:bg-discord-light cursor-pointer' : ''}`}
                          >
                            {editingCredential === login.username ? (
                              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editLabel}
                                  onChange={(e) => setEditLabel(e.target.value)}
                                  placeholder="Connection label"
                                  className="w-full px-2 py-1 text-sm bg-discord-dark rounded border border-discord-lighter text-discord-text"
                                />
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {[
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
                                  ].map(({ color, name }) => (
                                    <button
                                      key={color}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditColor(color);
                                      }}
                                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                                        editColor === color ? 'border-white ring-2 ring-discord-accent' : 'border-discord-lighter hover:scale-110'
                                      }`}
                                      style={{ backgroundColor: color }}
                                      title={name}
                                    />
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await handleSaveCredentialEdit(login.username, e);
                                    }}
                                    className="flex-1 px-2 py-1 text-xs bg-discord-accent text-white rounded hover:bg-opacity-80"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingCredential(null);
                                    }}
                                    className="px-2 py-1 text-xs bg-discord-lighter text-discord-text rounded hover:bg-discord-light"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                  {login.color && (
                                    <div 
                                      className="w-3 h-3 rounded-full border border-discord-lighter flex-shrink-0" 
                                      style={{ backgroundColor: login.color }}
                                      title="Connection theme color"
                                    />
                                  )}
                                  <div>
                                    <p className="text-sm text-discord-text font-medium">{login.label}</p>
                                    <p className="text-xs text-discord-text-muted">
                                      {login.username} • {login.isSandbox ? 'Sandbox' : 'Production'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={(e) => handleEditCredential(login, e)}
                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-discord-lighter rounded transition-all"
                                    title="Edit label and color"
                                  >
                                    <svg className="w-4 h-4 text-discord-text-muted hover:text-discord-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteSavedLogin(login.username, e)}
                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-discord-danger rounded transition-all"
                                    title="Delete saved login"
                                  >
                                    <svg className="w-4 h-4 text-discord-text-muted hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Username */}
                <div className="mb-4">
                  <label htmlFor="username" className="block text-sm font-medium text-discord-text mb-2">
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setIsUsingSavedLogin(false);
                    }}
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

                {/* Save Credentials & Label - only show when not using a saved login */}
                {!isUsingSavedLogin && (
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
                            {[
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
                            ].map(({ color: colorValue, name }) => (
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
                )}

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
                {/* Saved OAuth Logins Dropdown */}
                {savedOAuthLogins.length > 0 && (
                  <div className="mb-4 relative">
                    <button
                      type="button"
                      onClick={() => setShowSavedOAuthLogins(!showSavedOAuthLogins)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-discord-lighter rounded-lg text-sm text-discord-text hover:bg-discord-light transition-colors"
                    >
                      <span>Select saved OAuth connection</span>
                      <svg className={`w-4 h-4 transition-transform ${showSavedOAuthLogins ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showSavedOAuthLogins && (
                      <div className="absolute z-10 w-full mt-1 bg-discord-medium rounded-lg shadow-lg border border-discord-lighter overflow-hidden">
                        {savedOAuthLogins.map((login) => (
                          <div
                            key={login.id}
                            onClick={() => !editingOAuth && handleSelectSavedOAuthLogin(login)}
                            className={`px-3 py-2 ${!editingOAuth ? 'hover:bg-discord-light cursor-pointer' : ''}`}
                          >
                            {editingOAuth === login.id ? (
                              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editLabel}
                                  onChange={(e) => setEditLabel(e.target.value)}
                                  placeholder="Connection label"
                                  className="w-full px-2 py-1 text-sm bg-discord-dark rounded border border-discord-lighter text-discord-text"
                                />
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {[
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
                                  ].map(({ color, name }) => (
                                    <button
                                      key={color}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditColor(color);
                                      }}
                                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                                        editColor === color ? 'border-white ring-2 ring-discord-accent' : 'border-discord-lighter hover:scale-110'
                                      }`}
                                      style={{ backgroundColor: color }}
                                      title={name}
                                    />
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await handleSaveOAuthEdit(login.id, e);
                                    }}
                                    className="flex-1 px-2 py-1 text-xs bg-discord-accent text-white rounded hover:bg-opacity-80"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingOAuth(null);
                                    }}
                                    className="px-2 py-1 text-xs bg-discord-lighter text-discord-text rounded hover:bg-discord-light"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                  {login.color && (
                                    <div 
                                      className="w-3 h-3 rounded-full border border-discord-lighter flex-shrink-0" 
                                      style={{ backgroundColor: login.color }}
                                      title="Connection theme color"
                                    />
                                  )}
                                  <div>
                                    <p className="text-sm text-discord-text font-medium">{login.label}</p>
                                    <p className="text-xs text-discord-text-muted">
                                      {login.username} • {login.isSandbox ? 'Sandbox' : 'Production'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={(e) => handleEditOAuth(login, e)}
                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-discord-lighter rounded transition-all"
                                    title="Edit label and color"
                                  >
                                    <svg className="w-4 h-4 text-discord-text-muted hover:text-discord-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteSavedOAuthLogin(login.id, e)}
                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-discord-danger rounded transition-all"
                                    title="Delete saved login"
                                  >
                                    <svg className="w-4 h-4 text-discord-text-muted hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Divider if there are saved connections */}
                {savedOAuthLogins.length > 0 && (
                  <div className="relative mb-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-discord-lighter"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2 bg-discord-dark text-discord-text-muted">or add new connection</span>
                    </div>
                  </div>
                )}

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
                            <li>Enter a name (e.g., "Salesforce Query Tool")</li>
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

                {/* Save Connection & Label */}
                <div className="mb-4 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveOAuthConnection}
                      onChange={(e) => setSaveOAuthConnection(e.target.checked)}
                      className="custom-checkbox"
                    />
                    <span className="text-sm text-discord-text-muted">
                      Remember this connection
                    </span>
                  </label>
                  
                  {saveOAuthConnection && (
                    <>
                      <input
                        type="text"
                        value={oauthLabel}
                        onChange={(e) => setOauthLabel(e.target.value)}
                        placeholder="Label (e.g., My Dev Sandbox)"
                        className="input"
                      />
                      <div className="space-y-2">
                        <label className="text-sm text-discord-text-muted">
                          Theme Color:
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {[
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
                          ].map(({ color: colorValue, name }) => (
                            <button
                              key={colorValue}
                              type="button"
                              onClick={() => setOauthColor(colorValue)}
                              className={`w-8 h-8 rounded-full border-2 transition-all ${
                                oauthColor === colorValue ? 'border-white ring-2 ring-discord-accent' : 'border-discord-lighter hover:scale-110'
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
      </div>
    </div>
  );
};

export default LoginPage;
