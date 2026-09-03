// Reads JSON on stdin, prints the value of a JavaScript expression over it.
//
// This replaces `jq` in the Phase 19 readiness checks. `jq` is not a prerequisite of this
// repository — README.md §Prerequisites requires Node 24.x and pnpm 11.x and nothing else — and
// six Phase 19 checks piped through it, so they could not run on a machine that had never
// installed it. That is the same gap that silently disabled all eight .claude/hooks/ gates from
// at least 2026-07-24, found and fixed on 2026-09-03.
//
// The expression is evaluated with the parsed document bound to `d`:
//
//   kubectl get deployment -o json | node scripts/readiness/jsonpick.mjs 'd.items.length'
//   curl -s http://jaeger:16686/api/services | node scripts/readiness/jsonpick.mjs 'd.data.length'
//
// Objects print as indented JSON; everything else prints as-is. Exit 1 on unparseable input or a
// failing expression, so a check that cannot be evaluated fails its step instead of printing
// nothing and reading as a zero.

const expression = process.argv[2];

if (!expression) {
  process.stderr.write('usage: <json on stdin> | node jsonpick.mjs <expression over `d`>\n');
  process.exit(1);
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf8');

let d;
try {
  d = JSON.parse(raw);
} catch (err) {
  process.stderr.write(`jsonpick: stdin is not valid JSON: ${err.message}\n`);
  process.exit(1);
}

let value;
try {
  value = new Function('d', `return (${expression});`)(d);
} catch (err) {
  process.stderr.write(`jsonpick: expression failed: ${err.message}\n`);
  process.exit(1);
}

process.stdout.write(
  (typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value)) +
    '\n',
);
