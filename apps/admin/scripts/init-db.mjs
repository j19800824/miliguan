import { Client } from 'pg';
import { getDatabaseFilePath, initializeDatabase } from '../src/lib/database.js';

function getAdminDatabaseUrl() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error('DATABASE_URL is not configured');
  }

  const databaseUrl = new URL(rawUrl);
  const databaseName = databaseUrl.pathname.replace(/^\//, '');

  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name');
  }

  databaseUrl.pathname = '/postgres';

  return {
    adminUrl: databaseUrl.toString(),
    databaseName
  };
}

async function ensureDatabaseExists() {
  const { adminUrl, databaseName } = getAdminDatabaseUrl();
  const client = new Client({ connectionString: adminUrl });

  await client.connect();

  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);

    if (result.rowCount === 0) {
      const safeName = databaseName.replace(/"/g, '""');
      await client.query(`CREATE DATABASE "${safeName}"`);
    }
  } finally {
    await client.end();
  }
}

await ensureDatabaseExists();
await initializeDatabase();

console.log(`PostgreSQL database ready: ${getDatabaseFilePath()}`);
