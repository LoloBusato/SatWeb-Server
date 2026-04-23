import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth, attachBranchFilter } from '../middlewares/requireAuth';
import type { AuthService } from '../../application/services/AuthService';
import type {
  DashboardRepository,
  Granularity,
  PeriodPreset,
} from '../../infrastructure/repositories/DashboardRepository';

/**
 * Dashboard de estadísticas — 6 endpoints paralelos bajo /api/v2/dashboard:
 *   GET /orders-over-time    — serie temporal con granularidad.
 *   GET /revenue             — facturación desde movname + breakdown.
 *   GET /top-problems        — tokens más frecuentes en orders.problem.
 *   GET /branch-performance  — métricas por sucursal.
 *   GET /period-compare      — current vs previous (week|month) con deltas.
 *   GET /problem-details     — deep-dive sobre un token (byBrand/State/Branch).
 *
 * Filtros comunes: from/to (ISO date, rango inclusive-inclusive traducido
 * internamente a [from, to+1day) ), branchId (admin-only override).
 *
 * Branch scope: `attachBranchFilter` setea `req.branchFilter` al branch del
 * user o null si tiene branches:view_all. Usuarios regulares ven sólo su
 * sucursal; admin ve todas o puede narrowear con ?branchId=X.
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

const periodCompareQuery = z.object({
  preset: z.enum(['week', 'month']),
  anchor: isoDate.optional(),
  branchId: z.coerce.number().int().positive().optional(),
});

const problemDetailsQuery = dateRangeQuery.and(
  z.object({ token: z.string().trim().min(1).max(60) }),
);

function parseFrom(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function parseToExclusive(s: string): Date {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Devuelve la fecha calendario de hoy en Buenos Aires como Date de wall-clock
 * local. Vale para el default del `anchor` de period-compare cuando el caller
 * no lo pasa; el servidor en UTC podría ver un día distinto al usuario AR.
 */
function todayInBuenosAires(): Date {
  const iso = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  });
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
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

  r.get(
    '/period-compare',
    auth,
    attachBranchFilter,
    validate({ query: periodCompareQuery }),
    async (req, res, next) => {
      try {
        const q = req.query as unknown as z.output<typeof periodCompareQuery>;
        const branchId = resolveBranchScope(req.branchFilter ?? null, q.branchId);

        const anchor = q.anchor ? parseFrom(q.anchor) : todayInBuenosAires();
        const result = await dashboardRepo.periodCompare({
          anchor,
          preset: q.preset as PeriodPreset,
          branchId,
        });

        res.json({ ...result, branchFilter: branchId });
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/problem-details',
    auth,
    attachBranchFilter,
    validate({ query: problemDetailsQuery }),
    async (req, res, next) => {
      try {
        const q = req.query as unknown as z.output<typeof problemDetailsQuery>;
        const branchId = resolveBranchScope(req.branchFilter ?? null, q.branchId);

        const result = await dashboardRepo.problemDetails(q.token, {
          from: parseFrom(q.from),
          to: parseToExclusive(q.to),
          branchId,
        });

        res.json({ from: q.from, to: q.to, branchFilter: branchId, ...result });
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
