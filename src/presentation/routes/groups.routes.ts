import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth, requirePermission } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type { GroupRepository } from '../../infrastructure/repositories/GroupRepository';
import type { PermissionRepository } from '../../infrastructure/repositories/PermissionRepository';
import { NotFoundError } from '../../domain/errors';

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(45),
});

const updateSchema = createSchema.partial();

const setPermissionsSchema = z.object({
  permissionIds: z.array(z.number().int().positive()).max(500),
});

export function groupsRouter(
  groupRepo: GroupRepository,
  permRepo: PermissionRepository,
  authService: AuthService,
): Router {
  const r = Router();
  const auth = requireAuth(authService);
  const canManage = requirePermission('groups:manage');

  r.get('/', auth, async (_req, res, next) => {
    try {
      res.json({ items: await groupRepo.list() });
    } catch (err) {
      next(err);
    }
  });

  r.get('/:id', auth, validate({ params: idParamSchema }), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = await groupRepo.findById(id);
      if (!row) throw new NotFoundError('Grupo');
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  r.post('/', auth, canManage, validate({ body: createSchema }), async (req, res, next) => {
    try {
      res.status(201).json(await groupRepo.create(req.body));
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
        res.json(await groupRepo.update(id, req.body));
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
        await groupRepo.softDelete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/:id/permissions',
    auth,
    canManage,
    validate({ params: idParamSchema }),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const group = await groupRepo.findById(id);
        if (!group) throw new NotFoundError('Grupo');
        res.json({ items: await permRepo.listByGroupId(id) });
      } catch (err) {
        next(err);
      }
    },
  );

  r.put(
    '/:id/permissions',
    auth,
    canManage,
    validate({ params: idParamSchema, body: setPermissionsSchema }),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const group = await groupRepo.findById(id);
        if (!group) throw new NotFoundError('Grupo');
        const items = await permRepo.setGroupPermissions(id, req.body.permissionIds);
        res.json({ items });
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
