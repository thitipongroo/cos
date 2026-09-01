---
name: qa-security-testing
description: Probe an application for exploitable weaknesses - injection, broken access control, exposure of secrets and data. Use before a release, after an auth change, or when a security review is required.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
---

# Security Testing

Only test systems you are authorised to test. Confirm the scope in writing before
starting, and stay inside it.

## What to cover

1. **Access control** - can a user reach another user's data by changing an
   identifier? This is the most common serious finding and the easiest to check
2. **Injection** - untrusted input reaching a query, a shell, a path, a template
   or a deserializer
3. **Authentication** - session fixation, tokens that outlive a logout, password
   reset that leaks account existence, missing rate limits on login
4. **Exposure** - secrets in code, in logs, in error messages, in client bundles,
   in git history
5. **Transport and headers** - TLS version and configuration, and the headers the
   project requires
6. **Dependencies** - known vulnerabilities in what is actually shipped

## Reporting a finding

- **Where** and **how to reproduce**, precisely
- **What an attacker gains** - the concrete impact, not a category name
- **Severity** by impact and how reachable it is
- **The fix**, specifically

## Rules

- Never test production without written authorisation and a window
- Never exfiltrate real data to demonstrate a finding. Prove access, then stop
- Report through the agreed channel only. A vulnerability in a public ticket is a
  disclosure
- Say plainly when you found nothing. An empty result is a valid outcome

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins — read it before applying anything here.

- `context.md` QM-4 — Security
- QM-5 — Data Privacy & Compliance
- spec §5.9

QM-4 lists what must be hardened and the scanners that gate merge (CodeQL, Semgrep CE, ruff, jscpd). §5.9 holds the STRIDE threat model per external surface. Pentest findings go to `docs/registers/pentest-findings.md`.
