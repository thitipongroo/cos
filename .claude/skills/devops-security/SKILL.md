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

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins
— read it before applying anything here.

- `context.md` QM-4 — Security
- ADR-013
- spec §5.2

QM-4 decides where secrets live by deployment type — AWS Secrets Manager for cloud, HashiCorp Vault on premise,
SealedSecret for anything that must sit in git. It also fixes TLS 1.3 as the ingress minimum and AES-256 as the at-rest
minimum.
