import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'miliguan-admin-local-secret';
const secret = new TextEncoder().encode(JWT_SECRET);
export const SESSION_IDLE_MINUTES = 60;

export type AdminJwtPayload = {
  sub: string;
  sid: string;
  roleName: string;
};

export async function signAdminJwt(payload: AdminJwtPayload) {
  return new SignJWT({ roleName: payload.roleName, sid: payload.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_IDLE_MINUTES}m`)
    .sign(secret);
}

export async function verifyAdminJwt(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return {
    userId: String(payload.sub ?? ''),
    sessionId: String(payload.sid ?? ''),
    roleName: String(payload.roleName ?? '')
  };
}
