/**
 * Browser API client. Cookies are httpOnly (never readable here, D2.2); only the CSRF cookie is read and echoed
 * in X-CSRF-Token. On 401 the session is refreshed once (single-flight across concurrent calls) and the call retried.
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const all = document.cookie.split('; ');
  for (const n of [`__Host-${name}`, name]) {
    const hit = all.find((c) => c.startsWith(`${n}=`));
    if (hit) return decodeURIComponent(hit.slice(n.length + 1));
  }
  return undefined;
}

const refreshing: Record<string, Promise<boolean> | undefined> = {};

async function refresh(realm: 'tenant' | 'platform'): Promise<boolean> {
  refreshing[realm] ??= (async () => {
    const url = realm === 'platform' ? '/api/platform/auth/refresh' : '/api/auth/refresh';
    for (let i = 0; i < 3; i++) {
      const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': readCookie(realm === 'platform' ? 'hmsp_csrf' : 'hms_csrf') ?? '' } });
      if (r.ok) return true;
      if (r.status !== 409) return false;
      await new Promise((res) => setTimeout(res, 300));
    }
    return false;
  })().finally(() => setTimeout(() => (refreshing[realm] = undefined), 0));
  return refreshing[realm]!;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  form?: FormData;
}

export async function api<T = any>(path: string, opts: ApiOptions = {}, retried = false): Promise<T> {
  const realm = path.startsWith('/api/platform') ? 'platform' : 'tenant';
  const method = opts.method ?? (opts.body || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (method !== 'GET') headers['X-CSRF-Token'] = readCookie(realm === 'platform' ? 'hmsp_csrf' : 'hms_csrf') ?? '';
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const res = await fetch(path, { method, headers, body, credentials: 'include', cache: 'no-store' });
  const isAuthCall = /\/auth\/(login|refresh)$/.test(path);
  if (res.status === 401 && !retried && !isAuthCall) {
    if (await refresh(realm)) return api<T>(path, opts, true);
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const e = (data as any)?.error ?? {};
    throw new ApiError(res.status, e.code ?? `HTTP_${res.status}`, e.message ?? 'Đã có lỗi xảy ra.', e.details);
  }
  return data as T;
}

function safeJson(t: string) {
  try { return JSON.parse(t); } catch { return t; }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'VALIDATION_ERROR' && Array.isArray(e.details) && e.details.length) return `Dữ liệu không hợp lệ: ${e.details[0]}`;
    if (Array.isArray(e.details) && e.details.length > 1 && typeof e.details[0] === 'string') return e.details.join(' ');
    return e.message;
  }
  if (e instanceof TypeError) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
  return 'Đã có lỗi xảy ra.';
}

export function fileUrl(id: string) {
  return `/api/files/${id}/download`;
}

export async function uploadFile(file: File, purpose: 'ASSIGNMENT_ATTACHMENT' | 'QUESTION_MEDIA' | 'ANSWER_UPLOAD') {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', file);
  return api<{ id: string; name: string; size: number; mimeType: string }>('/api/files', { method: 'POST', form });
}
