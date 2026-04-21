import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth, requirePermission } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type { StateRepository } from '../../infrastructure/repositories/StateRepository';
import { NotFoundError } from '../../domain/errors';

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(155),
  color: z.string().trim().max(25).nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(155).optional(),
  color: z.string().trim().max(25).nullable().optional(),
});

export function statesRouter(
  stateRepo: StateRepository,
  authService: AuthService,
): Router {
  const r = Router();
  const auth = requireAuth(authService);
  const canManage = requirePermission('states:manage');

  r.get('/', auth, async (_req, res, next) => {
    try {
      res.json({ items: await stateRepo.list() });
    } catch (err) {
      next(err);
    }
  });

  r.get('/:id', auth, validate({ params: idParamSchema }), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = await stateRepo.findById(id);
      if (!row) throw new NotFoundError('Estado');
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  r.post('/', auth, canManage, validate({ body: createSchema }), async (req, res, next) => {
    try {
      const created = await stateRepo.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  r.patch(
    '/:id',
    auth,
    canManage,
    validate({ params: idParamSchema, body: updateSchema }),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const updated = await stateRepo.update(id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  r.delete(
    '/:id',
    auth,
    canManage,
    validate({ params: idParamSchema }),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        await stateRepo.softDelete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
