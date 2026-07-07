// Cross-platform `clean` helper: removes dist/ and any *.tsbuildinfo in the
// current working directory. Replaces the Unix-only `rm -rf dist *.tsbuildinfo`
// shell command, which fails on Windows cmd.exe. Zero external dependencies.
import { rmSync, readdirSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

for (const entry of readdirSync('.')) {
  if (entry.endsWith('.tsbuildinfo')) {
    rmSync(entry, { force: true });
  }
}
