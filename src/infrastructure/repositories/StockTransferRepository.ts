import { and, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';
import { ConflictError, NotFoundError } from '../../domain/errors';

export interface TransferStockInput {
  stockId: number;
  fromBranchId: number;
  toBranchId: number;
  cantidad: number;
  transferredByUserId: number;
  note: string | null;
}

export interface StockTransferRecord {
  id: number;
  stockId: number;
  repuestoName: string | null;
  fromBranchId: number;
  fromBranchName: string | null;
  toBranchId: number;
  toBranchName: string | null;
  cantidad: number;
  transferredBy: number;
  transferredByUsername: string | null;
  transferredAt: Date;
  note: string | null;
}

export interface ListTransfersOptions {
  limit: number;
  offset: number;
  stockId?: number;
}

export class StockTransferRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * Ejecuta una transferencia atómica:
   *   1. Valida cantidad, no-op (from == to), destino vivo, y stock suficiente
   *      en stockbranch del origen.
   *   2. Resta cantidad_restante en la sucursal origen.
   *   3. Suma cantidad_branch + cantidad_restante en destino (upsert via
   *      ON DUPLICATE KEY UPDATE sobre UNIQUE (stock_id, branch_id);
   *      replica el comportamiento del legacy `PUT /api/stock/distribute/:id`).
   *   4. Inserta la fila de audit en stock_transfers.
   */
  async transfer(input: TransferStockInput): Promise<StockTransferRecord> {
    if (input.cantidad < 1) {
      throw new ConflictError('cantidad debe ser >= 1');
    }
    if (input.fromBranchId === input.toBranchId) {
      throw new ConflictError('La sucursal origen y destino no pueden ser la misma');
    }

    // Destino existe y no soft-deleted
    const destRows = await this.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(eq(schema.branches.id, input.toBranchId), isNull(schema.branches.deletedAt)),
      )
      .limit(1);
    if (destRows.length === 0) {
      throw new ConflictError('Sucursal destino inexistente o eliminada');
    }

    // Hay fila de stockbranch en origen con cantidad_restante suficiente
    const srcRows = await this.db
      .select({
        id: schema.stockbranch.id,
        cantidadRestante: schema.stockbranch.cantidadRestante,
      })
      .from(schema.stockbranch)
      .where(
        and(
          eq(schema.stockbranch.stockId, input.stockId),
          eq(schema.stockbranch.branchId, input.fromBranchId),
        ),
      )
      .limit(1);
    const src = srcRows[0];
    if (!src) {
      throw new ConflictError('La sucursal origen no tiene este stock asignado');
    }
    if (src.cantidadRestante < input.cantidad) {
      throw new ConflictError(
        `Stock insuficiente en la sucursal origen: solicitadas ${input.cantidad}, disponibles ${src.cantidadRestante}`,
      );
    }

    let insertedId = 0;

    await this.db.transaction(async (tx) => {
      // 1. Decrementar origen
      await tx
        .update(schema.stockbranch)
        .set({
          cantidadRestante: sql`${schema.stockbranch.cantidadRestante} - ${input.cantidad}`,
        })
        .where(
          and(
            eq(schema.stockbranch.stockId, input.stockId),
            eq(schema.stockbranch.branchId, input.fromBranchId),
          ),
        );

      // 2. Incrementar destino (upsert replicando el legacy /distribute)
      await tx
        .insert(schema.stockbranch)
        .values({
          stockId: input.stockId,
          branchId: input.toBranchId,
          cantidadBranch: input.cantidad,
          cantidadRestante: input.cantidad,
        })
        .onDuplicateKeyUpdate({
          set: {
            cantidadBranch: sql`${schema.stockbranch.cantidadBranch} + ${input.cantidad}`,
            cantidadRestante: sql`${schema.stockbranch.cantidadRestante} + ${input.cantidad}`,
          },
        });

      // 3. Audit
      const [result] = await tx
        .insert(schema.stockTransfers)
        .values({
          stockId: input.stockId,
          fromBranchId: input.fromBranchId,
          toBranchId: input.toBranchId,
          cantidad: input.cantidad,
          transferredBy: input.transferredByUserId,
          note: input.note,
        })
        .$returningId();
      insertedId = result.id;
    });

    const created = await this.findById(insertedId);
    if (!created) throw new NotFoundError('Transfer');
    return created;
  }

  async findById(id: number): Promise<StockTransferRecord | null> {
    const fromBranch = alias(schema.branches, 'from_branch');
    const toBranch = alias(schema.branches, 'to_branch');

    const rows = await this.db
      .select({
        id: schema.stockTransfers.id,
        stockId: schema.stockTransfers.stockId,
        repuestoName: schema.repuestos.name,
        fromBranchId: schema.stockTransfers.fromBranchId,
        fromBranchName: fromBranch.name,
        toBranchId: schema.stockTransfers.toBranchId,
        toBranchName: toBranch.name,
        cantidad: schema.stockTransfers.cantidad,
        transferredBy: schema.stockTransfers.transferredBy,
        transferredByUsername: schema.users.username,
        transferredAt: schema.stockTransfers.transferredAt,
        note: schema.stockTransfers.note,
      })
      .from(schema.stockTransfers)
      .leftJoin(schema.stock, eq(schema.stock.id, schema.stockTransfers.stockId))
      .leftJoin(
        schema.repuestos,
        eq(schema.repuestos.id, schema.stock.repuestoId),
      )
      .leftJoin(fromBranch, eq(fromBranch.id, schema.stockTransfers.fromBranchId))
      .leftJoin(toBranch, eq(toBranch.id, schema.stockTransfers.toBranchId))
      .leftJoin(schema.users, eq(schema.users.id, schema.stockTransfers.transferredBy))
      .where(eq(schema.stockTransfers.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  async list(
    branchFilter: number | null,
    opts: ListTransfersOptions,
  ): Promise<StockTransferRecord[]> {
    const fromBranch = alias(schema.branches, 'from_branch');
    const toBranch = alias(schema.branches, 'to_branch');

    const conditions: SQL[] = [];
    if (opts.stockId !== undefined) {
      conditions.push(eq(schema.stockTransfers.stockId, opts.stockId));
    }
    if (branchFilter !== null) {
      const branchOr = or(
        eq(schema.stockTransfers.fromBranchId, branchFilter),
        eq(schema.stockTransfers.toBranchId, branchFilter),
      );
      if (branchOr) conditions.push(branchOr);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return this.db
      .select({
        id: schema.stockTransfers.id,
        stockId: schema.stockTransfers.stockId,
        repuestoName: schema.repuestos.name,
        fromBranchId: schema.stockTransfers.fromBranchId,
        fromBranchName: fromBranch.name,
        toBranchId: schema.stockTransfers.toBranchId,
        toBranchName: toBranch.name,
        cantidad: schema.stockTransfers.cantidad,
        transferredBy: schema.stockTransfers.transferredBy,
        transferredByUsername: schema.users.username,
        transferredAt: schema.stockTransfers.transferredAt,
        note: schema.stockTransfers.note,
      })
      .from(schema.stockTransfers)
      .leftJoin(schema.stock, eq(schema.stock.id, schema.stockTransfers.stockId))
      .leftJoin(
        schema.repuestos,
        eq(schema.repuestos.id, schema.stock.repuestoId),
      )
      .leftJoin(fromBranch, eq(fromBranch.id, schema.stockTransfers.fromBranchId))
      .leftJoin(toBranch, eq(toBranch.id, schema.stockTransfers.toBranchId))
      .leftJoin(schema.users, eq(schema.users.id, schema.stockTransfers.transferredBy))
      .where(whereClause)
      .orderBy(desc(schema.stockTransfers.transferredAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }
}
