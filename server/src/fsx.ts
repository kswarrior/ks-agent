import fs from 'node:fs'
import path from 'node:path'

/**
 * Resolves `rel` inside `root`, returning null when it escapes the root
 * (traversal via .., absolute paths, etc.). Used by every filesystem surface.
 * Also prevents symlink escape: if the target or its parent is a symlink
 * pointing outside the project, it is rejected.
 */
export function resolveInProject(root: string, rel: string): string | null {
  const absRoot = path.resolve(root)
  const abs = path.resolve(absRoot, rel)
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) return null
  // Symlink protection: ensure realpath stays within project
  try {
    const realRoot = fs.realpathSync(absRoot)
    // If target exists, check its realpath
    if (fs.existsSync(abs)) {
      const realAbs = fs.realpathSync(abs)
      if (realAbs !== realRoot && !realAbs.startsWith(realRoot + path.sep)) return null
    } else {
      // For non-existent targets (e.g. new file), check parent realpath
      const parent = path.dirname(abs)
      if (fs.existsSync(parent)) {
        const realParent = fs.realpathSync(parent)
        // Reconstruct expected real path via parent + basename
        const realAbsViaParent = path.join(realParent, path.basename(abs))
        // If parent is already outside, reject; else if basename is symlink that would point outside, the final realpath check on next access will catch it,
        // but we can at least ensure parent is within project
        if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) return null
        // Also if the parent's realpath plus basename would be outside due to symlink parent, above already covers
        // For extra safety, if the file will be created as symlink later, its realpath will be checked on read
        void realAbsViaParent
      }
    }
  } catch {
    // If realpath fails (e.g. broken symlink, permission), fall back to string check already done
  }
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
