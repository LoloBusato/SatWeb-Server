import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import crypto from 'node:crypto';
import { env } from './config/env';
import { logger } from './config/logger';
import { db, pool } from './infrastructure/db';
import { UserRepository } from './infrastructure/repositories/UserRepository';
import { PermissionRepository } from './infrastructure/repositories/PermissionRepository';
import { AuthService } from './application/services/AuthService';
import { authRouter } from './presentation/routes/auth.routes';
import { errorHandler } from './presentation/middlewares/errorHandler';

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));

app.use(
  pinoHttp({
    logger,
    genReqId: (req) =>
      (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID(),
  }),
);

app.get('/api/v2/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'ok' });
  } catch (err) {
    logger.error({ err }, 'health check: db ping failed');
    res.status(503).json({ ok: false, db: 'error' });
  }
});

const userRepo = new UserRepository(db);
const permRepo = new PermissionRepository(db);
const authService = new AuthService(userRepo, permRepo);

app.use('/api/v2/auth', authRouter(authService));

app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api v2 listening');
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
