import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema';

export interface ListOrdersOptions {
  limit: number;
  offset: number;
  deliveredOnly?: boolean;
}

export interface OrderListItem {
  id: number;
  clientId: number;
  clientName: string;
  deviceId: number;
  deviceModel: string;
  stateId: number;
  stateName: string;
  stateColor: string | null;
  branchId: number;
  branchName: string;
  createdAt: string;
  returnedAt: string | null;
}

export class OrderRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async listByBranch(
    branchId: number | null,
    opts: ListOrdersOptions,
  ): Promise<OrderListItem[]> {
    const conditions: SQL[] = [];
    if (branchId !== null) {
      conditions.push(eq(schema.orders.branchId, branchId));
    }
    if (opts.deliveredOnly === true) {
      conditions.push(sql`${schema.orders.returnedAt} IS NOT NULL`);
    } else if (opts.deliveredOnly === false) {
      conditions.push(sql`${schema.orders.returnedAt} IS NULL`);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        id: schema.orders.id,
        clientId: schema.orders.clientId,
        clientName: sql<string>`CONCAT_WS(' ', ${schema.clients.name}, ${schema.clients.surname})`,
        deviceId: schema.orders.deviceId,
        deviceModel: schema.devices.model,
        stateId: schema.orders.stateId,
        stateName: schema.states.name,
        stateColor: schema.states.color,
        branchId: schema.orders.branchId,
        branchName: schema.branches.name,
        createdAt: schema.orders.createdAt,
        returnedAt: schema.orders.returnedAt,
      })
      .from(schema.orders)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.orders.clientId))
      .innerJoin(schema.devices, eq(schema.devices.id, schema.orders.deviceId))
      .innerJoin(schema.states, eq(schema.states.id, schema.orders.stateId))
      .innerJoin(schema.branches, eq(schema.branches.id, schema.orders.branchId))
      .where(whereClause)
      .orderBy(desc(schema.orders.id))
      .limit(opts.limit)
      .offset(opts.offset);

    return rows;
  }
}
