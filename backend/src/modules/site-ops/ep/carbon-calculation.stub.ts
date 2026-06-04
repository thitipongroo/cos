// CarbonCalculationEngine Stub — Phase 6
// DECIDED (spec §Phase 6 Decision / §33.4 + 09-data-architecture.md):
//   Material-level factors: EN 15804:2012+A2:2019 / ISO 21930:2017 (EPD source, configurable per tenant)
//   Project-level reporting: GHG Protocol (Scope 1/2/3 classification)
// Implementation: populate boq_items.carbon_factor_kg_co2e from EPD per EN 15804;
//   aggregate via GHG Protocol Scope 3 for project footprint report.
// Data sources: boq_items.carbon_factor_kg_co2e (nullable) + site.material.consumed events.
// Trigger: implement when tenant requests carbon reporting or regulation requires it.

export interface CarbonBreakdownByMaterial {
  material_id: string;
  material_name: string;
  quantity_used: string; // DECIMAL(10,4)
  unit: string;
  carbon_factor_kg_co2e: string; // DECIMAL(19,4) per unit
  total_kg_co2e: string; // DECIMAL(19,4)
}

export interface GhgScopeBreakdown {
  scope_1_kg_co2e: string; // Direct emissions
  scope_2_kg_co2e: string; // Indirect — energy
  scope_3_kg_co2e: string; // Value-chain — materials (primary source here)
}

export interface ProjectFootprintResult {
  total_kg_co2e: string; // DECIMAL(19,4)
  breakdown_by_material: CarbonBreakdownByMaterial[];
  scope_breakdown: GhgScopeBreakdown;
  calculated_at: string; // ISO 8601 UTC
  standards: string[]; // ['EN 15804:2012+A2:2019', 'GHG Protocol']
}

export interface CarbonCalculationEngine {
  calculateProjectFootprint(projectId: string, tenantId: string): Promise<ProjectFootprintResult>;
}

// STUB — not implemented until trigger condition met
export class CarbonCalculationEngineStub implements CarbonCalculationEngine {
  async calculateProjectFootprint(
    projectId: string,
    tenantId: string,
  ): Promise<ProjectFootprintResult> {
    throw new Error(
      `CarbonCalculationEngine not yet implemented for project ${projectId} / tenant ${tenantId}. ` +
        'Trigger: tenant requests carbon reporting or regulation requires it. ' +
        'Standards: EN 15804:2012+A2:2019 (material EPD) + GHG Protocol (project scope). ' +
        'Spec: §Phase 6 Decision + §33.4 + 09-data-architecture.md.',
    );
  }
}
