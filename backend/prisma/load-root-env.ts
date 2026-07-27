// Two-file env scheme (spec §08): the only .env is the monorepo ROOT one. These prisma scripts run
// with cwd = backend/ (ts-node via `pnpm --filter @cos/backend`), so the root .env is ../.env; the
// second path covers a run from the repo root. dotenv does not override already-set vars, so an env
// value passed on the command line still wins. Imported for its side effect: `import './load-root-env'`.
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../.env') });
config({ path: resolve(process.cwd(), '.env') });
