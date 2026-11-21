/**
 * Creates (or resets) a Platform Admin. Usage:
 *   PLATFORM_ADMIN_EMAIL=ops@example.com PLATFORM_ADMIN_NAME="Ops" PLATFORM_ADMIN_PASSWORD='...' node dist/scripts/create-platform-admin.js
 * The password is read from the environment, never from argv (avoids shell history).
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { hashPassword, assertPasswordPolicy } from '../auth/password';

async function main() {
  const email = (process.env.PLATFORM_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const name = process.env.PLATFORM_ADMIN_NAME ?? 'Platform Admin';
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? '';
  if (!email || !password) throw new Error('PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD are required');
  assertPasswordPolicy(password, [email]);
  const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_SYSTEM_URL } } });
  const passwordHash = await hashPassword(password);
  await db.platformUser.upsert({ where: { email }, create: { email, fullName: name, passwordHash }, update: { passwordHash, status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null } });
  await db.platformAuditLog.create({ data: { action: 'platform.admin.provisioned_cli', resourceType: 'platform_user', metadata: { email } } });
  await db.$disconnect();
  console.log(`Platform admin ready: ${email}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
