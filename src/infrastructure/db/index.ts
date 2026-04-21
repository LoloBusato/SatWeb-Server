import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { env } from '../../config/env';
import * as schema from './schema';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DBNAME,
  connectionLimit: 15,
});

export const db = drizzle(pool, { schema, mode: 'default' });
