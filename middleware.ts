import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getAuthSecretOrNull } from './src/lib/secret';

/**
 * No fallback secret: when AUTH_SECRET is missing, weak, or a known
 * compromised value this is null and every presented token is rejected
 * (protected pages redirect to login / admin login).
 */
function getSecret(): Uint8Array | null {
  return getAuthSecretOrNull();
}

/**
 * Edge guard for authenticated pages.
 * - /dashboard, /settings, /account → require vb_session (user cookie).
 * - /admin (everything except /admin/login) → require vb_admin cookie.
 * Other routes (including /admin/login) are not gated here — the
 * server components do the check themselves so they can render
 * informative messages when the cookie is missing.
 */
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const secret = getSecret();

  if (path.startsWith('/admin') && path !== '/admin/login') {
    const token = req.cookies.get('vb_admin')?.value;
    let ok = false;
    if (token && secret) {
      try {
        const { payload } = await jwtVerify(token, secret);
        ok = payload.admin === true;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      const url = new URL('/admin/login', req.url);
      url.searchParams.set('next', path);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (
    path.startsWith('/dashboard') ||
    path.startsWith('/settings') ||
    path.startsWith('/account')
  ) {
    const token = req.cookies.get('vb_session')?.value;
    let ok = false;
    if (token && secret) {
      try {
        await jwtVerify(token, secret);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      const url = new URL('/login', req.url);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/settings',
    '/settings/:path*',
    '/account',
    '/account/:path*',
    '/admin',
    '/admin/:path*',
  ],
};
