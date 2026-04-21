import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../domain/errors';
import type { AuthService } from '../../application/services/AuthService';

export function requireAuth(authService: AuthService) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Falta header Authorization'));
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      req.user = authService.verifyToken(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requirePermission(code: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!req.user.permissions.includes(code)) {
      return next(new ForbiddenError());
    }
    next();
  };
}

export function attachBranchFilter(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new UnauthorizedError());
  req.branchFilter = req.user.permissions.includes('branches:view_all')
    ? null
    : req.user.branchId;
  next();
}
