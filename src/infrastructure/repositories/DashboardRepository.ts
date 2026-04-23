import { sql, type SQL } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';

/**
 * Fuente de las métricas del dashboard de estadísticas. Todas las queries
 * son raw SQL via `sql` tag porque agregaciones y DATE_FORMAT bucketing son
 * más claros en SQL que en Drizzle DSL.
 *
 * Branch scope: las queries reciben `branchId: number | null`. null = todas
 * las sucursales (admin). Un número = filtro AND o JOIN por esa sucursal.
 * Todos los filtros por rango de fecha son inclusive en `from`, exclusive
 * en `to` (el caller traduce "día final del rango" a `to = dayAfter`).
 *
 * Las fechas de `movname` son VARCHAR `dd/m/yyyy HH:MM:SS` — el refactor de
 * fechas VARCHAR→DATETIME no tocó esa tabla por scope, así que revenue()
 * parsea con STR_TO_DATE en el WHERE (100% parseable en prod).
 */

export type Granularity = 'day' | 'week' | 'month';
export type PeriodPreset = 'week' | 'month';

export interface DashboardFilters {
  from: Date;
  to: Date;
  branchId: number | null;
}

export interface OrdersOverTimeBucket {
  bucket: string;
  created: number;
  delivered: number;
}

export interface RevenueBucket {
  bucket: string;
  facturacion: number;
}

export interface RevenueBreakdownRow {
  ingreso: string;
  egreso: string;
  count: number;
  total: number;
}

export interface RevenueResult {
  totalFacturacion: number;
  buckets: RevenueBucket[];
  breakdown: RevenueBreakdownRow[];
}

export interface TopProblemItem {
  token: string;
  count: number;
}

export interface TopProblemsResult {
  items: TopProblemItem[];
  totalOrdersScanned: number;
}

export interface BranchPerformanceRow {
  branchId: number;
  branchName: string;
  ordersCreated: number;
  ordersDelivered: number;
  avgDaysToDelivery: number | null;
  deliveredWithin7Days: number;
  deliveryRate: number;
}

export interface PeriodKpis {
  ordersCreated: number;
  ordersDelivered: number;
  avgDaysToDelivery: number | null;
  totalFacturacion: number;
}

export interface PeriodSnapshot extends PeriodKpis {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD (inclusive — último día del período)
}

export interface PeriodDelta {
  abs: number | null;
  pct: number | null;
}

export interface PeriodCompareResult {
  preset: PeriodPreset;
  anchor: string;
  current: PeriodSnapshot;
  previous: PeriodSnapshot;
  deltas: {
    ordersCreated: PeriodDelta;
    ordersDelivered: PeriodDelta;
    avgDaysToDelivery: PeriodDelta;
    totalFacturacion: PeriodDelta;
  };
}

export interface ProblemCountRow {
  key: string;
  count: number;
}

export interface ProblemDetailsResult {
  token: string;
  totalOrders: number;
  ordersDelivered: number;
  avgDaysToDelivery: number | null;
  deliveryRate: number;
  byBrand: ProblemCountRow[];
  byState: ProblemCountRow[];
  byBranch: ProblemCountRow[];
  samples: string[];
}

/**
 * Combinaciones (ingreso, egreso) del ledger movname que cuentan como
 * facturación. Se quedan explícitas acá porque interpretar el ledger
 * requiere conocer el negocio — ver la probe previa con los top
 * ingreso/egreso pairs. Agregar líneas acá si aparecen categorías nuevas.
 */
const FACTURACION_PAIRS: Array<{ ingreso: string; egreso: string }> = [
  { ingreso: 'Caja', egreso: 'Venta' },
  { ingreso: 'Caja', egreso: 'Reparaciones' },
];

const SPANISH_STOPWORDS = new Set([
  'para',
  'pero',
  'como',
  'este',
  'esta',
  'esto',
  'esos',
  'esas',
  'todos',
  'todas',
  'sobre',
  'desde',
  'entre',
  'hace',
  'hasta',
  'tiene',
  'tenía',
  'tenia',
  'puede',
  'mucho',
  'muchos',
  'cuando',
  'donde',
  'porque',
  'solo',
  'sólo',
  'también',
  'tambien',
  'nada',
  'algo',
  'algún',
  'algun',
  'algunos',
]);

function bucketFormatSql(granularity: Granularity): SQL {
  switch (granularity) {
    case 'day':
      return sql`'%Y-%m-%d'`;
    case 'week':
      // Lunes de la semana ISO del valor — formato YYYY-MM-DD para orden lexicográfico.
      return sql`'WEEK-START'`;
    case 'month':
      return sql`'%Y-%m-01'`;
  }
}

/**
 * Devuelve la expresión SQL que convierte un DATETIME a la clave del bucket.
 * Para semana devolvemos el lunes de la semana (DATE_SUB con WEEKDAY). Para
 * día y mes alcanza un DATE_FORMAT directo.
 */
function bucketExpr(col: SQL, granularity: Granularity): SQL {
  if (granularity === 'week') {
    return sql`DATE_FORMAT(DATE_SUB(${col}, INTERVAL WEEKDAY(${col}) DAY), '%Y-%m-%d')`;
  }
  return sql`DATE_FORMAT(${col}, ${bucketFormatSql(granularity)})`;
}

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ]/g, '');
}

export class DashboardRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async ordersOverTime(
    filters: DashboardFilters,
    granularity: Granularity,
  ): Promise<OrdersOverTimeBucket[]> {
    const branchClauseCreated =
      filters.branchId !== null ? sql`AND o.branches_id = ${filters.branchId}` : sql``;
    const branchClauseDelivered = branchClauseCreated;

    const createdBucket = bucketExpr(sql`o.created_at`, granularity);
    const deliveredBucket = bucketExpr(sql`o.returned_at`, granularity);

    const [createdRows] = (await this.db.execute(sql`
      SELECT ${createdBucket} AS bucket, COUNT(*) AS cnt
      FROM orders o
      WHERE o.created_at >= ${filters.from} AND o.created_at < ${filters.to}
        ${branchClauseCreated}
      GROUP BY bucket
      ORDER BY bucket
    `)) as unknown as [Array<{ bucket: string; cnt: number }>];

    const [deliveredRows] = (await this.db.execute(sql`
      SELECT ${deliveredBucket} AS bucket, COUNT(*) AS cnt
      FROM orders o
      WHERE o.returned_at IS NOT NULL
        AND o.returned_at >= ${filters.from} AND o.returned_at < ${filters.to}
        ${branchClauseDelivered}
      GROUP BY bucket
      ORDER BY bucket
    `)) as unknown as [Array<{ bucket: string; cnt: number }>];

    const byBucket = new Map<string, OrdersOverTimeBucket>();
    for (const row of createdRows) {
      byBucket.set(row.bucket, {
        bucket: row.bucket,
        created: Number(row.cnt),
        delivered: 0,
      });
    }
    for (const row of deliveredRows) {
      const existing = byBucket.get(row.bucket);
      if (existing) existing.delivered = Number(row.cnt);
      else byBucket.set(row.bucket, { bucket: row.bucket, created: 0, delivered: Number(row.cnt) });
    }
    return Array.from(byBucket.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  async revenue(filters: DashboardFilters, granularity: Granularity): Promise<RevenueResult> {
    const branchClause =
      filters.branchId !== null ? sql`AND branch_id = ${filters.branchId}` : sql``;

    const parsedFecha = sql`STR_TO_DATE(fecha, '%d/%m/%Y %H:%i:%s')`;
    const bucketCol = bucketExpr(parsedFecha, granularity);

    // Filtro de facturación: (ingreso, egreso) en una lista corta.
    const pairFilter = sql.join(
      FACTURACION_PAIRS.map((p) => sql`(ingreso = ${p.ingreso} AND egreso = ${p.egreso})`),
      sql` OR `,
    );

    const [totalRows] = (await this.db.execute(sql`
      SELECT COALESCE(SUM(monto), 0) AS total
      FROM movname
      WHERE ${parsedFecha} >= ${filters.from} AND ${parsedFecha} < ${filters.to}
        AND (${pairFilter})
        ${branchClause}
    `)) as unknown as [Array<{ total: number | string }>];

    const [bucketRows] = (await this.db.execute(sql`
      SELECT ${bucketCol} AS bucket, SUM(monto) AS facturacion
      FROM movname
      WHERE ${parsedFecha} >= ${filters.from} AND ${parsedFecha} < ${filters.to}
        AND (${pairFilter})
        ${branchClause}
      GROUP BY bucket
      ORDER BY bucket
    `)) as unknown as [Array<{ bucket: string; facturacion: number | string }>];

    const [breakdownRows] = (await this.db.execute(sql`
      SELECT ingreso, egreso, COUNT(*) AS cnt, SUM(monto) AS total
      FROM movname
      WHERE ${parsedFecha} >= ${filters.from} AND ${parsedFecha} < ${filters.to}
        ${branchClause}
      GROUP BY ingreso, egreso
      ORDER BY total DESC
    `)) as unknown as [
      Array<{ ingreso: string; egreso: string; cnt: number; total: number | string }>,
    ];

    return {
      totalFacturacion: Number(totalRows[0]?.total ?? 0),
      buckets: bucketRows.map((r) => ({
        bucket: r.bucket,
        facturacion: Number(r.facturacion),
      })),
      breakdown: breakdownRows.map((r) => ({
        ingreso: r.ingreso,
        egreso: r.egreso,
        count: Number(r.cnt),
        total: Number(r.total),
      })),
    };
  }

  async topProblems(filters: DashboardFilters, limit: number): Promise<TopProblemsResult> {
    const branchClause =
      filters.branchId !== null ? sql`AND o.branches_id = ${filters.branchId}` : sql``;

    // Cap defensivo: 50k filas máximo (contra memory spikes en rangos gigantes).
    // El dataset prod tiene ~13k órdenes en ~4 años; en la práctica no se toca.
    const [rows] = (await this.db.execute(sql`
      SELECT problem FROM orders o
      WHERE o.created_at >= ${filters.from} AND o.created_at < ${filters.to}
        ${branchClause}
      LIMIT 50000
    `)) as unknown as [Array<{ problem: string | null }>];

    const freq = new Map<string, number>();
    for (const row of rows) {
      if (!row.problem) continue;
      const words = row.problem.split(/\s+/);
      for (const word of words) {
        const t = normalizeToken(word);
        if (t.length < 4) continue;
        if (SPANISH_STOPWORDS.has(t)) continue;
        freq.set(t, (freq.get(t) ?? 0) + 1);
      }
    }

    const items = Array.from(freq.entries())
      .map(([token, count]) => ({ token, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return { items, totalOrdersScanned: rows.length };
  }

  async branchPerformance(filters: DashboardFilters): Promise<BranchPerformanceRow[]> {
    const branchClause =
      filters.branchId !== null ? sql`AND b.idbranches = ${filters.branchId}` : sql``;

    const [rows] = (await this.db.execute(sql`
      SELECT
        b.idbranches AS branch_id,
        b.branch AS branch_name,
        COUNT(o.order_id) AS orders_created,
        SUM(CASE WHEN o.returned_at IS NOT NULL THEN 1 ELSE 0 END) AS orders_delivered,
        AVG(CASE WHEN o.returned_at IS NOT NULL
                 THEN TIMESTAMPDIFF(DAY, o.created_at, o.returned_at) END) AS avg_days,
        SUM(CASE WHEN o.returned_at IS NOT NULL
                  AND TIMESTAMPDIFF(DAY, o.created_at, o.returned_at) <= 7
                 THEN 1 ELSE 0 END) AS within_7
      FROM branches b
      LEFT JOIN orders o ON o.branches_id = b.idbranches
        AND o.created_at >= ${filters.from} AND o.created_at < ${filters.to}
      WHERE b.deleted_at IS NULL
        ${branchClause}
      GROUP BY b.idbranches, b.branch
      ORDER BY orders_created DESC
    `)) as unknown as [
      Array<{
        branch_id: number;
        branch_name: string;
        orders_created: number;
        orders_delivered: number;
        avg_days: number | string | null;
        within_7: number;
      }>,
    ];

    return rows.map((r) => {
      const created = Number(r.orders_created);
      const delivered = Number(r.orders_delivered);
      return {
        branchId: Number(r.branch_id),
        branchName: r.branch_name,
        ordersCreated: created,
        ordersDelivered: delivered,
        avgDaysToDelivery: r.avg_days === null ? null : Number(r.avg_days),
        deliveredWithin7Days: Number(r.within_7),
        deliveryRate: created > 0 ? delivered / created : 0,
      };
    });
  }

  /**
   * Comparativo current vs previous para un preset (`week` o `month`) anclado
   * a una fecha. Devuelve los 4 KPIs en cada período más sus deltas abs/pct.
   *
   * Rangos:
   *   week  — lunes a domingo de la semana del anchor; previous = -7 días.
   *   month — primer día del mes del anchor al primer día del mes siguiente;
   *           previous = mes calendario anterior (puede tener 28-31 días).
   *
   * Los rangos se construyen con `new Date(y, m-1, d)` — Date local del
   * proceso, pero con wall-clock explícito. mysql2 formatea al enviarlo
   * usando la tz de Node; la DB compara strings literales contra sus
   * DATETIMEs (que almacenan AR-local wall-clock). El roundtrip preserva
   * el wall-clock sin importar la tz del proceso.
   */
  async periodCompare(opts: {
    anchor: Date;
    preset: PeriodPreset;
    branchId: number | null;
  }): Promise<PeriodCompareResult> {
    const ranges = computePeriodRanges(opts.anchor, opts.preset);
    const [currentKpis, previousKpis] = await Promise.all([
      this.kpiSnapshot({ from: ranges.current.from, to: ranges.current.to, branchId: opts.branchId }),
      this.kpiSnapshot({ from: ranges.previous.from, to: ranges.previous.to, branchId: opts.branchId }),
    ]);
    const current: PeriodSnapshot = {
      from: formatDateOnly(ranges.current.from),
      to: formatDateOnly(addDays(ranges.current.to, -1)),
      ...currentKpis,
    };
    const previous: PeriodSnapshot = {
      from: formatDateOnly(ranges.previous.from),
      to: formatDateOnly(addDays(ranges.previous.to, -1)),
      ...previousKpis,
    };
    return {
      preset: opts.preset,
      anchor: formatDateOnly(opts.anchor),
      current,
      previous,
      deltas: {
        ordersCreated: computeDelta(current.ordersCreated, previous.ordersCreated),
        ordersDelivered: computeDelta(current.ordersDelivered, previous.ordersDelivered),
        avgDaysToDelivery: computeDelta(current.avgDaysToDelivery, previous.avgDaysToDelivery),
        totalFacturacion: computeDelta(current.totalFacturacion, previous.totalFacturacion),
      },
    };
  }

  private async kpiSnapshot(filters: DashboardFilters): Promise<PeriodKpis> {
    const branchOrderClause =
      filters.branchId !== null ? sql`AND branches_id = ${filters.branchId}` : sql``;
    const branchMovnameClause =
      filters.branchId !== null ? sql`AND branch_id = ${filters.branchId}` : sql``;

    const parsedFecha = sql`STR_TO_DATE(fecha, '%d/%m/%Y %H:%i:%s')`;
    const pairFilter = sql.join(
      FACTURACION_PAIRS.map((p) => sql`(ingreso = ${p.ingreso} AND egreso = ${p.egreso})`),
      sql` OR `,
    );

    const [
      [createdRows],
      [deliveredRows],
      [facturacionRows],
    ] = (await Promise.all([
      this.db.execute(sql`
        SELECT COUNT(*) AS cnt FROM orders
        WHERE created_at >= ${filters.from} AND created_at < ${filters.to}
          ${branchOrderClause}
      `),
      this.db.execute(sql`
        SELECT COUNT(*) AS cnt,
               AVG(TIMESTAMPDIFF(DAY, created_at, returned_at)) AS avg_days
        FROM orders
        WHERE returned_at IS NOT NULL
          AND returned_at >= ${filters.from} AND returned_at < ${filters.to}
          ${branchOrderClause}
      `),
      this.db.execute(sql`
        SELECT COALESCE(SUM(monto), 0) AS total FROM movname
        WHERE ${parsedFecha} >= ${filters.from} AND ${parsedFecha} < ${filters.to}
          AND (${pairFilter})
          ${branchMovnameClause}
      `),
    ])) as unknown as [
      [Array<{ cnt: number }>, unknown],
      [Array<{ cnt: number; avg_days: number | string | null }>, unknown],
      [Array<{ total: number | string }>, unknown],
    ];

    return {
      ordersCreated: Number(createdRows[0]?.cnt ?? 0),
      ordersDelivered: Number(deliveredRows[0]?.cnt ?? 0),
      avgDaysToDelivery:
        deliveredRows[0]?.avg_days === null || deliveredRows[0]?.avg_days === undefined
          ? null
          : Number(deliveredRows[0].avg_days),
      totalFacturacion: Number(facturacionRows[0]?.total ?? 0),
    };
  }

  /**
   * Deep-dive sobre un token de problema dentro de un rango + branch scope.
   * Breakdown por marca, estado, sucursal + métricas de ciclo + 5 samples
   * del texto real del `problem` para que el frontend muestre contexto.
   *
   * `orders.problem` usa collation utf8mb4_0900_ai_ci → LIKE es case y accent
   * insensitive. `%` y `_` del token se escapan con `|` via ESCAPE para
   * evitar wildcards accidentales.
   */
  async problemDetails(token: string, filters: DashboardFilters): Promise<ProblemDetailsResult> {
    const branchClause =
      filters.branchId !== null ? sql`AND o.branches_id = ${filters.branchId}` : sql``;
    const likeValue = `%${escapeLike(token)}%`;
    const whereClause = sql`
      o.created_at >= ${filters.from} AND o.created_at < ${filters.to}
      AND o.problem LIKE ${likeValue} ESCAPE '|'
      ${branchClause}
    `;

    const [
      [totals],
      [byBrand],
      [byState],
      [byBranch],
      [samples],
    ] = (await Promise.all([
      this.db.execute(sql`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN o.returned_at IS NOT NULL THEN 1 ELSE 0 END) AS delivered,
               AVG(CASE WHEN o.returned_at IS NOT NULL
                        THEN TIMESTAMPDIFF(DAY, o.created_at, o.returned_at) END) AS avg_days
        FROM orders o
        WHERE ${whereClause}
      `),
      this.db.execute(sql`
        SELECT br.brand AS k, COUNT(*) AS cnt
        FROM orders o
        JOIN devices d ON d.iddevices = o.device_id
        JOIN brands br ON br.brandid = d.brand_id
        WHERE ${whereClause}
        GROUP BY br.brand
        ORDER BY cnt DESC
      `),
      this.db.execute(sql`
        SELECT s.state AS k, COUNT(*) AS cnt
        FROM orders o
        JOIN states s ON s.idstates = o.state_id
        WHERE ${whereClause}
        GROUP BY s.state
        ORDER BY cnt DESC
      `),
      this.db.execute(sql`
        SELECT b.branch AS k, COUNT(*) AS cnt
        FROM orders o
        JOIN branches b ON b.idbranches = o.branches_id
        WHERE ${whereClause}
        GROUP BY b.branch
        ORDER BY cnt DESC
      `),
      this.db.execute(sql`
        SELECT o.problem AS p
        FROM orders o
        WHERE ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT 5
      `),
    ])) as unknown as [
      [Array<{ total: number; delivered: number; avg_days: number | string | null }>, unknown],
      [Array<{ k: string; cnt: number }>, unknown],
      [Array<{ k: string; cnt: number }>, unknown],
      [Array<{ k: string; cnt: number }>, unknown],
      [Array<{ p: string }>, unknown],
    ];

    const total = Number(totals[0]?.total ?? 0);
    const delivered = Number(totals[0]?.delivered ?? 0);
    return {
      token,
      totalOrders: total,
      ordersDelivered: delivered,
      avgDaysToDelivery:
        totals[0]?.avg_days === null || totals[0]?.avg_days === undefined
          ? null
          : Number(totals[0].avg_days),
      deliveryRate: total > 0 ? delivered / total : 0,
      byBrand: byBrand.map((r) => ({ key: r.k, count: Number(r.cnt) })),
      byState: byState.map((r) => ({ key: r.k, count: Number(r.cnt) })),
      byBranch: byBranch.map((r) => ({ key: r.k, count: Number(r.cnt) })),
      samples: samples.map((r) => r.p),
    };
  }
}

function computePeriodRanges(
  anchor: Date,
  preset: PeriodPreset,
): { current: { from: Date; to: Date }; previous: { from: Date; to: Date } } {
  if (preset === 'week') {
    const day = anchor.getDay(); // 0=domingo ... 6=sábado
    const daysToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - daysToMonday);
    const nextMonday = addDays(monday, 7);
    const prevMonday = addDays(monday, -7);
    return {
      current: { from: monday, to: nextMonday },
      previous: { from: prevMonday, to: monday },
    };
  }
  // month
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const nextFirst = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const prevFirst = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
  return {
    current: { from: first, to: nextFirst },
    previous: { from: prevFirst, to: first },
  };
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function computeDelta(current: number | null, previous: number | null): PeriodDelta {
  if (current === null || previous === null) return { abs: null, pct: null };
  const abs = current - previous;
  const pct = previous === 0 ? null : abs / previous;
  return { abs, pct };
}

function escapeLike(v: string): string {
  return v.replace(/[|%_]/g, (c) => '|' + c);
}
