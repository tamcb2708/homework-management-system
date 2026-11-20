import { PrismaClient } from '@prisma/client';

/** Database migration test: security invariants of the migrated schema (database-design §15). */
describe('Migrated schema invariants', () => {
  const sys = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_SYSTEM_URL } } });
  afterAll(() => sys.$disconnect());

  it('every table with tenant_id has RLS enabled + forced and a tenant_isolation policy for hms_app', async () => {
    const rows = await sys.$queryRaw<{ table: string; rls: boolean; forced: boolean; policies: bigint }[]>`
      SELECT c.relname AS table, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
             (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation' AND 'hms_app' = ANY(p.roles)) AS policies
      FROM pg_class c JOIN information_schema.columns col ON col.table_name = c.relname AND col.column_name = 'tenant_id'
      WHERE c.relkind = 'r' AND col.table_schema = 'public'`;
    expect(rows.length).toBeGreaterThanOrEqual(35);
    const bad = rows.filter((r) => !r.rls || !r.forced || Number(r.policies) !== 1).map((r) => r.table);
    expect(bad).toEqual([]);
  });

  it('runtime roles cannot bypass RLS and are not superusers', async () => {
    const roles = await sys.$queryRaw<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname IN ('hms_app', 'hms_system')`;
    expect(roles).toHaveLength(2);
    roles.forEach((r) => { expect(r.rolbypassrls).toBe(false); expect(r.rolsuper).toBe(false); });
  });

  it('append-only tables reject UPDATE and DELETE', async () => {
    const triggers = await sys.$queryRaw<{ t: string }[]>`SELECT event_object_table AS t FROM information_schema.triggers WHERE trigger_name LIKE '%_append_only'`;
    for (const t of ['submission_versions', 'submission_answers', 'submission_attachments', 'grade_history', 'audit_logs', 'platform_audit_logs']) {
      expect(triggers.map((r) => r.t)).toContain(t);
    }
    await sys.platformAuditLog.create({ data: { action: 'test.immutable' } });
    await expect(sys.platformAuditLog.updateMany({ where: { action: 'test.immutable' }, data: { action: 'x' } })).rejects.toThrow(/append-only/);
    await expect(sys.platformAuditLog.deleteMany({ where: { action: 'test.immutable' } })).rejects.toThrow(/append-only/);
  });

  it('check constraints guard scores and assignment windows', async () => {
    const constraints = await sys.$queryRaw<{ conname: string }[]>`SELECT conname FROM pg_constraint WHERE contype = 'c'`;
    const names = constraints.map((c) => c.conname);
    for (const n of ['grade_details_score_ck', 'grades_score_ck', 'assignments_window_ck', 'assignment_targets_one_ck', 'grade_details_official_ck']) expect(names).toContain(n);
  });
});
