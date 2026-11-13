// `prisma migrate deploy` against one database, from inside the backend image (D45, 2026-11-13).
//
// runMigrationsActivity used `execSync('npx prisma migrate deploy', { env: { DATABASE_URL: tenantUrl } })`.
// Three things made that unable to work, each measured:
//   - the image has no npx (removed with npm, D43) and no prisma CLI (it was a devDependency);
//   - the image had neither the schema nor the migrations nor prisma.config.ts;
//   - Prisma 7 takes the migrate URL from prisma.config.ts → env('DIRECT_DATABASE_URL'), not from
//     DATABASE_URL. In the worker DIRECT_DATABASE_URL is the SHARED database, so with the tools in place
//     the command would have migrated the shared database and left the tenant's new one empty.
//
// So: the CLI is a dependency, the image carries backend/prisma/{schema.prisma,migrations} and
// backend/prisma.config.ts, and this runs the CLI's own entry point with node — execFile, no shell, no
// npx — from backend/ (where prisma.config.ts resolves its relative paths), with BOTH variables set to
// the target URL.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

/** backend/ — this module sits four levels below it, as src/… in tests and dist/… in the image. */
export const BACKEND_ROOT = path.resolve(__dirname, '../../../..');

export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; maxBuffer: number },
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

const execFileAsync = promisify(execFile) as unknown as ExecFileFn;

export interface MigrateDeployResult {
  stdout: string;
  stderr: string;
}

export async function prismaMigrateDeploy(
  dbUrl: string,
  run: ExecFileFn = execFileAsync,
): Promise<MigrateDeployResult> {
  const cli = require.resolve('prisma/build/index.js', { paths: [BACKEND_ROOT] });
  const { stdout, stderr } = await run(process.execPath, [cli, 'migrate', 'deploy'], {
    cwd: BACKEND_ROOT,
    // CHECKPOINT_DISABLE: the CLI's version check / telemetry call home stays off inside the worker.
    env: {
      ...process.env,
      DIRECT_DATABASE_URL: dbUrl,
      DATABASE_URL: dbUrl,
      CHECKPOINT_DISABLE: '1',
    },
    maxBuffer: 16 * 1024 * 1024,
  });
  return { stdout: String(stdout), stderr: String(stderr) };
}
