// JSON access for the .claude/hooks/ scripts.
//
// Why this file exists: every hook used to parse its payload with `jq`. `jq` is not a
// prerequisite of this repository — README.md §Prerequisites requires Node 24.x and pnpm 11.x
// and nothing else — so on a machine without it every hook read an empty value and took its
// "nothing to check here" branch. That is indistinguishable from a clean pass, so all eight
// gates were open from at least 2026-07-24 with nothing reporting a problem.
//
// Node is already required to run this repository at all, so this cannot recur the same way.
//
// Exit codes are the contract; the caller distinguishes them:
//   0  success / predicate true
//   1  predicate false (a normal answer, not a failure)
//   2  usage error
//   3  unusable input — unreadable file, malformed JSON, missing stdin

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function die(code, message) {
  process.stderr.write(`json-query: ${message}\n`);
  process.exit(code);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function readJsonFile(path) {
  const { readFile } = await import('node:fs/promises');
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    die(3, `cannot read ${path}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    die(3, `${path} is not valid JSON: ${err.message}`);
  }
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  // Reads a hook payload on stdin. Writes file_path, then content, each NUL-terminated, so a
  // content field containing newlines survives the round trip into bash `read -d ''`.
  case 'input': {
    const raw = await readStdin();
    if (raw.trim() === '') die(3, 'no hook payload on stdin');
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      die(3, `hook payload is not valid JSON: ${err.message}`);
    }
    const input = payload?.tool_input ?? {};
    const filePath = typeof input.file_path === 'string' ? input.file_path : '';
    const content =
      typeof input.content === 'string'
        ? input.content
        : typeof input.new_string === 'string'
          ? input.new_string
          : '';
    process.stdout.write(`${filePath}\0${content}\0`);
    break;
  }

  // Rule 26: is <name> declared in any dependency field of <package.json>?
  case 'has-dep': {
    const [file, name] = args;
    if (!file || !name) die(2, 'usage: has-dep <package.json> <name>');
    const pkg = await readJsonFile(file);
    const found = DEP_FIELDS.some((field) => {
      const deps = pkg?.[field];
      return deps !== null && typeof deps === 'object' && Object.hasOwn(deps, name);
    });
    process.exit(found ? 0 : 1);
    break;
  }

  // Rule 32: does <file> carry a top-level <key>?
  case 'has-key': {
    const [file, key] = args;
    if (!file || !key) die(2, 'usage: has-key <file.json> <key>');
    const json = await readJsonFile(file);
    const present = json !== null && typeof json === 'object' && Object.hasOwn(json, key);
    process.exit(present ? 0 : 1);
    break;
  }

  // Rule 27: keys of the first of <field...> that is present, one per line.
  // turbo.json is read as `keys turbo.json pipeline tasks` because the key was renamed
  // between Turborepo 1.x and 2.x and the hook must accept either.
  case 'keys': {
    const [file, ...fields] = args;
    if (!file || fields.length === 0) die(2, 'usage: keys <file.json> <field> [field...]');
    const json = await readJsonFile(file);
    for (const field of fields) {
      const value = json?.[field];
      if (value !== null && typeof value === 'object') {
        const names = Object.keys(value);
        if (names.length > 0) process.stdout.write(`${names.join('\n')}\n`);
        process.exit(0);
      }
    }
    process.exit(1);
    break;
  }

  default:
    die(2, `unknown command: ${command ?? '(none)'}`);
}
