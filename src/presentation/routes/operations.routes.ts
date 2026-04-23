import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth, attachBranchFilter } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type { OperationsRepository } from '../../infrastructure/repositories/OperationsRepository';

/**
 * Rango de fechas inclusivo (from) / exclusivo (to) en el endpoint público,
 * lo que da la semántica "todo el día `to`" sin preocuparse por horas. El
 * repo interpreta `to` como un DATETIME literal (start-of-day del día
 * siguiente) para no perder los eventos del último día en el filtro
 * date_dt < to.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD')
  .refine((s) => !isNaN(Date.parse(s + 'T00:00:00Z')), 'Fecha inválida');

const operationsListQuery = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    branchId: z.coerce.number().int().positive().optional(),
    query: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: '`to` debe ser >= `from`',
    path: ['to'],
  });

const operationsSummaryQuery = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    branchId: z.coerce.number().int().positive().optional(),
    query: z.string().trim().max(120).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: '`to` debe ser >= `from`',
    path: ['to'],
  });

function parseFrom(s: string | undefined): Date | null {
  if (!s) return null;
  return new Date(s + 'T00:00:00');
}

function parseToExclusive(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Resolvé el branchId efectivo para el filtro:
 *   - Si el user NO tiene branches:view_all → forzamos a su branch.
 *     Ignora silenciosamente cualquier branchId del query.
 *   - Si SÍ tiene (admin / prueba) → usa el query branchId si vino, o null
 *     para "todas las sucursales".
 */
function resolveBranchScope(
  req: { branchFilter: number | null },
  queryBranchId: number | undefined,
): number | null {
  if (req.branchFilter !== null) return req.branchFilter;
  return queryBranchId ?? null;
}

export function operationsRouter(
  opsRepo: OperationsRepository,
  authService: AuthService,
): Router {
  const r = Router();
  const auth = requireAuth(authService);

  r.get(
    '/',
    auth,
    attachBranchFilter,
    validate({ query: operationsListQuery }),
    async (req, res, next) => {
      try {
        const q = req.query as unknown as z.output<typeof operationsListQuery>;
        const branchId = resolveBranchScope(
          { branchFilter: req.branchFilter ?? null },
          q.branchId,
        );

        const result = await opsRepo.list({
          from: parseFrom(q.from),
          to: parseToExclusive(q.to),
          branchId,
          query: q.query ?? null,
          limit: q.limit,
          offset: q.offset,
        });

        res.json({
          items: result.items,
          total: result.total,
          page: { limit: q.limit, offset: q.offset, count: result.items.length },
          branchFilter: branchId,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/summary',
    auth,
    attachBranchFilter,
    validate({ query: operationsSummaryQuery }),
    async (req, res, next) => {
      try {
        const q = req.query as unknown as z.output<typeof operationsSummaryQuery>;
        const branchId = resolveBranchScope(
          { branchFilter: req.branchFilter ?? null },
          q.branchId,
        );

        const summary = await opsRepo.summary({
          from: parseFrom(q.from),
          to: parseToExclusive(q.to),
          branchId,
          query: q.query ?? null,
        });

        res.json({
          ...summary,
          branchFilter: branchId,
          from: q.from ?? null,
          to: q.to ?? null,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
