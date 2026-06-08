import { randomUUID } from 'crypto';
import { buildTenant, buildUser, buildProject, buildDocument, buildInvoice } from '../factories';

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
});
