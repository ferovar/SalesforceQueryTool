import React from 'react';

interface TitleBarProps {
  isLoggedIn: boolean;
  onLogout: () => void;
  instanceUrl?: string;
  onOpenSettings: () => void;
}

const TitleBar: React.FC<TitleBarProps> = ({ isLoggedIn, onLogout, instanceUrl, onOpenSettings }) => {
  const handleMinimize = () => window.electronAPI.minimizeWindow();
  const handleMaximize = () => window.electronAPI.maximizeWindow();
  const handleClose = () => window.electronAPI.closeWindow();

  return (
    <div className="h-8 bg-discord-darker flex items-center justify-between select-none drag-region border-b border-discord-dark">
      {/* Left side - App info */}
      <div className="flex items-center h-full px-3 no-drag">
        <div className="flex items-center gap-2">
          {/* Logo */}
          <svg className="w-4 h-4" viewBox="0 0 100 100" fill="none">
            <path d="M80 55c0-8.284-6.716-15-15-15-.74 0-1.466.054-2.175.158C60.33 31.21 52.067 25 42.5 25 30.626 25 21 34.626 21 46.5c0 .84.048 1.67.14 2.484C14.023 51.145 9 57.817 9 65.5 9 75.165 16.835 83 26.5 83h48c10.77 0 19.5-8.73 19.5-19.5 0-4.41-1.46-8.48-3.926-11.754C83.17 50.246 80 52.284 80 55z" fill="#5865f2"/>
          </svg>
          <span className="text-xs font-semibold text-discord-text">Salesforce Query Tool</span>
        </div>
      </div>

      {/* Center - Connection status */}
      <div className="flex items-center gap-2 text-xs">
        {isLoggedIn && instanceUrl && (
          <div className="flex items-center gap-2 no-drag">
            <div className="w-2 h-2 rounded-full bg-discord-success animate-pulse" />
            <span className="text-discord-text-muted">
              Connected to {instanceUrl.replace('https://', '')}
            </span>
            <button
              onClick={onLogout}
              className="ml-2 px-2 py-0.5 text-xs text-discord-text-muted hover:text-discord-text hover:bg-discord-light rounded transition-colors"
            >
              Logout
            </button>
          </div>
        )}
      </div>

      {/* Right side - Settings and Window controls */}
      <div className="flex items-center h-full no-drag">
        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="h-full px-3 hover:bg-discord-light transition-colors group"
          title="Settings"
        >
          <svg className="w-3.5 h-3.5 text-discord-text-muted group-hover:text-discord-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        
        <div className="w-px h-4 bg-discord-lighter mx-1" />
        
        <button
          onClick={handleMinimize}
          className="h-full px-3 hover:bg-discord-light transition-colors group"
          title="Minimize"
        >
          <svg className="w-3 h-3 text-discord-text-muted group-hover:text-discord-text" fill="currentColor" viewBox="0 0 10 10">
            <rect y="4" width="10" height="1" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="h-full px-3 hover:bg-discord-light transition-colors group"
          title="Maximize"
        >
          <svg className="w-3 h-3 text-discord-text-muted group-hover:text-discord-text" fill="none" stroke="currentColor" viewBox="0 0 10 10">
            <rect x="1" y="1" width="8" height="8" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="h-full px-3 hover:bg-discord-danger transition-colors group"
          title="Close"
        >
          <svg className="w-3 h-3 text-discord-text-muted group-hover:text-white" fill="currentColor" viewBox="0 0 10 10">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
