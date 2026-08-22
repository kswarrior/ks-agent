import { randomBytes } from 'crypto';

export function randomId(prefix = ''): string {
  const hex = randomBytes(8).toString('hex');
  return prefix ? `${prefix}_${hex}` : hex;
}
