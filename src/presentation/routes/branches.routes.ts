import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth, requirePermission } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type { BranchRepository } from '../../infrastructure/repositories/BranchRepository';
import type { BranchSettingsRepository } from '../../infrastructure/repositories/BranchSettingsRepository';
import { NotFoundError } from '../../domain/errors';

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(45),
  contact: z.string().trim().min(1).max(100),
  info: z.string().max(255),
  ganancia: z.number().nonnegative(),
});

const updateSchema = createSchema.partial();

const settingsSchema = z.object({
  readyStateId: z.number().int().positive(),
  incucaiStateId: z.number().int().positive(),
  deliveredStateId: z.number().int().positive(),
  pickupReminderHours: z.number().int().min(1).max(24 * 365).optional(),
  incucaiAfterDays: z.number().int().min(1).max(365 * 10).optional(),
});

export function branchesRouter(
  branchRepo: BranchRepository,
  branchSettingsRepo: BranchSettingsRepository,
  authService: AuthService,
): Router {
  const r = Router();
  const auth = requireAuth(authService);
  const canManage = requirePermission('branches:manage');

  r.get('/', auth, async (_req, res, next) => {
    try {
      res.json({ items: await branchRepo.list() });
    } catch (err) {
      next(err);
    }
  });

  r.get('/:id', auth, validate({ params: idParamSchema }), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = await branchRepo.findById(id);
      if (!row) throw new NotFoundError('Sucursal');
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  r.post('/', auth, canManage, validate({ body: createSchema }), async (req, res, next) => {
    try {
      const created = await branchRepo.create(req.body);
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
        const updated = await branchRepo.update(id, req.body);
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
        await branchRepo.softDelete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/:id/settings',
    auth,
    canManage,
    validate({ params: idParamSchema }),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const branch = await branchRepo.findById(id);
        if (!branch) throw new NotFoundError('Sucursal');
        const settings = await branchSettingsRepo.findByBranchId(id);
        res.json(settings);
      } catch (err) {
        next(err);
      }
    },
  );

  r.put(
    '/:id/settings',
    auth,
    canManage,
    validate({ params: idParamSchema, body: settingsSchema }),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const settings = await branchSettingsRepo.upsert(id, req.body);
        res.json(settings);
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
