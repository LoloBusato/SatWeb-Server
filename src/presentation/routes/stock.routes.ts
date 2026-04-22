import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type { StockRepository } from '../../infrastructure/repositories/StockRepository';
import { NotFoundError } from '../../domain/errors';

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export function stockRouter(
  repo: StockRepository,
  authService: AuthService,
): Router {
  const r = Router();
  const auth = requireAuth(authService);

  r.get(
    '/:id/distribution',
    auth,
    validate({ params: idParamSchema }),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const result = await repo.distribution(id);
        if (!result) throw new NotFoundError('Stock');
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
