import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';

export interface OrderLocationTransfer {
  id: number;
  orderId: number;
  fromBranchId: number | null;
  fromBranchName: string | null;
  toBranchId: number;
  toBranchName: string | null;
  transferredBy: number;
  transferredByUsername: string | null;
  transferredAt: Date;
  note: string | null;
}

export class OrderLocationHistoryRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async listByOrderId(orderId: number): Promise<OrderLocationTransfer[]> {
    const fromBranch = alias(schema.branches, 'from_branch');
    const toBranch = alias(schema.branches, 'to_branch');

    const rows = await this.db
      .select({
        id: schema.orderLocationHistory.id,
        orderId: schema.orderLocationHistory.orderId,
        fromBranchId: schema.orderLocationHistory.fromBranchId,
        fromBranchName: fromBranch.name,
        toBranchId: schema.orderLocationHistory.toBranchId,
        toBranchName: toBranch.name,
        transferredBy: schema.orderLocationHistory.transferredBy,
        transferredByUsername: schema.users.username,
        transferredAt: schema.orderLocationHistory.transferredAt,
        note: schema.orderLocationHistory.note,
      })
      .from(schema.orderLocationHistory)
      .leftJoin(fromBranch, eq(fromBranch.id, schema.orderLocationHistory.fromBranchId))
      .leftJoin(toBranch, eq(toBranch.id, schema.orderLocationHistory.toBranchId))
      .leftJoin(schema.users, eq(schema.users.id, schema.orderLocationHistory.transferredBy))
      .where(eq(schema.orderLocationHistory.orderId, orderId))
      .orderBy(asc(schema.orderLocationHistory.transferredAt));

    return rows;
  }
}
