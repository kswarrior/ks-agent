import path from 'node:path'

/**
 * Resolves `rel` inside `root`, returning null when it escapes the root
 * (traversal via .., absolute paths, etc.). Used by every filesystem surface.
 */
export function resolveInProject(root: string, rel: string): string | null {
  const absRoot = path.resolve(root)
  const abs = path.resolve(absRoot, rel)
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) return null
  return abs
}

export function relWithin(root: string, abs: string): string {
  return path.relative(path.resolve(root), abs).split(path.sep).join('/')
}

/** A single safe path segment: no separators, no dot entries, no NUL. */
export function validSegment(name: string): boolean {
  return (
    !!name &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('\0') &&
    name.trim() === name
  )
}
