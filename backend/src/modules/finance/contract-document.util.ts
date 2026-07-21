// Contract-document generator (ADR-058 CT-2c-3). Builds a simple, self-contained PDF from the Contract,
// its free-text terms, and the materialized BOQ line snapshot (finance.boq_line_snapshots). Pure pdf-lib
// (no browser/native) so it is deterministic and unit-testable. A single writeLine() helper centralizes
// pagination — every line flows through it, so there is one page-break branch, not many.

import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ContractRow, BoqSnapshotItem } from './finance.repository';

const MARGIN = 50;
const LINE_GAP = 6;

export async function buildContractPdf(input: {
  contract: ContractRow;
  items: BoqSnapshotItem[];
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage();
  let y = page.getSize().height - MARGIN;

  const writeLine = (text: string, size = 11, f: PDFFont = font): void => {
    if (y < MARGIN) {
      page = doc.addPage();
      y = page.getSize().height - MARGIN;
    }
    page.drawText(text, { x: MARGIN, y, size, font: f });
    y -= size + LINE_GAP;
  };

  const c = input.contract;
  writeLine('CONTRACT', 20, bold);
  writeLine(`Contract ID: ${c.contract_id}`);
  writeLine(`Project: ${c.project_id}`);
  writeLine(`Type: ${c.contract_type}`);
  writeLine(`Value: ${c.contract_value ?? '-'}`);
  writeLine('');

  writeLine('Terms', 14, bold);
  for (const termLine of (c.terms ?? '-').split('\n')) writeLine(termLine);
  writeLine('');

  writeLine('Bill of Quantities', 14, bold);
  for (const it of input.items) {
    writeLine(
      `${it.item_code ?? '-'}  ${it.description}  ${it.quantity} ${it.unit} x ${it.unit_cost} = ${it.estimated_total}`,
    );
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
