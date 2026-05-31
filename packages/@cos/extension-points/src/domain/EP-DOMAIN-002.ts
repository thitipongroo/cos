// EP-DOMAIN-002: BIMIntegration (project structure import)
// Source: context/00_master_construction_os.md §Phase 3 Extension Points
// Trigger: project team uses BIM software and wants WBS/project structure imported
//          from BIM model at project creation time
// Format: IFC preferred (platform-agnostic open standard)
// Note: BIM quantities → BOQ auto-population handled separately in Phase 4

import { StubBase } from '../stub-base';

export interface BIMStructureResult {
  phasesCreated: number;
  milestonesCreated: number;
  unmappedElements: string[];
}

export class BIMIntegration extends StubBase {
  readonly EP_ID = 'EP-DOMAIN-002';
  readonly EP_VERSION = '0.1.0';
  readonly TRIGGER = 'Project team adopts BIM software with WBS structure to import';
  readonly PHASE = 'Phase 3/4 (stub)';

  async importProjectStructure(
    bimFileUrl: string,
    projectId: string,
    tenantId: string,
  ): Promise<BIMStructureResult> {
    this.logStubCall('importProjectStructure', { bimFileUrl, projectId, tenantId });
    return { phasesCreated: 0, milestonesCreated: 0, unmappedElements: [] };
  }
}
