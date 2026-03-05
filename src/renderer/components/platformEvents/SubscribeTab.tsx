import React, { useState, useEffect, useRef } from 'react';
import type {
  PlatformEventInfo,
  PlatformEventSubscription,
  PlatformEventMessage,
} from '../../types/electron.d';

interface SubscribeTabProps {
  events: PlatformEventInfo[];
  liveEvents: PlatformEventMessage[];
  onClearEvents: () => void;
  onRefreshSubscriptions: () => void;
}

const SubscribeTab: React.FC<SubscribeTabProps> = ({
  events,
  liveEvents,
  onClearEvents,
  onRefreshSubscriptions,
}) => {
  const [selectedEvent, setSelectedEvent] = useState('');
  const [replayId, setReplayId] = useState<number>(-1);
  const [subscriptions, setSubscriptions] = useState<PlatformEventSubscription[]>([]);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const eventListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshSubscriptions();
    const interval = setInterval(refreshSubscriptions, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll && eventListRef.current) {
      eventListRef.current.scrollTop = 0;
    }
  }, [liveEvents.length, autoScroll]);

  const refreshSubscriptions = async () => {
    try {
      const subs = await window.electronAPI.platformEvents.getSubscriptions();
      setSubscriptions(subs);
      onRefreshSubscriptions();
    } catch {
      // ignore
    }
  };

  const handleSubscribe = async () => {
    if (!selectedEvent) return;
    setIsSubscribing(true);
    try {
      const result = await window.electronAPI.platformEvents.subscribe(selectedEvent, replayId);
      if (result.success) {
        await refreshSubscriptions();
      }
    } catch (err) {
      console.error('Subscribe failed:', err);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleUnsubscribe = async (subscriptionId: string) => {
    try {
      await window.electronAPI.platformEvents.unsubscribe(subscriptionId);
      await refreshSubscriptions();
    } catch (err) {
      console.error('Unsubscribe failed:', err);
    }
  };

  const handleUnsubscribeAll = async () => {
    try {
      await window.electronAPI.platformEvents.unsubscribeAll();
      await refreshSubscriptions();
    } catch (err) {
      console.error('Unsubscribe all failed:', err);
    }
  };

  const toggleExpandEvent = (index: number) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full">
      {/* Subscription Controls */}
      <div className="w-80 flex-shrink-0 border-r border-discord-darker flex flex-col">
        <div className="p-4 border-b border-discord-darker space-y-3">
          <h3 className="text-sm font-semibold text-discord-text">Subscribe</h3>

          <select
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
            className="w-full px-3 py-2 bg-discord-medium border border-discord-darker rounded text-sm text-discord-text focus:outline-none focus:border-discord-accent"
          >
            <option value="">Select an event...</option>
            {events.map((e) => (
              <option key={e.name} value={e.name}>
                {e.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <label className="text-xs text-discord-text-muted">Replay:</label>
            <select
              value={replayId}
              onChange={(e) => setReplayId(parseInt(e.target.value, 10))}
              className="flex-1 px-2 py-1 bg-discord-medium border border-discord-darker rounded text-xs text-discord-text focus:outline-none focus:border-discord-accent"
            >
              <option value={-1}>New events only (-1)</option>
              <option value={-2}>All retained events (-2)</option>
            </select>
          </div>

          <button
            onClick={handleSubscribe}
            disabled={!selectedEvent || isSubscribing}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
          >
            {isSubscribing ? 'Subscribing...' : 'Subscribe'}
          </button>
        </div>

        {/* Active Subscriptions */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 border-b border-discord-darker flex items-center justify-between">
            <h4 className="text-xs font-semibold text-discord-text-muted uppercase">
              Active Subscriptions ({subscriptions.length})
            </h4>
            {subscriptions.length > 0 && (
              <button
                onClick={handleUnsubscribeAll}
                className="text-xs text-red-400 hover:underline"
              >
                Unsubscribe All
              </button>
            )}
          </div>

          {subscriptions.length === 0 ? (
            <div className="p-4 text-sm text-discord-text-muted text-center">
              No active subscriptions
            </div>
          ) : (
            subscriptions.map((sub) => (
              <div
                key={sub.id}
                className="px-3 py-2.5 border-b border-discord-darker/50 hover:bg-discord-medium/30"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-discord-text font-medium truncate">
                    {sub.eventName}
                  </span>
                  <button
                    onClick={() => handleUnsubscribe(sub.id)}
                    className="text-xs text-red-400 hover:underline flex-shrink-0 ml-2"
                  >
                    Stop
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs text-discord-text-muted">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Live
                  </span>
                  <span>{sub.eventCount} events</span>
                  <span>{new Date(sub.startedAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Live Event Feed */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b border-discord-darker flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-discord-text">
              Live Events ({liveEvents.length})
            </h3>
            {liveEvents.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Streaming
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-discord-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded"
              />
              Auto-scroll
            </label>
            <button
              onClick={onClearEvents}
              disabled={liveEvents.length === 0}
              className="px-2 py-1 text-xs text-discord-text-muted hover:text-discord-text bg-discord-medium rounded transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>

        <div ref={eventListRef} className="flex-1 overflow-y-auto">
          {liveEvents.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-discord-lighter" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <p className="text-discord-text-muted text-sm">
                  {subscriptions.length === 0
                    ? 'Subscribe to a Platform Event to see live events'
                    : 'Waiting for events...'}
                </p>
              </div>
            </div>
          ) : (
            liveEvents.map((event, index) => (
              <div
                key={`${event.receivedAt}-${index}`}
                className="border-b border-discord-darker/50 hover:bg-discord-medium/20"
              >
                <button
                  onClick={() => toggleExpandEvent(index)}
                  className="w-full text-left px-4 py-2 flex items-center gap-3"
                >
                  <svg
                    className={`w-3 h-3 text-discord-text-muted transition-transform ${
                      expandedEvents.has(index) ? 'rotate-90' : ''
                    }`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs text-discord-text-muted font-mono">
                    {new Date(event.receivedAt).toLocaleTimeString()}
                  </span>
                  <span className="text-sm text-discord-accent font-medium">
                    {event.eventName}
                  </span>
                  {event.data?.event?.replayId && (
                    <span className="text-xs text-discord-text-muted">
                      replay: {event.data.event.replayId}
                    </span>
                  )}
                </button>

                {expandedEvents.has(index) && (
                  <div className="px-4 pb-3 pl-10">
                    <pre className="text-xs text-discord-text font-mono bg-discord-darker/50 p-3 rounded overflow-x-auto">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SubscribeTab;
