// Graph Service — Phase 13
// Executes the 5 required graph queries against Neo4j.
// tenant_id is included in every query — enforces tenant isolation at graph level.
// Source: context/00_master_construction_os.md §Phase 13 Graph Queries
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Driver, Record as Neo4jRecord, Session } from 'neo4j-driver';
import { NEO4J_DRIVER } from './graph.module';

@Injectable()
export class GraphService {
  constructor(@Inject(NEO4J_DRIVER) private readonly driver: Driver) {}

  // Graph Query 1 — all vendors supplying to a project
  // GET /api/v1/graph/projects/:projectId/vendors
  async getVendorsForProject(projectId: string, tenantId: string) {
    return this.read(
      `MATCH (p:Project {project_id: $projectId, tenant_id: $tenantId})
       -[:HAS_MATERIAL]->(m:Material)-[:SUPPLIED_BY]->(v:Vendor)
       RETURN DISTINCT v.vendor_id AS vendorId,
                       coalesce(v.vendor_name, '') AS vendorName`,
      { projectId, tenantId },
      (r) => ({ vendorId: r.get('vendorId'), vendorName: r.get('vendorName') }),
    );
  }

  // Graph Query 4 — material supply chain for a project
  // GET /api/v1/graph/projects/:projectId/supply-chain
  async getSupplyChain(projectId: string, tenantId: string) {
    return this.read(
      `MATCH (p:Project {project_id: $projectId, tenant_id: $tenantId})
       -[:HAS_MATERIAL]->(m:Material)-[:SUPPLIED_BY|DELIVERED_BY]->(v:Vendor)
       RETURN m.material_id AS materialId,
              coalesce(m.description, '') AS description,
              v.vendor_id AS vendorId,
              coalesce(v.vendor_name, '') AS vendorName`,
      { projectId, tenantId },
      (r) => ({
        materialId: r.get('materialId'),
        description: r.get('description'),
        vendorId: r.get('vendorId'),
        vendorName: r.get('vendorName'),
      }),
    );
  }

  // Graph Query 3 — all inspections for a project (pass/fail summary)
  // GET /api/v1/graph/projects/:projectId/inspections
  async getInspectionsForProject(projectId: string, tenantId: string) {
    return this.read(
      `MATCH (p:Project {project_id: $projectId, tenant_id: $tenantId})-[:HAS_INSPECTION]->(i:Inspection)
       RETURN i.inspection_id AS inspectionId,
              coalesce(i.status, '') AS status,
              coalesce(i.inspected_at, '') AS inspectedAt`,
      { projectId, tenantId },
      (r) => ({
        inspectionId: r.get('inspectionId'),
        status: r.get('status'),
        inspectedAt: r.get('inspectedAt'),
      }),
    );
  }

  // Graph Query 5 — vendor relationship map (which projects share this vendor)
  // GET /api/v1/graph/vendors/:vendorId/projects
  async getProjectsForVendor(vendorId: string, tenantId: string) {
    return this.read(
      `MATCH (v:Vendor {vendor_id: $vendorId, tenant_id: $tenantId})
       <-[:SUPPLIED_BY|DELIVERED_BY]-(m:Material)<-[:HAS_MATERIAL]-(p:Project)
       RETURN DISTINCT p.project_id AS projectId,
                       coalesce(p.project_name, '') AS projectName`,
      { vendorId, tenantId },
      (r) => ({ projectId: r.get('projectId'), projectName: r.get('projectName') }),
    );
  }

  // Graph Query 2 — all invoices submitted by a vendor
  // GET /api/v1/graph/vendors/:vendorId/invoices
  async getInvoicesForVendor(vendorId: string, tenantId: string) {
    return this.read(
      `MATCH (v:Vendor {vendor_id: $vendorId, tenant_id: $tenantId})-[:SUBMITTED]->(i:Invoice)
       RETURN i.invoice_id AS invoiceId,
              coalesce(i.amount, '') AS amount,
              coalesce(i.currency, '') AS currency,
              coalesce(i.status, '') AS status`,
      { vendorId, tenantId },
      (r) => ({
        invoiceId: r.get('invoiceId'),
        amount: r.get('amount'),
        currency: r.get('currency'),
        status: r.get('status'),
      }),
    );
  }

  private async read<T>(
    cypher: string,
    params: Record<string, string>,
    mapper: (record: Neo4jRecord) => T,
  ): Promise<T[]> {
    let session: Session | null = null;
    try {
      session = this.driver.session({ defaultAccessMode: 'READ' });
      const result = await session.run(cypher, params);
      return result.records.map(mapper);
    } catch (_err) {
      throw new ServiceUnavailableException('Graph query failed — Neo4j unavailable');
    } finally {
      await session?.close();
    }
  }
}
