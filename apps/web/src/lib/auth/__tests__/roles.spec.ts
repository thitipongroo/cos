/**
 * Post-login landing routes — spec §20.7.
 *
 * §35.13 ESC-25: apps/web had no unit tests. This module decides where a user lands immediately
 * after authenticating, so the important case is the unknown/missing claim: it must go to
 * `/pending`, never to a real page a role has not been granted.
 */
import { CosRole } from '@cos/types';

import { ROLE_LANDING, landingFor } from '../roles';

describe('landingFor', () => {
  it.each([
    [CosRole.SYSTEM_ADMIN, '/admin'],
    [CosRole.EXECUTIVE, '/'],
    [CosRole.PROJECT_MANAGER, '/projects'],
    [CosRole.PROCUREMENT_OFFICER, '/procurement/requests'],
    [CosRole.PROC_MANAGER, '/procurement/requests'],
    [CosRole.FINANCE, '/finance/payments'],
    [CosRole.SITE_ENGINEER, '/site/reports'],
    [CosRole.CRM_SALES_MANAGER, '/crm/leads'],
    [CosRole.SITE_WORKER, '/tasks'],
    [CosRole.SAFETY_OFFICER, '/safety/incidents'],
    [CosRole.TENANT_ADMIN, '/settings/users'],
    [CosRole.VIEWER, '/'],
  ])('routes %s to %s', (role, expected) => {
    expect(landingFor(role)).toBe(expected);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
  ])('sends a %s role claim to /pending', (_label, role) => {
    expect(landingFor(role as string | undefined | null)).toBe('/pending');
  });

  it('sends an unrecognised role to /pending rather than a real page', () => {
    expect(landingFor('CRANE_OPERATOR')).toBe('/pending');
  });

  it('is not fooled by inherited Object properties', () => {
    // `role in ROLE_LANDING` walks the prototype chain — "toString" must not resolve to a route.
    expect(landingFor('toString')).toBe('/pending');
    expect(landingFor('constructor')).toBe('/pending');
  });
});

describe('ROLE_LANDING', () => {
  it('covers every CosRole', () => {
    for (const role of Object.values(CosRole)) {
      expect(ROLE_LANDING).toHaveProperty(role);
    }
  });

  it('every landing route is an absolute path', () => {
    for (const route of Object.values(ROLE_LANDING)) {
      expect(route.startsWith('/')).toBe(true);
    }
  });

  it('SITE_WORKER and SAFETY_OFFICER land on their shipped §20.7 pages', () => {
    // Both were previously parked; the module comment records that their backends have shipped.
    expect(ROLE_LANDING[CosRole.SITE_WORKER]).toBe('/tasks');
    expect(ROLE_LANDING[CosRole.SAFETY_OFFICER]).toBe('/safety/incidents');
  });
});
