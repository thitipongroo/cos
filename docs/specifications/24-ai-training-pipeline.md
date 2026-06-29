---
title: 'AI Training Pipeline'
version: '1.3.0'
status: Active
last_updated: '2026-05-26'
authors:
  - thitipongroo
related_docs:
  - 09-data-architecture.md
  - 22-ai-architecture.md
  - 23-ai-native-operating-model.md
  - 04-tech-stack.md
---

# 24. AI Training Pipeline

## Table of Contents

- [24.1 Data Sources](#241-data-sources)
- [24.2 Training Pipeline](#242-training-pipeline)
  - [Path A — Traditional ML Models](#path-a--traditional-ml-models)
  - [Path B — LLM / RAG-based Features](#path-b--llm--rag-based-features)
- [24.3 Model Types](#243-model-types)
- [24.4 MLOps Stack](#244-mlops-stack)
- [24.5 LLM and RAG Pipeline](#245-llm-and-rag-pipeline)

---

## 24.1 Data Sources

Sources :

- Site reports
- Drawings
- Cost history
- Schedules
- Procurement data
- Inspection failures
- Photos/videos

---

## 24.2 Training Pipeline

Two separate pipelines serve different AI capability types. They must not be conflated :

### Path A — Traditional ML Models

Applies to : time-series forecasting (delay prediction, cost overrun), computer vision
(safety compliance), graph ML (relationship inference), classification (risk detection).

```text
Operational Data
→ Data Lake
→ Cleaning
→ Feature Engineering  (Feast feature store)
→ Model Training       (Kubeflow Pipelines)
→ Evaluation           (Evidently AI)
→ Deployment           (MLflow model registry → Kubernetes serving)
→ Monitoring           (drift detection, performance metrics)
→ Retraining           (triggered by drift or scheduled cycle)

```

### Path B — LLM / RAG-based Features

Applies to : AI Copilot, document summarization, daily report generation, OCR, voice
transcription, translation. These features do NOT use the training pipeline above.
They use the RAG pipeline defined in section 24.5.

```text
Document / Operational Data
→ RAG Pipeline (see section 24.5)
→ LLM API (GPT-4o primary / gpt-4o-mini cost fallback — see 22-ai-architecture section 22.5)
→ Response to user

```

No model training is required for LLM-based features in MVP or early stages. Fine-tuning
is considered post-Stage 3 only (see section 24.5 Strategy note).

---

## 24.3 Model Types

| Model                   | Use Case               |
| ----------------------- | ---------------------- |
| LLM                     | Copilot                |
| Time-series forecasting | Delay prediction       |
| Computer vision         | Safety/compliance      |
| Graph ML                | Relationship inference |
| Classification          | Risk detection         |

---

## 24.4 MLOps Stack

Stack :

- MLflow (experiment tracking + model registry)
- Kubeflow
- Feast
- Airflow
- Evidently AI (model/output evaluation + drift)

---

## 24.5 LLM and RAG Pipeline

Strategy :

- No self-hosted LLM training — use foundation model APIs (OpenAI GPT-4o / gpt-4o-mini)
- Construction domain knowledge injected via RAG, not fine-tuning (MVP and early stages)
- Fine-tuning considered post-Stage 3 when operational data volume is sufficient to justify cost

RAG Pipeline :

```text
Document ingested
→ OCR / text extraction
→ chunked (documents: chunk_size=500, chunk_overlap=100 — master Phase 11; site reports = 1 chunk)
→ embedded via text-embedding-3-small (OpenAI, 1536 dimensions)
→ stored in pgvector (MVP) / Weaviate (at scale)
→ query-time: hybrid search (semantic similarity + keyword BM25)
→ top-k chunks injected into LLM prompt as context
→ LLM generates response in user's language (Thai or English)

```

Thai Language :

- Thai is first-class — evaluation benchmarks include Thai construction domain queries
- text-embedding-3-small supports Thai adequately for construction domain queries
- LLM output quality in Thai evaluated monthly against a golden dataset of construction terms
- Fallback: if primary model Thai accuracy falls below threshold, auto-route via `LLMProvider`
  interface; threshold = 85% on a golden dataset of ≥ 100 construction-domain Thai queries,
  evaluated monthly

---

## References

| ID             | Title                                                              | Source                                                                                                                      |
| -------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [IEEE 830]     | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                                                                           |
| [Whisper]      | Robust Speech Recognition via Large-Scale Weak Supervision         | Radford et al., OpenAI 2022                                                                                                 |
| [RAG]          | Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks   | Lewis et al., NeurIPS 2020                                                                                                  |
| [pgvector]     | pgvector: Vector Similarity Search for Postgres                    | [github.com/pgvector/pgvector](https://github.com/pgvector/pgvector)                                                        |
| [MLflow]       | MLflow — Open source platform for the ML lifecycle                 | [mlflow.org/docs/latest/index.html](https://mlflow.org/docs/latest/index.html)                                              |
| [ConfluentSR]  | Confluent Schema Registry Documentation                            | [docs.confluent.io/platform/current/schema-registry](https://docs.confluent.io/platform/current/schema-registry/index.html) |
| [OpenAI-embed] | OpenAI Embeddings Documentation                                    | [platform.openai.com/docs/guides/embeddings](https://platform.openai.com/docs/guides/embeddings)                            |
| [LangChain]    | LangChain Python Documentation                                     | [python.langchain.com/docs/introduction](https://python.langchain.com/docs/introduction/)                                   |

> 📎 See also: [09-data-architecture](09-data-architecture.md) · [22-ai-architecture](22-ai-architecture.md) · [23-ai-native-operating-model](23-ai-native-operating-model.md) · [04-tech-stack](04-tech-stack.md)
