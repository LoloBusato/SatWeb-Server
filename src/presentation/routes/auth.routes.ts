import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import { UnauthorizedError } from '../../domain/errors';

const loginSchema = z.object({
  username: z.string().min(1).max(45),
  password: z.string().min(1).max(200),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export function authRouter(authService: AuthService): Router {
  const r = Router();
  const auth = requireAuth(authService);

  r.post('/login', validate({ body: loginSchema }), async (req, res, next) => {
    try {
      const result = await authService.login(req.body.username, req.body.password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  r.get('/me', auth, (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    res.json({
      user: {
        id: req.user.sub,
        username: req.user.username,
        branchId: req.user.branchId,
        groupId: req.user.groupId,
      },
      permissions: req.user.permissions,
    });
  });

  r.post(
    '/change-password',
    auth,
    validate({ body: changePasswordSchema }),
    async (req, res, next) => {
      try {
        if (!req.user) throw new UnauthorizedError();
        await authService.changePassword(
          req.user.sub,
          req.body.oldPassword,
          req.body.newPassword,
        );
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
