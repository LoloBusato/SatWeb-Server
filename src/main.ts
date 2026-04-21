import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { pool } from './infrastructure/db';

const app = createApp();

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
