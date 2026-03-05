import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { PlatformEventInfo, PlatformEventDescribe, PlatformEventMessage } from '../../types/electron.d';
import DiscoverTab from './DiscoverTab';
import PublishTab from './PublishTab';
import SubscribeTab from './SubscribeTab';
import PublishHistoryTab from './PublishHistoryTab';

const isNamespaced = (name: string) => name.replace(/__e$/, '').includes('__');

interface PlatformEventsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabName = 'discover' | 'publish' | 'subscribe' | 'history';

const PlatformEventsModal: React.FC<PlatformEventsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabName>('discover');
  const [events, setEvents] = useState<PlatformEventInfo[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [selectedEventName, setSelectedEventName] = useState<string>('');
  const [selectedEventDescribe, setSelectedEventDescribe] = useState<PlatformEventDescribe | null>(null);
  const [liveEvents, setLiveEvents] = useState<PlatformEventMessage[]>([]);
  const [activeSubscriptionCount, setActiveSubscriptionCount] = useState(0);
  const [includeNamespaces, setIncludeNamespaces] = useState(false);

  const filteredEvents = useMemo(() => {
    if (includeNamespaces) return events;
    return events.filter((e) => !isNamespaced(e.name));
  }, [events, includeNamespaces]);

  // Load events when modal opens
  useEffect(() => {
    if (isOpen) {
      loadEvents();
      refreshSubscriptionCount();
    }
  }, [isOpen]);

  // Listen for streaming events
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = window.electronAPI.platformEvents.onEvent((data: PlatformEventMessage) => {
      setLiveEvents((prev) => [data, ...prev].slice(0, 500));
      refreshSubscriptionCount();
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  const loadEvents = async () => {
    setIsLoadingEvents(true);
    try {
      const result = await window.electronAPI.platformEvents.getEvents();
      if (result.success && result.data) {
        setEvents(result.data);
      }
    } catch (err) {
      console.error('Failed to load platform events:', err);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const refreshSubscriptionCount = useCallback(async () => {
    try {
      const subs = await window.electronAPI.platformEvents.getSubscriptions();
      setActiveSubscriptionCount(subs.length);
    } catch {
      // ignore
    }
  }, []);

  const handleSelectEvent = useCallback(async (eventName: string) => {
    setSelectedEventName(eventName);
    try {
      const result = await window.electronAPI.platformEvents.describe(eventName);
      if (result.success && result.data) {
        setSelectedEventDescribe(result.data);
      }
    } catch (err) {
      console.error('Failed to describe event:', err);
    }
  }, []);

  const handleUseInPublish = useCallback((eventName: string) => {
    handleSelectEvent(eventName);
    setActiveTab('publish');
  }, [handleSelectEvent]);

  const handleRepublish = useCallback((eventName: string, payload: Record<string, unknown>) => {
    handleSelectEvent(eventName);
    setActiveTab('publish');
    // The PublishTab will pick up selectedEventName and can be passed a pre-filled payload
  }, [handleSelectEvent]);

  if (!isOpen) return null;

  const tabs: { id: TabName; label: string; badge?: number }[] = [
    { id: 'discover', label: 'Discover' },
    { id: 'publish', label: 'Publish' },
    { id: 'subscribe', label: 'Subscribe', badge: activeSubscriptionCount > 0 ? activeSubscriptionCount : undefined },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-discord-dark rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden border border-discord-darker">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-discord-darker bg-discord-darker/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h2 className="text-lg font-semibold text-discord-text">Platform Events</h2>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 ml-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-t transition-colors relative ${
                    activeTab === tab.id
                      ? 'text-discord-accent border-b-2 border-discord-accent'
                      : 'text-discord-text-muted hover:text-discord-text'
                  }`}
                >
                  {tab.label}
                  {tab.badge !== undefined && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-green-500 text-white rounded-full">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-discord-text-muted hover:text-discord-text hover:bg-discord-medium rounded transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'discover' && (
            <DiscoverTab
              events={filteredEvents}
              isLoading={isLoadingEvents}
              onRefresh={loadEvents}
              onSelectEvent={handleSelectEvent}
              selectedEventName={selectedEventName}
              selectedEventDescribe={selectedEventDescribe}
              onUseInPublish={handleUseInPublish}
              includeNamespaces={includeNamespaces}
              onToggleNamespaces={setIncludeNamespaces}
            />
          )}
          {activeTab === 'publish' && (
            <PublishTab
              events={filteredEvents}
              selectedEventName={selectedEventName}
              selectedEventDescribe={selectedEventDescribe}
              onSelectEvent={handleSelectEvent}
              includeNamespaces={includeNamespaces}
              onToggleNamespaces={setIncludeNamespaces}
            />
          )}
          {activeTab === 'subscribe' && (
            <SubscribeTab
              events={filteredEvents}
              liveEvents={liveEvents}
              onClearEvents={() => setLiveEvents([])}
              onRefreshSubscriptions={refreshSubscriptionCount}
              includeNamespaces={includeNamespaces}
              onToggleNamespaces={setIncludeNamespaces}
            />
          )}
          {activeTab === 'history' && (
            <PublishHistoryTab
              onRepublish={handleRepublish}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PlatformEventsModal;
