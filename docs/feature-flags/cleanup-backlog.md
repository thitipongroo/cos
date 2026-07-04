# Construction OS — Feature Flag Cleanup Backlog

> **Purpose:** Track feature flags that are candidates for removal from code. Per QM-15, flags must
> be removed within **30 days** of reaching 100% rollout. This file is the authoritative list of
> stale or scheduled-for-removal flags.
>
> Flag system: **AWS AppConfig** (Stage 1–3). Flag naming: `{stage}.{domain}.{feature}`.

---

## How to use this file

When a flag reaches 100% rollout:

1. Engineer adds the flag to the **Scheduled for removal** table with the 30-day deadline
2. Creates a cleanup ticket linked to this entry
3. After code removal, moves the flag to the **Removed** table

**CI check:** `scripts/ci/check-feature-flag-staleness.sh` scans source code for flag keys and
cross-references with this file. Build warning (not failure) if a flag is in source code and
its deadline has passed.

---

## Active flags (currently in rollout)

| Flag key                                 | Domain       | Description                             | Current rollout % | Rollout started | Owner            |
| ---------------------------------------- | ------------ | --------------------------------------- | ----------------- | --------------- | ---------------- |
| `s1.procurement.rfq-workflow`            | Procurement  | Full PR→RFQ→PO Temporal workflow        |         0%        |         —       | Engineering lead |
| `s1.ai.report-generation`                | AI Gateway   | GPT-4o report generation endpoint       |         0%        |         —       | Engineering lead |
| `s1.mobile.offline-sync-v2`              | Mobile       | WatermelonDB delta sync engine          |         0%        |         —       | Engineering lead |
| `s1.finance.budget-alerts`               | Finance      | Budget exceeded push notifications      |         0%        |         —       | Engineering lead |
| `s1.analytics.clickhouse-exec-dashboard` | Analytics    | Executive ClickHouse dashboard          |         0%        |         —       | Engineering lead |
| `s1.notifications.expo-push`             | Notification | Expo push notification channel          |         0%        |         —       | Engineering lead |
| `s1.knowledge-graph.neo4j-sync`          | Graph        | Neo4j kg-ingestion-worker sync          |         0%        |         —       | Engineering lead |
| `s1.equipment.telemetry-ingest`          | Equipment    | TimescaleDB telemetry pipeline          |         0%        |         —       | Engineering lead |
| `s1.workforce.overtime-calc`             | Workforce    | Thai overtime calculation engine        |         0%        |         —       | Engineering lead |
| `s1.platform.enterprise-provisioning`    | Platform     | Enterprise tenant provisioning workflow |         0%        |         —       | Engineering lead |

---

## Scheduled for removal (100% rollout reached — remove by deadline)

| Flag key     | 100% reached | Removal deadline | Cleanup ticket | Status |
| ------------ | ------------ | ---------------- | -------------- |--------|
| _(none yet)_ |      —       |        —         |        —       |   —    |

---

## Removed flags (archived)

| Flag key     | Domain | Removed date | Removed in PR/commit |
| ------------ | ------ | ------------ | -------------------- |
| _(none yet)_ |    —   |       —      |          —           |

---

## Rollout protocol

Per QM-15 progressive rollout order:

1. **1%** of tenants → observe for minimum 24 hours → check error budget (QM-14)
2. **10%** of tenants → observe for minimum 24 hours
3. **50%** of tenants → observe for minimum 24 hours
4. **100%** → start 30-day removal clock

Emergency rollback: toggle flag to OFF in AWS AppConfig → takes effect within **60 seconds**
without deployment (QM-15 kill switch requirement).

---

## Mandatory flag scenarios (do not ship without a flag)

Per QM-15, these change types **must** be flagged before production:

- Any new UI screen or workflow step
- Any new AI/LLM endpoint
- Any database migration that modifies existing data (backfill, column drop)
- Any change to authentication or authorization logic
- Any Kafka schema change

---

## Review schedule

| Trigger                  | Action                                                                          |
| ------------------------ | ------------------------------------------------------------------------------- |
| Weekly (Monday)          | Engineering lead reviews Scheduled table; creates cleanup PRs for overdue flags |
| New feature → production | Add row to Active flags table                                                   |
| Flag reaches 100%        | Move to Scheduled table; create cleanup ticket                                  |
| Code removal merged      | Move to Removed table                                                           |
