import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { requireAuth, attachBranchFilter } from '../middlewares/requireAuth';
import {
  formatDateOnly,
  respondMaybeCsv,
  type CsvColumn,
} from '../helpers/csv';
import type { AuthService } from '../../application/services/AuthService';
import type {
  OperationsRepository,
  OperationItem,
} from '../../infrastructure/repositories/OperationsRepository';

/**
 * Rango de fechas inclusivo (from) / inclusivo (to) en el endpoint público.
 * Internamente `to` se traduce al start-of-day del día siguiente para usarse
 * como límite exclusivo y no perder los eventos del último día del rango.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD')
  .refine((s) => !isNaN(Date.parse(s + 'T00:00:00Z')), 'Fecha inválida');

const formatEnum = z.enum(['json', 'csv']).optional();

const operationsListQuery = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    branchId: z.coerce.number().int().positive().optional(),
    query: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    format: formatEnum,
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
    format: formatEnum,
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: '`to` debe ser >= `from`',
    path: ['to'],
  });

const OPERATIONS_CSV_COLUMNS: CsvColumn<OperationItem>[] = [
  { header: 'kind', value: (r) => r.kind },
  { header: 'id', value: (r) => r.id },
  { header: 'date', value: (r) => formatDateOnly(r.date) },
  { header: 'branchId', value: (r) => r.branchId },
  { header: 'branchName', value: (r) => r.branchName },
  { header: 'label', value: (r) => r.label },
  { header: 'clientName', value: (r) => r.clientName },
  { header: 'deviceModel', value: (r) => r.deviceModel },
  { header: 'repuestoName', value: (r) => r.repuestoName },
  { header: 'esGarantia', value: (r) => (r.esGarantia == null ? '' : r.esGarantia === 1 ? 'sí' : 'no') },
];

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

        respondMaybeCsv(
          req,
          res,
          {
            items: result.items,
            total: result.total,
            page: { limit: q.limit, offset: q.offset, count: result.items.length },
            branchFilter: branchId,
          },
          {
            filename: `operations-${q.from ?? 'all'}-${q.to ?? 'all'}.csv`,
            rows: result.items,
            columns: OPERATIONS_CSV_COLUMNS,
          },
        );
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

        respondMaybeCsv(
          req,
          res,
          { ...summary, branchFilter: branchId, from: q.from ?? null, to: q.to ?? null },
          {
            filename: `operations-summary-${q.from ?? 'all'}-${q.to ?? 'all'}.csv`,
            rows: [summary],
            columns: [
              { header: 'orderCount', value: (r) => r.orderCount },
              { header: 'saleCount', value: (r) => r.saleCount },
              { header: 'totalCount', value: (r) => r.totalCount },
            ],
          },
        );
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}
