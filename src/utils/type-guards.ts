/**
 * Type guards and safe type conversion utilities
 */

import { Buffer } from 'node:buffer';

export function isBuffer(value: unknown): value is Buffer {
  return value instanceof Buffer;
}

export function safeNumber(value: unknown, defaultValue = 0): number {
  return typeof value === 'number' ? value : defaultValue;
}

export function isValidBuffer(buffer: unknown): buffer is Buffer {
  return buffer instanceof Buffer && buffer.length > 0;
}

export function getOptionalNumber(value: unknown, defaultValue = 0): number {
  return typeof value === 'number' && !isNaN(value) ? value : defaultValue;
}

export function getOptionalString(value: unknown, defaultValue = ''): string {
  return typeof value === 'string' ? value : defaultValue;
}
