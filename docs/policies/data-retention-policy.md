# Construction OS — Data Retention Policy

> **Purpose:** Define the retention period and disposal method for each entity type stored by
> Construction OS. Required by PDPA B.E. 2562 §26 and QM-5. Reviewed annually and before each
> Stage transition.

---

## Principles

1. **Data minimization** — collect and retain only what is necessary for the stated purpose.
2. **Purpose limitation** — data is not retained beyond the period needed to fulfill the purpose for which it was collected.
3. **Accuracy** — stale data that no longer serves its purpose is deleted or anonymized, not kept indefinitely.
4. **Right to erasure** — when a data subject exercises their PDPA §33 right, deletion /
   anonymization is completed within 30 days, subject to legal hold exceptions below.

---

> **Table names verified 2026-08-03** against `backend/prisma/migrations/` (68 migrations, 98
> tables, resolving the `20260605000004_db_refactor_global_schemas` `SET SCHEMA` moves). Seven rows
> named tables that do not exist — `qc_inspections`, `check_ins`, `workforce.worker_rates`,
> `workforce.timesheets`, `equipment.assets`, `equipment.telemetry`, `equipment.maintenance_logs` —
> and the photo bucket was `cos-files-{env}` rather than the per-tenant `cos-{tenant_id}` the file
> service actually creates. A retention rule naming a table that does not exist can never be
> executed, so each was an unenforceable rule, not a cosmetic typo. The National ID row was removed
> outright: no `national_id` column exists in any migration, so there is nothing to purge.

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

| Entity                | Table                                 | Retention Period           | Disposal Method                                 | Legal Basis                                    |
| --------------------- | ------------------------------------- | -------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| Project records       | `projects`                            | Project lifetime + 7 years | Archive (read-only); delete after 7 years       | Thai accounting law; construction contract law |
| BOQ line items        | `boq_items`                           | Project lifetime + 7 years | Archive                                         | Same as project                                |
| Daily site reports    | `site_reports`                        | Project lifetime + 7 years | Archive                                         | Contractual; accounting                        |
| Safety checklists     | `safety_checklists`                   | Project lifetime + 7 years | Archive                                         | Thai safety law (กฎกระทรวงความปลอดภัย)         |
| QC inspection records | `site_ops.inspections`                | Project lifetime + 7 years | Archive                                         | Construction contract                          |
| Issue records         | `issues`                              | Project lifetime + 3 years | Archive                                         | Contractual                                    |
| GPS check-in records  | `workforce_telemetry.attendance_logs` | 90 days from collection    | Hard delete (raw GPS); aggregate to daily count | PDPA §6(7) location data minimization          |
| Progress photos (S3)  | S3 bucket `cos-{tenant_id}`           | Project lifetime + 1 year  | S3 lifecycle rule → Glacier → delete            | Contractual                                    |

### Procurement data

| Entity                         | Table                                                                       | Retention Period                                               | Disposal Method                                                                              | Legal Basis                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Purchase requests              | `purchase_requests`                                                         | 7 years from PO close                                          | Archive                                                                                      | Thai accounting law                                                                          |
| RFQs                           | `rfqs`                                                                      | 7 years from completion                                        | Archive                                                                                      | Accounting                                                                                   |
| Vendor quotations              | `quotations`                                                                | 7 years from PO award                                          | Archive                                                                                      | Accounting; dispute resolution                                                               |
| Purchase orders                | `purchase_orders`                                                           | 7 years from delivery                                          | Archive                                                                                      | Accounting                                                                                   |
| Delivery notes                 | `delivery_notes`                                                            | 7 years                                                        | Archive                                                                                      | Accounting                                                                                   |
| Vendor contact person          | `procurement.vendors.contact_email`, `.contact_phone`                       | While the vendor is active + 7 years from the last transaction | **Anonymise in place** (clear the two columns; the vendor row and its purchase history stay) | Accounting (the transactions), not the contact — see § External people below                 |
| Sole trader's tax id / address | `procurement.vendors.tax_id`, `.address` where `vendor_type = 'INDIVIDUAL'` | Same as above                                                  | Anonymise in place                                                                           | Revenue Code §87 requires the TRANSACTION record, which survives anonymisation of the person |

### CRM data — EXTERNAL people (COS is processor)

| Entity         | Table                                     | Retention Period                              | Disposal Method                                                      | Legal Basis                                           |
| -------------- | ----------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| CRM contact    | `crm.contacts`                            | Until the tenant erases, or lead close + 2 yr | **Anonymise in place** — clear `name`/`email`/`phone`, keep the row  | No statutory basis to keep the PERSON; see below      |
| CRM lead       | `crm.leads`                               | Same                                          | Anonymise `contact_name`; `company` is untouched (not personal data) | —                                                     |
| Converted lead | `crm.opportunities` → `finance.customers` | 7 years from conversion                       | Row retained; personal columns already anonymised upstream           | Thai accounting law (the transaction, not the person) |

**Why anonymise rather than delete, and why the row stays.** QM-5 states the platform's strategy
outright — _"anonymization-in-place preferred over cascade delete (preserves aggregate analytics)"_ —
and the schema makes it the only correct option here: `crm.contacts.lead_id` is `NOT NULL REFERENCES
crm.leads`, and a lead converts into an opportunity and then a `finance.customers` row that Thai
accounting law requires be kept for 7 years. Deleting the contact would break a chain the tenant is
legally obliged to retain; clearing the personal columns removes the person from it and leaves the
transaction intact. This is the standard **conditional erasure** shape: the personal data leaves the
operational system, the record that the law requires survives.

**A legal-hold copy is kept separately, reachable by legal only.** Where a row is under
`legal_hold` (§ Legal hold below), anonymisation is deferred and the pre-anonymisation values are
written to the restricted archive rather than discarded, so a dispute can still be answered.
Product-owner decision 2026-08-16; the archive and its access control are specified in ADR-090.

**Stating the basis is itself an obligation.** Answering a data subject with "we keep it for legal
reasons" without naming the law, the categories and the period is a breach in its own right — which
is why each row above names its statute rather than pointing at this document generally.

### Finance data

| Entity                 | Table                  | Retention Period        | Disposal Method | Legal Basis                      |
| ---------------------- | ---------------------- | ----------------------- | --------------- | -------------------------------- |
| Invoices               | `invoices`             | 7 years                 | Archive         | Revenue Code §87; accounting law |
| Budget entries         | `budget_entries`       | 7 years                 | Archive         | Accounting                       |
| Payment records        | `payment_records`      | 7 years                 | Archive         | Accounting                       |
| Financial transactions | `finance_transactions` | 7 years                 | Archive         | Revenue Code                     |
| Retention payments     | `retention_schedules`  | Project close + 7 years | Archive         | Contract                         |

### Workforce data

| Entity                  | Table                                    | Retention Period            | Disposal Method                 | Legal Basis                       |
| ----------------------- | ---------------------------------------- | --------------------------- | ------------------------------- | --------------------------------- |
| Worker records (active) | `workforce.workers`                      | Employment period           | N/A                             | Contractual                       |
| Worker records (ended)  | `workforce.workers`                      | End of employment + 2 years | Anonymize PII; retain aggregate | Thai Labor Protection Act §§13-17 |
| Salary / rate records   | `workforce.project_workforce.daily_rate` | 7 years                     | Archive                         | Thai Revenue Code                 |
| Timesheet records       | `workforce_telemetry.timesheets`         | 2 years                     | Archive                         | Labor law                         |

### Equipment data

| Entity                            | Table                                       | Retention Period         | Disposal Method                                                        | Legal Basis      |
| --------------------------------- | ------------------------------------------- | ------------------------ | ---------------------------------------------------------------------- | ---------------- |
| Equipment records                 | `equipment.equipment`                       | Asset lifetime + 5 years | Archive                                                                | Asset accounting |
| Equipment telemetry (TimescaleDB) | `equipment_telemetry.equipment_utilization` | 90 days hot              | Downsample to hourly aggregates after 90 days; keep aggregates 5 years | Operational      |
| Maintenance records               | `equipment.equipment_maintenance`           | Asset lifetime + 5 years | Archive                                                                | Accounting       |

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

S3 lifecycle rules are defined in `infrastructure/terraform/aws/modules/s3/main.tf` —
`lifecycle_rule` blocks.

**PostgreSQL deletion — NOT IMPLEMENTED.** This line previously said it ran via
`scripts/maintenance/data-retention-cleanup.sh` on a daily 02:00 UTC cron. Neither the script nor
a CronJob exists, so nothing deletes expired rows on a schedule: the periods in the table above
are met for object storage and not for the database. Intended behaviour when built: delete per
that table, in batches, with a dry-run mode and a row count in the log.

---

## Review schedule

| Trigger                            | Reviewer              | Action                                     |
| ---------------------------------- | --------------------- | ------------------------------------------ |
| Annually (January)                 | Product owner + legal | Verify all periods comply with current law |
| Stage 1 → Stage 2 gate             | Engineering lead      | Verify all S3 lifecycle rules deployed     |
| New entity type added              | Engineering lead      | Add entry to this document before merging  |
| Regulatory change (PDPA amendment) | Legal counsel         | Update affected entries within 30 days     |
