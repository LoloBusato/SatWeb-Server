import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth, attachBranchFilter } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type { OrderRepository } from '../../infrastructure/repositories/OrderRepository';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  delivered: z.enum(['true', 'false']).optional(),
});

export function ordersRouter(
  orderRepo: OrderRepository,
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

  return r;
}
