import { config } from 'dotenv';
import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const origin = z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin);
const schema = z.object({
  PORT: port.default(3001),
  ACADEMIC_DEMO: z.enum(['0', '1']).default('0').transform(value => value === '1'),
  ADMIN_MATRICULAS: z.string().default('').transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(32),
  AUTH_TTL_SECONDS: z.coerce.number().int().min(1).max(86400).default(1800),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5175,http://localhost:5175')
    .transform((value) => value.split(',').map((entry) => entry.trim()))
    .pipe(z.array(origin).min(1)),
});

const databaseSchema = z.object({
  DB_HOST: z.string().trim().min(1).default('127.0.0.1'),
  DB_PORT: port.default(3306),
  DB_USER: z.string().trim().min(1).refine((user) => user.toLowerCase() !== 'root'),
  DB_PASSWORD: z.string().min(1),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(50).default(5),
});

export type DatabaseEnvironment = z.infer<typeof databaseSchema> & { schema: 'supermercado' | 'Supermercado' };

export function loadEnvironment(official = false) {
  const source: NodeJS.ProcessEnv = official ? {} : process.env;
  const loaded = config({ path: official ? '.env.official' : '.env', processEnv: source, quiet: true });
  if (official && loaded.error) throw new Error('Configuração paralela ausente: backend/.env.official');
  const settings = official ? { PORT: '3002', DB_PORT: '3307', CORS_ORIGIN: 'http://localhost:5176,http://127.0.0.1:5176', ...source } : source;
  const result = schema.safeParse(settings);
  if (!result.success) {
    throw new Error('Configuração inválida: ' + result.error.issues.map((issue) => issue.path.join('.')).join(', '));
  }
  const database = databaseSchema.safeParse(settings);
  if (!database.success) {
    const fields = database.error.issues.map((issue) => issue.path.join('.'));
    console.warn('MySQL indisponível por configuração: ' + fields.join(', '));
  }
  const schemaName = official ? 'Supermercado' : 'supermercado';
  const connection: DatabaseEnvironment | undefined = database.success
    ? { ...database.data, schema: schemaName } : undefined;
  return { ...result.data, database: connection };
}
