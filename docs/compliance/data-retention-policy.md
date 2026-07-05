# Construction OS — Data Retention Policy

> **Purpose:** Define the retention period and disposal method for each entity type stored by
> Construction OS. Required by PDPA B.E. 2562 §26 and QM-5. Reviewed annually and before each
> Stage transition.

---

## Principles

1. **Data minimization** — collect and retain only what is necessary for the stated purpose.
2. **Purpose limitation** — data is not retained beyond the period needed to fulfill the purpose for which it was collected.
3. **Accuracy** — stale data that no longer serves its purpose is deleted or anonymized, not kept indefinitely.
4. **Right to erasure** — when a data subject exercises their PDPA §33 right, deletion / anonymization is completed within 30 days, subject to legal hold exceptions below.

---

## Retention schedule

### Identity and authentication data

| Entity                               | Table / Store               | Retention Period               | Disposal Method                                                 | Legal Basis    |
| ------------------------------------ | --------------------------- | ------------------------------ | --------------------------------------------------------------- | -------------- |
| User account (active)                | Keycloak + `identity.users` | Active account lifetime        | N/A (active)                                                    | Contractual    |
| User account (deleted / deactivated) | Keycloak + `identity.users` | 30 days after deletion request | Anonymize (replace PII with `[DELETED]`); purge Keycloak record | PDPA §33       |
| SMS OTP attempt log                  | `identity.otp_attempts`     | 30 days                        | Hard delete                                                     | Security audit |
| Refresh tokens                       | Keycloak session store      | Token TTL (7 days rolling)     | Auto-expire                                                     | Security       |
| MFA device records                   | Keycloak                    | Account lifetime               | Deleted with account                                            | Contractual    |

### Project and operational data

| Entity                | Table                       | Retention Period           | Disposal Method                                 | Legal Basis                                    |
| --------------------- | --------------------------- | -------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| Project records       | `projects`                  | Project lifetime + 7 years | Archive (read-only); delete after 7 years       | Thai accounting law; construction contract law |
| BOQ line items        | `boq_items`                 | Project lifetime + 7 years | Archive                                         | Same as project                                |
| Daily site reports    | `site_reports`              | Project lifetime + 7 years | Archive                                         | Contractual; accounting                        |
| Safety checklists     | `safety_checklists`         | Project lifetime + 7 years | Archive                                         | Thai safety law (กฎกระทรวงความปลอดภัย)         |
| QC inspection records | `qc_inspections`            | Project lifetime + 7 years | Archive                                         | Construction contract                          |
| Issue records         | `issues`                    | Project lifetime + 3 years | Archive                                         | Contractual                                    |
| GPS check-in records  | `check_ins`                 | 90 days from collection    | Hard delete (raw GPS); aggregate to daily count | PDPA §6(7) location data minimization          |
| Progress photos (S3)  | S3 bucket `cos-files-{env}` | Project lifetime + 1 year  | S3 lifecycle rule → Glacier → delete            | Contractual                                    |

### Procurement data

| Entity            | Table               | Retention Period        | Disposal Method | Legal Basis                    |
| ----------------- | ------------------- | ----------------------- | --------------- | ------------------------------ |
| Purchase requests | `purchase_requests` | 7 years from PO close   | Archive         | Thai accounting law            |
| RFQs              | `rfqs`              | 7 years from completion | Archive         | Accounting                     |
| Vendor quotations | `quotations`        | 7 years from PO award   | Archive         | Accounting; dispute resolution |
| Purchase orders   | `purchase_orders`   | 7 years from delivery   | Archive         | Accounting                     |
| Delivery notes    | `delivery_notes`    | 7 years                 | Archive         | Accounting                     |

### Finance data

| Entity                 | Table                  | Retention Period        | Disposal Method | Legal Basis                      |
| ---------------------- | ---------------------- | ----------------------- | --------------- | -------------------------------- |
| Invoices               | `invoices`             | 7 years                 | Archive         | Revenue Code §87; accounting law |
| Budget entries         | `budget_entries`       | 7 years                 | Archive         | Accounting                       |
| Payment records        | `payment_records`      | 7 years                 | Archive         | Accounting                       |
| Financial transactions | `finance_transactions` | 7 years                 | Archive         | Revenue Code                     |
| Retention payments     | `retention_schedules`  | Project close + 7 years | Archive         | Contract                         |

### Workforce data

| Entity                    | Table                           | Retention Period                        | Disposal Method                                | Legal Basis                            |
| ------------------------- | ------------------------------- | --------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| Worker records (active)   | `workforce.workers`             | Employment period                       | N/A                                            | Contractual                            |
| Worker records (ended)    | `workforce.workers`             | End of employment + 2 years             | Anonymize PII; retain aggregate                | Thai Labor Protection Act §§13-17      |
| National ID (บัตรประชาชน) | `workforce.workers.national_id` | End of employment + 2 years, then purge | Hard delete from column; retain UUID reference | PDPA §26 — sensitive data minimization |
| Salary / rate records     | `workforce.worker_rates`        | 7 years                                 | Archive                                        | Thai Revenue Code                      |
| Timesheet records         | `workforce.timesheets`          | 2 years                                 | Archive                                        | Labor law                              |

### Equipment data

| Entity                            | Table                        | Retention Period         | Disposal Method                                                        | Legal Basis      |
| --------------------------------- | ---------------------------- | ------------------------ | ---------------------------------------------------------------------- | ---------------- |
| Equipment records                 | `equipment.assets`           | Asset lifetime + 5 years | Archive                                                                | Asset accounting |
| Equipment telemetry (TimescaleDB) | `equipment.telemetry`        | 90 days hot              | Downsample to hourly aggregates after 90 days; keep aggregates 5 years | Operational      |
| Maintenance records               | `equipment.maintenance_logs` | Asset lifetime + 5 years | Archive                                                                | Accounting       |

### Observability and audit data

| Entity                  | Store                         | Retention Period                             | Disposal Method      | Legal Basis             |
| ----------------------- | ----------------------------- | -------------------------------------------- | -------------------- | ----------------------- |
| Application logs        | Loki                          | 30 days hot (S3)                             | Move to cold storage | Operational             |
| Application logs (cold) | S3 Glacier                    | 1 year                                       | Delete               | Operational             |
| Compliance audit logs   | S3 Glacier                    | **7 years**                                  | Delete               | SOC 2; PDPA audit trail |
| Distributed traces      | Tempo                         | 14 days                                      | Auto-purge           | Operational             |
| Metrics                 | Prometheus (TSDB)             | 15 days                                      | Auto-purge           | Operational             |
| Aggregated metrics      | Thanos / Prometheus long-term | 1 year                                       | Auto-purge           | SLO review              |
| Kafka events            | Kafka topic retention         | 7 days default; 30 days for financial topics | Auto-delete          | Operational             |

### Analytics data

| Entity                | Store         | Retention Period                            | Disposal Method                | Legal Basis       |
| --------------------- | ------------- | ------------------------------------------- | ------------------------------ | ----------------- |
| ClickHouse analytics  | ClickHouse    | 90-day rolling window                       | TTL partition drop             | Operational (raw) |
| TimescaleDB telemetry | TimescaleDB   | 90 days                                     | Compression + retention policy | Operational       |
| MLOps feature store   | Feast / Redis | Feature-specific; max 30 days for real-time | Feast TTL                      | AI operations     |

---

## Legal hold

When a project or tenant is subject to a legal dispute or regulatory investigation:

1. Engineering lead places a **legal hold** flag on the affected project / tenant
2. All retention policies are **suspended** for the flagged records
3. Deletion automation skips records with `legal_hold = true`
4. Legal hold is removed only by explicit written approval from product owner or legal counsel
5. Hold duration is bounded by the legal proceeding timeline

---

## Anonymization standard

When records are anonymized (rather than deleted), the following fields must be cleared:

- Full name → `[ANONYMIZED]`
- Phone number → `[ANONYMIZED]`
- Email → `anonymized-{uuid}@cos.invalid`
- National ID → null
- GPS coordinates → null
- Free-text notes containing names → `[ANONYMIZED]`
- Foreign key references to `identity.users` are set to a tombstone user UUID

Aggregate counts, financial totals, and non-PII fields are retained.

---

## Automation

S3 lifecycle rules are defined in `infrastructure/terraform/aws/s3.tf` — `lifecycle_rule` blocks.
PostgreSQL scheduled deletion runs via `scripts/maintenance/data-retention-cleanup.sh` (cron, daily at 02:00 UTC).

---

## Review schedule

| Trigger                            | Reviewer              | Action                                     |
| ---------------------------------- | --------------------- | ------------------------------------------ |
| Annually (January)                 | Product owner + legal | Verify all periods comply with current law |
| Stage 1 → Stage 2 gate             | Engineering lead      | Verify all S3 lifecycle rules deployed     |
| New entity type added              | Engineering lead      | Add entry to this document before merging  |
| Regulatory change (PDPA amendment) | Legal counsel         | Update affected entries within 30 days     |
