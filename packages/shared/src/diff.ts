export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffResult {
  before: string;
  after: string;
  lines: DiffLine[];
  added: number;
  removed: number;
}

function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.split(/\r?\n/);
}

/** Beyond this many lines per side, LCS is O(n²) in time/memory — fall back to a coarse diff. */
const MAX_LCS_LINES = 4000;

/**
 * Compute a minimal line-level diff using LCS. For very large inputs it
 * degrades gracefully to a remove-all/add-all diff instead of exhausting
 * memory.
 */
export function computeDiff(before: string, after: string): DiffResult {
  const a = splitLines(before);
  const b = splitLines(after);
  const m = a.length;
  const n = b.length;

  if (m > MAX_LCS_LINES || n > MAX_LCS_LINES) {
    const lines: DiffLine[] = [];
    for (let i = 0; i < m; i++) lines.push({ type: 'remove', text: a[i], oldLine: i + 1 });
    for (let j = 0; j < n; j++) lines.push({ type: 'add', text: b[j], newLine: j + 1 });
    return { before, after, lines, added: n, removed: m };
  }

  // LCS dp matrix
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      lines.push({ type: 'context', text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'remove', text: a[i], oldLine: i + 1 });
      removed++;
      i++;
    } else {
      lines.push({ type: 'add', text: b[j], newLine: j + 1 });
      added++;
      j++;
    }
  }
  while (i < m) {
    lines.push({ type: 'remove', text: a[i], oldLine: i + 1 });
    removed++;
    i++;
  }
  while (j < n) {
    lines.push({ type: 'add', text: b[j], newLine: j + 1 });
    added++;
    j++;
  }

  return { before, after, lines, added, removed };
}

export function formatUnifiedDiff(filePath: string, diff: DiffResult): string {
  const out: string[] = [];
  out.push(`--- a/${filePath}`);
  out.push(`+++ b/${filePath}`);
  for (const line of diff.lines) {
    if (line.type === 'add') out.push(`+${line.text}`);
    else if (line.type === 'remove') out.push(`-${line.text}`);
    else out.push(` ${line.text}`);
  }
  return out.join('\n');
}
