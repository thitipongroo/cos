import type { Client } from 'pg';

const DOMAIN_SCHEMAS = [
  'platform',
  'projects',
  'finance',
  'procurement',
  'workforce',
  'equipment',
  'documents',
  'safety',
  'analytics',
];

export async function truncateAllTables(client: Client): Promise<void> {
  await client.query('SET session_replication_role = replica');

  for (const schema of DOMAIN_SCHEMAS) {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1`,
      [schema],
    );
    for (const { tablename } of rows) {
      await client.query(`TRUNCATE TABLE ${schema}.${tablename} CASCADE`);
    }
  }

  await client.query('SET session_replication_role = DEFAULT');
}

export async function resetAndSeed(
  client: Client,
  seed: (client: Client) => Promise<void>,
): Promise<void> {
  await truncateAllTables(client);
  await seed(client);
}
