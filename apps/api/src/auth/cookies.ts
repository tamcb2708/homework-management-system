import type { CookieOptions, Response } from 'express';
import { loadConfig } from '../config/env';
import { ACCESS_TTL_SECONDS, PLATFORM_ACCESS_TTL_SECONDS, PLATFORM_SESSION_HOURS, REFRESH_IDLE_DAYS } from './tokens';

/** __Host- prefix (host-only, Path=/, Secure) whenever served over HTTPS (docs/authentication-authorization.md §4.1). */
export function cookieName(base: string): string {
  return loadConfig().cookieSecure ? `__Host-${base}` : base;
}

export const COOKIES = {
  access: () => cookieName('hms_at'),
  refresh: () => cookieName('hms_rt'),
  csrf: () => cookieName('hms_csrf'),
  pAccess: () => cookieName('hmsp_at'),
  pRefresh: () => cookieName('hmsp_rt'),
  pCsrf: () => cookieName('hmsp_csrf'),
};

function base(httpOnly: boolean, sameSite: 'lax' | 'strict', maxAgeSec: number): CookieOptions {
  return { httpOnly, secure: loadConfig().cookieSecure, sameSite, path: '/', maxAge: maxAgeSec * 1000 };
}

export function setTenantCookies(res: Response, access: string, refresh: string, csrf: string) {
  res.cookie(COOKIES.access(), access, base(true, 'lax', ACCESS_TTL_SECONDS));
  res.cookie(COOKIES.refresh(), refresh, base(true, 'strict', REFRESH_IDLE_DAYS * 86400));
  res.cookie(COOKIES.csrf(), csrf, base(false, 'strict', REFRESH_IDLE_DAYS * 86400));
}

export function clearTenantCookies(res: Response) {
  for (const n of [COOKIES.access(), COOKIES.refresh(), COOKIES.csrf()]) res.clearCookie(n, { path: '/', secure: loadConfig().cookieSecure });
}

export function setPlatformCookies(res: Response, access: string, refresh: string, csrf: string) {
  res.cookie(COOKIES.pAccess(), access, base(true, 'lax', PLATFORM_ACCESS_TTL_SECONDS));
  res.cookie(COOKIES.pRefresh(), refresh, base(true, 'strict', PLATFORM_SESSION_HOURS * 3600));
  res.cookie(COOKIES.pCsrf(), csrf, base(false, 'strict', PLATFORM_SESSION_HOURS * 3600));
}

export function clearPlatformCookies(res: Response) {
  for (const n of [COOKIES.pAccess(), COOKIES.pRefresh(), COOKIES.pCsrf()]) res.clearCookie(n, { path: '/', secure: loadConfig().cookieSecure });
}
