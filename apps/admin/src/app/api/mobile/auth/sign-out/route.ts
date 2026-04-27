import { NextResponse } from 'next/server';
import { deleteSession } from '@/lib/database.js';
import { verifyAdminJwt } from '@/lib/auth/jwt';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : '';

  if (token) {
    try {
      const payload = await verifyAdminJwt(token);
      await deleteSession(payload.sessionId);
    } catch {
      /* silent: token already invalid */
    }
  }

  return NextResponse.json({ ok: true });
}
