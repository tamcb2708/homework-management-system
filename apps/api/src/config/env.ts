/** Validated runtime configuration. Fails fast on missing/unsafe values. */
export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  appOrigins: string[];
  cookieSecure: boolean;
  logLevel: string;
  databaseUrl: string;
  databaseSystemUrl: string;
  jwtSecret: string;
  platformJwtSecret: string;
  csrfSecret: string;
  storageDriver: 'local' | 's3';
  storageLocalDir: string;
  s3: { endpoint?: string; region: string; bucket?: string; accessKeyId?: string; secretAccessKey?: string; forcePathStyle: boolean };
  aiProvider: 'disabled' | 'fake' | 'anthropic';
  aiModel: string;
  schedulerEnabled: boolean;
  bearerEnabled: boolean;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const secret = (name: string) => {
    const v = req(name);
    if (v.length < 32) throw new Error(`${name} must be at least 32 characters`);
    if (isProduction && v.startsWith('change-me')) throw new Error(`${name} still has the example value`);
    return v;
  };
  const aiProvider = (process.env.AI_PROVIDER ?? 'disabled') as AppConfig['aiProvider'];
  if (!['disabled', 'fake', 'anthropic'].includes(aiProvider)) throw new Error('AI_PROVIDER must be disabled|fake|anthropic');
  if (isProduction && aiProvider === 'fake') throw new Error('AI_PROVIDER=fake is forbidden in production');
  if (aiProvider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY');
  const storageDriver = (process.env.STORAGE_DRIVER ?? 'local') as AppConfig['storageDriver'];
  cached = {
    nodeEnv,
    isProduction,
    port: Number(process.env.PORT ?? 4000),
    appOrigins: (process.env.APP_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    databaseUrl: req('DATABASE_URL'),
    databaseSystemUrl: req('DATABASE_SYSTEM_URL'),
    jwtSecret: secret('JWT_SECRET'),
    platformJwtSecret: secret('PLATFORM_JWT_SECRET'),
    csrfSecret: secret('CSRF_SECRET'),
    storageDriver,
    storageLocalDir: process.env.STORAGE_LOCAL_DIR ?? './storage',
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'auto',
      bucket: process.env.S3_BUCKET,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    },
    aiProvider,
    aiModel: process.env.AI_GRADING_MODEL ?? 'claude-opus-5-5',
    schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false',
    bearerEnabled: process.env.AUTH_BEARER_ENABLED === 'true',
  };
  if (storageDriver === 's3' && (!cached.s3.bucket || !cached.s3.accessKeyId || !cached.s3.secretAccessKey)) {
    throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY');
  }
  return cached;
}

/** Test helper. */
export function resetConfigCache() {
  cached = undefined;
}
