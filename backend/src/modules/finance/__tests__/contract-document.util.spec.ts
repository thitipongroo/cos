import { buildContractPdf } from '../contract-document.util';
import type { ContractRow, BoqSnapshotItem } from '../finance.repository';

const baseContract: ContractRow = {
  contract_id: 'con-1',
  tenant_id: 'tenant-1',
  project_id: 'proj-1',
  contract_type: 'MAIN_CONTRACT',
  contract_value: '1000000.0000',
  customer_id: 'cust-1',
  vendor_id: null,
  status: 'DRAFT',
  signed_document_id: null,
  terms: 'Net 30\nRetention 5%',
  created_at: new Date('2026-07-21'),
};

function line(i: number): BoqSnapshotItem {
  return {
    item_code: i % 2 === 0 ? null : `A-${i}`, // exercise item_code null + present
    description: `Item ${i}`,
    unit: 'm3',
    quantity: '10.0000',
    unit_cost: '2500.0000',
    estimated_total: '25000.0000',
  };
}

describe('buildContractPdf (ADR-058 CT-2c-3)', () => {
  it('renders a multi-page PDF with terms, value, and many BOQ lines (pagination + item_code branches)', async () => {
    const items = Array.from({ length: 60 }, (_, i) => line(i)); // enough to overflow one page
    const pdf = await buildContractPdf({ contract: baseContract, items });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-'); // valid PDF header
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('renders with no terms, no contract value, and no BOQ lines (null branches)', async () => {
    const pdf = await buildContractPdf({
      contract: { ...baseContract, terms: null, contract_value: null },
      items: [],
    });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
