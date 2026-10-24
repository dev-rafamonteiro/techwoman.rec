import { readEnv } from '@tw/db';

const bool = (v: string | undefined, def: boolean) => (v === undefined || v === '' ? def : ['1', 'true', 'yes'].includes(v.toLowerCase()));

export interface Config {
  env: 'production' | 'development' | 'test';
  isProd: boolean;
  port: number;
  host: string;
  eventId: string;
  publicBaseUrl: string;
  allowedOrigins: string[];
  /** Segredo de assinatura do JWT e de derivação do token da participante. */
  jwtSecret: string;
  turnstileSecret: string | null;
  /** Em dev/test sem segredo, o Turnstile aceita qualquer token. */
  turnstileEnabled: boolean;
  whatsappEnabled: boolean;
  /** Cookie Secure (produção). */
  cookieSecure: boolean;
  /** Valida cada resposta contra o schema do contrato (ligado fora de produção). */
  validateResponses: boolean;
  trustProxy: boolean;
  mongoUri: string | undefined;
  mongoDb: string | undefined;
  /** Retenção/links: o link vale até N dias após o evento. */
  linkValidDaysAfterEvent: number;
  sessionHours: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = (env['NODE_ENV'] === 'production' ? 'production' : env['NODE_ENV'] === 'test' ? 'test' : 'development') as Config['env'];
  const isProd = nodeEnv === 'production';
  const jwtSecret = readEnv('JWT_SECRET', env) ?? (isProd ? '' : 'dev-only-secret-change-me-dev-only-secret');
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET (ou JWT_SECRET_FILE) ausente ou curto demais (mínimo 32 caracteres)');
  }
  const publicBaseUrl = (env['PUBLIC_BASE_URL'] || (isProd ? 'https://techwoman.dev' : 'http://localhost:5173')).replace(/\/$/, '');
  const turnstileSecret = readEnv('TURNSTILE_SECRET', env) ?? null;
  return {
    env: nodeEnv,
    isProd,
    port: Number(env['PORT'] || 3000),
    host: env['HOST'] || '0.0.0.0',
    eventId: env['EVENT_ID'] || 'techwoman-2026',
    publicBaseUrl,
    allowedOrigins: [publicBaseUrl, ...(env['ALLOWED_ORIGINS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)],
    jwtSecret,
    turnstileSecret,
    turnstileEnabled: isProd ? true : turnstileSecret !== null,
    whatsappEnabled: bool(env['WHATSAPP_ENABLED'], false),
    cookieSecure: bool(env['COOKIE_SECURE'], isProd),
    validateResponses: bool(env['VALIDATE_RESPONSES'], !isProd),
    trustProxy: bool(env['TRUST_PROXY'], true),
    mongoUri: readEnv('MONGODB_URI', env),
    mongoDb: readEnv('MONGODB_DB', env),
    linkValidDaysAfterEvent: 7,
    sessionHours: 12,
  };
}
