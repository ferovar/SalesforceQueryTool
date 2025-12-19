import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import PerformanceMonitor from '../PerformanceMonitor';

// Mock the window.electronAPI
const mockGetPerformanceData = jest.fn().mockResolvedValue({
  heapUsed: 50 * 1024 * 1024, // 50 MB
  heapTotal: 100 * 1024 * 1024, // 100 MB
  external: 10 * 1024 * 1024, // 10 MB
  uptime: 3661, // ~1 hour
});

beforeEach(() => {
  (window as any).electronAPI = {
    getPerformanceData: mockGetPerformanceData,
  };
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PerformanceMonitor', () => {
  it('should not render when visible is false', () => {
    render(<PerformanceMonitor visible={false} />);
    expect(screen.queryByText('Performance')).not.toBeInTheDocument();
  });

  it('should render when visible is true', async () => {
    render(<PerformanceMonitor visible={true} />);
    
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('F12 to close')).toBeInTheDocument();
  });

  it('should show FPS counter', async () => {
    render(<PerformanceMonitor visible={true} />);
    expect(screen.getByText('FPS')).toBeInTheDocument();
  });

  it('should show uptime', async () => {
    render(<PerformanceMonitor visible={true} />);
    expect(screen.getByText('Uptime')).toBeInTheDocument();
  });

  it('should show heap memory usage', async () => {
    render(<PerformanceMonitor visible={true} />);
    expect(screen.getByText('Heap')).toBeInTheDocument();
  });

  it('should fetch performance data on interval', async () => {
    render(<PerformanceMonitor visible={true} />);
    
    // Initial call should happen
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    
    expect(mockGetPerformanceData).toHaveBeenCalled();
  });

  it('should stop fetching when hidden', async () => {
    const { rerender } = render(<PerformanceMonitor visible={true} />);
    
    // Advance timers to trigger fetch
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    
    const callCountWhenVisible = mockGetPerformanceData.mock.calls.length;
    
    // Hide the monitor
    rerender(<PerformanceMonitor visible={false} />);
    
    // Advance timers
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    
    // No additional calls should have been made
    expect(mockGetPerformanceData.mock.calls.length).toBe(callCountWhenVisible);
  });
});
