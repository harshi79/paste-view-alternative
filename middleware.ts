import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'vibebin-dev-secret-do-not-use-in-production-change-me',
);

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

  if (path.startsWith('/admin') && path !== '/admin/login') {
    const token = req.cookies.get('vb_admin')?.value;
    let ok = false;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, SECRET);
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
    if (token) {
      try {
        await jwtVerify(token, SECRET);
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
    '/dashboard/:path*',
    '/settings/:path*',
    '/account/:path*',
    '/admin',
    '/admin/:path*',
  ],
};
