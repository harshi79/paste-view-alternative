import { headers } from 'next/headers';

/**
 * Returns the request's real IP. Behind Vercel/proxies this reads
 * x-forwarded-for (first value = original client). We deliberately
 * do NOT trust the spoofable `x-real-ip` or socket address because
 * Vercel doesn't expose the socket to route handlers in production.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  return '0.0.0.0';
}
