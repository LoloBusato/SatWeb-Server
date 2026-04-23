import { sql, type SQL } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';

/**
 * Operaciones completadas = flujo unificado de:
 *   - Órdenes entregadas (orders con returned_at IS NOT NULL).
 *   - Ventas sueltas (reducestock con orderid IS NULL — stock reducido
 *     que no corresponde a una reparación sino a una venta directa).
 *
 * Branch scoping:
 *   - orders: filtramos por branches_id (sucursal origen). Replica el filtro
 *     del frontend legacy (Operaciones.js). Una variante futura podría
 *     considerar current_branch_id para que lab branches aparezcan en su
 *     dashboard cuando reciben órdenes de otra sucursal.
 *   - sales: stockbranch.branch_id (sucursal donde ocurrió el consumo).
 */
export interface OperationsFilters {
  from: Date | null;
  to: Date | null;
  branchId: number | null;
  query: string | null;
}

export interface OperationsListOptions extends OperationsFilters {
  limit: number;
  offset: number;
}

export interface OperationItem {
  kind: 'order' | 'sale';
  id: number;
  date: Date;
  branchId: number;
  branchName: string;
  label: string;
  clientName: string | null;
  deviceModel: string | null;
  repuestoName: string | null;
  esGarantia: number | null;
}

export interface OperationsListResult {
  items: OperationItem[];
  total: number;
}

export interface OperationsSummary {
  orderCount: number;
  saleCount: number;
  totalCount: number;
}

export class OperationsRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  private orderFilters(f: OperationsFilters): SQL[] {
    const conds: SQL[] = [sql`o.returned_at IS NOT NULL`];
    if (f.from) conds.push(sql`o.returned_at >= ${f.from}`);
    if (f.to) conds.push(sql`o.returned_at < ${f.to}`);
    if (f.branchId !== null) conds.push(sql`o.branches_id = ${f.branchId}`);
    if (f.query) {
      const q = `%${f.query}%`;
      conds.push(
        sql`(CONCAT_WS(' ', c.name, c.surname) LIKE ${q} OR d.model LIKE ${q} OR CONCAT('Orden #', o.order_id) LIKE ${q})`,
      );
    }
    return conds;
  }

  private saleFilters(f: OperationsFilters): SQL[] {
    const conds: SQL[] = [sql`rs.orderid IS NULL`];
    if (f.from) conds.push(sql`rs.\`date\` >= ${f.from}`);
    if (f.to) conds.push(sql`rs.\`date\` < ${f.to}`);
    if (f.branchId !== null) conds.push(sql`sb.branch_id = ${f.branchId}`);
    if (f.query) {
      const q = `%${f.query}%`;
      conds.push(sql`r.repuesto LIKE ${q}`);
    }
    return conds;
  }

  async list(opts: OperationsListOptions): Promise<OperationsListResult> {
    const orderConds = this.orderFilters(opts);
    const saleConds = this.saleFilters(opts);

    const orderWhere = sql.join(orderConds, sql` AND `);
    const saleWhere = sql.join(saleConds, sql` AND `);

    // Cada expresión de texto lleva COLLATE explícito para evitar
    // "Illegal mix of collations" en el UNION. Los literales y los
    // CAST NULL AS CHAR heredan la collation del conexión (general_ci
    // típicamente), mientras que las columnas de texto del schema son
    // utf8mb4_0900_ai_ci. MySQL rechaza el UNION sin conversion explícita.
    const unionSql = sql`
      (SELECT
         'order' COLLATE utf8mb4_0900_ai_ci AS kind,
         o.order_id AS id,
         o.returned_at AS \`date\`,
         o.branches_id AS branch_id,
         b.branch COLLATE utf8mb4_0900_ai_ci AS branch_name,
         CONCAT('Orden #', o.order_id) COLLATE utf8mb4_0900_ai_ci AS label,
         CONCAT_WS(' ', c.name, c.surname) COLLATE utf8mb4_0900_ai_ci AS client_name,
         d.model COLLATE utf8mb4_0900_ai_ci AS device_model,
         CAST(NULL AS CHAR) COLLATE utf8mb4_0900_ai_ci AS repuesto_name,
         CAST(NULL AS UNSIGNED) AS es_garantia
       FROM orders o
       JOIN branches b ON b.idbranches = o.branches_id
       JOIN clients c ON c.idclients = o.client_id
       JOIN devices d ON d.iddevices = o.device_id
       WHERE ${orderWhere})
      UNION ALL
      (SELECT
         'sale' COLLATE utf8mb4_0900_ai_ci AS kind,
         rs.idreducestock AS id,
         rs.\`date\` AS \`date\`,
         sb.branch_id,
         b.branch COLLATE utf8mb4_0900_ai_ci AS branch_name,
         r.repuesto COLLATE utf8mb4_0900_ai_ci AS label,
         CAST(NULL AS CHAR) COLLATE utf8mb4_0900_ai_ci AS client_name,
         CAST(NULL AS CHAR) COLLATE utf8mb4_0900_ai_ci AS device_model,
         r.repuesto COLLATE utf8mb4_0900_ai_ci AS repuesto_name,
         rs.es_garantia
       FROM reducestock rs
       JOIN stockbranch sb ON sb.stockbranchid = rs.stockbranch_id
       JOIN stock s ON s.idstock = sb.stock_id
       JOIN repuestos r ON r.idrepuestos = s.repuesto_id
       JOIN branches b ON b.idbranches = sb.branch_id
       WHERE ${saleWhere})
    `;

    // Tiebreaker por (kind, id) para que la paginación sea determinista
    // cuando varias filas comparten `date` — frecuente con DATETIMEs a
    // resolución de segundo y con orders.returned_at a 00:00:00.
    const [rows] = (await this.db.execute(sql`
      SELECT * FROM (${unionSql}) u
      ORDER BY \`date\` DESC, kind ASC, id DESC
      LIMIT ${opts.limit} OFFSET ${opts.offset}
    `)) as unknown as [
      Array<{
        kind: 'order' | 'sale';
        id: number;
        date: Date;
        branch_id: number;
        branch_name: string;
        label: string;
        client_name: string | null;
        device_model: string | null;
        repuesto_name: string | null;
        es_garantia: number | null;
      }>,
    ];

    const [totalRows] = (await this.db.execute(sql`
      SELECT COUNT(*) AS total FROM (${unionSql}) u
    `)) as unknown as [Array<{ total: number }>];

    return {
      items: rows.map((r) => ({
        kind: r.kind,
        id: Number(r.id),
        date: r.date instanceof Date ? r.date : new Date(r.date),
        branchId: Number(r.branch_id),
        branchName: r.branch_name,
        label: r.label,
        clientName: r.client_name,
        deviceModel: r.device_model,
        repuestoName: r.repuesto_name,
        esGarantia:
          r.es_garantia === null || r.es_garantia === undefined
            ? null
            : Number(r.es_garantia),
      })),
      total: Number(totalRows[0]?.total ?? 0),
    };
  }

  async summary(filters: OperationsFilters): Promise<OperationsSummary> {
    const orderConds = this.orderFilters(filters);
    const saleConds = this.saleFilters(filters);
    const orderWhere = sql.join(orderConds, sql` AND `);
    const saleWhere = sql.join(saleConds, sql` AND `);

    const [rows] = (await this.db.execute(sql`
      SELECT
        (SELECT COUNT(*)
         FROM orders o
         JOIN branches b ON b.idbranches = o.branches_id
         JOIN clients c ON c.idclients = o.client_id
         JOIN devices d ON d.iddevices = o.device_id
         WHERE ${orderWhere}) AS order_count,
        (SELECT COUNT(*)
         FROM reducestock rs
         JOIN stockbranch sb ON sb.stockbranchid = rs.stockbranch_id
         JOIN stock s ON s.idstock = sb.stock_id
         JOIN repuestos r ON r.idrepuestos = s.repuesto_id
         JOIN branches b ON b.idbranches = sb.branch_id
         WHERE ${saleWhere}) AS sale_count
    `)) as unknown as [Array<{ order_count: number; sale_count: number }>];

    const orderCount = Number(rows[0]?.order_count ?? 0);
    const saleCount = Number(rows[0]?.sale_count ?? 0);
    return { orderCount, saleCount, totalCount: orderCount + saleCount };
  }
}
