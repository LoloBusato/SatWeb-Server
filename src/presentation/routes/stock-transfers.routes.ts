import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth, attachBranchFilter } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type { StockTransferRepository } from '../../infrastructure/repositories/StockTransferRepository';
import { ForbiddenError, UnauthorizedError } from '../../domain/errors';

const createSchema = z.object({
  stockId: z.number().int().positive(),
  fromBranchId: z.number().int().positive(),
  toBranchId: z.number().int().positive(),
  cantidad: z.number().int().min(1),
  note: z.string().trim().max(255).nullable().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  stockId: z.coerce.number().int().positive().optional(),
});

export function stockTransfersRouter(
  repo: StockTransferRepository,
  authService: AuthService,
): Router {
  const r = Router();
  const auth = requireAuth(authService);

  r.post('/', auth, attachBranchFilter, validate({ body: createSchema }), async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const branchFilter = req.branchFilter ?? null;

      // Un user sin branches:view_all sólo puede transferir DESDE su sucursal.
      // Con view_all, puede transferir desde cualquier origen.
      if (branchFilter !== null && req.body.fromBranchId !== branchFilter) {
        throw new ForbiddenError(
          'Solo podés transferir stock desde tu sucursal',
        );
      }

      const created = await repo.transfer({
        stockId: req.body.stockId,
        fromBranchId: req.body.fromBranchId,
        toBranchId: req.body.toBranchId,
        cantidad: req.body.cantidad,
        transferredByUserId: req.user.sub,
        note: req.body.note ?? null,
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  r.get('/', auth, attachBranchFilter, validate({ query: listQuerySchema }), async (req, res, next) => {
    try {
      const q = req.query as unknown as z.output<typeof listQuerySchema>;
      const items = await repo.list(req.branchFilter ?? null, {
        limit: q.limit,
        offset: q.offset,
        stockId: q.stockId,
      });
      res.json({
        items,
        page: { limit: q.limit, offset: q.offset, count: items.length },
        branchFilter: req.branchFilter ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
