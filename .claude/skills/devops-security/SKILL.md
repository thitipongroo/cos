---
name: devops-security
description: Harden the running system and its supply chain - secrets, access, dependencies, network and configuration. Use when setting up infrastructure, before a security review, or after an exposure.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
  - "Bash"
---

# Security (Operations)

Most breaches come through a credential, a dependency or a misconfiguration - not
through clever exploitation of application code.

## Secrets

- Never in code, never in an image, never in an environment file that reaches git
- Injected at runtime from a secret manager
- Rotatable, with a schedule, and rotation tested before it is needed
- Scanned for in commits, and in history

## Access

- Least privilege by default. Start from nothing and add what breaks
- Separate credentials per environment. A production credential usable from a
  laptop is a production incident waiting for a bad day
- Every human access authenticated individually - no shared account, no shared key
- Revoke on departure, and verify the revocation

## Dependencies

Scan what actually ships, not the top-level list. Have a route to patch a
critical vulnerability in hours, and test that route before you need it.

## Network and configuration

Deny by default, open what is needed, and record why. Default credentials
changed, admin surfaces not publicly reachable, TLS enforced end to end.

## Rules

- **An exposed secret is compromised** - rotate it, do not assess whether anyone
  saw it
- **Log security-relevant events** - authentication, authorisation failures,
  privilege changes - separately and immutably
- Never postpone a fix because exploitation seems unlikely
