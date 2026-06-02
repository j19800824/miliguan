import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE } from '@/lib/auth/shared';
import { deleteSession } from '@/lib/database.js';
import { verifyAdminJwt } from '@/lib/auth/jwt';

export async function POST(req: Request) {
  const cookie = req.headers.get('cookie') ?? '';
  const session = cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ADMIN_SESSION_COOKIE}=`))
    ?.split('=')[1];

  if (session) {
    try {
      const token = await verifyAdminJwt(session);
      await deleteSession(token.sessionId);
    } catch {
      // Ignore invalid/expired token on sign-out.
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure:
      process.env.NODE_ENV === 'production' &&
      process.env.COOKIE_INSECURE !== 'true',
    maxAge: 0
  });
  return response;
}
