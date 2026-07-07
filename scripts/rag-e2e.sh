#!/usr/bin/env bash
# End-to-end hybrid RAG retrieval proof against REAL OpenSearch + pgvector (no OpenAI).
# Brings up single-node OpenSearch + a pgvector Postgres on a private docker network, then runs
# services/ai-gateway/tests/test_rag_backends_integration.py inside a python:3.12 container on
# that network. Deterministic (test-only) query embedding — no external calls, no spend.
set -euo pipefail

NET=rag-e2e-net
OS_C=rag-e2e-opensearch
PG_C=rag-e2e-pgvector

cleanup() {
  docker rm -f "$OS_C" "$PG_C" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker network create "$NET" >/dev/null

docker run -d --name "$PG_C" --network "$NET" \
  -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg16 >/dev/null

docker run -d --name "$OS_C" --network "$NET" \
  -e discovery.type=single-node \
  -e plugins.security.disabled=true \
  -e OPENSEARCH_INITIAL_ADMIN_PASSWORD='Cos_E2e_Passw0rd!' \
  -e "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m" \
  opensearchproject/opensearch:3.7.0 >/dev/null

echo "waiting for postgres..."
for _ in $(seq 1 30); do
  docker exec "$PG_C" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done

echo "waiting for opensearch..."
for _ in $(seq 1 90); do
  docker exec "$OS_C" curl -s http://localhost:9200 >/dev/null 2>&1 && break
  sleep 2
done

MSYS_NO_PATHCONV=1 docker run --rm --network "$NET" \
  -v "D:/workspace/cos:/app" -w /app/services/ai-gateway \
  -e OPENSEARCH_URL="http://$OS_C:9200" \
  -e DATABASE_URL="postgresql://postgres:postgres@$PG_C:5432/postgres" \
  python:3.12 bash -c \
  "pip install --quiet 'opensearch-py[async]' asyncpg pytest pytest-asyncio pyyaml && \
   python -m pytest tests/test_rag_backends_integration.py -v -p no:cacheprovider -o filterwarnings=ignore"
