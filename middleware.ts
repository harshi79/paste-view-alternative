import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'vibebin-dev-secret-do-not-use-in-production-change-me',
);

/** Guard signed-in-only pages (dashboard, settings) at the edge. */
export async function middleware(req: NextRequest) {
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

export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*'],
};
