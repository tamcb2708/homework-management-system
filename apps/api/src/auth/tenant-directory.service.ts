import { Injectable } from '@nestjs/common';
import { DbService } from '../prisma/db.service';
import { forbidden, notFound } from '../common/errors';
import { normalizeIdentifier } from '../common/util';

interface TenantInfo { id: string; slug: string; name: string; status: string; timezone: string }

/** Resolves schools by code/id with a short in-memory cache (status changes propagate within 15 s; sessions are revoked on suspend). */
@Injectable()
export class TenantDirectory {
  private cache = new Map<string, { at: number; t: TenantInfo | null }>();
  private readonly ttl = 15_000;

  constructor(private readonly db: DbService) {}

  invalidate() {
    this.cache.clear();
  }

  private async lookup(key: string, where: { slug: string } | { id: string }): Promise<TenantInfo | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttl) return hit.t;
    const t = await this.db.appClient.tenant.findUnique({ where, select: { id: true, slug: true, name: true, status: true, timezone: true } }).catch(() => null);
    this.cache.set(key, { at: Date.now(), t });
    return t;
  }

  async publicInfo(slug: string) {
    const t = await this.lookup(`s:${normalizeIdentifier(slug)}`, { slug: normalizeIdentifier(slug) });
    if (!t || t.status === 'ARCHIVED') throw notFound('Không tìm thấy trường với mã này.');
    return { slug: t.slug, name: t.name, status: t.status };
  }

  async requireActiveBySlug(slug: string): Promise<TenantInfo> {
    const s = normalizeIdentifier(slug ?? '');
    const t = s ? await this.lookup(`s:${s}`, { slug: s }) : null;
    if (!t || t.status === 'ARCHIVED') throw notFound('Không tìm thấy trường với mã này.');
    if (t.status !== 'ACTIVE') throw forbidden('TENANT_SUSPENDED', 'Trường đang tạm ngưng sử dụng hệ thống.');
    return t;
  }

  async requireActiveById(id: string): Promise<TenantInfo> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
    const t = await this.lookup(`i:${id}`, { id });
    if (!t) throw notFound();
    if (t.status !== 'ACTIVE') throw forbidden('TENANT_SUSPENDED', 'Trường đang tạm ngưng sử dụng hệ thống.');
    return t;
  }
}
