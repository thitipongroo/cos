// Cross-platform copy of Avro schema files (src/avro/*.avsc -> dist/avro/).
// Replaces the previous shell one-liner (`mkdir -p ... && cp ...`) which is not
// portable to Windows cmd.exe. Uses only Node built-ins — no extra dependency.
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(pkgRoot, 'src', 'avro');
const destDir = join(pkgRoot, 'dist', 'avro');

mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const entry of readdirSync(srcDir)) {
  if (entry.endsWith('.avsc')) {
    copyFileSync(join(srcDir, entry), join(destDir, entry));
    copied += 1;
  }
}

console.log(`copy:avro — copied ${copied} .avsc file(s) to dist/avro`);
