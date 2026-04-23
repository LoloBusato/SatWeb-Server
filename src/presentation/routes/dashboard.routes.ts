import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth, attachBranchFilter } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type {
  DashboardRepository,
  Granularity,
} from '../../infrastructure/repositories/DashboardRepository';

/**
 * Dashboard de Fase 4 iter 2 — 4 endpoints paralelos, cada uno un KPI:
 *   GET /api/v2/dashboard/orders-over-time
 *   GET /api/v2/dashboard/revenue
 *   GET /api/v2/dashboard/top-problems
 *   GET /api/v2/dashboard/branch-performance
 *
 * Filtros comunes: from/to (ISO date, rango inclusive-inclusive traducido
 * internamente a [from, to+1day) ), branchId (admin-only override).
 *
 * Branch scope: idéntico al resto de v2 — `attachBranchFilter` setea
 * `req.branchFilter` al branch del user o null si tiene branches:view_all.
 * Usuarios regulares ven sólo su sucursal (branchId del query es ignorado);
 * admin ve todas o puede narrowear con ?branchId=X.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD')
  .refine((s) => !isNaN(Date.parse(s + 'T00:00:00Z')), 'Fecha inválida');

const dateRangeQuery = z
  .object({
    from: isoDate,
    to: isoDate,
    branchId: z.coerce.number().int().positive().optional(),
  })
  .refine((q) => q.from <= q.to, { message: '`to` debe ser >= `from`', path: ['to'] });

const granularityQuery = dateRangeQuery.and(
  z.object({ granularity: z.enum(['day', 'week', 'month']).default('day') }),
);

const topProblemsQuery = dateRangeQuery.and(
  z.object({ limit: z.coerce.number().int().min(1).max(100).default(15) }),
);

function parseFrom(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function parseToExclusive(s: string): Date {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d;
}

function resolveBranchScope(
  branchFilter: number | null,
  queryBranchId: number | undefined,
): number | null {
  if (branchFilter !== null) return branchFilter;
  return queryBranchId ?? null;
}

export function dashboardRouter(
  dashboardRepo: DashboardRepository,
  authService: AuthService,
): Router {
  const r = Router();
  const auth = requireAuth(authService);

  r.get(
    '/orders-over-time',
    auth,
    attachBranchFilter,
    validate({ query: granularityQuery }),
    async (req, res, next) => {
      try {
        const q = req.query as unknown as z.output<typeof granularityQuery>;
        const branchId = resolveBranchScope(req.branchFilter ?? null, q.branchId);

        const buckets = await dashboardRepo.ordersOverTime(
          {
            from: parseFrom(q.from),
            to: parseToExclusive(q.to),
            branchId,
          },
          q.granularity as Granularity,
        );

        res.json({
          from: q.from,
          to: q.to,
          branchFilter: branchId,
          granularity: q.granularity,
          buckets,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/revenue',
    auth,
    attachBranchFilter,
    validate({ query: granularityQuery }),
    async (req, res, next) => {
      try {
        const q = req.query as unknown as z.output<typeof granularityQuery>;
        const branchId = resolveBranchScope(req.branchFilter ?? null, q.branchId);

        const result = await dashboardRepo.revenue(
          { from: parseFrom(q.from), to: parseToExclusive(q.to), branchId },
          q.granularity as Granularity,
        );

        res.json({
          from: q.from,
          to: q.to,
          branchFilter: branchId,
          granularity: q.granularity,
          ...result,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/top-problems',
    auth,
    attachBranchFilter,
    validate({ query: topProblemsQuery }),
    async (req, res, next) => {
      try {
        const q = req.query as unknown as z.output<typeof topProblemsQuery>;
        const branchId = resolveBranchScope(req.branchFilter ?? null, q.branchId);

        const result = await dashboardRepo.topProblems(
          { from: parseFrom(q.from), to: parseToExclusive(q.to), branchId },
          q.limit,
        );

        res.json({
          from: q.from,
          to: q.to,
          branchFilter: branchId,
          limit: q.limit,
          ...result,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/branch-performance',
    auth,
    attachBranchFilter,
    validate({ query: dateRangeQuery }),
    async (req, res, next) => {
      try {
        const q = req.query as unknown as z.output<typeof dateRangeQuery>;
        const branchId = resolveBranchScope(req.branchFilter ?? null, q.branchId);

        const items = await dashboardRepo.branchPerformance({
          from: parseFrom(q.from),
          to: parseToExclusive(q.to),
          branchId,
        });

        res.json({ from: q.from, to: q.to, branchFilter: branchId, items });
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
