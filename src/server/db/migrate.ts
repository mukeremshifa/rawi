import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { socketDb } from './client';

try {
  process.loadEnvFile('.dev.vars');
} catch {
  /* Shell configuration is also supported. */
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is missing. Configure the designated development database in .dev.vars.');
  process.exitCode = 1;
} else {
  const direct = new URL(url);
  direct.hostname = direct.hostname.replace('-pooler.', '.');
  const connection = socketDb(direct.toString());
  try {
    await migrate(connection.db, { migrationsFolder: './drizzle' });
    console.log('Development database migrations applied.');
  } catch {
    console.error(
      'Migration failed. Check the development database connection and reviewed migration SQL. No connection details are logged.',
    );
    process.exitCode = 1;
  } finally {
    await connection.close();
  }
}
