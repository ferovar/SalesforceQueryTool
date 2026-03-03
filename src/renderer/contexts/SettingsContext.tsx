import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { AppSettings } from '../types/electron.d';
import { defaultSettings } from '../components/SettingsModal';

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: AppSettings) => void;
  togglePerformanceMonitor: () => void;
  isProduction: boolean | undefined;
  setIsProduction: (isProd: boolean | undefined) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isProduction, setIsProduction] = useState<boolean | undefined>(undefined);
  const initialized = useRef(false);

  // Load settings from electron-store on mount
  useEffect(() => {
    (async () => {
      try {
        if (window.electronAPI?.settings) {
          const saved = await window.electronAPI.settings.get();
          if (saved) {
            setSettings(prev => ({ ...prev, ...saved }));
          }
        }
      } catch (e) {
        console.error('Error loading settings:', e);
      }
      initialized.current = true;
    })();
  }, []);

  // Persist settings to electron-store whenever they change (after initial load)
  useEffect(() => {
    if (!initialized.current) return;
    try {
      if (window.electronAPI?.settings) {
        window.electronAPI.settings.save(settings);
      }
    } catch (e) {
      console.error('Error saving settings:', e);
    }
  }, [settings]);

  // Listen for F12 key to toggle performance monitor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        setSettings(prev => ({
          ...prev,
          showPerformanceMonitor: !prev.showPerformanceMonitor,
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const updateSettings = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
  }, []);

  const togglePerformanceMonitor = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      showPerformanceMonitor: !prev.showPerformanceMonitor,
    }));
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        togglePerformanceMonitor,
        isProduction,
        setIsProduction,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
