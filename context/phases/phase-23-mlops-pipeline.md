# Phase 23 — Mlops Pipeline

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 11, 14 · SaaS Maturity Stage 5.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build MLOps Pipeline for continuous model training and deployment.

Depends on: Phase 11 (AI Foundation), Phase 14 (Analytics — training data source)

MLOps Stack (from source §19.4):
  MLflow 3.x        — experiment tracking and model registry (bumped 2.x→3.x: latest stable, product-owner decision 2026-06-30)
  Apache Airflow 3.x — pipeline orchestration (DAG-based) (bumped 2.x→3.x: latest stable, product-owner decision 2026-06-30)
  Kubeflow Pipelines — Kubernetes-native ML workflow execution
  Feast             — feature store (serving layer for ML features)
  Evidently AI      — model/output evaluation + drift monitoring
    open-source, self-hosted; in-cluster, no external SaaS/API key (replaced W&B per ADR-038; see spec §22.6)

Training Data Sources (from source §19.1):
  - site_reports (PostgreSQL → Data Lake)
  - cost_history (ClickHouse analytics tables)
  - procurement_data (PostgreSQL)
  - inspection_failures (PostgreSQL)
  - photos/documents (MinIO → OCR extracted text)

Data Flow (from source §19.2):
  Operational Data (PostgreSQL/ClickHouse)
  → Data Lake (MinIO — parquet format)
  → Airflow DAG: Cleaning → Feature Engineering → Training
  → MLflow: experiment logging, model versioning
  → Kubeflow: model evaluation and deployment
  → AI Gateway: model endpoint updated (canary or blue-green)
  → Monitoring: Prometheus metrics on model performance

Model Types (from source §19.3):
  LLM fine-tuning:       OpenAI GPT-4o primary; Claude/Ollama fallback (see spec §22.6)
  Time-series forecasting (DelayForecastModel): XGBoost regressor; features: procurement delays, task completion %, weather, workforce; requires 90+ days data (see spec §22.6)
  Computer vision (SafetyVisionModel):       XGBoost classifier on ViT image embeddings; requires 10,000+ labeled site photos (see spec §22.6)
  Graph ML (GraphMLModel):              XGBoost on Neo4j graph-derived features (PageRank, centrality); requires 6+ months data (see spec §22.6)
  Classification (RiskClassifier):        XGBoost multi-class (LOW/MEDIUM/HIGH/CRITICAL); features: budget variance, schedule delay, procurement, safety incidents; requires 50+ projects (see spec §22.6)
  Device trust (DeviceTrustModel):        XGBoost binary classifier, calibrated probability rendered 0–100; features: attestation verdict, enrolment age, last_seen_at recency, revocation history, ingress ASN stability; NO count threshold — promoted only by beating the rule-based baseline on a held-out set (PR-AUC), because the positive class is rare by design (see spec §22.6; ADR-081)
  Anomaly detection (CostAnomalyModel):   flags unusual cost entries and procurement patterns.
    Added 2026-08-22 — it had an evaluation threshold in spec §30.11 (Precision ≥ 0.85, secondary
    Recall) but was missing from this phase and from §22.6. Algorithm, input features and minimum
    training data are UNSPECIFIED — do NOT infer them; owner AI/Platform Lead, decided when Layer B
    enters an active development sprint. See docs/architecture/test-design/README.md §35.13 ESC-03.

Feature Store (Feast):
  Feature views:
    project_features:     budget_variance, days_to_deadline, open_issue_count
    procurement_features: avg_delivery_delay, rfq_to_po_days, overdue_invoice_count
    site_features:        manpower_7d_avg, inspection_fail_rate, report_submission_rate
  Online store: Redis (for real-time inference)
  Offline store: PostgreSQL — Feast `postgres` contrib store (feast_offline schema on the existing RDS).
    NOT ClickHouse: both ClickHouse and PostgreSQL are Feast community/contrib offline stores (neither is
    a stable core store — core = BigQuery/Snowflake/Redshift/Dask), and ClickHouse's own guidance is that
    a Feast "literal store" underutilises ClickHouse (it recommends Featureform for a virtual store).
    PostgreSQL reuses the existing RDS and is the more widely-used contrib path. Training features that
    originate in ClickHouse analytics (cost_history etc.) are bridged into feast_offline by the
    dag-update-feature-store Airflow DAG. (Decision 2026-07-23 — see feature_store.yaml.)

Airflow DAGs (generate stubs for all):
  dag-export-training-data:    daily export from PostgreSQL/ClickHouse → MinIO (parquet)
  dag-train-delay-model:       weekly retraining of delay prediction model
  dag-train-risk-classifier:   weekly retraining of risk classifier
  dag-update-feature-store:    daily refresh of Feast feature views
  dag-model-evaluation:        post-training: evaluate on holdout set, log to MLflow

Generate:

- Airflow DAG files for all 5 DAGs above (as stubs with clear TODO markers)
- MLflow tracking server Docker Compose + Kubernetes deployment
- Feast feature store configuration (feature_store.yaml + feature view definitions)
- Kubeflow pipeline YAML for model training workflow
- MinIO bucket for data lake: cos-datalake-{tenant_id}
- Data export utility: PostgreSQL → Parquet (using pandas + pyarrow)
- Model serving integration: update AI Gateway endpoint post-deployment
- AI provider decisions documented in docs/specifications/22-ai-architecture.md §22.6
- Unit tests: DAG task functions (with mocked data sources)
- Integration tests: end-to-end Airflow DAG run with test data
- PRODUCER for `construction.delay.detected.v1` — DONE 2026-08-25. Producer:
  services/ai-gateway/reports/delay_event.py (beside risk_event.py, which already had the Kafka
  producer). Second consumer: backend TasksDelayConsumer, which sets task.status = BLOCKED within the
  scope recorded at §Phase 6 completion gate 6. The Knowledge Graph consumer was already built. The
  producer emits only once DelayForecastModel returns a prediction, and that model is still a stub.
  The account of why it was deferred, kept because it is the reason the shape existed at all:
  added 2026-08-23 after an audit found the event has
  a schema, a topic, a catalogue entry and TWO documented consumers, but nothing anywhere in the
  repository publishes it. `DelayForecastModel` below is the AI_FORECAST source the payload's
  `detected_by` names, which is why the producer belongs to this phase rather than to Phase 12
  (whose delay-risk report emits `ai.risk_prediction.generated.v1`, a different event).
  Payload and severity bands: spec `32 §Event payloads` row 8 — LOW=1-2 days, MEDIUM=3-6, HIGH=7-13,
  CRITICAL=14+, identical to the Phase 12 delay-risk bands.
  Ship it together with BOTH consumers, or the event is unobservable and the gap simply moves:
    1. Knowledge Graph — already built and waiting (`kg-ingestion-worker` maps it to `(:Delay)` and
       `[:IMPACTS]`; §Phase 13). Until the producer exists, graph queries 7 and 8 return nothing.
    2. Task auto-block — `task.status = BLOCKED` on receipt, which §Phase 6 completion gate 6 states
       as fact ("event auto-sets task.status = BLOCKED") and which NO code performs today. The gate
       itself works: `tasks.service.ts` reads the status, and a PM can set BLOCKED by hand via
       PATCH /tasks/:id. What is missing is only the automatic path.
  Product-owner decision 2026-08-23: deferred here rather than stubbed earlier, because a producer
  built before the forecasting model would have to be rewritten once the model exists.

- PRODUCER for the safety-violation event — added 2026-08-25 after Phase 20 found the §19.6 rule
  "Critical safety notifications (SafetyIncidentReported, SafetyViolationDetected) cannot be
  disabled" enforceable for only ONE of the two events it names. `SafetyIncidentReported` maps to
  `safety.incident.created.v1`; `SafetyViolationDetected` has no canonical event type, no `.avsc`,
  no topic-catalogue entry, no producer and no consumer — it appears in exactly two places in the
  whole specification: the §19.6 sentence above and the Safety group of
  `16-enterprise-event-flow §Enterprise event catalogue`.
  It belongs to this phase because `SafetyVisionModel` below is what detects a violation — its
  `SafetyAnalysisResult { violations, confidence, severity }` is the only source of one anywhere in
  the specs — and that model is gated on "10,000+ labeled site photos accumulated in production".
  Ship the event together with all five of its halves, or the gap simply moves:
    1. canonical event type + `.avsc` + `EVENT_AVSC_MAP` entry (naming per §7.3 / §32.4)
    2. the producer, in whichever service hosts SafetyVisionModel inference
    3. membership of `CRITICAL_EVENT_TYPES` in `notification.service.ts` — without it the event is
       one a user can switch off, which is the exact thing §19.6 forbids
    4. `EVENT_ROLE_MAP` routing AND `SUBSCRIBED_EVENT_TYPES` subscription (a routing entry alone
       decides an audience for a message no consumer asks for)
    5. a system-default notification template — `notifyUser` drops any channel with no template row
  DONE 2026-08-25 (product-owner decision to build rather than defer again). All five halves shipped:
  `safety.violation.detected.v1` + .avsc + catalogue entry (payload in spec §32.4 row 22); producer at
  services/ai-gateway/reports/safety_violation_event.py; membership of CRITICAL_EVENT_TYPES;
  EVENT_ROLE_MAP routing AND the consumer subscription; and the system-default template in migration
  20260825000003. The producer emits only once SafetyVisionModel returns an analysis, and that model
  is still a stub until it has 10,000+ labeled photos.
  The guard that protected the gap — the `§19.6 critical event set` block in
  `notification.service.spec.ts` — fired exactly as designed when the event was minted, and now
  asserts the wiring instead of the absence.
  Product-owner decision 2026-08-25: deferred to this phase rather than named speculatively now,
  because an event type minted before the model exists would fix a name and a payload that the
  model's actual output may not match.

Stubs in Phase 23 (generate stub — algorithms RESOLVED in spec §22-ai-architecture §22.6, implement when data thresholds met):

  ModelRegistry:
    Integrated with: MLflow tracking server (deployed in this phase)
    Interface: { registerModel(name: str, version: str, artifactPath: str): ModelRef }
    Note:     implement concrete class after MLflow server is running

  FeatureStore:
    Integrated with: Feast (deployed in this phase)
    Interface: { getOnlineFeatures(entityRows: list[dict]): list[FeatureVector] }
    Note:     implement concrete class after Feast feature store is configured

  AutonomousWorkflowExecutor:
    Status:   Phase 23+ — do NOT activate in Phase 23 itself
    Interface: { execute(workflowType: str, payload: dict,
                         tenantId: str): AutonomousResult }
    Constraint: NEVER trigger financial transactions, human-approval workflows,
                or data deletions — generate stub only, governance review required

  ExperimentMonitoring:
    Integrated with: MLflow Tracking (experiment runs/metrics) + Evidently AI (evaluation + drift) — self-hosted
    Interface: { logRun(experimentName: str, metrics: dict, params: dict): RunRef }  (MLflow-backed)
    Auth:     in-cluster — no external SaaS / API key
    Note:     provider RESOLVED — MLflow + Evidently AI (replaced W&B per ADR-038); source: spec §22-ai-architecture §22.6

  DelayForecastModel:
    Trigger:  after Phase 23 DAG dag-train-delay-model has run with 90+ days production data
    Interface: { predict(features: DelayFeatures): DelayPrediction }
    DelayFeatures: { weather, workforce_count, procurement_delay_days,
                     historical_velocity, days_to_deadline }
    DelayPrediction: { delay_probability: float, estimated_delay_days: int,
                       confidence_interval: tuple[int, int] }
    Algorithm: RESOLVED — XGBoost regressor; source: spec §22-ai-architecture §22.6
    Framework: scikit-learn + XGBoost

  SafetyVisionModel:
    Trigger:  after 10,000+ labeled site photos accumulated in production
    Interface: { analyze(image_url: str): SafetyAnalysisResult }
    SafetyAnalysisResult: { violations: list[str], confidence: float, severity: str }
    Algorithm: RESOLVED — XGBoost classifier on HOG + ViT image embeddings; source: spec §22-ai-architecture §22.6
    Framework: scikit-learn + XGBoost

  GraphMLModel:
    Trigger:  after Neo4j graph has 6+ months of relationship data
    Interface: { inferRelationship(node_a: str, node_b: str,
                                   node_type: str): RelationshipScore }
    RelationshipScore: { score: float, relationship_type: str }
    Algorithm: RESOLVED — XGBoost on Neo4j graph-derived features (PageRank, centrality); source: spec §22-ai-architecture §22.6
    Framework: scikit-learn + XGBoost

  RiskClassifier:
    Trigger:  after 50+ projects with full lifecycle data in production
    Interface: { classify(project_features: ProjectFeatures): RiskLevel }
    RiskLevel: ENUM(LOW, MEDIUM, HIGH, CRITICAL)
    Algorithm: RESOLVED — XGBoost multi-class (LOW/MEDIUM/HIGH/CRITICAL); source: spec §22-ai-architecture §22.6
    Framework: scikit-learn + XGBoost

  DeviceTrustModel:  (added 2026-08-04 — ADR-081; the fifth §22.6 model)
    Trigger:  NOT a data count. Promoted only when it beats the rule-based baseline on a held-out
              set (PR-AUC). The positive class ("device later revoked as compromised") is rare by
              design, so a count/calendar trigger would promote an untrained model, and accuracy and
              ROC-AUC both stay flattering under that imbalance.
    Day one:  a deterministic rule-based scorer serves behind the same interface and IS the baseline
              the model must beat. While it serves, the surface must NOT be described as AI-derived.
    Interface: { score(deviceId: string, userId: string): TrustScore }
    TrustScore: { score: int 0..100, scoredBy: 'RULES'|'MODEL', signals: SignalState[] }  (the mobile BADGE renders 'RULE_BASED'|'AI_VERIFIED'; the wire value is scoredBy)
    Algorithm: RESOLVED — XGBoost binary classifier, calibrated; source: spec §22-ai-architecture §22.6
    Framework: scikit-learn + XGBoost
    Governance: ADVISORY ONLY — never revokes a device, never blocks a login (§22.3 autonomous-mode
              prohibition). Model card records the PR-AUC margin that authorised promotion (§22.9).

Constraints:

- Before marking Phase 23 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
