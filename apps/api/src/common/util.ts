import { Prisma } from '@prisma/client';

export type Dec = Prisma.Decimal | number | string | null | undefined;

/** Decimal → number (2 decimals) for API responses. */
export function num(d: Dec): number | null {
  if (d === null || d === undefined) return null;
  return Math.round(Number(d) * 100) / 100;
}

export function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

/** True when value is a multiple of step (with float tolerance). */
export function isMultipleOf(value: number, step: number): boolean {
  if (step <= 0) return true;
  const q = value / step;
  return Math.abs(q - Math.round(q)) < 1e-6;
}

export function normalizeIdentifier(s: string): string {
  return s.normalize('NFC').trim().toLowerCase();
}

export function pageParams(page?: number, pageSize?: number) {
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const p = Math.max(Number(page) || 1, 1);
  return { skip: (p - 1) * size, take: size, page: p, pageSize: size };
}
