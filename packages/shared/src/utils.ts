export function generateId(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).substring(2, 9)}`;
}

export function sanitizePath(path: string, projectRoot: string): string {
  const resolved = require('path').resolve(projectRoot, path);
  const normalizedRoot = require('path').resolve(projectRoot);
  
  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error(`Path traversal attempt detected: ${path}`);
  }
  
  return resolved;
}

export function isDangerousCommand(command: string): boolean {
  const dangerousPatterns = [
    /^rm\s+-rf\s+\//,
    /^rm\s+-rf\s+\*\*/,
    /^sudo\s+/,
    /^chmod\s+777/,
    /^chown\s+root/,
    />\s*\/dev\/(null|zero|random)/,
    /^\s*:\s*\(\s*\)\s*\{\s*:\|\:&\s*\}\s*;\s*/, // fork bomb
    /^dd\s+if=/,
    /^mkfs/,
    /^fdisk/,
    /^shutdown/,
    /^reboot/,
    /^halt/,
    /^poweroff/
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(command.trim()));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

export function parseJsonSafe<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function retry<T>(
  fn: () => Promise<T>,
  retries: number,
  delay: number = 1000
): Promise<T> {
  return fn().catch(err => {
    if (retries <= 0) throw err;
    return sleep(delay).then(() => retry(fn, retries - 1, delay * 2));
  });
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result;
}

export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    if (key in obj) result[key] = obj[key];
  });
  return result;
}