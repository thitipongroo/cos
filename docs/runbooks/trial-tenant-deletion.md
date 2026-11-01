---
title: Trial Tenant Deletion
version: 1.0.0
last_updated: 2026-11-01
audience: SYSTEM_ADMIN, Platform Engineering
---

# Trial Tenant Deletion Runbook

Use this runbook when a free-trial tenant reaches `PENDING_DELETION` (spec §7.10, ADR-109): its trial ended 30 days
ago without a plan being bought, and the read-only month is over. construction-os.io promises that the data is
then deleted. Nothing deletes it automatically — this runbook is the deletion.

**State.** The PostgreSQL step (`scripts/maintenance/trial-tenant-purge.sql`) was run end-to-end against a local
database built from every migration on 2026-11-01: refusals, dry run, multi-pass delete, anonymisation, audit row,
re-run. **No other step has been executed anywhere yet.** QM-11 requires the whole runbook to be run in staging
before the Stage transition.

## When

- The daily `trial-lifecycle` job sends every SYSTEM_ADMIN the day-60 notice ("Trial tenant due for deletion"), or
- this query, on the privileged connection, lists a tenant:

  ```sql
  SELECT tenant_id, tenant_code, trial_ends_at
    FROM platform.tenants
   WHERE subscription_status = 'PENDING_DELETION' AND is_active
   ORDER BY trial_ends_at;
  ```

Do it within the working week of the notice. The website says the data is deleted after the read-only month;
it does not promise the day.

## Prerequisites

- [ ] You are a SYSTEM_ADMIN and know your own `platform.users.user_id` (the purge records it)
- [ ] A privileged PostgreSQL connection string for the tenant's database (`PURGE_DATABASE_URL`). A trial is
      never ENTERPRISE, so this is the shared database
- [ ] Admin access to MinIO, OpenSearch, Neo4j, Keycloak (realm `construction-os`) and Kafka for the environment
- [ ] A ticket for this deletion — its number goes into the justification

## Step 1 — Confirm the customer did not pay

Ask sales. If the customer bought a plan — even late — **do not delete**: convert the tenant instead with
`PATCH /api/v1/admin/tenants/{tenantId}/convert`. Every write the tenant lost while read-only comes back with it,
and the data is intact.

## Step 2 — Confirm there is no hold

Ask the product owner whether a dispute or a regulator's request covers this tenant
(`docs/policies/data-retention-policy.md` § Legal hold). Per-file legal holds (`files.files.legal_hold`) are
checked by the script in step 3 and stop it; a hold on the tenant as a whole exists only as that conversation.

## Step 3 — PostgreSQL: dry run, then delete

```bash
psql "$PURGE_DATABASE_URL" -v tenant_id=<tenant uuid> -v mode=dry-run \
  -v actor_id=<your user uuid> -v justification='Trial ended <date>, not converted (ticket <n>).' \
  -f scripts/maintenance/trial-tenant-purge.sql
```

Read the `would delete …` lines. Then run the same command with `-v mode=delete`.

The script refuses unless the tenant is `PENDING_DELETION`, the actor is an active SYSTEM_ADMIN, the justification
is 10–500 characters, and no file is under legal hold. In one transaction it deletes every row carrying the
tenant's id in every schema, **except** what the retention policy keeps (§ Free-trial tenants there): the tenant
row (deactivated), its audit trail, its user rows (anonymised) and the consent / data-subject request records. It
writes a `tenant.trial_purge` audit row with the per-table counts. If it fails, nothing changed; fix the cause and
run it again. Running it twice is safe.

Keep the `pass N: deleted …` output in the ticket — it is the record of what was removed.

## Step 4 — Files (MinIO)

The file service keeps one bucket per tenant (`services/file-service/src/services/minio.service.ts`):

```bash
mc rb --force <alias>/cos-<tenant uuid>
mc rb --force <alias>/cos-quarantine-<tenant uuid>
```

This also removes any data-export archives the tenant downloaded during the read-only month.

## Step 5 — Search (OpenSearch)

```bash
# The tenant's file index (file-service)
curl -X DELETE "$OPENSEARCH_URL/files-<tenant uuid>"
# Project search documents (backend, index cos_projects)
curl -X POST "$OPENSEARCH_URL/cos_projects/_delete_by_query" -H 'Content-Type: application/json' \
  -d '{"query":{"term":{"tenant_id.keyword":"<tenant uuid>"}}}'
```

## Step 6 — Graph (Neo4j)

Every node the graph module writes carries `tenant_id`:

```cypher
MATCH (n {tenant_id: $tenantId}) DETACH DELETE n;
```

## Step 7 — Sign-in (Keycloak)

The tenant's users live in the shared realm `construction-os` with the attribute `tenant_id`. Delete each:

```bash
kcadm.sh get users -r construction-os -q q=tenant_id:<tenant uuid> --fields id,username
kcadm.sh delete users/<id> -r construction-os   # for each id listed
```

## Step 8 — Events (Kafka)

Per-tenant topics are `<tenant uuid>.<event type>` and `<tenant uuid>.dlq` (§7.3). List, then delete:

```bash
kafka-topics.sh --bootstrap-server "$KAFKA" --list | grep '^<tenant uuid>\.'
kafka-topics.sh --bootstrap-server "$KAFKA" --delete --topic '<tenant uuid>\..*'
```

Events on the shared `platform.events` topic (including the four trial events) are not removed; they expire with
the topic's retention (`docs/policies/data-retention-policy.md` § Observability and audit data).

## Step 9 — Close

- ClickHouse analytics and TimescaleDB telemetry expire on their 90-day windows; nothing to do
- Backups expire on their normal schedule; a restore of an older backup would bring the tenant back — whoever
  restores must re-run this runbook for every tenant purged since that backup
- Record in the ticket: the step 3 output, the date, and that steps 4–8 were done

## Rollback

There is none. Step 3 is the point of no return for the database; steps 4–8 for everything else. If the customer
returns afterwards, they start a new trial.
