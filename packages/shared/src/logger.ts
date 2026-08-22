export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: any;
  scope?: string;
}

class Logger {
  private listeners: Set<(entry: LogEntry) => void> = new Set();
  private minLevel: LogLevel = 'info';
  private static instance: Logger | null = null;

  static get(): Logger {
    if (!Logger.instance) Logger.instance = new Logger();
    return Logger.instance;
  }

  setLevel(level: LogLevel) {
    this.minLevel = level;
  }

  on(listener: (entry: LogEntry) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(entry: LogEntry) {
    const order: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    if (order.indexOf(entry.level) < order.indexOf(this.minLevel)) return;
    const ts = entry.timestamp;
    const line = `[${ts}] ${entry.level.toUpperCase()} ${entry.scope ? `[${entry.scope}] ` : ''}${entry.message}`;
    if (entry.level === 'error') {
      console.error(line, entry.data ?? '');
    } else if (entry.level === 'warn') {
      console.warn(line, entry.data ?? '');
    } else {
      console.log(line, entry.data ?? '');
    }
    for (const l of this.listeners) {
      try {
        l(entry);
      } catch (e) {
        console.error('Logger listener failed', e);
      }
    }
  }

  debug(message: string, data?: any, scope?: string) {
    this.emit({ level: 'debug', message, data, scope, timestamp: new Date().toISOString() });
  }

  info(message: string, data?: any, scope?: string) {
    this.emit({ level: 'info', message, data, scope, timestamp: new Date().toISOString() });
  }

  warn(message: string, data?: any, scope?: string) {
    this.emit({ level: 'warn', message, data, scope, timestamp: new Date().toISOString() });
  }

  error(message: string, data?: any, scope?: string) {
    this.emit({ level: 'error', message, data, scope, timestamp: new Date().toISOString() });
  }
}

export const logger = Logger.get();
