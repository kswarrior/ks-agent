import { realpathSync, existsSync, statSync } from 'fs';
import { resolve, sep, relative, normalize, isAbsolute } from 'path';

export interface PathSafetyResult {
  safe: boolean;
  resolved: string;
  relative: string;
  reason?: string;
}

export function safeResolve(rootDir: string, target: string): PathSafetyResult {
  try {
    const absRoot = resolve(rootDir);
    const cleaned = normalize(target);
    let absTarget: string;
    if (isAbsolute(cleaned)) {
      absTarget = cleaned;
    } else {
      absTarget = resolve(absRoot, cleaned);
    }

    // Resolve symlinks when possible
    let realTarget = absTarget;
    try {
      if (existsSync(absTarget)) {
        realTarget = realpathSync(absTarget);
      }
    } catch (_e) {
      // ignore
    }

    let realRoot = absRoot;
    try {
      if (existsSync(absRoot)) {
        realRoot = realpathSync(absRoot);
      }
    } catch (_e) {
      // ignore
    }

    const rel = relative(realRoot, realTarget);

    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      return { safe: true, resolved: realTarget, relative: rel || '.' };
    }

    return {
      safe: false,
      resolved: realTarget,
      relative: rel,
      reason: `Path "${target}" escapes project root`,
    };
  } catch (e: any) {
    return {
      safe: false,
      resolved: target,
      relative: target,
      reason: e?.message ?? 'Invalid path',
    };
  }
}

export function isPathSafe(rootDir: string, target: string): boolean {
  return safeResolve(rootDir, target).safe;
}

export function ensureWithinRoot(rootDir: string, target: string): string {
  const r = safeResolve(rootDir, target);
  if (!r.safe) {
    throw new Error(r.reason || 'Path outside project root');
  }
  return r.resolved;
}
