import { randomUUID } from 'crypto';
import {
  buildTenant,
  buildUser,
  buildProject,
  buildDocument,
  buildInvoice,
  buildCreateProjectDto,
  buildCreateVendorDto,
  buildCreatePurchaseRequestDto,
  buildCreateRfqDto,
  buildCreatePurchaseOrderDto,
  buildCreateBoqItemDto,
  buildSetBudgetDto,
  buildCreateSiteReportDto,
  buildCreateWorkerDto,
  buildCreateCheckInDto,
  buildNotificationPreferenceDto,
  buildRegisterDeviceDto,
} from '../factories';

describe('factories', () => {
  describe('buildTenant', () => {
    it('generates unique id and defaults', () => {
      const t = buildTenant();
      expect(t.id).toHaveLength(36);
      expect(t.tier).toBe('SHARED');
      expect(t.active).toBe(true);
    });

    it('applies overrides', () => {
      const id = randomUUID();
      const t = buildTenant({ id, tier: 'DEDICATED', active: false });
      expect(t.id).toBe(id);
      expect(t.tier).toBe('DEDICATED');
      expect(t.active).toBe(false);
    });
  });

  describe('buildUser', () => {
    it('assigns tenantId and defaults', () => {
      const tenantId = randomUUID();
      const u = buildUser(tenantId);
      expect(u.tenant_id).toBe(tenantId);
      expect(u.role).toBe('PROJECT_MANAGER');
      expect(u.email).toMatch(/@example\.com$/);
    });

    it('applies overrides', () => {
      const tenantId = randomUUID();
      const u = buildUser(tenantId, { role: 'ADMIN', email: 'admin@example.com' });
      expect(u.role).toBe('ADMIN');
      expect(u.email).toBe('admin@example.com');
    });
  });

  describe('buildProject', () => {
    it('assigns tenantId and defaults', () => {
      const tenantId = randomUUID();
      const p = buildProject(tenantId);
      expect(p.tenant_id).toBe(tenantId);
      expect(p.status).toBe('ACTIVE');
      expect(p.currency).toBe('THB');
    });

    it('applies overrides', () => {
      const tenantId = randomUUID();
      const p = buildProject(tenantId, { status: 'COMPLETED', budget: 0 });
      expect(p.status).toBe('COMPLETED');
      expect(p.budget).toBe(0);
    });
  });

  describe('buildDocument', () => {
    it('constructs storage_key from tenantId + projectId', () => {
      const tenantId = randomUUID();
      const projectId = randomUUID();
      const userId = randomUUID();
      const d = buildDocument(tenantId, projectId, userId);
      expect(d.storage_key).toContain(tenantId);
      expect(d.storage_key).toContain(projectId);
      expect(d.mime_type).toBe('application/pdf');
    });

    it('applies overrides', () => {
      const tenantId = randomUUID();
      const projectId = randomUUID();
      const userId = randomUUID();
      const d = buildDocument(tenantId, projectId, userId, {
        mime_type: 'image/png',
        size_bytes: 512,
      });
      expect(d.mime_type).toBe('image/png');
      expect(d.size_bytes).toBe(512);
    });
  });

  describe('buildInvoice', () => {
    it('defaults to PENDING status and THB currency', () => {
      const tenantId = randomUUID();
      const projectId = randomUUID();
      const inv = buildInvoice(tenantId, projectId);
      expect(inv.status).toBe('PENDING');
      expect(inv.currency).toBe('THB');
      expect(inv.due_date.getTime()).toBeGreaterThan(Date.now());
    });

    it('applies overrides', () => {
      const tenantId = randomUUID();
      const projectId = randomUUID();
      const inv = buildInvoice(tenantId, projectId, { status: 'PAID', amount: 0 });
      expect(inv.status).toBe('PAID');
      expect(inv.amount).toBe(0);
    });
  });

  // ── Domain request DTO factories ── each call covers the default-param branch (no overrides)
  //    and the provided-overrides branch.
  describe('DTO factories', () => {
    it('buildCreateProjectDto: defaults + overrides', () => {
      expect(buildCreateProjectDto().budget_currency).toBe('THB');
      expect(buildCreateProjectDto({ project_type: 'RESIDENTIAL' }).project_type).toBe(
        'RESIDENTIAL',
      );
    });

    it('buildCreateVendorDto: defaults + overrides', () => {
      expect(buildCreateVendorDto().contact_email).toMatch(/@example\.com$/);
      expect(buildCreateVendorDto({ vendor_name: 'Acme' }).vendor_name).toBe('Acme');
    });

    it('buildCreatePurchaseRequestDto: defaults + overrides', () => {
      expect(buildCreatePurchaseRequestDto().pr_number).toMatch(/^PR-/);
      expect(buildCreatePurchaseRequestDto({ required_date: '2027-01-01' }).required_date).toBe(
        '2027-01-01',
      );
    });

    it('buildCreateRfqDto: assigns projectId, defaults + overrides', () => {
      const projectId = randomUUID();
      expect(buildCreateRfqDto(projectId).project_id).toBe(projectId);
      expect(buildCreateRfqDto(projectId, { rfq_number: 'RFQ-1' }).rfq_number).toBe('RFQ-1');
    });

    it('buildCreatePurchaseOrderDto: assigns vendor + project, defaults + overrides', () => {
      const vendorId = randomUUID();
      const projectId = randomUUID();
      const po = buildCreatePurchaseOrderDto(vendorId, projectId);
      expect(po.vendor_id).toBe(vendorId);
      expect(po.project_id).toBe(projectId);
      expect(
        buildCreatePurchaseOrderDto(vendorId, projectId, { po_number: 'PO-1' }).po_number,
      ).toBe('PO-1');
    });

    it('buildCreateBoqItemDto: assigns categoryId, defaults + overrides', () => {
      const categoryId = randomUUID();
      expect(buildCreateBoqItemDto(categoryId).category_id).toBe(categoryId);
      expect(buildCreateBoqItemDto(categoryId, { unit: 'kg' }).unit).toBe('kg');
    });

    it('buildSetBudgetDto: defaults + overrides', () => {
      expect(buildSetBudgetDto().total_budget_currency).toBe('THB');
      expect(buildSetBudgetDto({ total_budget_amount: '2.0000' }).total_budget_amount).toBe(
        '2.0000',
      );
    });

    it('buildCreateSiteReportDto: assigns projectId, defaults + overrides', () => {
      const projectId = randomUUID();
      expect(buildCreateSiteReportDto(projectId).project_id).toBe(projectId);
      expect(buildCreateSiteReportDto(projectId, { report_date: '2026-02-02' }).report_date).toBe(
        '2026-02-02',
      );
    });

    it('buildCreateWorkerDto: defaults + overrides', () => {
      expect(buildCreateWorkerDto().employment_type).toBe('PERMANENT');
      expect(buildCreateWorkerDto({ trade_type: 'Electrician' }).trade_type).toBe('Electrician');
    });

    it('buildCreateCheckInDto: assigns projectId, defaults + overrides', () => {
      const projectId = randomUUID();
      expect(buildCreateCheckInDto(projectId).project_id).toBe(projectId);
      expect(
        buildCreateCheckInDto(projectId, { check_in_at: '2026-01-01T00:00:00.000Z' }).check_in_at,
      ).toBe('2026-01-01T00:00:00.000Z');
    });

    it('buildNotificationPreferenceDto: defaults + overrides', () => {
      expect(buildNotificationPreferenceDto().channel).toBe('IN_APP');
      expect(buildNotificationPreferenceDto({ is_enabled: false }).is_enabled).toBe(false);
    });

    it('buildRegisterDeviceDto: defaults + overrides', () => {
      expect(buildRegisterDeviceDto().platform).toBe('IOS');
      expect(buildRegisterDeviceDto({ platform: 'ANDROID' }).platform).toBe('ANDROID');
    });
  });
});
