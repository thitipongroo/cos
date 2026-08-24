import { projectStatusTone } from '../projectStatusTone';

describe('projectStatusTone', () => {
  it('makes ACTIVE green — the state where work is actually running', () => {
    expect(projectStatusTone('ACTIVE')).toBe('success');
    expect(projectStatusTone('COMPLETED')).toBe('success');
  });

  it('leaves DRAFT neutral, which is what StatusChip and the mockup already do', () => {
    expect(projectStatusTone('DRAFT')).toBe('neutral');
    expect(projectStatusTone('CANCELLED')).toBe('neutral');
  });

  it('treats ON_HOLD as something to act on, not as nothing', () => {
    expect(projectStatusTone('ON_HOLD')).toBe('warning');
  });

  it('is case-insensitive — the API returns upper case, callers should not have to care', () => {
    expect(projectStatusTone('active')).toBe('success');
  });

  it('falls to neutral for a status it does not know, rather than guessing a colour', () => {
    // The enum can grow. A wrong colour on a lifecycle state is a wrong claim about a project.
    expect(projectStatusTone('ARCHIVED')).toBe('neutral');
    expect(projectStatusTone('')).toBe('neutral');
    expect(projectStatusTone(null)).toBe('neutral');
    expect(projectStatusTone(undefined)).toBe('neutral');
  });
});
