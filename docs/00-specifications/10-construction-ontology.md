---
title: "Construction Ontology"
version: "1.2.0"
status: Active
last_updated: "2026-05-25"
authors:
  - thitipongroo
related_docs:
  - 09-data-architecture.md
  - 11-database-schema.md
  - 12-construction-knowledge-graph.md
---

# 10. Construction Ontology

## Table of Contents

- [10.1 Purpose](#101-purpose)
- [10.2 Core Ontology Objects](#102-core-ontology-objects)
- [10.3 Core Relationships and Cardinality](#103-core-relationships-and-cardinality)
- [10.4 Why Ontology Matters](#104-why-ontology-matters)

---

## 10.1 Purpose

Create machine-understandable construction knowledge.

---

## 10.2 Core Ontology Objects

Physical Objects :

| Object | Key Properties |
| --- | --- |
| Building | building_id, name, type, total_floors, location, status |
| Floor | floor_id, building_id, floor_number, gross_area_sqm |
| Room | room_id, floor_id, room_number, room_type, area_sqm |
| Structure | structure_id, building_id, structure_type (column/beam/slab/wall), material_type |
| Equipment | equipment_id, type, model, serial_number, status, assigned_project |
| Material | material_id, name, category, unit, unit_cost, lead_time_days |

Operational Objects :

| Object | Key Properties |
| --- | --- |
| Task | task_id, name, work_type, status, planned_start, planned_end, progress_percent |
| Inspection | inspection_id, type, result (pass/fail/conditional), severity |
| Procurement | procurement_id, stage (PR/RFQ/PO/Delivery/Vendor Invoice), status, total_value |
| Delivery | delivery_id, po_id, quantity_delivered, delivery_date, received_by |
| Incident | incident_id, type, severity (low/medium/high/critical), reported_by |

Note on Procurement :

`Procurement` in the ontology represents the conceptual procurement lifecycle as a
single object with stages. In the database schema (see 11-database-schema) this is
normalised into separate tables per stage :

- `purchase_request` — stage: PR
- `rfq` — stage: RFQ
- `quotation` — stage: RFQ response
- `purchase_order` — stage: PO
- `delivery` — stage: Delivery
- `vendor_invoice` — stage: Vendor Invoice

Ontology relationships such as `Procurement FULFILLED_BY Vendor` resolve at the schema
level to `purchase_order.vendor_id → vendor.vendor_id`. The graph node `Procurement`
in the Knowledge Graph (see 12-construction-knowledge-graph) represents the
stage-specific record appropriate to the query context.

Financial Objects :

| Object | Key Properties |
| --- | --- |
| Budget | budget_id, project_id, category, allocated_amount, spent_amount |
| Invoice | invoice_id, contract_id, amount, status, due_date |
| Cost Center | cost_center_id, project_id, category, period |
| Contract | contract_id, contract_type, contract_value, customer_id (nullable), vendor_id (nullable), project_id, status |

Entity Objects :

| Object | Key Properties |
| --- | --- |
| Project | project_id, name, type, status, budget, start_date, end_date |
| Worker | conceptual role only — see note below |
| Vendor | vendor_id, name, category, rating, status |
| Customer | customer_id, name, type, contact_email |

Note on Worker :

`Worker` in the ontology represents the conceptual role of "a person performing work on site."
It is NOT a separate database entity. In the schema (see 11-database-schema) :

- The canonical person record is `Employee` (employee_id, full_name, role, department)
- Site presence is recorded in `Workforce` (attendance_id, employee_id, project_id, role_on_site)
- worker_id in site context equals attendance_id — it is not a separate identity

The ontology uses `Worker` to express relationships like `Task ASSIGNED_TO Worker` where
Worker resolves to Employee via the Workforce record.

---

## 10.3 Core Relationships and Cardinality

| Relationship | From | To | Cardinality |
| --- | --- | --- | --- |
| HAS_FLOOR | Building | Floor | 1:N |
| HAS_ROOM | Floor | Room | 1:N |
| CONTAINS_STRUCTURE | Building | Structure | 1:N |
| LOCATED_IN | Task | Floor | N:1 |
| LOCATED_IN | Task | Room | N:1 |
| USES | Task | Material | N:M |
| DEPENDS_ON | Task | Task | N:M |
| VALIDATED_BY | Task | Inspection | 1:N |
| IMPACTS | Incident | Task | N:M |
| DELIVERED_BY | Material | Vendor | N:1 |
| FULFILLED_BY | Procurement | Vendor | N:1 |
| BELONGS_TO | Contract | Vendor | N:1 |
| BELONGS_TO | Contract | Customer | N:1 |
| BELONGS_TO | Invoice | Contract | N:1 |
| ASSIGNED_TO | Task | Worker | N:M |

Note on FULFILLED_BY and BELONGS_TO :

Relationships from Procurement, Contract, and Invoice to Vendor/Customer are conceptual ontology edges.
At the schema level, these resolve as :

- `Procurement FULFILLED_BY Vendor` → `purchase_order.vendor_id → vendor.vendor_id`
- `Contract BELONGS_TO Vendor` → `contract.vendor_id → vendor.vendor_id` (subcontract / supply_agreement — vendor_id populated, customer_id null)
- `Contract BELONGS_TO Customer` → `contract.customer_id → customer.customer_id` (main_contract / client-side — customer_id populated, vendor_id null)
- `Invoice BELONGS_TO Contract` (AR/client billing) → `Financials — Billing.contract_id → Contract.contract_id`

See 11-database-schema Contract entity note for the contract_type distinction (main_contract / subcontract / supply_agreement).

Note on Invoice schema duality :

The ontology Financial Object `Invoice` (with `contract_id`) maps to `Financials — Billing`
in the schema — the AR (Accounts Receivable) entity representing contractor-to-client
billing tied to a contract.

`Procurement — Vendor Invoice` is a separate AP (Accounts Payable) entity in the schema
(vendor_invoice_id, linked to po_id) — it represents the billing stage of the procurement
lifecycle. It does not have a `contract_id`; it is linked to a purchase_order instead.

See 11-database-schema for full entity definitions of both.

The ontology-to-schema mapping is detailed in section 10.2 (Note on Procurement above).

---

## 10.4 Why Ontology Matters

Enables :

- AI reasoning
- Semantic search
- Cross-project learning
- Knowledge graph analytics
- Automation
- Failure propagation modeling

---

## References

| ID | Title | Source |
| --- | --- | --- |
| [IEEE 830] | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998 |
| [IFC4] | Industry Foundation Classes IFC4 — ISO 16739-1:2018 | buildingSMART International |
| [buildingSMART] | buildingSMART International Standards | [buildingsmart.org/standards](https://www.buildingsmart.org/standards/) |
| [OWL2] | OWL 2 Web Ontology Language — W3C Recommendation | [w3.org/TR/owl2-overview](https://www.w3.org/TR/owl2-overview/) |
| [SKOS] | SKOS Simple Knowledge Organization System | W3C Recommendation — [w3.org/TR/skos-reference](https://www.w3.org/TR/skos-reference/) |

> 📎 See also: [09-data-architecture](09-data-architecture.md) · [11-database-schema](11-database-schema.md) · [12-construction-knowledge-graph](12-construction-knowledge-graph.md)
