import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Prefer .env.local (Vercel convention) over .env. First-loaded wins.
const root = process.cwd();
for (const name of ['.env.local', '.env']) {
  const file = path.join(root, name);
  if (fs.existsSync(file)) dotenv.config({ path: file, override: false });
}

const boolFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_DBNAME: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  ALLOW_LEGACY_PASSWORD_MIGRATION: boolFromEnv.default('true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // Throws (instead of process.exit) so consumers can handle it. For
  // example, the legacy index.js wraps `require('./dist/v2')` in a
  // try/catch — without env configured, v2 simply won't mount, and
  // the legacy routes keep serving traffic. Standalone runs
  // (src/main.ts) surface the error at startup and exit with the
  // full stack trace.
  throw new Error(`Invalid environment variables:\n${details}`);
}

export const env = parsed.data;
export type Env = typeof env;
