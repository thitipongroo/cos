# Kafka Consumer Lag and Partition Rebalance Runbook

**Source:** QM-14 — SLI/SLO/Error Budget (Kafka consumer lag SLO)  
**Trigger:** Alertmanager alert `KafkaConsumerLagHigh` fires

---

## SLO Thresholds (QM-14)

| State        | Threshold                        | Action                       |
| ------------ | -------------------------------- | ---------------------------- |
| **Normal**   | < 1,000 messages per partition   | No action                    |
| **Alert**    | > 5,000 messages for > 2 minutes | Investigate immediately (P2) |
| **Critical** | > 50,000 messages                | Declare P1 incident          |

---

## Consumer Groups

| Consumer Group                | Topics consumed                                           | Service                            |
| ----------------------------- | --------------------------------------------------------- | ---------------------------------- |
| `notification-consumer-group` | `site.*`, `procurement.*`, `finance.*`, `file.document.*` | NestJS notification module         |
| `analytics-worker-group`      | `site.*`, `procurement.*`, `finance.*`                    | Go analytics worker                |
| `kg-ingestion-group`          | `site.*`, `procurement.*`                                 | Go KG ingestion worker             |
| `embedding-worker-group`      | `file.document.*`                                         | Python embedding worker            |
| `clickhouse-kafka-engine`     | all domain topics                                         | ClickHouse Kafka Engine (internal) |

---

## Step 1 — Diagnose Lag

```bash
# Check lag per group and partition
kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BOOTSTRAP \
  --describe \
  --group notification-consumer-group

# Check all groups at once
for group in notification-consumer-group analytics-worker-group kg-ingestion-group embedding-worker-group; do
  echo "=== $group ==="
  kafka-consumer-groups.sh --bootstrap-server $KAFKA_BOOTSTRAP --describe --group "$group"
done
```

**Output to check:**

- `LAG` column — number of messages behind
- `CONSUMER-ID` — if empty, consumer is dead/not running

---

## Step 2 — Identify Root Cause

| Symptom                               | Likely cause                           |
| ------------------------------------- | -------------------------------------- |
| Consumer pod not running              | Pod crash — check `kubectl logs`       |
| Consumer running but lag growing fast | Producer rate spike; consumer too slow |
| `CONSUMER-ID` empty                   | Consumer disconnected from group       |
| Partition rebalancing loop            | Consumer timeout misconfiguration      |

```bash
# Check consumer pod health
kubectl get pods -n cos -l app.kubernetes.io/name=<consumer-service>
kubectl logs -n cos <pod-name> --tail=100

# Check for rebalance events in logs
kubectl logs -n cos <pod-name> --tail=500 | grep -i "rebalanc\|partition assign\|revoke"
```

---

## Step 3 — Remediation

### Consumer pod crashed → restart

```bash
kubectl rollout restart deployment/<consumer-service> -n cos
# Wait for rollout
kubectl rollout status deployment/<consumer-service> -n cos
```

### Consumer too slow → scale up

```bash
kubectl scale deployment/<consumer-service> --replicas=3 -n cos
# Monitor lag after scaling
watch kafka-consumer-groups.sh --bootstrap-server $KAFKA_BOOTSTRAP \
  --describe --group <group-name>
```

### Partition rebalance loop → check session timeout

- Default `session.timeout.ms` = 10000 (10s)
- If processing takes > 10s per message → increase `max.poll.interval.ms`
- Config location: `infrastructure/kubernetes/<service>/configmap.yaml`

### Lag > 50,000 (Critical) → consider resetting offset

```bash
# CAUTION: only use if messages are safe to skip (e.g. analytics, not financial)
# Always get product owner approval before resetting offsets

# Reset to latest (skip unprocessed messages)
kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BOOTSTRAP \
  --group <group-name> \
  --topic <topic-name> \
  --reset-offsets \
  --to-latest \
  --execute
```

---

## Step 4 — Verify Recovery

```bash
# Monitor lag trending down
watch -n 5 kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BOOTSTRAP \
  --describe \
  --group <group-name>
```

Lag must return below 1,000 within 10 minutes of remediation. If not — escalate to P1.

---

## Dead-Letter Queue (DLQ)

Failed messages are routed to DLQ topics: `<original-topic>.dlq`

```bash
# Check DLQ depth
kafka-run-class.sh kafka.tools.GetOffsetShell \
  --broker-list $KAFKA_BOOTSTRAP \
  --topic site.inspection.failed.v1.dlq \
  --time -1

# Replay DLQ messages (after root cause fixed)
kafka-console-consumer.sh \
  --bootstrap-server $KAFKA_BOOTSTRAP \
  --topic site.inspection.failed.v1.dlq \
  --from-beginning | kafka-console-producer.sh \
  --bootstrap-server $KAFKA_BOOTSTRAP \
  --topic site.inspection.failed.v1
```
