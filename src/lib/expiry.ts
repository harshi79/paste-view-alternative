/** Client-safe paste constants (no database imports). */

export const EXPIRY_OPTIONS = [
  { id: 'never', label: 'Never', seconds: 0 },
  { id: '10min', label: '10 minutes', seconds: 10 * 60 },
  { id: '1h', label: '1 hour', seconds: 3600 },
  { id: '1d', label: '1 day', seconds: 86400 },
  { id: '1w', label: '1 week', seconds: 7 * 86400 },
  { id: '1m', label: '1 month', seconds: 30 * 86400 },
] as const;

export type ExpiryId = (typeof EXPIRY_OPTIONS)[number]['id'];

export function expiryFromId(id: string | undefined | null): Date | null {
  const opt = EXPIRY_OPTIONS.find((o) => o.id === id);
  if (!opt || opt.seconds === 0) return null;
  return new Date(Date.now() + opt.seconds * 1000);
}

export function isExpiredDate(p: { expiresAt: Date | null }): boolean {
  return !!p.expiresAt && p.expiresAt.getTime() <= Date.now();
}
