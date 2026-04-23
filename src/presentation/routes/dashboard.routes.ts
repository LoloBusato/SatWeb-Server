import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth, attachBranchFilter } from '../middlewares/requireAuth';
import { respondMaybeCsv, type CsvColumn } from '../helpers/csv';
import type { AuthService } from '../../application/services/AuthService';
import type {
  DashboardRepository,
  Granularity,
  PeriodPreset,
  OrdersOverTimeBucket,
  RevenueBucket,
  RevenueBreakdownRow,
  TopProblemItem,
  BranchPerformanceRow,
  PeriodSnapshot,
  ProblemCountRow,
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

const formatEnum = z.enum(['json', 'csv']).optional();

const dateRangeQuery = z
  .object({
    from: isoDate,
    to: isoDate,
    branchId: z.coerce.number().int().positive().optional(),
    format: formatEnum,
  })
  .refine((q) => q.from <= q.to, { message: '`to` debe ser >= `from`', path: ['to'] });

const granularityQuery = dateRangeQuery.and(
  z.object({
    granularity: z.enum(['day', 'week', 'month']).default('day'),
    // revenue: elegí qué dataset exportar como CSV (los 3 están en el JSON).
    section: z.enum(['buckets', 'breakdown']).optional(),
  }),
);

const topProblemsQuery = dateRangeQuery.and(
  z.object({ limit: z.coerce.number().int().min(1).max(100).default(15) }),
);

const periodCompareQuery = z.object({
  preset: z.enum(['week', 'month']),
  anchor: isoDate.optional(),
  branchId: z.coerce.number().int().positive().optional(),
  format: formatEnum,
});

const problemDetailsQuery = dateRangeQuery.and(
  z.object({
    token: z.string().trim().min(1).max(60),
    // problem-details: elegí qué breakdown exportar como CSV.
    section: z.enum(['byBrand', 'byState', 'byBranch']).optional(),
  }),
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

// ======================== CSV column definitions ========================

const ORDERS_OVER_TIME_COLUMNS: CsvColumn<OrdersOverTimeBucket>[] = [
  { header: 'bucket', value: (r) => r.bucket },
  { header: 'created', value: (r) => r.created },
  { header: 'delivered', value: (r) => r.delivered },
];

const REVENUE_BUCKET_COLUMNS: CsvColumn<RevenueBucket>[] = [
  { header: 'bucket', value: (r) => r.bucket },
  { header: 'facturacion', value: (r) => r.facturacion },
];

const REVENUE_BREAKDOWN_COLUMNS: CsvColumn<RevenueBreakdownRow>[] = [
  { header: 'ingreso', value: (r) => r.ingreso },
  { header: 'egreso', value: (r) => r.egreso },
  { header: 'count', value: (r) => r.count },
  { header: 'total', value: (r) => r.total },
];

const TOP_PROBLEMS_COLUMNS: CsvColumn<TopProblemItem>[] = [
  { header: 'token', value: (r) => r.token },
  { header: 'count', value: (r) => r.count },
];

const BRANCH_PERFORMANCE_COLUMNS: CsvColumn<BranchPerformanceRow>[] = [
  { header: 'branchId', value: (r) => r.branchId },
  { header: 'branchName', value: (r) => r.branchName },
  { header: 'ordersCreated', value: (r) => r.ordersCreated },
  { header: 'ordersDelivered', value: (r) => r.ordersDelivered },
  { header: 'avgDaysToDelivery', value: (r) => r.avgDaysToDelivery?.toFixed(2) ?? '' },
  { header: 'deliveredWithin7Days', value: (r) => r.deliveredWithin7Days },
  { header: 'deliveryRate', value: (r) => r.deliveryRate.toFixed(4) },
];

type PeriodCsvRow = PeriodSnapshot & { period: 'current' | 'previous' };
const PERIOD_COMPARE_COLUMNS: CsvColumn<PeriodCsvRow>[] = [
  { header: 'period', value: (r) => r.period },
  { header: 'from', value: (r) => r.from },
  { header: 'to', value: (r) => r.to },
  { header: 'ordersCreated', value: (r) => r.ordersCreated },
  { header: 'ordersDelivered', value: (r) => r.ordersDelivered },
  { header: 'avgDaysToDelivery', value: (r) => r.avgDaysToDelivery?.toFixed(2) ?? '' },
  { header: 'totalFacturacion', value: (r) => r.totalFacturacion },
];

const PROBLEM_COUNT_COLUMNS: CsvColumn<ProblemCountRow>[] = [
  { header: 'key', value: (r) => r.key },
  { header: 'count', value: (r) => r.count },
];

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

        respondMaybeCsv(
          req,
          res,
          { from: q.from, to: q.to, branchFilter: branchId, granularity: q.granularity, buckets },
          {
            filename: `orders-over-time-${q.from}-${q.to}.csv`,
            rows: buckets,
            columns: ORDERS_OVER_TIME_COLUMNS,
          },
        );
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

        const jsonPayload = {
          from: q.from,
          to: q.to,
          branchFilter: branchId,
          granularity: q.granularity,
          ...result,
        };

        // Sección para CSV: por default `breakdown` (más útil para contabilidad).
        // `section=buckets` exporta la serie temporal.
        if ((q.section ?? 'breakdown') === 'buckets') {
          respondMaybeCsv(req, res, jsonPayload, {
            filename: `revenue-buckets-${q.from}-${q.to}.csv`,
            rows: result.buckets,
            columns: REVENUE_BUCKET_COLUMNS,
          });
        } else {
          respondMaybeCsv(req, res, jsonPayload, {
            filename: `revenue-breakdown-${q.from}-${q.to}.csv`,
            rows: result.breakdown,
            columns: REVENUE_BREAKDOWN_COLUMNS,
          });
        }
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

        respondMaybeCsv(
          req,
          res,
          { from: q.from, to: q.to, branchFilter: branchId, limit: q.limit, ...result },
          {
            filename: `top-problems-${q.from}-${q.to}.csv`,
            rows: result.items,
            columns: TOP_PROBLEMS_COLUMNS,
          },
        );
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

        respondMaybeCsv(
          req,
          res,
          { from: q.from, to: q.to, branchFilter: branchId, items },
          {
            filename: `branch-performance-${q.from}-${q.to}.csv`,
            rows: items,
            columns: BRANCH_PERFORMANCE_COLUMNS,
          },
        );
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

        const csvRows: PeriodCsvRow[] = [
          { period: 'current', ...result.current },
          { period: 'previous', ...result.previous },
        ];

        respondMaybeCsv(
          req,
          res,
          { ...result, branchFilter: branchId },
          {
            filename: `period-compare-${q.preset}-${result.anchor}.csv`,
            rows: csvRows,
            columns: PERIOD_COMPARE_COLUMNS,
          },
        );
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

        // Sección para CSV: byBranch por default (más útil para reportar por
        // sucursal). byBrand/byState disponibles con ?section=X.
        const section = q.section ?? 'byBranch';
        const csvRows =
          section === 'byBrand'
            ? result.byBrand
            : section === 'byState'
              ? result.byState
              : result.byBranch;

        respondMaybeCsv(
          req,
          res,
          { from: q.from, to: q.to, branchFilter: branchId, ...result },
          {
            filename: `problem-details-${q.token}-${section}.csv`,
            rows: csvRows,
            columns: PROBLEM_COUNT_COLUMNS,
          },
        );
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
