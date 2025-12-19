import React, { useState, useEffect } from 'react';

interface PerformanceMonitorProps {
  visible: boolean;
}

interface PerformanceData {
  heapUsed: number;
  heapTotal: number;
  external: number;
  uptime: number;
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({ visible }) => {
  const [perfData, setPerfData] = useState<PerformanceData>({
    heapUsed: 0,
    heapTotal: 0,
    external: 0,
    uptime: 0,
  });
  const [fps, setFps] = useState(0);

  useEffect(() => {
    if (!visible) return;

    // Memory usage polling
    const memoryInterval = setInterval(async () => {
      try {
        const data = await window.electronAPI.getPerformanceData();
        if (data) {
          setPerfData(data);
        }
      } catch {
        // Fallback to basic performance API if available
        if (performance && (performance as any).memory) {
          const mem = (performance as any).memory;
          setPerfData({
            heapUsed: mem.usedJSHeapSize,
            heapTotal: mem.totalJSHeapSize,
            external: 0,
            uptime: performance.now() / 1000,
          });
        }
      }
    }, 1000);

    // FPS counter
    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;

    const countFrame = () => {
      frameCount++;
      const now = performance.now();
      
      if (now - lastTime >= 1000) {
        setFps(Math.round(frameCount * 1000 / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
      }
      
      animationId = requestAnimationFrame(countFrame);
    };
    
    animationId = requestAnimationFrame(countFrame);

    return () => {
      clearInterval(memoryInterval);
      cancelAnimationFrame(animationId);
    };
  }, [visible]);

  if (!visible) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const heapPercent = perfData.heapTotal > 0 
    ? Math.round((perfData.heapUsed / perfData.heapTotal) * 100) 
    : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-discord-darker/95 backdrop-blur-sm border border-discord-lighter rounded-lg shadow-xl p-3 text-xs font-mono animate-slide-in">
      <div className="flex items-center gap-2 mb-2 text-discord-text-muted">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span className="font-semibold">Performance</span>
        <span className="text-[10px] opacity-50 ml-auto">F12 to close</span>
      </div>
      
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-discord-text-muted">FPS</span>
          <span className={`font-semibold ${fps >= 55 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-discord-danger'}`}>
            {fps}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-discord-text-muted">Uptime</span>
          <span className="text-discord-text">{formatTime(perfData.uptime)}</span>
        </div>
        
        <div className="col-span-2 mt-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-discord-text-muted">Heap</span>
            <span className="text-discord-text">
              {formatBytes(perfData.heapUsed)} / {formatBytes(perfData.heapTotal)}
            </span>
          </div>
          <div className="h-1.5 bg-discord-light rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${
                heapPercent > 80 ? 'bg-discord-danger' : 
                heapPercent > 60 ? 'bg-yellow-400' : 'bg-green-400'
              }`}
              style={{ width: `${heapPercent}%` }}
            />
          </div>
        </div>

        {perfData.external > 0 && (
          <div className="col-span-2 flex items-center justify-between">
            <span className="text-discord-text-muted">External</span>
            <span className="text-discord-text">{formatBytes(perfData.external)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformanceMonitor;
