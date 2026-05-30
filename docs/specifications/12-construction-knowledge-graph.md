---
title: "Construction Knowledge Graph"
version: "1.2.0"
status: Active
last_updated: "2026-05-25"
authors:
  - thitipongroo
related_docs:
  - 09-data-architecture.md
  - 10-construction-ontology.md
  - 11-database-schema.md
  - 22-ai-architecture.md
---

# 12. Construction Knowledge Graph

## Table of Contents

- [12.1 Purpose](#121-purpose)
- [12.2 Graph Nodes](#122-graph-nodes)
- [12.3 Graph Relationships](#123-graph-relationships)
- [12.4 Graph Use Cases](#124-graph-use-cases)
  - [Risk Propagation](#risk-propagation)
  - [Root Cause Analysis](#root-cause-analysis)
  - [AI Context Retrieval](#ai-context-retrieval)
  - [Cross-project Learning](#cross-project-learning)

---

## 12.1 Purpose

Construction data is highly relational.

Traditional relational DB alone cannot model :

- project dependencies
- procurement chains
- construction sequencing
- failure propagation
- contractor relationships

Therefore :

> A construction knowledge graph becomes critical.

---

## 12.2 Graph Nodes

Entities :

- Project
- Building
- Floor
- Room
- Structure
- Task
- Worker
- Vendor
- Material
- Equipment
- Procurement
- Contract
- Inspection
- Incident
- Invoice

Note on Worker :

`Worker` in the knowledge graph is a conceptual graph node representing
"a person performing work on site." It is NOT a separate database entity.
Worker resolves to the `Employee` master record via the `Workforce` (attendance)
record at query time. See 10-construction-ontology section 10.2 for full detail.

Note on Procurement :

`Procurement` in the knowledge graph is a conceptual node representing the full
procurement lifecycle. In the database schema it is normalised into separate tables
(purchase_request, rfq, quotation, purchase_order, delivery, vendor_invoice).
See 10-construction-ontology section 10.2 (Note on Procurement) for the full mapping.

Note on Invoice :

`Invoice` in the knowledge graph represents the AR (Accounts Receivable) billing entity —
the `Financials — Billing` record in the schema, linked to a Contract via `contract_id`.
The relationship `Invoice BELONGS_TO Contract` (section 12.3) resolves at the schema level
to `Financials — Billing.contract_id → Contract.contract_id`.

`Procurement — Vendor Invoice` (AP / Accounts Payable) is a separate schema entity linked
to a Purchase Order via `po_id`. It is represented in the graph as part of the Procurement
lifecycle node, not as a standalone Invoice node. See 11-database-schema for full entity
definitions and 10-construction-ontology section 10.3 Note on FULFILLED_BY and BELONGS_TO.

---

## 12.3 Graph Relationships

Examples :

- Task DEPENDS_ON Task
- Task USES Material
- Task LOCATED_IN Floor
- Task LOCATED_IN Room
- Room PART_OF Floor
- Floor PART_OF Building
- Structure PART_OF Building
- Material DELIVERED_BY Vendor
- Procurement FULFILLED_BY Vendor
- Procurement FULFILLS Task
- Contract BELONGS_TO Vendor
- Contract BELONGS_TO Customer
- Inspection VALIDATES Task
- Incident IMPACTS Task
- Invoice BELONGS_TO Contract

---

## 12.4 Graph Use Cases

### Risk Propagation

Detect:

"If supplier A delays cement delivery, which tasks/projects become affected?"

### Root Cause Analysis

Identify recurring failure patterns.

### AI Context Retrieval

Provide highly contextual reasoning for AI copilots.

### Cross-project Learning

Transfer lessons learned across projects.

---

## References

| ID | Title | Source |
| --- | --- | --- |
| [IEEE 830] | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998 |
| [Neo4j] | Neo4j Graph Database Documentation | [neo4j.com/docs](https://neo4j.com/docs/) |
| [PropertyGraph] | openCypher — Property Graph Query Language | [opencypher.org](https://opencypher.org/) |
| [W3C-RDF] | RDF 1.1 Concepts and Abstract Syntax | W3C Recommendation — [w3.org/TR/rdf11-concepts](https://www.w3.org/TR/rdf11-concepts/) |
| [pgvector] | pgvector: Vector Similarity Search for Postgres | [github.com/pgvector/pgvector](https://github.com/pgvector/pgvector) |

> 📎 See also: [09-data-architecture](09-data-architecture.md) · [10-construction-ontology](10-construction-ontology.md) · [11-database-schema](11-database-schema.md) · [22-ai-architecture](22-ai-architecture.md)
