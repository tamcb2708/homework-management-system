/**
 * Same-origin proxy: browser → web (/api/*) → NestJS API. Reads API_INTERNAL_URL at RUNTIME
 * (Next.js rewrites are fixed at build time, which breaks container deployments).
 * In production Nginx routes /api directly to the API; this proxy serves single-process / preview setups.
 */
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'proxy-connection', 'te', 'trailer']);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const base = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');
  const { path } = await ctx.params;
  const target = `${base}/api/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase())) headers.set(k, v); });
  const fwd = req.headers.get('x-forwarded-for');
  headers.set('x-forwarded-host', req.headers.get('host') ?? '');
  headers.set('x-forwarded-proto', req.nextUrl.protocol.replace(':', ''));
  if (fwd) headers.set('x-forwarded-for', fwd);
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method, headers, body: hasBody ? req.body : undefined, redirect: 'manual', cache: 'no-store',
      // @ts-expect-error -- Node fetch needs duplex for streamed request bodies
      duplex: hasBody ? 'half' : undefined,
    });
  } catch {
    return Response.json({ error: { code: 'API_UNAVAILABLE', message: 'Máy chủ API tạm thời không phản hồi.' } }, { status: 502 });
  }
  const out = new Headers();
  res.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'content-encoding' && k.toLowerCase() !== 'set-cookie') out.set(k, v); });
  for (const c of res.headers.getSetCookie()) out.append('set-cookie', c);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
