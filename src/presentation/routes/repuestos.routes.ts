import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth, requirePermission } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type { RepuestoRepository } from '../../infrastructure/repositories/RepuestoRepository';
import { NotFoundError } from '../../domain/errors';

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(155),
  cantidadLimite: z.number().int().min(0).optional(),
  colorId: z.number().int().positive().nullable().optional(),
  nombreRepuestosId: z.number().int().positive().nullable().optional(),
  calidadRepuestosId: z.number().int().positive().nullable().optional(),
  almacenamientoRepuestosId: z.number().int().positive().nullable().optional(),
  venta: z.boolean().optional(),
  precioVentaSugerido: z.number().nonnegative().max(99999999.99).nullable().optional(),
  deviceIds: z.array(z.number().int().positive()).optional(),
});

const updateSchema = createSchema.partial();

export function repuestosRouter(
  repo: RepuestoRepository,
  authService: AuthService,
): Router {
  const r = Router();
  const auth = requireAuth(authService);
  const canManage = requirePermission('repuestos:manage');

  r.get('/', auth, async (_req, res, next) => {
    try {
      const items = await repo.list();
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  r.get('/:id', auth, validate({ params: idParamSchema }), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = await repo.findById(id);
      if (!row) throw new NotFoundError('Repuesto');
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  r.post('/', auth, canManage, validate({ body: createSchema }), async (req, res, next) => {
    try {
      const created = await repo.create(req.body);
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
        const updated = await repo.update(id, req.body);
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
        await repo.softDelete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
