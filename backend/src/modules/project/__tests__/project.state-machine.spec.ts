// Unit tests: Project State Machine
// QM-1: ≥80% line coverage, ≥70% branch coverage
// Tests cover all allowed/forbidden transitions and role restrictions.

import { validateTransition, allowedTransitions } from '../project.state-machine';
import type { ProjectStatus } from '../project.state-machine';

describe('Project State Machine', () => {
  describe('allowedTransitions()', () => {
    // EXACT sets, not arrayContaining. master:2065 says "Do NOT invent additional states or
    // transitions", and arrayContaining only proves the listed edges are PRESENT — adding
    // COMPLETED to DRAFT's targets left all three of these green while breaking the one rule the
    // spec states as a prohibition. Sorted so the assertion is about membership, not declaration
    // order, which the spec does not fix.
    it('DRAFT goes to exactly ACTIVE and CANCELLED (master:2048, 2051)', () => {
      expect([...allowedTransitions('DRAFT')].sort()).toEqual(['ACTIVE', 'CANCELLED']);
    });

    it('ACTIVE goes to exactly ON_HOLD, COMPLETED and CANCELLED (master:2048-2050)', () => {
      expect([...allowedTransitions('ACTIVE')].sort()).toEqual([
        'CANCELLED',
        'COMPLETED',
        'ON_HOLD',
      ]);
    });

    it('ON_HOLD goes to exactly ACTIVE and CANCELLED (master:2048, 2052)', () => {
      expect([...allowedTransitions('ON_HOLD')].sort()).toEqual(['ACTIVE', 'CANCELLED']);
    });

    it('returns empty array from COMPLETED (terminal)', () => {
      expect(allowedTransitions('COMPLETED')).toHaveLength(0);
    });

    it('returns empty array from CANCELLED (terminal)', () => {
      expect(allowedTransitions('CANCELLED')).toHaveLength(0);
    });

    it('returns [] fallback for unknown status (covers ?? branch)', () => {
      expect(allowedTransitions('UNKNOWN' as ProjectStatus)).toEqual([]);
    });
  });

  describe('validateTransition() — allowed transitions', () => {
    it('DRAFT → ACTIVE succeeds for PROJECT_MANAGER', () => {
      const result = validateTransition({
        currentStatus: 'DRAFT',
        toStatus: 'ACTIVE',
        actorRole: 'PROJECT_MANAGER',
      });
      expect(result.allowed).toBe(true);
    });

    it('DRAFT → ACTIVE succeeds for TENANT_ADMIN', () => {
      const result = validateTransition({
        currentStatus: 'DRAFT',
        toStatus: 'ACTIVE',
        actorRole: 'TENANT_ADMIN',
      });
      expect(result.allowed).toBe(true);
    });

    it('ACTIVE → ON_HOLD succeeds with reason', () => {
      const result = validateTransition({
        currentStatus: 'ACTIVE',
        toStatus: 'ON_HOLD',
        actorRole: 'PROJECT_MANAGER',
        reason: 'Waiting for permits',
      });
      expect(result.allowed).toBe(true);
    });

    it('ON_HOLD → ACTIVE succeeds for PROJECT_MANAGER', () => {
      const result = validateTransition({
        currentStatus: 'ON_HOLD',
        toStatus: 'ACTIVE',
        actorRole: 'PROJECT_MANAGER',
      });
      expect(result.allowed).toBe(true);
    });

    it('ACTIVE → COMPLETED succeeds for TENANT_ADMIN with past end_date', () => {
      const result = validateTransition({
        currentStatus: 'ACTIVE',
        toStatus: 'COMPLETED',
        actorRole: 'TENANT_ADMIN',
        endDate: '2020-01-01',
      });
      expect(result.allowed).toBe(true);
    });

    // master:2061 says ANY -> CANCELLED, and master:2048-2052 lists three sources: DRAFT, ACTIVE and
    // ON_HOLD. Only the DRAFT one was ever proven to WORK — the other two appeared solely in
    // refusal cases, so a rule that blocked them outright would have looked correct.
    it('ACTIVE → CANCELLED succeeds for TENANT_ADMIN with reason (master:2050)', () => {
      expect(
        validateTransition({
          currentStatus: 'ACTIVE',
          toStatus: 'CANCELLED',
          actorRole: 'TENANT_ADMIN',
          reason: 'client withdrew funding',
        }).allowed,
      ).toBe(true);
    });

    it('ON_HOLD → CANCELLED succeeds for TENANT_ADMIN with reason (master:2052)', () => {
      expect(
        validateTransition({
          currentStatus: 'ON_HOLD',
          toStatus: 'CANCELLED',
          actorRole: 'TENANT_ADMIN',
          reason: 'permit permanently revoked',
        }).allowed,
      ).toBe(true);
    });

    it('DRAFT → CANCELLED succeeds for TENANT_ADMIN with reason', () => {
      const result = validateTransition({
        currentStatus: 'DRAFT',
        toStatus: 'CANCELLED',
        actorRole: 'TENANT_ADMIN',
        reason: 'Client withdrew',
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('validateTransition() — forbidden transitions', () => {
    it('CANCELLED → ACTIVE is blocked (terminal state)', () => {
      const result = validateTransition({
        currentStatus: 'CANCELLED',
        toStatus: 'ACTIVE',
        actorRole: 'TENANT_ADMIN',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/terminal/i);
    });

    it('COMPLETED → ACTIVE is blocked (no allowed targets)', () => {
      const result = validateTransition({
        currentStatus: 'COMPLETED',
        toStatus: 'ACTIVE',
        actorRole: 'TENANT_ADMIN',
      });
      expect(result.allowed).toBe(false);
    });

    it('DRAFT → COMPLETED is blocked (invalid transition)', () => {
      const result = validateTransition({
        currentStatus: 'DRAFT',
        toStatus: 'COMPLETED',
        actorRole: 'TENANT_ADMIN',
        endDate: '2020-01-01',
      });
      expect(result.allowed).toBe(false);
    });

    it('ACTIVE → COMPLETED blocked without end_date', () => {
      const result = validateTransition({
        currentStatus: 'ACTIVE',
        toStatus: 'COMPLETED',
        actorRole: 'TENANT_ADMIN',
        endDate: null,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/end_date/i);
    });

    it('ACTIVE → COMPLETED blocked when end_date is in the future', () => {
      const futureDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const result = validateTransition({
        currentStatus: 'ACTIVE',
        toStatus: 'COMPLETED',
        actorRole: 'TENANT_ADMIN',
        endDate: futureDate,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/end_date/i);
    });
  });

  describe('validateTransition() — role enforcement', () => {
    it('ACTIVE → COMPLETED blocked for PROJECT_MANAGER (TENANT_ADMIN only)', () => {
      const result = validateTransition({
        currentStatus: 'ACTIVE',
        toStatus: 'COMPLETED',
        actorRole: 'PROJECT_MANAGER',
        endDate: '2020-01-01',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/PROJECT_MANAGER/);
    });

    it('ACTIVE → CANCELLED blocked for SITE_ENGINEER', () => {
      const result = validateTransition({
        currentStatus: 'ACTIVE',
        toStatus: 'CANCELLED',
        actorRole: 'SITE_ENGINEER',
        reason: 'reason',
      });
      expect(result.allowed).toBe(false);
    });

    it('ACTIVE → ON_HOLD blocked for FINANCE role', () => {
      const result = validateTransition({
        currentStatus: 'ACTIVE',
        toStatus: 'ON_HOLD',
        actorRole: 'FINANCE',
        reason: 'reason',
      });
      expect(result.allowed).toBe(false);
    });
  });

  describe('validateTransition() — reason requirement', () => {
    it('ON_HOLD requires reason', () => {
      const result = validateTransition({
        currentStatus: 'ACTIVE',
        toStatus: 'ON_HOLD',
        actorRole: 'PROJECT_MANAGER',
        reason: undefined,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/reason/i);
    });

    it('CANCELLED requires reason', () => {
      const result = validateTransition({
        currentStatus: 'ACTIVE',
        toStatus: 'CANCELLED',
        actorRole: 'TENANT_ADMIN',
        reason: undefined,
      });
      expect(result.allowed).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles all ProjectStatus values without throwing', () => {
      const statuses: ProjectStatus[] = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
      for (const from of statuses) {
        for (const to of statuses) {
          expect(() =>
            validateTransition({ currentStatus: from, toStatus: to, actorRole: 'TENANT_ADMIN' }),
          ).not.toThrow();
        }
      }
    });
  });
});

/**
 * Regression: `$queryRaw` returns a JS Date for the DATE column even though ProjectRow types
 * end_date as `string`, and `Date > 'YYYY-MM-DD'` coerces both to numbers — the string becomes NaN
 * and every NaN comparison is false, so the master:2060 gate silently never fired on a real
 * request. Found by the spec-derived integration suite; these two cases pin BOTH input shapes.
 */
describe('validateTransition — end_date arriving as a Date (master:2060)', () => {
  const base = {
    currentStatus: 'ACTIVE' as const,
    toStatus: 'COMPLETED' as const,
    actorRole: 'TENANT_ADMIN',
  };

  it('refuses completion when a Date end_date is in the future', () => {
    const result = validateTransition({ ...base, endDate: new Date('2099-12-31') });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('2099-12-31');
  });

  it('allows completion when a Date end_date is in the past', () => {
    expect(validateTransition({ ...base, endDate: new Date('2020-01-01') }).allowed).toBe(true);
  });

  it('still refuses a future end_date supplied as a string', () => {
    expect(validateTransition({ ...base, endDate: '2099-12-31' }).allowed).toBe(false);
  });
});
