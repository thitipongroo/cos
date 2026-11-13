// Guard on the tenant id that reaches a SQL literal in enterprise-provisioning.activities.
//
// migrateDataActivity used to run `pg_dump ... --where="tenant_id='${tenantId}'" | psql ...` through
// /bin/sh, so a tenantId carrying a quote or `$(...)` was arbitrary command execution (CodeQL
// js/indirect-command-line-injection). Since D46 (2026-11-13) there is no shell — pg_dump has no --where
// at all — but the copy still puts the id into COPY statements as a literal (COPY takes no bind
// parameters), so the UUID check stays. The URL check that guarded the shell command went with it.
//
// The activity itself is excluded from the coverage gate (it provisions real infrastructure and
// cannot run under jest), which is precisely why the guard was pulled out as a pure function.

import { assertUuid } from '../workflows/enterprise-provisioning.activities';

describe('assertUuid', () => {
  it.each([
    ['a v4 UUID', '3f2504e0-4f89-41d3-9a0c-0305e82c3301'],
    ['an uppercase UUID', '3F2504E0-4F89-41D3-9A0C-0305E82C3301'],
    ['a nil UUID', '00000000-0000-0000-0000-000000000000'],
  ])('accepts %s', (_label, value) => {
    expect(() => assertUuid(value, 'tenantId')).not.toThrow();
  });

  it.each([
    ['a shell-quote break-out', "3f2504e0-4f89-41d3-9a0c-0305e82c3301'; rm -rf /; #"],
    ['command substitution', '$(id)'],
    ['backtick substitution', '`id`'],
    ['a pipe', 'abc | cat /etc/passwd'],
    ['a semicolon', 'abc; whoami'],
    ['a UUID with trailing junk', '3f2504e0-4f89-41d3-9a0c-0305e82c3301x'],
    ['a UUID with a leading space', ' 3f2504e0-4f89-41d3-9a0c-0305e82c3301'],
    ['a truncated UUID', '3f2504e0-4f89-41d3-9a0c'],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(() => assertUuid(value, 'tenantId')).toThrow('tenantId must be a UUID');
  });

  it('names the offending field and does not echo the value back', () => {
    // The value can contain attacker-controlled text; it has no business in the error message.
    expect(() => assertUuid('$(id)', 'rdsEndpoint')).toThrow('rdsEndpoint must be a UUID');
    expect(() => assertUuid('$(id)', 'rdsEndpoint')).not.toThrow(/\$\(id\)/);
  });
});
