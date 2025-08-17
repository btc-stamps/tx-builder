/**
 * Cross-platform timer utilities for Deno and Node compatibility
 * 
 * Timer handling differences:
 * - Node.js: setTimeout/setInterval return NodeJS.Timeout objects
 * - Deno: setTimeout/setInterval return number IDs
 * - Browser: setTimeout/setInterval return number IDs
 * 
 * This module provides a unified interface that works across all platforms.
 */

// Use conditional type based on runtime
export type TimerId = number;

/**
 * Cross-platform clearTimeout that works in both Deno and Node
 */
export function clearTimeoutCompat(id: TimerId | undefined): void {
  if (id !== undefined) {
    clearTimeout(id as any);
  }
}

/**
 * Cross-platform clearInterval that works in both Deno and Node
 */
export function clearIntervalCompat(id: TimerId | undefined): void {
  if (id !== undefined) {
    clearInterval(id as any);
  }
}

/**
 * Cross-platform setTimeout wrapper
 */
export function setTimeoutCompat(callback: () => void, ms: number): TimerId {
  return setTimeout(callback, ms) as TimerId;
}

/**
 * Cross-platform setInterval wrapper
 */
export function setIntervalCompat(callback: () => void, ms: number): TimerId {
  return setInterval(callback, ms) as TimerId;
}
