---
title: 'Glossary — Construction OS'
version: '1.3.0'
status: Active
last_updated: '2026-05-26'
authors:
  - thitipongroo
related_docs:
  - 00-executive-overview.md
  - 10-construction-ontology.md
  - 11-database-schema.md
---

# Glossary — Construction OS

This document defines all domain-specific, technical, and platform terms used across the
Construction OS specification set. Terms are grouped by category and listed alphabetically
within each group.

---

## Table of Contents

- [Construction Domain Terms](#construction-domain-terms)
- [Financial Terms](#financial-terms)
- [Platform & Product Terms](#platform--product-terms)
- [Technical Infrastructure Terms](#technical-infrastructure-terms)
- [AI & ML Terms](#ai--ml-terms)
- [Security & Compliance Terms](#security--compliance-terms)
- [Acronym Quick Reference](#acronym-quick-reference)

---

## Construction Domain Terms

| Term | Thai | Definition |
| --- | --- | --- |
| **BOQ** (Bill of Quantities) | ใบรายการวัสดุและปริมาณงาน | A document listing all materials, labour, and tasks required for a construction project, with estimated quantities and unit costs. The BOQ is the basis for procurement planning and budget tracking. See `11-database-schema` BOQ entity. |
| **BIM** (Building Information Modeling) | แบบจำลองข้อมูลอาคาร | Digital 3D model containing geometry and metadata for a building throughout its lifecycle. Full BIM integration is post-MVP. |
| **Contractor** | ผู้รับเหมา | A company contracted to execute construction work. The primary user persona of this platform. |
| **Developer / Property Developer** | ผู้พัฒนาอสังหาริมทรัพย์ | A company that acquires land and commissions construction projects for sale or lease. |
| **Drawing Approval** | การอนุมัติแบบ | Formal sign-off on a construction drawing before work begins. Recorded as a Permit with `permit_type: drawing_approval`. |
| **Earned Value** | มูลค่างานที่ทำได้จริง | The budgeted cost of work actually performed. Used to calculate cost and schedule variance. |
| **Equipment** | เครื่องจักร/อุปกรณ์ก่อสร้าง | Heavy machinery or tools used on site (e.g., crane, excavator, scaffolding). Tracked as an Equipment entity in the schema. |
| **Facility Management** | การบริหารอาคาร | Post-completion operations and maintenance of a building or property asset. Part of the Asset Lifecycle domain. |
| **Handover** | การส่งมอบ | Formal transfer of a completed unit or building from the contractor to the client or end customer. Triggers AssetHandedOver event. |
| **Inspection** | การตรวจสอบ | On-site quality check against a defined checklist. Results are pass / fail / conditional. See `11-database-schema` Inspections entity. |
| **IoT** (Internet of Things) | อุปกรณ์เชื่อมต่ออินเทอร์เน็ต | Sensors and connected devices deployed on construction sites or in completed buildings. Post-MVP capability (Phase 5 ecosystem). |
| **MEP** | งานระบบอาคาร | Mechanical, Electrical, and Plumbing systems in a building. A key inspection category. |
| **Permit** | ใบอนุญาต | An authorization document for a specific activity (work permit, safety permit, drawing approval, entry permit). See `11-database-schema` Permit entity. |
| **Progress Update** | รายงานความคืบหน้า | A record of work completed against a task, expressed as `progress_percent` (0–100). |
| **Procurement** | การจัดซื้อจัดจ้าง | The end-to-end process of sourcing and purchasing materials or services: PR → RFQ → Quotation → PO → Delivery → Vendor Invoice. |
| **QC** (Quality Control) | การควบคุมคุณภาพ | Systematic inspection and testing to ensure construction work meets specifications. |
| **Rework** | การแก้ไขงาน | Corrective work required due to quality defects. A key cost driver the platform aims to reduce. |
| **RFI** (Request for Information) | การขอข้อมูล | A formal question raised by the site team about drawing specifications or design intent. Recorded as a Task with `work_type: rfi`. |
| **RFQ** (Request for Quotation) | การขอใบเสนอราคา | A formal request sent to vendors to submit price quotations for specified materials or services. |
| **Site Engineer** | วิศวกรสนาม | The primary field-level role responsible for executing and reporting daily construction work. |
| **Site Report** (Daily Site Report) | รายงานประจำวันหน้างาน | A daily record capturing weather, manpower count, work completed, and blockers. See `11-database-schema` Site Reports entity. |
| **Subcontractor** | ผู้รับเหมาช่วง | A specialist contractor hired by the main contractor to perform a specific scope of work. |
| **Timesheet** | ใบบันทึกชั่วโมงทำงาน | Record of hours worked by an employee on a project. Captured via the Workforce (Site Attendance) entity. |
| **Unit** | ยูนิต/ห้องชุด | An individual sellable property within a building (e.g., condominium unit, townhouse). Tracked in the Unit entity. |
| **Variation Order (VO)** | ใบสั่งเปลี่ยนแปลงงาน | A formal change to the original contract scope, price, or timeline. Requires approval per the workflow in `15-event-driven-workflow` section 15.5. |
| **Vendor** | ผู้ขาย/ซัพพลายเออร์ | A company supplying materials or subcontract services to the contractor. See `11-database-schema` Vendor entity. |
| **Warranty** | การรับประกัน | Post-handover guarantee period during which the developer/contractor is responsible for defect repairs. |
| **Workforce** | แรงงาน | Personnel working on a construction site. Includes FTE employees, daily labour, and subcontractor workers. Tracked via the Workforce (Site Attendance) entity. |

---

## Financial Terms

| Term | Thai | Definition |
| --- | --- | --- |
| **AP** (Accounts Payable) | เจ้าหนี้การค้า | Money the contractor owes to vendors for delivered goods or services. Recorded as `Procurement — Vendor Invoice` in the schema. |
| **AR** (Accounts Receivable) | ลูกหนี้การค้า | Money owed to the contractor by clients for completed work. Recorded as `Financials — Billing` in the schema. |
| **AR Receipt** | ใบรับเงินลูกหนี้ | Record of an actual client payment received against a Billing invoice. |
| **Budget Line** | บรรทัดงบประมาณ | A line-item in the project budget, optionally linked to a BOQ item. |
| **Cash Flow Forecast** | การพยากรณ์กระแสเงินสด | Projected inflows and outflows over time, used to predict liquidity risk. |
| **Cost Center** | ศูนย์ต้นทุน | An accounting unit that tracks costs for a specific project, department, or period. |
| **Cost Transaction** | รายการต้นทุน | An individual cost entry linked to its source (PO, Vendor Invoice, Attendance record, etc.). |
| **Retention** | เงินประกันผลงาน | A percentage of contract value withheld from payments until project completion or warranty expiry. See `Financials — Retention` entity. |
| **WIP** (Work in Progress) | งานระหว่างก่อสร้าง | The value of partially completed work not yet billed. An accounting concept for revenue recognition. |

---

## Platform & Product Terms

| Term | Definition |
| --- | --- |
| **Construction OS** | Short name for the Construction Operating System — this platform. The "OS" metaphor means it becomes the foundational operational layer, not a point solution. |
| **Tenant** | A single company (customer) using the platform in isolation from other companies. All data is scoped by `tenant_id`. See `07-multi-tenant-architecture`. |
| **Tenant Admin** | The role within a tenant responsible for configuring users, roles, workflows, and integrations. See `06-rbac-permission-matrix` section 6.2. |
| **System Admin** | A cross-tenant platform operator role used by the SaaS operator team. NOT provisioned to any tenant. See `06-rbac-permission-matrix` section 6.7. |
| **Layer A** | Assistive AI — the MVP AI capability tier. Includes report generation, summarization, OCR, voice transcription. See `22-ai-architecture` section 22.2. |
| **Layer B** | Analytical AI — post-MVP tier. Includes delay prediction, cost overrun forecasting, procurement analytics. |
| **Layer C** | Autonomous AI — future tier. AI agents execute multi-step workflows with minimal human intervention. |
| **Knowledge Graph** | A graph database (Neo4j) storing construction entities and their relationships, enabling AI reasoning across connected data. See `12-construction-knowledge-graph`. |
| **Ontology** | The formal model defining construction objects (Building, Task, Vendor, etc.), their properties, and relationships. See `10-construction-ontology`. |
| **Outbox Pattern** | A transactional pattern ensuring that a DB write and its corresponding event publish succeed or fail together, preventing event loss. See `09-data-architecture` section 9.4. |
| **Soft Delete** | `deleted_at` is set to a timestamp on delete request — the record remains in storage. All queries filter `WHERE deleted_at IS NULL`. **Exception — File Service:** files are automatically hard-deleted from MinIO 30 days after soft delete via a **daily recurring** Temporal scheduled workflow (see `09-data-architecture` File Lifecycle Policy). Database entity records remain soft-deleted indefinitely. See `11-database-schema` section 11.4. |
| **Wedge Product** | The initial feature set used to acquire customers — site reporting, procurement visibility, and cost tracking. Used to create operational dependency before expanding. |

---

## Technical Infrastructure Terms

| Term | Definition |
| --- | --- |
| **Apache Airflow** | Open-source workflow orchestration platform used to schedule and monitor the ML training pipeline. See `04-tech-stack` section 4.6. |
| **ArgoCD** | GitOps-based Kubernetes deployment tool. Manages all deployments by syncing from the GitOps repository. See `04-tech-stack` section 4.9. |
| **CDC** (Change Data Capture) | The process of detecting and capturing row-level database changes. Implemented via Debezium reading the PostgreSQL WAL. See `09-data-architecture` section 9.4. |
| **ClickHouse** | Column-oriented OLAP database used for aggregation-heavy analytics (cost, procurement, schedule). See `04-tech-stack` section 4.3. |
| **Confluent Schema Registry** | Central registry for Avro/JSON event schemas used with Kafka. Ensures producers and consumers agree on event structure; enforces backward-compatibility rules. See `15-event-driven-workflow` section 15.6. |
| **CQRS** (Command Query Responsibility Segregation) | An architectural pattern separating write (command) and read (query) paths. Used where necessary per `03-system-design` section 3.3. |
| **Debezium** | Open-source CDC platform that reads the PostgreSQL WAL and publishes change events to Kafka. See `04-tech-stack` section 4.4. |
| **DLQ** (Dead Letter Queue) | A Kafka queue that receives messages that failed processing after max retries. Tenant-scoped. See `07-multi-tenant-architecture` section 7.3. |
| **EKS** | Amazon Elastic Kubernetes Service — the managed Kubernetes cluster used on AWS. |
| **Helm** | Kubernetes package manager. The platform is packaged as Helm charts for deployment. See `08-enterprise-deployment` section 8.6. |
| **Apache Iceberg** | Open table format for data lake storage on S3. Supports time-travel queries and efficient cold storage. See `04-tech-stack` section 4.3. |
| **Kafka** | Distributed event streaming platform. The event bus for all domain events and CDC streams. See `04-tech-stack` section 4.4. |
| **Keycloak** | Open-source identity provider implementing OAuth2/OIDC/SAML. Manages authentication for all tenants. See `04-tech-stack` section 4.4. |
| **Kong Gateway** | Open-source API gateway handling JWT validation, rate limiting, tenant routing, and API analytics. See `04-tech-stack` section 4.8. |
| **Kubeflow** | Kubernetes-native ML pipeline platform used to orchestrate model training jobs in the MLOps stack. See `04-tech-stack` section 4.6. |
| **MSK** | Amazon Managed Streaming for Kafka — the managed Kafka service on AWS. |
| **NestJS** | Node.js framework used for the platform's Modular Monolith backend. See `03-system-design` section 3.1 and `04-tech-stack` section 4.2. |
| **Neo4j** | Graph database used for the Construction Knowledge Graph. See `04-tech-stack` section 4.3. |
| **OpenSearch** | Full-text search engine used for document search across site reports, inspections, and drawings. See `04-tech-stack` section 4.3. |
| **PagerDuty** | Incident management and on-call notification platform. Used to route critical alerts and manage escalation policies. See `31-monitoring-observability` section 31.9. |
| **SSE** (Server-Sent Events) | Unidirectional HTTP streaming from server to client. Used for in-app real-time notifications. See `19-notification-architecture` section 19.2. |
| **Temporal.io** | Durable workflow orchestration engine. Used for approval workflows and post-MVP AI orchestration. See `04-tech-stack` section 4.4. |
| **TimescaleDB** | PostgreSQL extension for time-series data. Used for telemetry and IoT sensor data. See `04-tech-stack` section 4.3. |
| **WAL** (Write-Ahead Log) | PostgreSQL's durability mechanism. Debezium reads the WAL to detect data changes without impacting application writes. |
| **WatermelonDB** | SQLite-backed offline database for React Native mobile app. See `04-tech-stack` section 4.1. |
| **Weights & Biases** | MLOps experiment tracking and model evaluation platform. Used to log training runs, compare model versions, and track evaluation metrics. See `04-tech-stack` section 4.6. |

---

## AI & ML Terms

| Term | Definition |
| --- | --- |
| **Embedding** | A numerical vector representation of text, used for semantic similarity search. Generated by `text-embedding-3-small` (OpenAI, 1536 dimensions). See `22-ai-architecture` section 22.5. |
| **Feast** | Open-source feature store used to manage ML model input features. Part of the MLOps stack. See `04-tech-stack` section 4.6. |
| **LangChain** | Python framework (`langchain>=0.3`, `langchain-openai>=0.2`) providing the unified `LLMProvider` and `EmbeddingProvider` interfaces. Replaces LiteLLM as the LLM abstraction layer. Prevents direct SDK coupling in domain services. See `22-ai-architecture` section 22.3. |
| **LLM Gateway** | The platform's routing layer for LLM API calls, implemented via LangChain (`langchain>=0.3`, `langchain-openai>=0.2`). Routes based on task type, cost, and latency. Primary: GPT-4o; cost fallback: gpt-4o-mini. See `22-ai-architecture` section 22.3. |
| **MLflow** | Open-source MLOps platform for experiment tracking, model registry, and model serving. See `04-tech-stack` section 4.6. |
| **text-embedding-3-small** | The embedding model used for semantic search (OpenAI, 1536 dimensions). Supports Thai adequately for construction domain queries. Accessed via `EmbeddingProvider` interface. See `22-ai-architecture` section 22.5. |
| **OCR** (Optical Character Recognition) | Automated extraction of text from images or PDFs. Used for drawing and invoice ingestion. Part of Layer A AI. |
| **pgvector** | PostgreSQL extension for storing and querying vector embeddings. Used in MVP; replaced by Weaviate at scale. See `04-tech-stack` section 4.3. |
| **RAG** (Retrieval-Augmented Generation) | A technique that injects relevant document chunks into an LLM prompt as context, enabling knowledge-grounded responses without fine-tuning. See `22-ai-architecture` section 22.5. |
| **Weaviate** | Dedicated vector database for large-scale embedding search. Replaces pgvector post-MVP. See `04-tech-stack` section 4.3. |

---

## Security & Compliance Terms

| Term | Definition |
| --- | --- |
| **ABAC** (Attribute-Based Access Control) | Fine-grained access control based on entity attributes (e.g., project scope, approval limits). Supplements RBAC. See `06-rbac-permission-matrix` section 6.5. |
| **AES-256** | Advanced Encryption Standard with 256-bit key. Used for all data at rest. See `05-security-compliance` section 5.2. |
| **GDPR** | General Data Protection Regulation (EU). A compliance target for the platform. See `05-security-compliance` section 5.3. |
| **HashiCorp Vault** | Secrets management system used for on-premise and hybrid deployments. Replaced by AWS Secrets Manager on cloud. See `04-tech-stack` section 4.4. |
| **ISO 27001** | International standard for information security management systems. A compliance target. |
| **JWT** (JSON Web Token) | Compact, self-contained token for transmitting authentication claims. Contains `tenant_id` for multi-tenant routing. See `05-security-compliance` section 5.4. |
| **mTLS** (Mutual TLS) | Two-way TLS authentication used for service-to-service communication. See `05-security-compliance` section 5.4. |
| **OIDC** (OpenID Connect) | Identity layer on top of OAuth 2.0. Used by Keycloak for authentication. |
| **PDPA** | Personal Data Protection Act — Thailand's data privacy law, effective 2022. A primary compliance target. See `05-security-compliance` section 5.3. |
| **RBAC** (Role-Based Access Control) | Access control model assigning permissions to roles, then roles to users. Authoritative definition in `06-rbac-permission-matrix`. |
| **SAML** | Security Assertion Markup Language. Used for enterprise SSO integration (Azure AD, Google Workspace, Okta). See `05-security-compliance` section 5.4. |
| **SOC 2** | Service Organization Control 2 — audit standard for cloud service providers. A compliance target. |
| **TLS 1.3** | Transport Layer Security version 1.3. All data in transit is encrypted using TLS 1.3. |
| **Zero Trust** | Security model requiring strict identity verification for every service and user, regardless of network location. See `05-security-compliance` section 5.1. |

---

## Acronym Quick Reference

| Acronym | Full Form                                      | See                                         |
| ------- | ---------------------------------------------- | ------------------------------------------- |
| ABAC    | Attribute-Based Access Control                 | 06-rbac-permission-matrix §6.5              |
| AP      | Accounts Payable                               | 11-database-schema (Vendor Invoice)         |
| AR      | Accounts Receivable                            | 11-database-schema (Billing)                |
| BIM     | Building Information Modeling                  | 21-mvp-scope (excluded)                     |
| BOQ     | Bill of Quantities                             | 11-database-schema (BOQ)                    |
| CDC     | Change Data Capture                            | 09-data-architecture §9.4                   |
| CQRS    | Command Query Responsibility Segregation       | 03-system-design §3.3                       |
| DLQ     | Dead Letter Queue                              | 07-multi-tenant-architecture §7.3           |
| GDPR    | General Data Protection Regulation             | 05-security-compliance §5.3                 |
| GTM     | Go-to-Market                                   | 25-go-to-market                             |
| IoT     | Internet of Things                             | 13-product-architecture Layer 4             |
| ISO     | International Organization for Standardization | 05-security-compliance §5.3                 |
| JWT     | JSON Web Token                                 | 05-security-compliance §5.4                 |
| LLM     | Large Language Model                           | 22-ai-architecture §22.3                    |
| MEP     | Mechanical, Electrical, Plumbing               | 11-database-schema (QC Inspection Template) |
| MLOps   | Machine Learning Operations                    | 04-tech-stack §4.6                          |
| mTLS    | Mutual TLS                                     | 05-security-compliance §5.4                 |
| OCR     | Optical Character Recognition                  | 22-ai-architecture §22.2                    |
| OIDC    | OpenID Connect                                 | 05-security-compliance §5.4                 |
| PDPA    | Personal Data Protection Act (Thailand)        | 05-security-compliance §5.3                 |
| PO      | Purchase Order                                 | 11-database-schema (Procurement — PO)       |
| PR      | Purchase Request                               | 11-database-schema (Procurement — PR)       |
| QC      | Quality Control                                | 11-database-schema (Inspections)            |
| RAG     | Retrieval-Augmented Generation                 | 22-ai-architecture §22.5                    |
| RBAC    | Role-Based Access Control                      | 06-rbac-permission-matrix                   |
| RFI     | Request for Information                        | 11-database-schema (Tasks — work_type: rfi) |
| RFQ     | Request for Quotation                          | 11-database-schema (Procurement — RFQ)      |
| RPO     | Recovery Point Objective                       | 08-enterprise-deployment §8.2               |
| RTO     | Recovery Time Objective                        | 08-enterprise-deployment §8.2               |
| SAML    | Security Assertion Markup Language             | 05-security-compliance §5.4                 |
| SOC     | Service Organization Control                   | 05-security-compliance §5.3                 |
| SSE     | Server-Sent Events                             | 19-notification-architecture §19.2          |
| TTL     | Time to Live                                   | 09-data-architecture §9.5                   |
| VO      | Variation Order                                | 15-event-driven-workflow §15.5              |
| WAL     | Write-Ahead Log                                | 09-data-architecture §9.4                   |
| WIP     | Work in Progress                               | 01-business-architecture §1.2               |

---

## References

| ID          | Title                                                              | Source                           |
| ----------- | ------------------------------------------------------------------ | -------------------------------- |
| [IEEE 830]  | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                |
| [OAuth2]    | The OAuth 2.0 Authorization Framework                              | RFC 6749                         |
| [JWT-RFC]   | JSON Web Token (JWT)                                               | RFC 7519                         |
| [NIST-RBAC] | Role Based Access Control — NIST SP 800-207                        | NIST Special Publication 800-207 |
| [ABAC]      | Guide to Attribute Based Access Control (ABAC)                     | NIST SP 800-162                  |
| [PDPA]      | Personal Data Protection Act B.E. 2562 (2019)                      | Thailand PDPA                    |
| [GDPR]      | General Data Protection Regulation                                 | EU Regulation 2016/679           |
| [IFC4]      | Industry Foundation Classes IFC4 — ISO 16739-1:2018                | buildingSMART International      |

---

> 📎 See also: [00-executive-overview](00-executive-overview.md) · [10-construction-ontology](10-construction-ontology.md) — formal object model with relationships · [11-database-schema](11-database-schema.md) — schema definitions for all entities · [06-rbac-permission-matrix](06-rbac-permission-matrix.md) — role definitions
