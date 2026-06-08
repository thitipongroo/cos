# DR Runbook: Kafka Broker Failure

**Source:** QM-12 — "DR runbooks must exist for: Kafka broker failure"  
**RTO target:** 30 minutes (production)

---

## Context

Production Kafka cluster: replication factor = 3, min ISR = 2 (Phase 19 AUTO-19).  
A single broker failure is handled automatically (remaining 2 brokers have all replicas).  
This runbook covers: multiple broker failure, unclean leader election, or full cluster unavailability.

---

## Step 1 — Assess Impact

```bash
# Check broker health
kafka-broker-api-versions.sh --bootstrap-server $KAFKA_BOOTSTRAP 2>&1 | head -20

# Check which brokers are down
zookeeper-shell.sh $ZOOKEEPER ls /brokers/ids
# Or for KRaft mode (Kafka 3.x):
kafka-metadata-quorum.sh --bootstrap-server $KAFKA_BOOTSTRAP describe --status

# Check under-replicated partitions
kafka-topics.sh \
  --bootstrap-server $KAFKA_BOOTSTRAP \
  --describe \
  --under-replicated-partitions
```

---

## Step 2 — Single Broker Down (auto-recovery)

If only 1 of 3 brokers is down — producers and consumers continue with ISR = 2.

```bash
# Restart the failed broker pod
kubectl rollout restart statefulset/kafka -n cos
kubectl rollout status statefulset/kafka -n cos

# Verify broker rejoined
kafka-topics.sh --bootstrap-server $KAFKA_BOOTSTRAP \
  --describe --under-replicated-partitions
# Expect: no output (all partitions fully replicated)
```

---

## Step 3 — Multiple Brokers Down (< quorum)

If 2+ brokers are down and producers are receiving `NotEnoughReplicasException`:

```bash
# Check consumer lag accumulating
for group in notification-consumer-group analytics-worker-group; do
  kafka-consumer-groups.sh --bootstrap-server $KAFKA_BOOTSTRAP \
    --describe --group "$group" 2>&1 | grep -v "^$"
done

# Restart all Kafka pods (rolling)
kubectl rollout restart statefulset/kafka -n cos

# If pods won't restart — check PVC health
kubectl get pvc -n cos | grep kafka
kubectl describe pvc kafka-data-kafka-0 -n cos
```

---

## Step 4 — Full Cluster Unavailable

If all brokers are down and services are failing:

1. **Producers** will buffer in outbox tables (NestJS outbox pattern) — no data loss
2. **Consumers** will accumulate lag — check lag tables after recovery

```bash
# Scale down consumers to prevent rebalance storm on recovery
kubectl scale deployment cos-analytics-worker --replicas=0 -n cos
kubectl scale deployment cos-kg-ingestion --replicas=0 -n cos

# Restart Kafka cluster
kubectl delete pod -l app.kubernetes.io/name=kafka -n cos

# Wait for all brokers to be ready
kubectl wait pod -l app.kubernetes.io/name=kafka -n cos \
  --for=condition=Ready --timeout=300s

# Scale consumers back up gradually
kubectl scale deployment cos-analytics-worker --replicas=1 -n cos
# Monitor lag before scaling further
```

---

## Step 5 — Verify Recovery

```bash
# Confirm all brokers online
kafka-topics.sh --bootstrap-server $KAFKA_BOOTSTRAP \
  --describe --under-replicated-partitions
# Expect: no output

# Confirm consumer lag recovering
watch -n 10 kafka-consumer-groups.sh --bootstrap-server $KAFKA_BOOTSTRAP \
  --describe --group notification-consumer-group

# Confirm new messages flowing
kafka-console-consumer.sh --bootstrap-server $KAFKA_BOOTSTRAP \
  --topic site.inspection.failed.v1 \
  --from-beginning --max-messages 1 --timeout-ms 10000
```

---

## Step 6 — Check DLQ for Failed Messages

```bash
# Check if any messages ended up in DLQ during outage
for topic in site.events.dlq procurement.events.dlq finance.events.dlq; do
  count=$(kafka-run-class.sh kafka.tools.GetOffsetShell \
    --broker-list $KAFKA_BOOTSTRAP --topic $topic --time -1 2>/dev/null | \
    awk -F: '{sum+=$3} END {print sum}')
  echo "$topic: $count messages"
done
```

Replay DLQ messages after confirming consumers are healthy (see `kafka-partition-rebalance.md`).
