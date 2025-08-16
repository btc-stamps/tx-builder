/**
 * Type Guards Tests
 *
 * Tests for type guard functions and safe type conversion utilities.
 * These functions provide runtime type checking and safe fallbacks.
 */

import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';

import {
  getOptionalNumber,
  getOptionalString,
  isBuffer,
  isValidBuffer,
  safeNumber,
} from '../../../src/utils/type-guards';

describe('Type Guards', () => {
  describe('isBuffer', () => {
    it('should return true for valid Buffer instances', () => {
      expect(isBuffer(Buffer.alloc(0))).toBe(true);
      expect(isBuffer(Buffer.from('test'))).toBe(true);
      expect(isBuffer(Buffer.from([1, 2, 3, 4]))).toBe(true);
      expect(isBuffer(Buffer.allocUnsafe(10))).toBe(true);
    });

    it('should return false for non-Buffer values', () => {
      expect(isBuffer(null)).toBe(false);
      expect(isBuffer(undefined)).toBe(false);
      expect(isBuffer('string')).toBe(false);
      expect(isBuffer(123)).toBe(false);
      expect(isBuffer([])).toBe(false);
      expect(isBuffer({})).toBe(false);
      expect(isBuffer(new Uint8Array([1, 2, 3]))).toBe(false);
      expect(isBuffer(new ArrayBuffer(8))).toBe(false);
    });

    it('should work as a type guard', () => {
      const value: unknown = Buffer.from('test');

      if (isBuffer(value)) {
        // TypeScript should know this is a Buffer now
        expect(value.length).toBe(4);
        expect(value.toString()).toBe('test');
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should handle edge cases', () => {
      expect(isBuffer(0)).toBe(false);
      expect(isBuffer(false)).toBe(false);
      expect(isBuffer(Symbol('test'))).toBe(false);
      expect(isBuffer(function () {})).toBe(false);
    });
  });

  describe('safeNumber', () => {
    it('should return the number when value is a valid number', () => {
      expect(safeNumber(42)).toBe(42);
      expect(safeNumber(0)).toBe(0);
      expect(safeNumber(-123)).toBe(-123);
      expect(safeNumber(3.14159)).toBe(3.14159);
      expect(safeNumber(Infinity)).toBe(Infinity);
      expect(safeNumber(-Infinity)).toBe(-Infinity);
    });

    it('should return default value for non-numbers', () => {
      expect(safeNumber('string')).toBe(0);
      expect(safeNumber(null)).toBe(0);
      expect(safeNumber(undefined)).toBe(0);
      expect(safeNumber({})).toBe(0);
      expect(safeNumber([])).toBe(0);
      expect(safeNumber(true)).toBe(0);
      expect(safeNumber(false)).toBe(0);
    });

    it('should use custom default value when provided', () => {
      expect(safeNumber('string', 999)).toBe(999);
      expect(safeNumber(null, -1)).toBe(-1);
      expect(safeNumber(undefined, 42)).toBe(42);
      expect(safeNumber({}, 100)).toBe(100);
    });

    it('should handle NaN correctly', () => {
      // safeNumber returns NaN if the value is NaN (it's still a number type)
      expect(safeNumber(NaN)).toBe(NaN);
      expect(safeNumber(NaN, 123)).toBe(NaN); // Still returns NaN because it's a number
    });

    it('should handle special numeric values', () => {
      expect(safeNumber(Number.MAX_VALUE)).toBe(Number.MAX_VALUE);
      expect(safeNumber(Number.MIN_VALUE)).toBe(Number.MIN_VALUE);
      expect(safeNumber(Number.EPSILON)).toBe(Number.EPSILON);
    });

    it('should not coerce string numbers', () => {
      // These should NOT be converted - function only accepts actual numbers
      expect(safeNumber('42')).toBe(0);
      expect(safeNumber('3.14')).toBe(0);
      expect(safeNumber('0')).toBe(0);
      expect(safeNumber('-123')).toBe(0);
    });
  });

  describe('isValidBuffer', () => {
    it('should return true for non-empty Buffer instances', () => {
      expect(isValidBuffer(Buffer.from('test'))).toBe(true);
      expect(isValidBuffer(Buffer.from([1, 2, 3]))).toBe(true);
      expect(isValidBuffer(Buffer.alloc(1))).toBe(true);
      expect(isValidBuffer(Buffer.allocUnsafe(10))).toBe(true);
    });

    it('should return false for empty buffers', () => {
      expect(isValidBuffer(Buffer.alloc(0))).toBe(false);
      expect(isValidBuffer(Buffer.from(''))).toBe(false);
      expect(isValidBuffer(Buffer.from([]))).toBe(false);
    });

    it('should return false for non-Buffer values', () => {
      expect(isValidBuffer(null)).toBe(false);
      expect(isValidBuffer(undefined)).toBe(false);
      expect(isValidBuffer('string')).toBe(false);
      expect(isValidBuffer(123)).toBe(false);
      expect(isValidBuffer([])).toBe(false);
      expect(isValidBuffer({})).toBe(false);
      expect(isValidBuffer(new Uint8Array([1, 2, 3]))).toBe(false);
    });

    it('should work as a type guard', () => {
      const value: unknown = Buffer.from('test');

      if (isValidBuffer(value)) {
        // TypeScript should know this is a non-empty Buffer
        expect(value.length).toBeGreaterThan(0);
        expect(typeof value.toString).toBe('function');
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should distinguish between empty and non-empty buffers', () => {
      const emptyBuffer = Buffer.alloc(0);
      const nonEmptyBuffer = Buffer.from('x');

      expect(isBuffer(emptyBuffer)).toBe(true);
      expect(isValidBuffer(emptyBuffer)).toBe(false);

      expect(isBuffer(nonEmptyBuffer)).toBe(true);
      expect(isValidBuffer(nonEmptyBuffer)).toBe(true);
    });
  });

  describe('getOptionalNumber', () => {
    it('should return the number when value is a valid number', () => {
      expect(getOptionalNumber(42)).toBe(42);
      expect(getOptionalNumber(0)).toBe(0);
      expect(getOptionalNumber(-123)).toBe(-123);
      expect(getOptionalNumber(3.14159)).toBe(3.14159);
    });

    it('should return default value for non-numbers', () => {
      expect(getOptionalNumber('string')).toBe(0);
      expect(getOptionalNumber(null)).toBe(0);
      expect(getOptionalNumber(undefined)).toBe(0);
      expect(getOptionalNumber({})).toBe(0);
      expect(getOptionalNumber([])).toBe(0);
      expect(getOptionalNumber(true)).toBe(0);
    });

    it('should use custom default value when provided', () => {
      expect(getOptionalNumber('string', 999)).toBe(999);
      expect(getOptionalNumber(null, -1)).toBe(-1);
      expect(getOptionalNumber(undefined, 42)).toBe(42);
    });

    it('should handle NaN by returning default value', () => {
      expect(getOptionalNumber(NaN)).toBe(0);
      expect(getOptionalNumber(NaN, 123)).toBe(123);
    });

    it('should handle special numeric values correctly', () => {
      expect(getOptionalNumber(Infinity)).toBe(Infinity);
      expect(getOptionalNumber(-Infinity)).toBe(-Infinity);
      expect(getOptionalNumber(Number.MAX_VALUE)).toBe(Number.MAX_VALUE);
      expect(getOptionalNumber(Number.MIN_VALUE)).toBe(Number.MIN_VALUE);
    });

    it('should not coerce string numbers', () => {
      expect(getOptionalNumber('42')).toBe(0);
      expect(getOptionalNumber('3.14')).toBe(0);
      expect(getOptionalNumber('0')).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(getOptionalNumber(Symbol('test'))).toBe(0);
      expect(getOptionalNumber(function () {})).toBe(0);
      expect(getOptionalNumber(new Date())).toBe(0);
    });
  });

  describe('getOptionalString', () => {
    it('should return the string when value is a string', () => {
      expect(getOptionalString('hello')).toBe('hello');
      expect(getOptionalString('')).toBe('');
      expect(getOptionalString('   ')).toBe('   ');
      expect(getOptionalString('test string with spaces')).toBe('test string with spaces');
      expect(getOptionalString('123')).toBe('123');
    });

    it('should return default value for non-strings', () => {
      expect(getOptionalString(null)).toBe('');
      expect(getOptionalString(undefined)).toBe('');
      expect(getOptionalString(123)).toBe('');
      expect(getOptionalString({})).toBe('');
      expect(getOptionalString([])).toBe('');
      expect(getOptionalString(true)).toBe('');
      expect(getOptionalString(false)).toBe('');
    });

    it('should use custom default value when provided', () => {
      expect(getOptionalString(null, 'default')).toBe('default');
      expect(getOptionalString(undefined, 'fallback')).toBe('fallback');
      expect(getOptionalString(123, 'not a number')).toBe('not a number');
      expect(getOptionalString({}, 'empty object')).toBe('empty object');
    });

    it('should handle special string values', () => {
      expect(getOptionalString('null')).toBe('null');
      expect(getOptionalString('undefined')).toBe('undefined');
      expect(getOptionalString('false')).toBe('false');
      expect(getOptionalString('0')).toBe('0');
    });

    it('should not convert other types to strings', () => {
      // These should NOT be converted - function only accepts actual strings
      expect(getOptionalString(123)).toBe('');
      expect(getOptionalString(true)).toBe('');
      expect(getOptionalString(false)).toBe('');
      expect(getOptionalString(Symbol('test'))).toBe('');
    });

    it('should handle edge cases', () => {
      expect(getOptionalString(NaN)).toBe('');
      expect(getOptionalString(Infinity)).toBe('');
      expect(getOptionalString(Buffer.from('test'))).toBe('');
      expect(getOptionalString(new Date())).toBe('');
      expect(getOptionalString(function () {})).toBe('');
    });
  });

  describe('Integration and Type Safety', () => {
    it('should work together for complex type checking scenarios', () => {
      interface TestData {
        id?: unknown;
        name?: unknown;
        data?: unknown;
        count?: unknown;
      }

      const testData: TestData = {
        id: 123,
        name: 'test',
        data: Buffer.from('data'),
        count: undefined,
      };

      const safeId = getOptionalNumber(testData.id, -1);
      const safeName = getOptionalString(testData.name, 'unknown');
      const safeData = isValidBuffer(testData.data) ? testData.data : Buffer.alloc(0);
      const safeCount = getOptionalNumber(testData.count, 0);

      expect(safeId).toBe(123);
      expect(safeName).toBe('test');
      expect(safeData.toString()).toBe('data');
      expect(safeCount).toBe(0);
    });

    it('should provide type safety for transaction building scenarios', () => {
      // Simulate parsing user input for transaction building
      const userInput = {
        feeRate: '15', // String instead of number
        amount: 1000, // Correct number
        data: null, // Null instead of Buffer
        description: 'test', // Correct string
        priority: undefined, // Missing value
      };

      const safeFeeRate = getOptionalNumber(userInput.feeRate, 10);
      const safeAmount = getOptionalNumber(userInput.amount, 0);
      const safeData = isValidBuffer(userInput.data) ? userInput.data : Buffer.from('default');
      const safeDescription = getOptionalString(userInput.description, 'No description');
      const safePriority = getOptionalString(userInput.priority, 'medium');

      expect(safeFeeRate).toBe(10); // Used default because string not accepted
      expect(safeAmount).toBe(1000); // Used actual value
      expect(safeData.toString()).toBe('default'); // Used default buffer
      expect(safeDescription).toBe('test'); // Used actual value
      expect(safePriority).toBe('medium'); // Used default
    });

    it('should handle array and object edge cases consistently', () => {
      const testValues = [[], {}, new Map(), new Set()];

      testValues.forEach((value) => {
        expect(isBuffer(value)).toBe(false);
        expect(isValidBuffer(value)).toBe(false);
        expect(safeNumber(value)).toBe(0);
        expect(getOptionalNumber(value)).toBe(0);
        expect(getOptionalString(value)).toBe('');
      });
    });

    it('should maintain consistency across different falsy values', () => {
      const falsyValues = [null, undefined, false, 0, '', NaN];

      falsyValues.forEach((value) => {
        expect(isBuffer(value)).toBe(false);
        expect(isValidBuffer(value)).toBe(false);

        // Numbers should handle their own falsy values correctly
        if (typeof value === 'number') {
          expect(safeNumber(value)).toBe(value);
          expect(getOptionalNumber(value)).toBe(isNaN(value) ? 0 : value);
        } else {
          expect(safeNumber(value)).toBe(0);
          expect(getOptionalNumber(value)).toBe(0);
        }

        // Strings should handle their own falsy values correctly
        if (typeof value === 'string') {
          expect(getOptionalString(value)).toBe(value);
        } else {
          expect(getOptionalString(value)).toBe('');
        }
      });
    });
  });

  describe('Performance and Memory Considerations', () => {
    it('should handle large buffers efficiently', () => {
      const largeBuffer = Buffer.alloc(100000); // 100KB buffer

      expect(isBuffer(largeBuffer)).toBe(true);
      expect(isValidBuffer(largeBuffer)).toBe(true);

      // Should not throw or timeout
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        isBuffer(largeBuffer);
        isValidBuffer(largeBuffer);
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // Should be very fast
    });

    it('should handle many calls efficiently', () => {
      const testValues = [123, 'test', null, undefined, [], {}];

      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        testValues.forEach((value) => {
          safeNumber(value);
          getOptionalNumber(value);
          getOptionalString(value);
          isBuffer(value);
        });
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000); // Should complete quickly
    });
  });
});
