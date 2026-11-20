import { SignJWT, jwtVerify } from 'jose';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const PLATFORM_ACCESS_TTL_SECONDS = 10 * 60;
export const REFRESH_IDLE_DAYS = 14;
export const REFRESH_ABSOLUTE_DAYS = 30;
export const PLATFORM_SESSION_HOURS = 8;

export interface TenantAccessClaims { sub: string; tid: string; sid: string; rv: number }
export interface PlatformAccessClaims { sub: string; sid: string }

const enc = (s: string) => new TextEncoder().encode(s);

export async function signTenantAccess(secret: string, c: TenantAccessClaims): Promise<string> {
  return new SignJWT({ tid: c.tid, sid: c.sid, rv: c.rv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.sub)
    .setAudience('hms-tenant')
    .setIssuer('hms')
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(enc(secret));
}

export async function verifyTenantAccess(secret: string, token: string): Promise<TenantAccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, enc(secret), { audience: 'hms-tenant', issuer: 'hms', algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.tid !== 'string' || typeof payload.sid !== 'string') return null;
    return { sub: payload.sub, tid: payload.tid, sid: payload.sid, rv: Number(payload.rv) };
  } catch {
    return null;
  }
}

export async function signPlatformAccess(secret: string, c: PlatformAccessClaims): Promise<string> {
  return new SignJWT({ sid: c.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.sub)
    .setAudience('hms-platform')
    .setIssuer('hms')
    .setIssuedAt()
    .setExpirationTime(`${PLATFORM_ACCESS_TTL_SECONDS}s`)
    .sign(enc(secret));
}

export async function verifyPlatformAccess(secret: string, token: string): Promise<PlatformAccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, enc(secret), { audience: 'hms-platform', issuer: 'hms', algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return { sub: payload.sub, sid: payload.sid };
  } catch {
    return null;
  }
}

/** Opaque refresh secret (256 bit). Only its SHA-256 is stored. */
export function newRefreshSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** CSRF token bound to the session id: HMAC(sessionId). */
export function csrfTokenFor(secret: string, sessionId: string): string {
  return createHmac('sha256', secret).update(`csrf:${sessionId}`).digest('base64url');
}

export function csrfMatches(secret: string, sessionId: string, token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(csrfTokenFor(secret, sessionId));
  const got = Buffer.from(token);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
