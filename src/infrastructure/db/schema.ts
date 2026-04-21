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
