/**
 * Timer Utils Tests
 *
 * Tests for cross-platform timer utilities that work in both Deno and Node.js.
 * These functions provide compatibility wrappers around standard timer functions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearIntervalCompat,
  clearTimeoutCompat,
  setIntervalCompat,
  setTimeoutCompat,
  type TimerId,
} from '../../../src/utils/timer-utils';

describe('Timer Utils', () => {
  let timers: TimerId[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    timers = [];
  });

  afterEach(() => {
    // Clean up any timers created during tests
    timers.forEach((timer) => {
      clearTimeoutCompat(timer);
      clearIntervalCompat(timer);
    });
    timers = [];
    vi.useRealTimers();
  });

  describe('setTimeoutCompat', () => {
    it('should execute callback after specified delay', () => {
      const callback = vi.fn();
      const timer = setTimeoutCompat(callback, 1000);
      timers.push(timer);

      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledOnce();
    });

    it('should return a timer ID', () => {
      const callback = vi.fn();
      const timer = setTimeoutCompat(callback, 100);
      timers.push(timer);

      expect(timer).toBeDefined();
      expect(typeof timer === 'number' || typeof timer === 'object').toBe(true);
    });

    it('should handle zero delay', () => {
      const callback = vi.fn();
      const timer = setTimeoutCompat(callback, 0);
      timers.push(timer);

      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(0);

      expect(callback).toHaveBeenCalledOnce();
    });

    it('should handle multiple timers', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const timer1 = setTimeoutCompat(callback1, 500);
      const timer2 = setTimeoutCompat(callback2, 1000);
      timers.push(timer1, timer2);

      vi.advanceTimersByTime(500);
      expect(callback1).toHaveBeenCalledOnce();
      expect(callback2).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);
      expect(callback2).toHaveBeenCalledOnce();
    });
  });

  describe('setIntervalCompat', () => {
    it('should execute callback repeatedly at specified interval', () => {
      const callback = vi.fn();
      const timer = setIntervalCompat(callback, 500);
      timers.push(timer);

      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(4);
    });

    it('should return a timer ID', () => {
      const callback = vi.fn();
      const timer = setIntervalCompat(callback, 100);
      timers.push(timer);

      expect(timer).toBeDefined();
      expect(typeof timer === 'number' || typeof timer === 'object').toBe(true);
    });

    it('should handle multiple intervals', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const timer1 = setIntervalCompat(callback1, 200);
      const timer2 = setIntervalCompat(callback2, 300);
      timers.push(timer1, timer2);

      vi.advanceTimersByTime(600);
      expect(callback1).toHaveBeenCalledTimes(3); // 200ms, 400ms, 600ms
      expect(callback2).toHaveBeenCalledTimes(2); // 300ms, 600ms
    });
  });

  describe('clearTimeoutCompat', () => {
    it('should clear a timeout before it executes', () => {
      const callback = vi.fn();
      const timer = setTimeoutCompat(callback, 1000);

      clearTimeoutCompat(timer);

      vi.advanceTimersByTime(1000);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle undefined timer ID safely', () => {
      expect(() => clearTimeoutCompat(undefined)).not.toThrow();
    });

    it('should handle null timer ID safely', () => {
      expect(() => clearTimeoutCompat(null as any)).not.toThrow();
    });

    it('should handle already cleared timer safely', () => {
      const callback = vi.fn();
      const timer = setTimeoutCompat(callback, 1000);

      clearTimeoutCompat(timer);
      expect(() => clearTimeoutCompat(timer)).not.toThrow();
    });

    it('should work with different timer ID types', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const timer1 = setTimeoutCompat(callback1, 1000);
      const timer2 = setTimeoutCompat(callback2, 1000);

      expect(() => {
        clearTimeoutCompat(timer1);
        clearTimeoutCompat(timer2);
      }).not.toThrow();
    });
  });

  describe('clearIntervalCompat', () => {
    it('should clear an interval before it executes', () => {
      const callback = vi.fn();
      const timer = setIntervalCompat(callback, 500);

      clearIntervalCompat(timer);

      vi.advanceTimersByTime(1000);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should stop a running interval', () => {
      const callback = vi.fn();
      const timer = setIntervalCompat(callback, 500);

      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(2);

      clearIntervalCompat(timer);

      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(2); // Should not increase
    });

    it('should handle undefined timer ID safely', () => {
      expect(() => clearIntervalCompat(undefined)).not.toThrow();
    });

    it('should handle null timer ID safely', () => {
      expect(() => clearIntervalCompat(null as any)).not.toThrow();
    });

    it('should handle already cleared timer safely', () => {
      const callback = vi.fn();
      const timer = setIntervalCompat(callback, 500);

      clearIntervalCompat(timer);
      expect(() => clearIntervalCompat(timer)).not.toThrow();
    });

    it('should work with different timer ID types', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const timer1 = setIntervalCompat(callback1, 500);
      const timer2 = setIntervalCompat(callback2, 500);

      expect(() => {
        clearIntervalCompat(timer1);
        clearIntervalCompat(timer2);
      }).not.toThrow();
    });
  });

  describe('Cross-platform compatibility', () => {
    it('should handle timer cleanup in mixed scenarios', () => {
      const timeoutCallback = vi.fn();
      const intervalCallback = vi.fn();

      const timeout = setTimeoutCompat(timeoutCallback, 1000);
      const interval = setIntervalCompat(intervalCallback, 500);

      vi.advanceTimersByTime(750);
      expect(intervalCallback).toHaveBeenCalledOnce();
      expect(timeoutCallback).not.toHaveBeenCalled();

      clearTimeoutCompat(timeout);
      clearIntervalCompat(interval);

      vi.advanceTimersByTime(1000);
      expect(intervalCallback).toHaveBeenCalledOnce(); // Should not increase
      expect(timeoutCallback).not.toHaveBeenCalled(); // Should never be called
    });

    it('should work with rapid timer creation and clearing', () => {
      const callbacks = Array.from({ length: 10 }, () => vi.fn());
      const timers: TimerId[] = [];

      // Create multiple timers rapidly
      callbacks.forEach((callback, index) => {
        timers.push(setTimeoutCompat(callback, (index + 1) * 100));
      });

      // Clear half of them
      timers.slice(0, 5).forEach((timer) => clearTimeoutCompat(timer));

      vi.advanceTimersByTime(1000);

      // First 5 should not have been called
      callbacks.slice(0, 5).forEach((callback) => {
        expect(callback).not.toHaveBeenCalled();
      });

      // Last 5 should have been called
      callbacks.slice(5).forEach((callback) => {
        expect(callback).toHaveBeenCalledOnce();
      });

      // Clean up remaining timers
      timers.slice(5).forEach((timer) => clearTimeoutCompat(timer));
    });

    it('should maintain type safety with TimerId', () => {
      // Test that the TimerId type works correctly
      const callback = vi.fn();
      const timer: TimerId = setTimeoutCompat(callback, 100);

      // Should be able to pass TimerId to clear functions
      clearTimeoutCompat(timer);
      clearIntervalCompat(timer); // Should also work (defensive)

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle very short timeouts', () => {
      const callback = vi.fn();
      const timer = setTimeoutCompat(callback, 1);
      timers.push(timer);

      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should handle very short intervals', () => {
      const callback = vi.fn();
      const timer = setIntervalCompat(callback, 1);
      timers.push(timer);

      vi.advanceTimersByTime(5);
      expect(callback).toHaveBeenCalledTimes(5);
    });

    it('should handle callback exceptions as expected', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Test error');
      });
      const normalCallback = vi.fn();

      const timer1 = setTimeoutCompat(errorCallback, 100);
      const timer2 = setTimeoutCompat(normalCallback, 200);
      timers.push(timer1, timer2);

      // Advance to trigger the error callback
      expect(() => vi.advanceTimersByTime(100)).toThrow('Test error');
      expect(errorCallback).toHaveBeenCalledOnce();

      // Advance to trigger the normal callback
      expect(() => vi.advanceTimersByTime(100)).not.toThrow();
      expect(normalCallback).toHaveBeenCalledOnce();
    });
  });
});
