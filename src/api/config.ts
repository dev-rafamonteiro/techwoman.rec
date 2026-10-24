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
  /** Segredo próprio do token da participante (HMAC); separado do JWT. */
  menteeTokenSecret: string;
  /** 'test': aceita só o token "test-ok" (nunca em produção). */
  turnstileMode: 'live' | 'test';
  rateLimitEnabled: boolean;
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
  const devSecret = (n: string) => `dev-only-${n}-secret-change-me-dev-only`;
  const jwtSecret = readEnv('JWT_SECRET', env) ?? (isProd ? '' : devSecret('jwt'));
  const menteeTokenSecret = readEnv('MENTEE_TOKEN_SECRET', env) ?? (isProd ? '' : devSecret('mentee'));
  for (const [name, v] of [['JWT_SECRET', jwtSecret], ['MENTEE_TOKEN_SECRET', menteeTokenSecret]] as const) {
    if (!v || v.length < 32) throw new Error(`${name} (ou ${name}_FILE) ausente ou curto demais (mínimo 32 caracteres)`);
  }
  const turnstileMode = env['TURNSTILE_MODE'] === 'test' ? 'test' : 'live';
  if (isProd && turnstileMode === 'test') throw new Error('TURNSTILE_MODE=test não é permitido em produção');
  const publicBaseUrl = (env['PUBLIC_BASE_URL'] || (isProd ? 'https://techwoman.dev' : 'http://localhost:5173')).replace(/\/$/, '');
  const turnstileSecret = readEnv('TURNSTILE_SECRET', env) ?? null;
  if (isProd && !turnstileSecret) throw new Error('TURNSTILE_SECRET (ou TURNSTILE_SECRET_FILE) é obrigatório em produção');
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
    turnstileEnabled: true,
    turnstileMode,
    menteeTokenSecret,
    rateLimitEnabled: bool(env['RATE_LIMIT'], true),
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
