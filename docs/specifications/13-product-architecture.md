---
title: "Product Architecture"
version: "1.1.0"
status: Active
last_updated: "2026-05-25"
authors:
  - thitipongroo
related_docs:
  - 03-system-design.md
  - 06-rbac-permission-matrix.md
  - 14-api-architecture.md
  - 21-mvp-scope.md
---

# 13. Product Architecture

## Table of Contents

- [13.1 Product Layering](#131-product-layering)
  - [Layer 1 — Core Platform](#layer-1--core-platform)
  - [Layer 2 — Construction Modules](#layer-2--construction-modules)
  - [Layer 3 — Intelligence Layer](#layer-3--intelligence-layer)
  - [Layer 4 — Ecosystem Layer](#layer-4--ecosystem-layer)
- [13.2 Product Packaging](#132-product-packaging)
  - [SMB Package](#smb-package)
  - [Mid-market Package](#mid-market-package)
  - [Enterprise Package](#enterprise-package)

---

## 13.1 Product Layering

### Layer 1 — Core Platform

Foundation :

- Identity
- Permissions
- Tenant isolation
- Audit logs
- Notifications
- Workflow engine
- Document engine           (OCR, version management, format conversion, drawing viewer — implemented by Document Service in 03-system-design section 3.2; sits above the File Service storage layer)
- API gateway
- Event bus

### Layer 2 — Construction Modules

Modules :

- CRM
- Project Management
- BOQ Engine
- Procurement
- Site Operations
- Workforce
- Quality Control
- Safety
- Equipment
- Finance
- Asset Management

### Layer 3 — Intelligence Layer

Services :

- AI Copilot
- Forecasting engine
- Risk scoring
- Schedule prediction
- Cost anomaly detection
- Knowledge graph
- Recommendation engine

### Layer 4 — Ecosystem Layer

Channels :

- Vendor portal
- Contractor portal
- Customer portal
- API marketplace
- BIM integrations
- IoT integrations
- ERP integrations

---

## 13.2 Product Packaging

### SMB Package

Features :

- Basic project management
- Procurement
- Cost tracking
- Mobile app

### Mid-market Package

Features :

- Multi-project
- Workflow automation
- AI forecasting  (Layer B Analytical AI — activates when Layer B is released post-MVP; see 22-ai-architecture section 22.2 and 21-mvp-scope section 21.4)
- Advanced finance

### Enterprise Package

Features :

- Multi-entity
- Custom workflows
- Data lake
- AI orchestration
- Private deployment
- SSO/SAML
- Compliance tooling

> 📎 See also: [03-system-design](03-system-design.md) · [06-rbac-permission-matrix](06-rbac-permission-matrix.md) · [14-api-architecture](14-api-architecture.md) · [21-mvp-scope](21-mvp-scope.md)
