// Unit tests for the CLS-backed auth context accessors. Covers all three states each accessor can see:
// no active context (cls.isActive() === false), active with the value set, and active with it unset.

import { ClsServiceManager } from 'nestjs-cls';
import {
  CLS_TENANT_ID,
  CLS_USER_ID,
  CLS_DEDICATED_DB_URL,
  clsTenantId,
  clsUserId,
  clsDedicatedDbUrl,
} from '../cls-context';

function inCls<T>(store: Record<string, string> | null, fn: () => T): Promise<T> {
  const cls = ClsServiceManager.getClsService();
  return cls.run(async () => {
    if (store) for (const [k, v] of Object.entries(store)) cls.set(k, v);
    return fn();
  });
}

describe('cls-context accessors', () => {
  describe('outside an active CLS context', () => {
    it('clsTenantId returns empty string', () => {
      expect(clsTenantId()).toBe('');
    });
    it('clsUserId returns empty string', () => {
      expect(clsUserId()).toBe('');
    });
    it('clsDedicatedDbUrl returns undefined', () => {
      expect(clsDedicatedDbUrl()).toBeUndefined();
    });
  });

  describe('inside an active context with values set', () => {
    it('returns the stored tenant id, user id and dedicated DB URL', async () => {
      const store = {
        [CLS_TENANT_ID]: 'tenant-1',
        [CLS_USER_ID]: 'user-1',
        [CLS_DEDICATED_DB_URL]: 'postgresql://app@dedicated/ent',
      };
      await expect(inCls(store, clsTenantId)).resolves.toBe('tenant-1');
      await expect(inCls(store, clsUserId)).resolves.toBe('user-1');
      await expect(inCls(store, clsDedicatedDbUrl)).resolves.toBe('postgresql://app@dedicated/ent');
    });
  });

  describe('inside an active context with nothing set', () => {
    it('clsTenantId and clsUserId fall back to empty string, dedicatedDbUrl to undefined', async () => {
      await expect(inCls(null, clsTenantId)).resolves.toBe('');
      await expect(inCls(null, clsUserId)).resolves.toBe('');
      await expect(inCls(null, clsDedicatedDbUrl)).resolves.toBeUndefined();
    });
  });
});
