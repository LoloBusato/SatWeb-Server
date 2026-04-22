import express, { Router } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import crypto from 'node:crypto';
import { env } from './config/env';
import { logger } from './config/logger';
import { db, pool } from './infrastructure/db';
import { UserRepository } from './infrastructure/repositories/UserRepository';
import { PermissionRepository } from './infrastructure/repositories/PermissionRepository';
import { OrderRepository } from './infrastructure/repositories/OrderRepository';
import { OrderStateHistoryRepository } from './infrastructure/repositories/OrderStateHistoryRepository';
import { OrderLocationHistoryRepository } from './infrastructure/repositories/OrderLocationHistoryRepository';
import { BranchSettingsRepository } from './infrastructure/repositories/BranchSettingsRepository';
import { StockTransferRepository } from './infrastructure/repositories/StockTransferRepository';
import { RepuestoRepository } from './infrastructure/repositories/RepuestoRepository';
import { StateRepository } from './infrastructure/repositories/StateRepository';
import { BranchRepository } from './infrastructure/repositories/BranchRepository';
import { GroupRepository } from './infrastructure/repositories/GroupRepository';
import { AuthService } from './application/services/AuthService';
import { authRouter } from './presentation/routes/auth.routes';
import { ordersRouter } from './presentation/routes/orders.routes';
import { statesRouter } from './presentation/routes/states.routes';
import { branchesRouter } from './presentation/routes/branches.routes';
import { groupsRouter } from './presentation/routes/groups.routes';
import { permissionsRouter } from './presentation/routes/permissions.routes';
import { usersRouter } from './presentation/routes/users.routes';
import { stockTransfersRouter } from './presentation/routes/stock-transfers.routes';
import { repuestosRouter } from './presentation/routes/repuestos.routes';
import { errorHandler } from './presentation/middlewares/errorHandler';

/**
 * Builds the v2 router with all its own middlewares (CORS, JSON parser, logs,
 * error handler). Intended to be mounted at /api/v2 on either a standalone
 * Express app (src/app.ts → src/main.ts) or on the legacy index.js that
 * Vercel deploys, so v2 and legacy coexist during cutover.
 */
export function createV2Router(): Router {
  const r = Router();

  r.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );

  r.use(express.json({ limit: '1mb' }));

  r.use(
    pinoHttp({
      logger,
      genReqId: (req) =>
        (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID(),
    }),
  );

  r.get('/health', async (_req, res) => {
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
  const orderRepo = new OrderRepository(db);
  const orderHistoryRepo = new OrderStateHistoryRepository(db);
  const orderLocationHistoryRepo = new OrderLocationHistoryRepository(db);
  const stateRepo = new StateRepository(db);
  const branchRepo = new BranchRepository(db);
  const branchSettingsRepo = new BranchSettingsRepository(db);
  const stockTransferRepo = new StockTransferRepository(db);
  const repuestoRepo = new RepuestoRepository(db);
  const groupRepo = new GroupRepository(db);
  const authService = new AuthService(userRepo, permRepo);

  r.use('/auth', authRouter(authService));
  r.use(
    '/orders',
    ordersRouter(orderRepo, orderHistoryRepo, orderLocationHistoryRepo, authService),
  );
  r.use('/states', statesRouter(stateRepo, authService));
  r.use('/branches', branchesRouter(branchRepo, branchSettingsRepo, authService));
  r.use('/groups', groupsRouter(groupRepo, permRepo, authService));
  r.use('/permissions', permissionsRouter(permRepo, authService));
  r.use('/users', usersRouter(userRepo, authService));
  r.use('/stock-transfers', stockTransfersRouter(stockTransferRepo, authService));
  r.use('/repuestos', repuestosRouter(repuestoRepo, authService));

  r.use(errorHandler);

  return r;
}
