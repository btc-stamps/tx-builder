/**
 * Logger Tests
 *
 * Tests for type-safe logging interface and console logger implementation.
 * Validates proper logging behavior and context handling.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsoleLogger, Logger } from '../../../src/utils/logger';

describe('Logger', () => {
  let logger: ConsoleLogger;
  let consoleSpy: {
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    debug: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    logger = new ConsoleLogger();

    // Spy on console methods
    consoleSpy = {
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    // Restore all console spies
    Object.values(consoleSpy).forEach((spy) => spy.mockRestore());
  });

  describe('ConsoleLogger', () => {
    it('should implement Logger interface', () => {
      expect(logger).toBeInstanceOf(ConsoleLogger);
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    describe('warn method', () => {
      it('should log warning message without context', () => {
        const message = 'Test warning message';

        logger.warn(message);

        expect(consoleSpy.warn).toHaveBeenCalledOnce();
        expect(consoleSpy.warn).toHaveBeenCalledWith(message);
      });

      it('should log warning message with context', () => {
        const message = 'Test warning with context';
        const context = { userId: 123, action: 'test' };

        logger.warn(message, context);

        expect(consoleSpy.warn).toHaveBeenCalledOnce();
        expect(consoleSpy.warn).toHaveBeenCalledWith(message, context);
      });

      it('should handle empty context object', () => {
        const message = 'Test warning';
        const context = {};

        logger.warn(message, context);

        expect(consoleSpy.warn).toHaveBeenCalledOnce();
        expect(consoleSpy.warn).toHaveBeenCalledWith(message, context);
      });

      it('should handle undefined context explicitly', () => {
        const message = 'Test warning';

        logger.warn(message, undefined);

        expect(consoleSpy.warn).toHaveBeenCalledOnce();
        expect(consoleSpy.warn).toHaveBeenCalledWith(message);
      });
    });

    describe('error method', () => {
      it('should log error message without context', () => {
        const message = 'Test error message';

        logger.error(message);

        expect(consoleSpy.error).toHaveBeenCalledOnce();
        expect(consoleSpy.error).toHaveBeenCalledWith(message);
      });

      it('should log error message with context', () => {
        const message = 'Test error with context';
        const context = { errorCode: 500, stack: 'trace' };

        logger.error(message, context);

        expect(consoleSpy.error).toHaveBeenCalledOnce();
        expect(consoleSpy.error).toHaveBeenCalledWith(message, context);
      });

      it('should handle complex context objects', () => {
        const message = 'Complex error';
        const context = {
          error: new Error('Original error'),
          metadata: { timestamp: Date.now(), version: '1.0.0' },
          nested: { deep: { value: 'test' } },
        };

        logger.error(message, context);

        expect(consoleSpy.error).toHaveBeenCalledOnce();
        expect(consoleSpy.error).toHaveBeenCalledWith(message, context);
      });
    });

    describe('info method', () => {
      it('should log info message without context', () => {
        const message = 'Test info message';

        logger.info(message);

        expect(consoleSpy.info).toHaveBeenCalledOnce();
        expect(consoleSpy.info).toHaveBeenCalledWith(message);
      });

      it('should log info message with context', () => {
        const message = 'Test info with context';
        const context = { operation: 'test', duration: 123 };

        logger.info(message, context);

        expect(consoleSpy.info).toHaveBeenCalledOnce();
        expect(consoleSpy.info).toHaveBeenCalledWith(message, context);
      });

      it('should handle null context safely', () => {
        const message = 'Test info';

        logger.info(message, null as any);

        expect(consoleSpy.info).toHaveBeenCalledOnce();
        expect(consoleSpy.info).toHaveBeenCalledWith(message, null);
      });
    });

    describe('debug method', () => {
      it('should log debug message without context', () => {
        const message = 'Test debug message';

        logger.debug!(message);

        expect(consoleSpy.debug).toHaveBeenCalledOnce();
        expect(consoleSpy.debug).toHaveBeenCalledWith(message);
      });

      it('should log debug message with context', () => {
        const message = 'Test debug with context';
        const context = { trace: true, level: 'verbose' };

        logger.debug!(message, context);

        expect(consoleSpy.debug).toHaveBeenCalledOnce();
        expect(consoleSpy.debug).toHaveBeenCalledWith(message, context);
      });

      it('should be optional (marked with ?)', () => {
        // Verify debug is optional in the interface
        const mockLogger: Logger = {
          warn: vi.fn(),
          error: vi.fn(),
          info: vi.fn(),
          // debug is optional - not required
        };

        expect(mockLogger.debug).toBeUndefined();
        expect(typeof mockLogger.warn).toBe('function');
        expect(typeof mockLogger.error).toBe('function');
        expect(typeof mockLogger.info).toBe('function');
      });
    });

    describe('Multiple log calls', () => {
      it('should handle multiple warn calls', () => {
        logger.warn('First warning');
        logger.warn('Second warning', { id: 1 });
        logger.warn('Third warning', { id: 2 });

        expect(consoleSpy.warn).toHaveBeenCalledTimes(3);
        expect(consoleSpy.warn).toHaveBeenNthCalledWith(1, 'First warning');
        expect(consoleSpy.warn).toHaveBeenNthCalledWith(2, 'Second warning', { id: 1 });
        expect(consoleSpy.warn).toHaveBeenNthCalledWith(3, 'Third warning', { id: 2 });
      });

      it('should handle mixed log levels', () => {
        logger.info('Starting operation');
        logger.warn('Something suspicious');
        logger.error('Operation failed');
        logger.debug!('Debug information');

        expect(consoleSpy.info).toHaveBeenCalledWith('Starting operation');
        expect(consoleSpy.warn).toHaveBeenCalledWith('Something suspicious');
        expect(consoleSpy.error).toHaveBeenCalledWith('Operation failed');
        expect(consoleSpy.debug).toHaveBeenCalledWith('Debug information');
      });

      it('should maintain separate call counts per level', () => {
        logger.info('Info 1');
        logger.warn('Warn 1');
        logger.info('Info 2');
        logger.error('Error 1');
        logger.warn('Warn 2');

        expect(consoleSpy.info).toHaveBeenCalledTimes(2);
        expect(consoleSpy.warn).toHaveBeenCalledTimes(2);
        expect(consoleSpy.error).toHaveBeenCalledTimes(1);
        expect(consoleSpy.debug).toHaveBeenCalledTimes(0);
      });
    });

    describe('Context object handling', () => {
      it('should handle various context data types', () => {
        const contexts = [
          { string: 'value' },
          { number: 42 },
          { boolean: true },
          { array: [1, 2, 3] },
          { object: { nested: 'value' } },
          { null_value: null },
          { undefined_value: undefined },
          { date: new Date('2023-01-01') },
        ];

        contexts.forEach((context, index) => {
          logger.info(`Test ${index}`, context);
        });

        expect(consoleSpy.info).toHaveBeenCalledTimes(contexts.length);
        contexts.forEach((context, index) => {
          expect(consoleSpy.info).toHaveBeenNthCalledWith(index + 1, `Test ${index}`, context);
        });
      });

      it('should preserve context object references', () => {
        const context = { mutable: 'value' };
        logger.info('Test', context);

        // Modify the original object
        context.mutable = 'changed';

        // The logged context should maintain the reference
        const [, loggedContext] = consoleSpy.info.mock.calls[0];
        expect(loggedContext).toBe(context);
        expect(loggedContext.mutable).toBe('changed');
      });
    });

    describe('Interface compliance', () => {
      it('should work as Logger interface', () => {
        const loggerAsInterface: Logger = new ConsoleLogger();

        expect(() => {
          loggerAsInterface.warn('test warn');
          loggerAsInterface.error('test error');
          loggerAsInterface.info('test info');
          if (loggerAsInterface.debug) {
            loggerAsInterface.debug('test debug');
          }
        }).not.toThrow();

        expect(consoleSpy.warn).toHaveBeenCalledWith('test warn');
        expect(consoleSpy.error).toHaveBeenCalledWith('test error');
        expect(consoleSpy.info).toHaveBeenCalledWith('test info');
        expect(consoleSpy.debug).toHaveBeenCalledWith('test debug');
      });

      it('should accept custom logger implementations', () => {
        const customLogger: Logger = {
          warn: vi.fn(),
          error: vi.fn(),
          info: vi.fn(),
          debug: vi.fn(),
        };

        customLogger.warn('custom warn', { custom: true });
        customLogger.error('custom error');
        customLogger.info('custom info', { type: 'custom' });
        customLogger.debug!('custom debug');

        expect(customLogger.warn).toHaveBeenCalledWith('custom warn', { custom: true });
        expect(customLogger.error).toHaveBeenCalledWith('custom error');
        expect(customLogger.info).toHaveBeenCalledWith('custom info', { type: 'custom' });
        expect(customLogger.debug).toHaveBeenCalledWith('custom debug');
      });
    });

    describe('Edge cases', () => {
      it('should handle empty string messages', () => {
        logger.warn('');
        logger.error('');
        logger.info('');
        logger.debug!('');

        expect(consoleSpy.warn).toHaveBeenCalledWith('');
        expect(consoleSpy.error).toHaveBeenCalledWith('');
        expect(consoleSpy.info).toHaveBeenCalledWith('');
        expect(consoleSpy.debug).toHaveBeenCalledWith('');
      });

      it('should handle very long messages', () => {
        const longMessage = 'x'.repeat(10000);

        logger.info(longMessage);

        expect(consoleSpy.info).toHaveBeenCalledWith(longMessage);
      });

      it('should handle special characters in messages', () => {
        const specialMessage = 'Message with\nnewlines\tand\rtabs and unicode: 🚀 émojis';

        logger.info(specialMessage);

        expect(consoleSpy.info).toHaveBeenCalledWith(specialMessage);
      });

      it('should handle circular references in context', () => {
        const context: any = { name: 'test' };
        context.self = context; // Create circular reference

        expect(() => {
          logger.info('Circular context', context);
        }).not.toThrow();

        expect(consoleSpy.info).toHaveBeenCalledWith('Circular context', context);
      });
    });
  });
});
