import React, { useState, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import LoginPage from './pages/LoginPage';
import MainPage from './pages/MainPage';

export interface UserSession {
  userId: string;
  organizationId: string;
  instanceUrl: string;
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for saved credentials on startup
    checkSavedCredentials();
  }, []);

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
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-discord-darker flex items-center justify-center">
        <div className="text-discord-text">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-discord-darker flex flex-col overflow-hidden">
      <TitleBar 
        isLoggedIn={isLoggedIn} 
        onLogout={handleLogout}
        instanceUrl={session?.instanceUrl}
      />
      <main className="flex-1 overflow-hidden">
        {isLoggedIn && session ? (
          <MainPage session={session} />
        ) : (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        )}
      </main>
    </div>
  );
}

export default App;
