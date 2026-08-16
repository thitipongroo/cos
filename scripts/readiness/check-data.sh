#!/usr/bin/env bash
# [AUTO] Phase 19 — Data layer validation
# Verifies: RDS backups, Redis AOF, Kafka replication factor
# Usage: AWS_REGION=ap-southeast-1 ./scripts/readiness/check-data.sh

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-southeast-1}"
PASS=0
FAIL=0

echo "==> Data layer checks"

# RDS — backup retention + Multi-AZ
if command -v aws &>/dev/null; then
  retention=$(aws rds describe-db-instances --region "$AWS_REGION" \
    --query 'DBInstances[?contains(DBInstanceIdentifier, `cos-postgres`)].BackupRetentionPeriod' \
    --output text 2>/dev/null || echo "")
  multiaz=$(aws rds describe-db-instances --region "$AWS_REGION" \
    --query 'DBInstances[?contains(DBInstanceIdentifier, `cos-postgres`)].MultiAZ' \
    --output text 2>/dev/null || echo "")

  if [[ "$retention" -ge 7 ]] 2>/dev/null; then
    echo "  ✓ RDS: backup retention = $retention days"
    PASS=$((PASS + 1))
  else
    echo "  ✗ RDS: backup retention = '${retention}' (expected >= 7)"
    FAIL=$((FAIL + 1))
  fi

  if [[ "$multiaz" == "True" ]]; then
    echo "  ✓ RDS: Multi-AZ enabled (PITR active)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ RDS: Multi-AZ = $multiaz (expected True for production)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  - AWS CLI not installed — skipping RDS checks"
fi

# Redis — AOF persistence
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
if command -v redis-cli &>/dev/null; then
  aof=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" CONFIG GET appendonly 2>/dev/null | tail -1 || echo "")
  if [[ "$aof" == "yes" ]]; then
    echo "  ✓ Redis: AOF persistence enabled"
    PASS=$((PASS + 1))
  else
    echo "  ✗ Redis: AOF persistence = '${aof}' (expected: yes)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  - redis-cli not installed — skipping Redis check"
fi

# Kafka — replication factor + ISR
KAFKA_BS="${KAFKA_BOOTSTRAP:-localhost:9092}"
if command -v kafka-topics.sh &>/dev/null; then
  bad_topics=$(kafka-topics.sh --describe --bootstrap-server "$KAFKA_BS" 2>/dev/null \
    | awk '/ReplicationFactor: [12]($| )/ || /Isr: [0-9]+$/ && NF < 4 {print}' | wc -l | tr -d ' ')
  if [[ "$bad_topics" == "0" ]]; then
    echo "  ✓ Kafka: all topics have RF>=3 and ISR>=2"
    PASS=$((PASS + 1))
  else
    echo "  ✗ Kafka: $bad_topics topics with insufficient replication"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  - kafka-topics.sh not installed — skipping Kafka check"
fi

echo ""
echo "==> Result: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
