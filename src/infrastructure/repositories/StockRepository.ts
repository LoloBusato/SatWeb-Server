import { asc, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';

export interface StockBranchRow {
  branchId: number;
  branchName: string;
  cantidadBranch: number;
  cantidadRestante: number;
}

export interface StockDistribution {
  stockId: number;
  repuestoName: string;
  distribution: StockBranchRow[];
}

export class StockRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * Devuelve la distribución de un stock puntual entre todas las sucursales
   * que tienen fila en `stockbranch` para ese stock_id. Sin scope de branch:
   * el caller ve todas las sucursales (es un endpoint de consulta cruzada,
   * no de edición).
   */
  async distribution(stockId: number): Promise<StockDistribution | null> {
    const header = await this.db
      .select({
        stockId: schema.stock.id,
        repuestoName: schema.repuestos.name,
      })
      .from(schema.stock)
      .innerJoin(
        schema.repuestos,
        eq(schema.repuestos.id, schema.stock.repuestoId),
      )
      .where(eq(schema.stock.id, stockId))
      .limit(1);
    if (header.length === 0) return null;

    const rows = await this.db
      .select({
        branchId: schema.stockbranch.branchId,
        branchName: schema.branches.name,
        cantidadBranch: schema.stockbranch.cantidadBranch,
        cantidadRestante: schema.stockbranch.cantidadRestante,
      })
      .from(schema.stockbranch)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.stockbranch.branchId),
      )
      .where(eq(schema.stockbranch.stockId, stockId))
      .orderBy(asc(schema.stockbranch.branchId));

    return {
      stockId: header[0].stockId,
      repuestoName: header[0].repuestoName,
      distribution: rows,
    };
  }
}
