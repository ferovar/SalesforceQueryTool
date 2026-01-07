import React, { useState, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import LoginPage from './pages/LoginPage';
import MainPage from './pages/MainPage';
import SettingsModal from './components/SettingsModal';
import PerformanceMonitor from './components/PerformanceMonitor';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';

export interface UserSession {
  userId: string;
  organizationId: string;
  instanceUrl: string;
  username?: string;
}

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { settings, updateSettings, isProduction, setIsProduction } = useSettings();

  useEffect(() => {
    // Check for saved credentials on startup
    checkSavedCredentials();
  }, []);

  // Detect if connected to production based on instance URL
  useEffect(() => {
    if (session?.instanceUrl) {
      // Production URLs typically don't contain 'sandbox', 'scratch', 'test', 'dev', 'cs', etc.
      const url = session.instanceUrl.toLowerCase();
      const isSandbox = url.includes('sandbox') || 
                        url.includes('scratch') || 
                        url.includes('test') || 
                        url.includes('.cs') || 
                        url.includes('--') || // Scratch orgs use -- in URL
                        /\..*\.my\.salesforce\.com/.test(url); // Subdomain pattern for sandboxes
      setIsProduction(!isSandbox);
    } else {
      setIsProduction(undefined);
    }
  }, [session, setIsProduction]);

  const checkSavedCredentials = async () => {
    try {
      // For now, just set loading to false
      // In the future, we could auto-login with saved credentials
      setIsLoading(false);
    } catch (error) {
      console.error('Error checking saved credentials:', error);
      setIsLoading(false);
    }
  };

  const handleLoginSuccess = (sessionData: UserSession) => {
    setSession(sessionData);
    setIsLoggedIn(true);
  };

  const handleLogout = async () => {
    try {
      await window.electronAPI.salesforce.logout();
    } catch (error) {
      console.error('Error logging out:', error);
    }
    setSession(null);
    setIsLoggedIn(false);
    setIsProduction(undefined);
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-discord-darker flex items-center justify-center">
        <div className="text-discord-text">Loading...</div>
      </div>
    );
  }

  // Debug log to see what theme is being used
  console.log('Current theme:', settings.theme, 'Type:', typeof settings.theme);
  console.log('Comparison result (theme === "nature"):', settings.theme === 'nature');
  console.log('Comparison result (theme === "starfield"):', settings.theme === 'starfield');
  console.log('Full settings object:', settings);

  return (
    <div className="h-screen w-screen bg-discord-darker flex flex-col overflow-hidden">
      <TitleBar 
        isLoggedIn={isLoggedIn} 
        onLogout={handleLogout}
        instanceUrl={session?.instanceUrl}
        username={session?.username}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <main className="flex-1 overflow-hidden">
        {isLoggedIn && session ? (
          <MainPage 
            session={session} 
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        ) : (
          <LoginPage 
            onLoginSuccess={handleLoginSuccess} 
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}
      </main>
      
      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={updateSettings}
        isLoggedIn={isLoggedIn}
        isProduction={isProduction}
      />
      
      {/* Performance Monitor */}
      <PerformanceMonitor visible={settings.showPerformanceMonitor} />
    </div>
  );
}

function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}

export default App;
