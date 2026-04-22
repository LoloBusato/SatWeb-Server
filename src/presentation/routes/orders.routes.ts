import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import {
  requireAuth,
  attachBranchFilter,
  requirePermission,
} from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type { OrderRepository } from '../../infrastructure/repositories/OrderRepository';
import type { OrderStateHistoryRepository } from '../../infrastructure/repositories/OrderStateHistoryRepository';
import type { OrderLocationHistoryRepository } from '../../infrastructure/repositories/OrderLocationHistoryRepository';
import { NotFoundError, UnauthorizedError } from '../../domain/errors';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  delivered: z.enum(['true', 'false']).optional(),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const changeStateSchema = z.object({
  stateId: z.number().int().positive(),
  note: z.string().trim().max(255).nullable().optional(),
});

const transferSchema = z.object({
  toBranchId: z.number().int().positive(),
  note: z.string().trim().max(255).nullable().optional(),
});

export function ordersRouter(
  orderRepo: OrderRepository,
  historyRepo: OrderStateHistoryRepository,
  locationHistoryRepo: OrderLocationHistoryRepository,
  authService: AuthService,
): Router {
  const r = Router();
  const auth = requireAuth(authService);

  r.get(
    '/',
    auth,
    attachBranchFilter,
    validate({ query: listQuerySchema }),
    async (req, res, next) => {
      try {
        const q = req.query as unknown as z.output<typeof listQuerySchema>;
        const branchFilter = req.branchFilter ?? null;
        const deliveredOnly =
          q.delivered === undefined ? undefined : q.delivered === 'true';

        req.log?.info(
          { userId: req.user?.sub, branchFilter, limit: q.limit, offset: q.offset },
          'list orders',
        );

        const items = await orderRepo.listByBranch(branchFilter, {
          limit: q.limit,
          offset: q.offset,
          deliveredOnly,
        });

        res.json({
          items,
          page: { limit: q.limit, offset: q.offset, count: items.length },
          branchFilter,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Listas derivadas de branch_settings — tienen que declararse ANTES
  // de /:id porque /pickup-pending matchearía como id='pickup-pending'
  // y fallaría la validación del param numérico.
  r.get('/pickup-pending', auth, attachBranchFilter, async (req, res, next) => {
    try {
      const items = await orderRepo.listPickupPending(req.branchFilter ?? null);
      res.json({ items, branchFilter: req.branchFilter ?? null });
    } catch (err) {
      next(err);
    }
  });

  r.get('/incucai-eligible', auth, attachBranchFilter, async (req, res, next) => {
    try {
      const items = await orderRepo.listIncucaiEligible(req.branchFilter ?? null);
      res.json({ items, branchFilter: req.branchFilter ?? null });
    } catch (err) {
      next(err);
    }
  });

  r.post(
    '/archive-overdue',
    auth,
    requirePermission('branches:manage'),
    attachBranchFilter,
    async (req, res, next) => {
      try {
        if (!req.user) throw new UnauthorizedError();
        const result = await orderRepo.archiveOverdue(
          req.branchFilter ?? null,
          req.user.sub,
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/:id',
    auth,
    attachBranchFilter,
    validate({ params: idParamSchema }),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const branchFilter = req.branchFilter ?? null;
        const order = await orderRepo.findById(id, branchFilter);
        if (!order) throw new NotFoundError('Orden');
        res.json(order);
      } catch (err) {
        next(err);
      }
    },
  );

  r.patch(
    '/:id/state',
    auth,
    attachBranchFilter,
    validate({ params: idParamSchema, body: changeStateSchema }),
    async (req, res, next) => {
      try {
        if (!req.user) throw new UnauthorizedError();
        const id = Number(req.params.id);
        const branchFilter = req.branchFilter ?? null;

        // Branch-scoped existence check first — 404 para users sin acceso,
        // igual que GET /:id. Evita leakage de que la orden existe en
        // otra sucursal.
        const existing = await orderRepo.findById(id, branchFilter);
        if (!existing) throw new NotFoundError('Orden');

        const updated = await orderRepo.updateState(
          id,
          req.body.stateId,
          req.user.sub,
          req.body.note ?? null,
        );
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/:id/state-history',
    auth,
    attachBranchFilter,
    validate({ params: idParamSchema }),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const branchFilter = req.branchFilter ?? null;
        const existing = await orderRepo.findById(id, branchFilter);
        if (!existing) throw new NotFoundError('Orden');

        const items = await historyRepo.listByOrderId(id);
        res.json({ items });
      } catch (err) {
        next(err);
      }
    },
  );

  r.post(
    '/:id/transfer',
    auth,
    attachBranchFilter,
    validate({ params: idParamSchema, body: transferSchema }),
    async (req, res, next) => {
      try {
        if (!req.user) throw new UnauthorizedError();
        const id = Number(req.params.id);
        const branchFilter = req.branchFilter ?? null;

        // Branch scope check (matches Fase 2.3 multi-tenancy OR: el user
        // debe tener la orden originada o actualmente en su sucursal).
        const existing = await orderRepo.findById(id, branchFilter);
        if (!existing) throw new NotFoundError('Orden');

        const updated = await orderRepo.transfer(
          id,
          req.body.toBranchId,
          req.user.sub,
          req.body.note ?? null,
        );
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/:id/location-history',
    auth,
    attachBranchFilter,
    validate({ params: idParamSchema }),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const branchFilter = req.branchFilter ?? null;
        const existing = await orderRepo.findById(id, branchFilter);
        if (!existing) throw new NotFoundError('Orden');

        const items = await locationHistoryRepo.listByOrderId(id);
        res.json({ items });
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
