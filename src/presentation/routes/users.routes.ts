import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth, requirePermission } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type { UserRepository } from '../../infrastructure/repositories/UserRepository';
import { NotFoundError } from '../../domain/errors';
import { toPublicUser } from '../../domain/entities/User';

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const createSchema = z.object({
  username: z.string().trim().min(1).max(45),
  password: z.string().min(8).max(200),
  groupId: z.number().int().positive(),
  branchId: z.number().int().positive(),
  userColor: z.string().max(45).nullable().optional(),
});

const updateSchema = z.object({
  username: z.string().trim().min(1).max(45).optional(),
  password: z.string().min(8).max(200).optional(),
  groupId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  userColor: z.string().max(45).nullable().optional(),
});

export function usersRouter(
  userRepo: UserRepository,
  authService: AuthService,
): Router {
  const r = Router();
  const auth = requireAuth(authService);
  const canManage = requirePermission('users:manage');

  r.get('/', auth, canManage, async (_req, res, next) => {
    try {
      const items = (await userRepo.list()).map(toPublicUser);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  r.get(
    '/:id',
    auth,
    canManage,
    validate({ params: idParamSchema }),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const row = await userRepo.findById(id);
        if (!row) throw new NotFoundError('Usuario');
        res.json(toPublicUser(row));
      } catch (err) {
        next(err);
      }
    },
  );

  r.post('/', auth, canManage, validate({ body: createSchema }), async (req, res, next) => {
    try {
      const passwordHash = await authService.hashPassword(req.body.password);
      const created = await userRepo.create({
        username: req.body.username,
        passwordHash,
        groupId: req.body.groupId,
        branchId: req.body.branchId,
        userColor: req.body.userColor ?? null,
      });
      res.status(201).json(toPublicUser(created));
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
        const { password, ...rest } = req.body;
        const input: Parameters<typeof userRepo.update>[1] = { ...rest };
        if (password !== undefined) {
          input.passwordHash = await authService.hashPassword(password);
        }
        const updated = await userRepo.update(id, input);
        res.json(toPublicUser(updated));
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
        await userRepo.softDelete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
