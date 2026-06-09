# Blameless Post-Mortem Template

**Source:** QM-17 — Incident Management  
**Required for:** All P0 and P1 incidents  
**Deadline:** Within 5 business days of incident resolution

> **Blameless principle:** This document focuses on systems and processes, not individuals.
> The goal is to understand what happened and prevent recurrence — not to assign blame.

---

## Incident Summary

| Field                  | Value                 |
| ---------------------- | --------------------- |
| **Incident ID**        | INC-YYYY-MM-DD-NNN    |
| **Severity**           | P0 / P1               |
| **Date declared**      | YYYY-MM-DD HH:MM ICT  |
| **Date resolved**      | YYYY-MM-DD HH:MM ICT  |
| **Duration**           | **_ hours _** minutes |
| **Incident Commander** |                       |
| **Scribe**             |                       |
| **Affected tenants**   |                       |
| **User impact**        |                       |

---

## Timeline

| Time (ICT) | Event                            |
| ---------- | -------------------------------- |
| HH:MM      | Alert fired / issue reported     |
| HH:MM      | On-call paged                    |
| HH:MM      | IC assigned                      |
| HH:MM      | Mitigation started               |
| HH:MM      | Tenants notified via status page |
| HH:MM      | Root cause identified            |
| HH:MM      | Fix deployed                     |
| HH:MM      | Incident resolved                |

---

## Root Cause

> Describe the technical root cause. Be specific — include service names, error messages, query patterns, or config values that caused the failure.

(fill in)

---

## Contributing Factors

> What conditions allowed this to happen? Include: missing alerts, inadequate monitoring, gaps in runbooks, test coverage gaps, deployment process issues.

- (fill in)

---

## Impact Assessment

| Metric                     | Value                      |
| -------------------------- | -------------------------- |
| Tenants affected           |                            |
| Users affected (estimated) |                            |
| Data loss                  | Yes / No — describe if Yes |
| SLO error budget consumed  |                            |
| Downtime duration          |                            |

---

## What Went Well

> Things that helped contain or resolve the incident faster.

- (fill in)

---

## What Went Poorly

> Things that slowed detection, diagnosis, or resolution.

- (fill in)

---

## Action Items

| Action    | Owner | Due Date   | Ticket |
| --------- | ----- | ---------- | ------ |
| (fill in) |       | YYYY-MM-DD |        |

---

## Lessons Learned

> One paragraph summary of the key takeaway from this incident.

(fill in)

---

## Sign-Off

| Role               | Name | Date |
| ------------------ | ---- | ---- |
| Incident Commander |      |      |
| Engineering Lead   |      |      |
