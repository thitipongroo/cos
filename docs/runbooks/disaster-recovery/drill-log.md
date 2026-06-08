# Disaster Recovery Drill Log

**Source:** QM-12 — "DR drills must be executed before every Stage transition; drill results recorded here"  
**Requirement:** Execute each scenario drill before Stage 1→2 transition

---

## Drill Requirements

Before Stage 1→2 transition, the following drills must be completed:

| Scenario | Runbook | Status | Last drill date |
|----------|---------|--------|----------------|
| PostgreSQL failover (RDS Multi-AZ) | `docs/runbooks/db-failover.md` | ☐ Pending | — |
| Kafka broker failure | `docs/runbooks/disaster-recovery/kafka-broker-failure.md` | ☐ Pending | — |
| Complete region failure | `docs/runbooks/disaster-recovery/region-failure.md` | ☐ Pending | — |
| KMS key compromise | `docs/runbooks/disaster-recovery/kms-key-compromise.md` | ☐ Pending | — |

Update table above after each drill.

---

## Drill Record Template

Copy this block for each drill entry.

---

### DRILL-NNN — [Scenario Name]

| Field | Value |
|-------|-------|
| **Date** | YYYY-MM-DD |
| **Environment** | staging |
| **Runbook used** | `docs/runbooks/disaster-recovery/[file].md` |
| **IC (Drill Lead)** | |
| **Observer / Reviewer** | |

**RTO measurement:**

| Milestone | Time (ICT) | Elapsed from drill start |
|-----------|-----------|------------------------|
| Drill start | HH:MM | 0:00 |
| Failure injected | HH:MM | |
| Impact detected (alert fired) | HH:MM | |
| Runbook opened and started | HH:MM | |
| Service health check passed | HH:MM | |
| **Full recovery confirmed** | **HH:MM** | **___ min** |

**RTO achieved:** ___ minutes (target: < 30 minutes for production)  
**Result:** ✅ PASS / ❌ FAIL

**Observations:**
- (what worked)

**Issues found:**
- (gaps in runbook, missing commands, incorrect steps)

**Action items:**

| Action | Owner | Due date |
|--------|-------|----------|
| | | |

---

## Drill History

| Drill ID | Date | Scenario | RTO achieved | Result | IC |
|----------|------|----------|-------------|--------|-----|
| (first entry goes here) | | | | | |
