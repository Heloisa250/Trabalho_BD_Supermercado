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
  const [[row]] = await pool.query<(RowDataPacket & { schemaName: string; caseMode: number })[]>({
    sql: 'SELECT DATABASE() AS schemaName, @@lower_case_table_names AS caseMode', timeout: 3000,
  });
  const expected = row?.caseMode === 1 ? schema.toLowerCase() : schema;
  if (row?.schemaName !== expected) throw new Error('Schema inesperado.');
}
