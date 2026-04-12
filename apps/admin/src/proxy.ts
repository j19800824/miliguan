import { ADMIN_SESSION_COOKIE } from '@/lib/auth/shared';
import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PREFIX = '/dashboard';
const SIGN_IN_PATH = '/auth/sign-in';

export default function proxy(req: NextRequest) {
  const session = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith(PROTECTED_PREFIX) && !session) {
    const signInUrl = new URL(SIGN_IN_PATH, req.url);
    signInUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}
export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
