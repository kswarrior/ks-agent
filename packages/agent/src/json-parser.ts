/**
 * Parse a JSON object embedded in a model response. Robust to:
 *  - ```json ... ``` fences
 *  - leading/trailing text
 *  - partial trailing commas
 */
export function extractJson<T = any>(text: string): T | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const parsed = safeParse(fence[1]);
    if (parsed !== undefined) return parsed as T;
  }
  // Find first { ... last } that balances
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  let candidate = text.slice(start, end + 1);
  candidate = candidate.replace(/,\s*([}\]])/g, '$1');
  const parsed = safeParse(candidate);
  if (parsed !== undefined) return parsed as T;
  // Try progressively shrinking until balanced
  for (let i = end; i > start; i--) {
    if (text[i] === '}') {
      const c = text.slice(start, i + 1).replace(/,\s*([}\]])/g, '$1');
      const p = safeParse(c);
      if (p !== undefined) return p as T;
    }
  }
  return null;
}

function safeParse(text: string): any | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
