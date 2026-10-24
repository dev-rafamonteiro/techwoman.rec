import { randomInt } from 'node:crypto';
import argon2 from 'argon2';

// OWASP: argon2id, m=19 MiB, t=2, p=1 (ajustável por env em produção).
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: Number(process.env['ARGON2_MEMORY_KIB'] ?? 19456),
  timeCost: Number(process.env['ARGON2_TIME_COST'] ?? 2),
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// Sem caracteres ambíguos (0/O, 1/l/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Senha provisória aleatória de 12 caracteres (troca obrigatória no primeiro acesso, M2). */
export function generateProvisionalPassword(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
