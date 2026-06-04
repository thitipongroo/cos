// BIM → BOQ Import Stub — Phase 4
// DECIDED (spec §13.4): IFC.js parser; optional Autodesk Forge / Trimble Connect connectors.
// Interface: { importQuantities(bimFileUrl, boqVersionId, tenantId): Promise<BIMImportResult> }
// IFC mapping: IfcElement quantities → BOQ line items (~80% entry reduction)
// Trigger: implement when first tenant requests BIM-to-BOQ auto-population.
// See also: BIMIntegration Phase 3 stub (project structure import — same IFC parser).

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
    _tenantId: string,
  ): Promise<BIMImportResult> {
    throw new Error(
      `BIMBoqImport not yet implemented for version ${boqVersionId}. ` +
        'Trigger: first tenant requests BIM-to-BOQ auto-population. ' +
        'Implement using IFC.js parser (spec §13.4).',
    );
  }
}
