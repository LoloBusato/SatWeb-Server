import { Router } from 'express';
import { requireAuth, requirePermission } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type { PermissionRepository } from '../../infrastructure/repositories/PermissionRepository';

export function permissionsRouter(
  permRepo: PermissionRepository,
  authService: AuthService,
): Router {
  const r = Router();
  const auth = requireAuth(authService);
  const canManageGroups = requirePermission('groups:manage');

  r.get('/', auth, canManageGroups, async (_req, res, next) => {
    try {
      res.json({ items: await permRepo.listAll() });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
