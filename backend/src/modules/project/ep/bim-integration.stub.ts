// BIMIntegration EP Stub — Phase 3 (project structure import)
// Source: docs/specifications/13-product-architecture.md §BIM Integration
// IFC format (ISO 16739-1:2018 IFC4); IFC.js parser — implement when first tenant requests.
//
// IFC mapping:
//   IfcBuildingStorey → project phases
//   IfcSpace → milestones
//
// Note: BOQ quantity import from BIM is a separate entry point handled in Phase 4.

import { NotImplementedException } from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('bim-integration');

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface BIMStructureResult {
  projectId: string;
  phasesImported: number;
  milestonesImported: number;
  warnings: string[];
}

export interface BimProjectIntegration {
  importProjectStructure(
    bimFileUrl: string,
    projectId: string,
    tenantId: string,
  ): Promise<BIMStructureResult>;
}

// ─── Stub ─────────────────────────────────────────────────────────────────────

export class BimProjectIntegrationStub implements BimProjectIntegration {
  async importProjectStructure(
    bimFileUrl: string,
    projectId: string,
    tenantId: string,
  ): Promise<BIMStructureResult> {
    logger.warn(
      { bimFileUrl, projectId, tenantId },
      'BIM integration not activated — implement when first tenant requests IFC import',
    );
    throw new NotImplementedException('BimProjectIntegration not yet activated');
  }
}

export const BIM_PROJECT_INTEGRATION = Symbol('BIM_PROJECT_INTEGRATION');
