import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';
import type { DatabaseEnvironment } from './env.js';

export function createDatabase(env: DatabaseEnvironment) {
  return createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.schema,
    connectionLimit: env.DB_CONNECTION_LIMIT,
    waitForConnections: true,
    queueLimit: 20,
    connectTimeout: 3000,
    multipleStatements: false,
    decimalNumbers: false,
    dateStrings: true,
  });
}

export async function checkDatabase(pool: Pool | undefined, schema: string) {
  if (!pool) throw new Error('MySQL sem configuração válida.');
  const [[row]] = await pool.query<(RowDataPacket & { schemaName: string })[]>({
    sql: 'SELECT DATABASE() AS schemaName', timeout: 3000,
  });
  if (row?.schemaName !== schema) throw new Error('Schema inesperado.');
}
