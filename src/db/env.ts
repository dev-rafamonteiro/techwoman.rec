import { readFileSync } from 'node:fs';

/** Lê VAR ou VAR_FILE (caminho de um Docker secret). Vazio conta como ausente. Nunca registra o valor. */
export function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const direct = env[name];
  if (direct) return direct;
  const file = env[`${name}_FILE`];
  if (file) {
    const v = readFileSync(file, 'utf8').trim();
    if (v) return v;
  }
  return undefined;
}
