# AI Feature Activation Checklist

**Source:** Phase 19 AI monitoring checks; Phase 11 AI Foundation; Phase 12 AI Report Assistant  
**Purpose:** Verify all AI features are safe to activate in production  
**Run before:** Enabling any AI endpoint for a new tenant or after a major AI service update

---

## Pre-Activation Checklist

### 1. LLM Provider

- [ ] `OPENAI_API_KEY` (or equivalent) loaded from AWS Secrets Manager / Vault — never hardcoded
- [ ] LLM provider health check passes: `GET /health/live` on AI Gateway returns 200
- [ ] `LLMProvider` interface is the only path to LLM calls — no direct OpenAI SDK imports in NestJS
- [ ] Fallback provider configured (e.g. Claude if OpenAI unavailable) — verify `LLMProvider` retry chain

```bash
# Verify AI Gateway health
curl -s https://ai-gateway.<domain>/health/live | python3 -m json.tool

# Verify LLM provider connectivity (staging)
curl -s https://ai-gateway.<domain>/v1/health/llm | python3 -m json.tool
```

### 2. Hallucination Guard

- [ ] `HallucinationGuard` enabled on all AI report endpoints
- [ ] Guard rejects responses with confidence < threshold (default: 0.7)
- [ ] Guard logs all rejected responses to `ai_usage_logs` with `hallucination_flagged = true`

```bash
# Verify HallucinationGuard is wired in
grep -r "HallucinationGuard" services/ai-gateway/ | grep -v test | grep -v __pycache__
# Expect: at least one result per AI report endpoint
```

### 3. Token Usage Tracking

- [ ] `ai_usage_logs` table exists in production database
- [ ] Every LLM call inserts a row with: `tenant_id`, `model`, `tokens_input`, `tokens_output`, `latency_ms`
- [ ] Per-tenant quota enforced (20 req/min — QM-7)

```bash
# Verify table exists and has recent rows
psql $DATABASE_URL -c "
  SELECT tenant_id, model, COUNT(*) as calls, SUM(tokens_input + tokens_output) as total_tokens
  FROM ai_usage_logs
  WHERE created_at > NOW() - INTERVAL '1 day'
  GROUP BY tenant_id, model
  ORDER BY calls DESC
  LIMIT 10;
"
```

### 4. AI Latency Monitoring

- [ ] AI latency Grafana dashboard visible at uid `ai-monitoring`
- [ ] p95 AI report generation < 5s (QM-6 SLO)
- [ ] Alert rule `AILatencyHigh` fires when p95 > 5s for > 2 minutes

```bash
# Check AI monitoring dashboard
curl -s -H "Authorization: Bearer $GRAFANA_TOKEN" \
  "$GRAFANA_URL/api/dashboards/uid/ai-monitoring" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Dashboard:', d['dashboard']['title'])
print('Panels:', len(d['dashboard']['panels']))
"
```

### 5. OCR Feature (Phase 9 + Phase 11)

- [ ] ClamAV scan runs before OCR on any uploaded document
- [ ] OCR results are stored in OpenSearch index, NOT in PostgreSQL BLOB columns
- [ ] OCR endpoint rate-limited to 20 req/min per user (file upload limit — QM-7)

### 6. Embedding Worker

- [ ] Embedding worker running (`kubectl get pods -n cos -l app=embedding-worker`)
- [ ] pgvector extension enabled in PostgreSQL
- [ ] OpenSearch index `cos-documents-<tenant_id>` exists for all active tenants

```bash
# Verify embedding worker
kubectl get pods -n cos -l app.kubernetes.io/name=embedding-worker

# Verify pgvector
psql $DATABASE_URL -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```

### 7. RAG Pipeline

- [ ] Semantic search endpoint returns results relevant to query (manual spot-check with Thai text)
- [ ] Context window not exceeded: prompt + retrieved context < model max tokens
- [ ] Retrieved documents are tenant-scoped (cross-tenant data must not appear in results)

---

## Post-Activation Smoke Test

Run these after enabling AI for a tenant:

```bash
# 1. Generate a site report (Thai language)
curl -X POST https://api.<domain>/api/v1/ai/reports/site \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_id": "<test-project-id>", "language": "th"}'

# Expected: 200 OK, report with Thai content, no hallucination flags

# 2. Check token usage was logged
psql $DATABASE_URL -c "
  SELECT * FROM ai_usage_logs ORDER BY created_at DESC LIMIT 1;
"
```

---

## Rollback

If AI features cause issues after activation:

1. Toggle feature flag `s1.ai.reports` to `OFF` (takes effect within 60 seconds — QM-15)
2. AI Gateway continues running — only NestJS AI endpoints are gated by the flag
3. Investigate root cause in `ai_usage_logs` and Grafana AI dashboard
4. Re-enable flag after fix is deployed and verified in staging
