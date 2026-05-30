---
title: "UX Flow"
version: "1.2.0"
status: Active
last_updated: "2026-05-28"
authors:
  - thitipongroo
related_docs:
  - 06-rbac-permission-matrix.md
  - 13-product-architecture.md
  - 21-mvp-scope.md
---

# 20. UX Flow

## Table of Contents

- [20.1 UX Philosophy](#201-ux-philosophy)
- [20.2 Role-based UX](#202-role-based-ux)
  - [Executive](#executive)
  - [Project Manager](#project-manager)
  - [Site Engineer](#site-engineer)
  - [Procurement Officer](#procurement-officer)
  - [Finance](#finance)
  - [Safety Officer](#safety-officer)
  - [CRM / Sales Manager](#crm--sales-manager)
- [20.3 Example Daily Site Workflow](#203-example-daily-site-workflow)

---

## 20.1 UX Philosophy

Construction workers do NOT behave like SaaS office users.

Therefore UX MUST be :

- Mobile-first
- Offline-capable
- Low cognitive load
- Fast data entry
- Voice/photo friendly
- WhatsApp/LINE-like simplicity
- Role-based simplicity

---

## 20.2 Role-based UX

### Executive

Needs :

- Portfolio health
- Risk alerts
- Cash flow
- Margin forecast
- Delay prediction

### Project Manager

Needs :

- Schedule tracking
- Procurement status
- Budget variance
- Site blockers

### Site Engineer

Needs :

- Daily tasks
- Drawing access
- Inspection forms
- Material requests

### Procurement Officer

Needs :

- RFQs
- Vendor comparisons
- Delivery tracking

### Finance

Needs :

- Cost recognition
- Payment approvals
- Cash flow

### Safety Officer

Needs :

- Safety checklists
- Incident reporting
- Safety compliance status
- Violation alerts

### CRM / Sales Manager

Needs :

- Lead pipeline
- Opportunity tracking
- Proposal generation
- Contract management

---

## 20.3 Example Daily Site Workflow

Morning :

1. Worker check-in
2. Task assignment
3. Material verification
4. Safety checklist

During work :

1. Progress updates
2. Photo uploads
3. Issue reporting
4. RFI submission (Request for Information — recorded as a Task record with work_type: rfi,
   linked to project_id and optionally to a BOQ item or drawing; see 11-database-schema Tasks)

End of day :

1. Daily report generation
2. Cost updates
3. Delay/risk analysis
4. Executive summary

AI Copilot assists at key steps.

MVP AI scope (Layer A — Assistive only) :

- Daily report generation
- Voice transcription for field notes
- OCR for drawings and invoices
- Document summarization

Layer B (Analytical — predictions) and Layer C (Autonomous — auto-actions) activate post-MVP.
See 21-mvp-scope for full AI phasing.

> 📎 See also: [06-rbac-permission-matrix](06-rbac-permission-matrix.md) · [13-product-architecture](13-product-architecture.md) · [21-mvp-scope](21-mvp-scope.md)
