import { mysqlTable, int, varchar, datetime, float, primaryKey } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const users = mysqlTable('users', {
  id: int('idusers').autoincrement().primaryKey(),
  username: varchar('username', { length: 45 }).notNull(),
  passwordHash: varchar('password', { length: 60 }).notNull(),
  groupId: int('grupos_id').notNull(),
  branchId: int('branch_id').notNull(),
  userColor: varchar('user_color', { length: 45 }).default('#374151'),
  deletedAt: datetime('deleted_at'),
});

export const groups = mysqlTable('grupousuarios', {
  id: int('idgrupousuarios').autoincrement().primaryKey(),
  name: varchar('grupo', { length: 45 }).notNull(),
  deletedAt: datetime('deleted_at'),
});

export const branches = mysqlTable('branches', {
  id: int('idbranches').autoincrement().primaryKey(),
  name: varchar('branch', { length: 45 }).notNull(),
  contact: varchar('contact', { length: 100 }).notNull(),
  info: varchar('info', { length: 255 }).notNull(),
  ganancia: float('ganancia').notNull(),
  deletedAt: datetime('deleted_at'),
});

export const states = mysqlTable('states', {
  id: int('idstates').autoincrement().primaryKey(),
  name: varchar('state', { length: 155 }).notNull(),
  color: varchar('color', { length: 25 }),
  deletedAt: datetime('deleted_at'),
});

export const permissions = mysqlTable('permissions', {
  id: int('id').autoincrement().primaryKey(),
  code: varchar('code', { length: 64 }).notNull(),
  description: varchar('description', { length: 255 }),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const groupPermissions = mysqlTable(
  'group_permissions',
  {
    groupId: int('group_id').notNull(),
    permissionId: int('permission_id').notNull(),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.permissionId] }),
  }),
);

export const clients = mysqlTable('clients', {
  id: int('idclients').autoincrement().primaryKey(),
  name: varchar('name', { length: 45 }).notNull(),
  surname: varchar('surname', { length: 45 }),
  email: varchar('email', { length: 45 }),
  instagram: varchar('instagram', { length: 45 }),
  phone: varchar('phone', { length: 45 }),
});

export const devices = mysqlTable('devices', {
  id: int('iddevices').autoincrement().primaryKey(),
  brandId: int('brand_id').notNull(),
  typeId: int('type_id').notNull(),
  model: varchar('model', { length: 45 }).notNull(),
});

export const orders = mysqlTable('orders', {
  id: int('order_id').autoincrement().primaryKey(),
  clientId: int('client_id').notNull(),
  deviceId: int('device_id').notNull(),
  branchId: int('branches_id').notNull(),
  stateId: int('state_id').notNull(),
  usersId: int('users_id').notNull(),
  createdAt: varchar('created_at', { length: 11 }).notNull(),
  returnedAt: varchar('returned_at', { length: 11 }),
  problem: varchar('problem', { length: 500 }).notNull(),
  serial: varchar('serial', { length: 45 }),
  deviceColor: varchar('device_color', { length: 30 }),
});

export const orderStateHistory = mysqlTable('order_state_history', {
  id: int('id').autoincrement().primaryKey(),
  orderId: int('order_id').notNull(),
  fromStateId: int('from_state_id'),
  toStateId: int('to_state_id').notNull(),
  changedBy: int('changed_by').notNull(),
  changedAt: datetime('changed_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  note: varchar('note', { length: 255 }),
});

export const branchSettings = mysqlTable('branch_settings', {
  branchId: int('branch_id').primaryKey(),
  readyStateId: int('ready_state_id').notNull(),
  pickupReminderHours: int('pickup_reminder_hours').default(48).notNull(),
  incucaiStateId: int('incucai_state_id').notNull(),
  incucaiAfterDays: int('incucai_after_days').default(180).notNull(),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
