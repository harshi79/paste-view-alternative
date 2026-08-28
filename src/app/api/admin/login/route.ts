import { NextResponse } from 'next/server';
import { getAdminPassword, createAdminSession } from '@/lib/auth';

export async function POST(req: Request) {
  const adminPw = getAdminPassword();
  if (!adminPw) {
    return NextResponse.json(
      { error: 'Admin is not configured. Set ADMIN_PASSWORD in your environment.' },
      { status: 503 },
    );
  }
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const provided = String(body.password ?? '');
  if (provided.length === 0 || provided !== adminPw) {
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  }
  await createAdminSession();
  return NextResponse.json({ ok: true });
}
