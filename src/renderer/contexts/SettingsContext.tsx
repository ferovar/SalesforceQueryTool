import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AppSettings } from '../components/SettingsModal';
import { defaultSettings } from '../components/SettingsModal';

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: AppSettings) => void;
  togglePerformanceMonitor: () => void;
  isProduction: boolean | undefined;
  setIsProduction: (isProd: boolean | undefined) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_STORAGE_KEY = 'salesforce-query-tool-settings';

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    // Load from localStorage on init
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure all default properties exist, especially new ones like theme
        return { ...defaultSettings, ...parsed };
      }
    } catch (e) {
      console.error('Error loading settings:', e);
    }
    return defaultSettings;
  });
  
  const [isProduction, setIsProduction] = useState<boolean | undefined>(undefined);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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
