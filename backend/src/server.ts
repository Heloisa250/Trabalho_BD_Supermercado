import { createApp } from './app.js';
import { employeeRepository } from './modules/auth/repository.js';
import { authService } from './modules/auth/service.js';
import { checkDatabase, createDatabase } from './config/database.js';
import { loadEnvironment } from './config/env.js';

const official = process.argv.includes('--official');
const env = loadEnvironment(official);
const database = env.database ? createDatabase(env.database) : undefined;
const app = createApp({
  corsOrigin: env.CORS_ORIGIN,
  database,
  admins: env.ADMIN_MATRICULAS,
  auth: {
    service: authService(employeeRepository(database), env.JWT_SECRET, env.AUTH_TTL_SECONDS, official),
    ttl: env.AUTH_TTL_SECONDS,
    secure: env.NODE_ENV === 'production',
  },
  checkDatabase: () => checkDatabase(database, official ? 'Supermercado' : 'supermercado'),
});

const listening = () => console.info('API disponível na porta ' + env.PORT);
const server = official ? app.listen(env.PORT, '127.0.0.1', listening) : app.listen(env.PORT, listening);

function shutdown() {
  server.close(async (error) => {
    try {
      await database?.end();
    } catch {
      process.exitCode = 1;
    }
    if (error) process.exitCode = 1;
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
