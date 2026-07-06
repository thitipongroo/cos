// BIM → BOQ Import Stub — Phase 4
// DECIDED (spec §13.4): IFC.js parser; optional Autodesk Forge / Trimble Connect connectors.
// Interface: { importQuantities(bimFileUrl, boqVersionId, tenantId): Promise<BIMImportResult> }
// IFC mapping: IfcElement quantities → BOQ line items (~80% entry reduction)
// Trigger: implement when first tenant requests BIM-to-BOQ auto-population.
// See also: BIMIntegration Phase 3 stub (project structure import — same IFC parser).

import { NotImplementedException } from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('bim-boq-import');

export interface BIMImportResult {
  items_imported: number;
  items_skipped: number;
  boq_version_id: string;
  warnings: string[];
}

export interface BIMBoqImportAdapter {
  importQuantities(
    bimFileUrl: string,
    boqVersionId: string,
    tenantId: string,
  ): Promise<BIMImportResult>;
}

// STUB — not implemented until trigger condition met
export class BIMBoqImportStub implements BIMBoqImportAdapter {
  async importQuantities(
    _bimFileUrl: string,
    boqVersionId: string,
    tenantId: string,
  ): Promise<BIMImportResult> {
    logger.warn(
      { boqVersionId, tenantId, adapter: 'BIMBoqImport' },
      'BIM-to-BOQ integration not activated — implement when first tenant requests auto-population (IFC.js, spec §13.4)',
    );
    throw new NotImplementedException('BIMBoqImport not yet activated');
  }
}
