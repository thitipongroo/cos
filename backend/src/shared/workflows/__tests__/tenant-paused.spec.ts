// classifyInactiveTenant (D52, 2026-11-13): a tenant paused by enterprise provisioning is waited for, a
// deactivated one is refused, and anything else passes through untouched.

import { ApplicationFailure } from '@temporalio/activity';
import { classifyInactiveTenant } from '../tenant-paused';
import { TenantInactiveError } from '../../prisma/get-db-url';
import { PROVISIONING_PAUSED_STATES } from '../provisioning-pause';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const T = 'aaaaaaaa-0000-4000-8000-000000000001';
const inactive = () => new TenantInactiveError(T, 'inactive');

describe('classifyInactiveTenant', () => {
  it.each(PROVISIONING_PAUSED_STATES)(
    'provisioning run at %s → TenantPaused, non-retryable',
    async (state) => {
      const out = await classifyInactiveTenant(inactive(), T, async () => state);
      expect(out).toBeInstanceOf(ApplicationFailure);
      expect((out as ApplicationFailure).type).toBe('TenantPaused');
      expect((out as ApplicationFailure).nonRetryable).toBe(true);
    },
  );

  it.each([
    ['no provisioning run', null],
    ['a run that finished', 'COMPLETED'],
    ['a run at the gate', 'AWAITING_APPROVAL'],
  ])('%s → TenantInactive, non-retryable (deactivated, D50)', async (_l, state) => {
    const out = await classifyInactiveTenant(inactive(), T, async () => state);
    expect((out as ApplicationFailure).type).toBe('TenantInactive');
    expect((out as ApplicationFailure).nonRetryable).toBe(true);
  });

  it('keeps the original error when the run state cannot be read (retried as before)', async () => {
    const err = inactive();
    const out = await classifyInactiveTenant(err, T, async () => {
      throw new Error('no worker answered');
    });
    expect(out).toBe(err);
  });

  it('leaves any other error alone, without asking Temporal', async () => {
    const err = new Error('relation does not exist');
    const read = jest.fn();
    expect(await classifyInactiveTenant(err, T, read)).toBe(err);
    expect(read).not.toHaveBeenCalled();
  });

  it('names only states the provisioning workflow sets', () => {
    const workflow = readFileSync(
      path.resolve(
        __dirname,
        '../../../modules/tenant/workflows/enterprise-provisioning.workflow.ts',
      ),
      'utf8',
    );
    for (const state of PROVISIONING_PAUSED_STATES) expect(workflow).toContain(`'${state}'`);
  });
});
