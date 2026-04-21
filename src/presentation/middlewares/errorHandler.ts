import type { Request, Response, NextFunction } from 'express';
import { DomainError } from '../../domain/errors';
import { logger } from '../../config/logger';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const reqLog = (req as Request & { log?: typeof logger }).log ?? logger;

  if (err instanceof DomainError) {
    reqLog.warn(
      { code: err.code, status: err.httpStatus, message: err.message },
      'domain error',
    );
    res.status(err.httpStatus).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  reqLog.error({ err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'internal', message: 'Internal server error' },
  });
}
