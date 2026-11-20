import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { badRequest } from '../common/errors';

const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
// Used to equalise response time when the account does not exist.
let dummyHash: Promise<string> | undefined;

export function hashPassword(pw: string): Promise<string> {
  return argon2.hash(pw, ARGON_OPTS);
}

export async function verifyPassword(hash: string | null | undefined, pw: string): Promise<boolean> {
  if (!hash) {
    dummyHash ??= argon2.hash('dummy-password-for-timing', ARGON_OPTS);
    await argon2.verify(await dummyHash, pw).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, pw);
  } catch {
    return false;
  }
}

const UNAMBIGUOUS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 12-char CSPRNG temporary password. Never derived from the student code (D4.3). */
export function generateTemporaryPassword(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) out += UNAMBIGUOUS[randomInt(UNAMBIGUOUS.length)];
  // Guarantee at least one digit and one letter
  if (!/\d/.test(out)) out = out.slice(0, -1) + String(randomInt(2, 10));
  if (!/[a-zA-Z]/.test(out)) out = 'k' + out.slice(1);
  return out;
}

const COMMON = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'matkhau', 'matkhau123', 'qwertyui', 'qwerty123',
  '11111111', '00000000', 'abc12345', 'iloveyou', 'admin123', 'abcd1234', '12341234', '87654321', 'hocsinh123',
  'giaovien123', 'vietnam123', 'aaaaaaaa', 'letmein1', 'welcome1', '123123123', 'zaq12wsx',
]);

/** NIST 800-63B style: length 8–128, not common, not equal to identifiers. */
export function assertPasswordPolicy(pw: string, identifiers: (string | null | undefined)[]) {
  if (pw.length < 8) throw badRequest('WEAK_PASSWORD', 'Mật khẩu phải có ít nhất 8 ký tự.');
  if (pw.length > 128) throw badRequest('WEAK_PASSWORD', 'Mật khẩu tối đa 128 ký tự.');
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) throw badRequest('WEAK_PASSWORD', 'Mật khẩu quá phổ biến, vui lòng chọn mật khẩu khác.');
  for (const id of identifiers) {
    if (!id) continue;
    const v = id.toLowerCase();
    const local = v.split('@')[0];
    if (lower === v || (local.length >= 3 && lower.includes(local))) {
      throw badRequest('WEAK_PASSWORD', 'Mật khẩu không được chứa tên đăng nhập, email hoặc mã học sinh.');
    }
  }
}
