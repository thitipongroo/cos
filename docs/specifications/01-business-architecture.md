---
title: 'Business Architecture'
version: '1.1.0'
status: Active
last_updated: '2026-05-25'
authors:
  - thitipongroo
related_docs:
  - 00-executive-overview.md
  - 02-system-wide-integration.md
  - 03-system-design.md
  - 13-product-architecture.md
---

# 1. Business Architecture

## Table of Contents

- [1.1 Business Problem Core](#11-business-problem-core)
- [1.2 Core Business Domains](#12-core-business-domains)
- [1.3 Operating Model](#13-operating-model)

---

> 📝 Business problem statements in this document use Thai to preserve the original domain framing.
> Technical terms and proper nouns remain in English throughout.

## 1.1 Business Problem Core

ปัญหาหลักของอุตสาหกรรมก่อสร้าง :

| Problem                       | Root Cause                               |
| ----------------------------- | ---------------------------------------- |
| Cost overrun                  | ไม่มี real-time cost visibility          |
| Delay                         | Planning disconnected from field reality |
| Rework                        | Drawing/version mismatch                 |
| Procurement waste             | ไม่มี demand forecasting                 |
| Cash flow collapse            | Billing/progress mismatch                |
| Knowledge loss                | ทุกอย่างอยู่ในคน                         |
| Site chaos                    | Communication fragmented                 |
| Quality inconsistency         | ไม่มี process standardization            |
| Executive blindness           | ไม่มี unified dashboard                  |
| Multi-project scaling failure | System ไม่ scale                         |

ระบบนี้ต้องแก้ "ทั้งระบบ" ไม่ใช่ optimize เฉพาะส่วนใดส่วนหนึ่ง

---

## 1.2 Core Business Domains

A. Pre-Construction :

- CRM
- Lead management
- Feasibility study
- Land acquisition
- BOQ estimation
- Tender management
- Contractor bidding
- Budget planning
- Design collaboration

Note on Pre-Construction MVP scope :

CRM (Lead management) and BOQ estimation ship with the core platform (schema built from
Day 1 — see 21-mvp-scope section 21.6). The following four capabilities are post-MVP :
Feasibility study, Land acquisition, Tender management, and Contractor bidding. They are
planned as Phase 2 extensions to the CRM Service (see 03-system-design section 3.2) when
the CRM UI module is released. They are not listed in 21-mvp-scope Excluded list because
they are sub-features of the CRM domain, not standalone modules.

B. Construction Execution :

- Project scheduling
- Site management
- Workforce management
- Material tracking
- Equipment tracking
- Inspection/QC
- Safety management
- Progress reporting
- Variation order management

C. Procurement & Supply Chain :

- Vendor management
- RFQ/RFP
- Purchase requests
- Purchase orders
- Delivery tracking
- Inventory
- Warehouse
- Cost optimization

D. Financial Operations :

- AP/AR
- Cost accounting
- Project accounting
- Budget tracking
- Cash flow forecasting
- Billing
- Retention
- Tax
- Financial reporting

E. Asset & Property Lifecycle :

- Unit inventory
- Property sales
- Transfer
- Warranty
- Facility management
- Maintenance
- IoT integration

F. Executive Intelligence Layer :

- Real-time analytics
- AI forecasting
- Risk prediction
- Productivity analytics
- Margin analysis
- Multi-project command center

---

## 1.3 Operating Model

Platform Architecture :

- Centralized master data
- Distributed operational workflows
- Event-driven coordination
- AI-assisted decision making
- Multi-company capable
- Multi-project capable
- Multi-region deployable

> 📎 See also: [00-executive-overview](00-executive-overview.md) · [02-system-wide-integration](02-system-wide-integration.md) · [03-system-design](03-system-design.md) · [13-product-architecture](13-product-architecture.md)
