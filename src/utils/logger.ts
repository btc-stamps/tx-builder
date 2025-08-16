/**
 * Logger interface for type-safe logging
 */
export interface Logger {
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug?(message: string, context?: Record<string, unknown>): void;
}

/**
 * Simple console-based logger implementation
 */
export class ConsoleLogger implements Logger {
  warn(message: string, context?: Record<string, unknown>): void {
    if (context !== undefined) {
      console.warn(message, context);
    } else {
      console.warn(message);
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (context !== undefined) {
      console.error(message, context);
    } else {
      console.error(message);
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (context !== undefined) {
      console.info(message, context);
    } else {
      console.info(message);
    }
  }

  debug?(message: string, context?: Record<string, unknown>): void {
    if (context !== undefined) {
      console.debug(message, context);
    } else {
      console.debug(message);
    }
  }
}
