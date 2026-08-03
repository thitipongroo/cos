// Structural checks on the sync role table.
//
// The per-entity role lists are verified behaviourally in sync-auth.guard.spec.ts. What this file
// guards is the SHAPE of the table: `material` has no read route in 14-api-architecture, so its read
// roles are derived from its parent (`site_report`) rather than mirrored from a spec line. A
// derivation nobody checks drifts, so the relationship is asserted here instead of merely commented.

import { CosRole } from '@cos/types';
import { PUSH_ROLES, DELTA_ROLES, syncAuthzInvariants } from '../sync-authz';

const roleSet = (roles: readonly CosRole[] | undefined): Set<CosRole> => new Set(roles ?? []);

describe('sync-authz invariants', () => {
  it.each(syncAuthzInvariants.childNeverWiderThanParent)(
    '$child is never readable by a role that cannot read $parent',
    ({ child, parent }) => {
      const parentRoles = roleSet(DELTA_ROLES[parent]);
      const extra = [...roleSet(DELTA_ROLES[child])].filter((r) => !parentRoles.has(r));
      expect(extra).toEqual([]);
    },
  );

  it.each(syncAuthzInvariants.writeNeverWiderThanRead)(
    'pushing %s is never granted more widely than reading it',
    (entity) => {
      const readRoles = DELTA_ROLES[entity];
      // An entity with no read entry is unrestricted for reads, so nothing can be wider than it.
      if (!readRoles) return;
      const extra = [...roleSet(PUSH_ROLES[entity])].filter((r) => !roleSet(readRoles).has(r));
      expect(extra).toEqual([]);
    },
  );

  it('every push entity is a plain own key — no prototype-chain entries', () => {
    for (const table of [PUSH_ROLES, DELTA_ROLES]) {
      expect(Object.hasOwn(table, 'constructor')).toBe(false);
      expect(Object.hasOwn(table, 'toString')).toBe(false);
      expect(Object.isFrozen(table)).toBe(true);
    }
  });

  it('no entity grants a role that does not exist in CosRole', () => {
    const valid = new Set(Object.values(CosRole));
    for (const table of [PUSH_ROLES, DELTA_ROLES]) {
      for (const roles of Object.values(table)) {
        for (const r of roles) expect(valid.has(r)).toBe(true);
      }
    }
  });
});
