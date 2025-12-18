import React, { useState, useEffect } from 'react';
import type { UserSession } from '../App';
import type { SavedLogin } from '../types/electron.d';
import StarfieldBackground from '../components/StarfieldBackground';

interface LoginPageProps {
  onLoginSuccess: (session: UserSession) => void;
}

type LoginMethod = 'credentials' | 'oauth';
type Environment = 'production' | 'sandbox';

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('credentials');
  const [environment, setEnvironment] = useState<Environment>('production');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [securityToken, setSecurityToken] = useState('');
  const [saveCredentials, setSaveCredentials] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLogins, setSavedLogins] = useState<SavedLogin[]>([]);
  const [showSavedLogins, setShowSavedLogins] = useState(false);

  useEffect(() => {
    loadSavedLogins();
    loadLastCredentials();
  }, []);

  const loadSavedLogins = async () => {
    try {
      const logins = await window.electronAPI.credentials.getSavedLogins();
      setSavedLogins(logins);
    } catch (err) {
      console.error('Error loading saved logins:', err);
    }
  };

  const loadLastCredentials = async () => {
    try {
      const creds = await window.electronAPI.credentials.get();
      if (creds) {
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
    setUsername(login.username);
    setEnvironment(login.isSandbox ? 'sandbox' : 'production');
    setShowSavedLogins(false);
    // The password and token will be loaded from secure storage on login attempt
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
        username,
        password,
        securityToken,
        isSandbox: environment === 'sandbox',
        saveCredentials,
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
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.salesforce.loginOAuth(environment === 'sandbox');

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

  return (
    <div className="h-full flex items-center justify-center bg-discord-darker p-8 relative overflow-hidden">
      {/* Animated starfield background */}
      <StarfieldBackground />
      
      <div className="w-full max-w-md animate-slide-in relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-discord-accent/10 mb-4">
            <svg className="w-10 h-10" viewBox="0 0 100 100" fill="none">
              <path d="M80 55c0-8.284-6.716-15-15-15-.74 0-1.466.054-2.175.158C60.33 31.21 52.067 25 42.5 25 30.626 25 21 34.626 21 46.5c0 .84.048 1.67.14 2.484C14.023 51.145 9 57.817 9 65.5 9 75.165 16.835 83 26.5 83h48c10.77 0 19.5-8.73 19.5-19.5 0-4.41-1.46-8.48-3.926-11.754C83.17 50.246 80 52.284 80 55z" fill="#5865f2"/>
              <circle cx="45" cy="52" r="12" stroke="#fff" strokeWidth="3" fill="none"/>
              <path d="M54 61l10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-discord-text mb-2">
            Salesforce Query Tool
          </h1>
          <p className="text-discord-text-muted">
            Connect to your Salesforce org to get started
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-discord-dark rounded-lg p-6 shadow-xl">
          {/* Environment Selection */}
          <div className="mb-6">
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
          <div className="flex border-b border-discord-lighter mb-6">
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
                    className="w-full flex items-center justify-between px-3 py-2 bg-discord-lighter rounded-lg text-sm text-discord-text-muted hover:text-discord-text transition-colors"
                  >
                    <span>Select saved login</span>
                    <svg className={`w-4 h-4 transition-transform ${showSavedLogins ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showSavedLogins && (
                    <div className="absolute z-10 w-full mt-1 bg-discord-medium rounded-lg shadow-lg border border-discord-lighter overflow-hidden">
                      {savedLogins.map((login) => (
                        <div
                          key={login.username}
                          onClick={() => handleSelectSavedLogin(login)}
                          className="flex items-center justify-between px-3 py-2 hover:bg-discord-light cursor-pointer group"
                        >
                          <div>
                            <p className="text-sm text-discord-text">{login.username}</p>
                            <p className="text-xs text-discord-text-muted">
                              {login.isSandbox ? 'Sandbox' : 'Production'} • Last used: {new Date(login.lastUsed).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={(e) => handleDeleteSavedLogin(login.username, e)}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-discord-danger rounded transition-all"
                          >
                            <svg className="w-4 h-4 text-discord-text-muted hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
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
                  <span className="text-discord-text-muted font-normal ml-1">(optional if IP whitelisted)</span>
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

              {/* Save Credentials */}
              <div className="mb-6">
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
            <div className="text-center">
              <p className="text-sm text-discord-text-muted mb-6">
                Click the button below to authenticate with Salesforce using OAuth.
                A browser window will open for you to log in.
              </p>
              <button
                onClick={handleOAuthLogin}
                disabled={isLoading}
                className="w-full btn btn-primary py-3 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Waiting for authentication...
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
              <p className="text-xs text-discord-text-muted mt-4">
                Note: OAuth requires a Connected App to be configured in Salesforce.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-discord-text-muted mt-6">
          Your credentials are encrypted and stored securely on your local machine.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
