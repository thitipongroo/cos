import { formatRole } from '../formatRole';

describe('formatRole', () => {
  it('turns a multi-word role identifier into title case', () => {
    expect(formatRole('PROJECT_MANAGER')).toBe('Project Manager');
    expect(formatRole('PROCUREMENT_OFFICER')).toBe('Procurement Officer');
    expect(formatRole('CRM_SALES_MANAGER')).toBe('Crm Sales Manager');
  });

  it('handles a single-word role', () => {
    expect(formatRole('EXECUTIVE')).toBe('Executive');
    expect(formatRole('VIEWER')).toBe('Viewer');
  });

  it('is NOT idempotent — only ever pass it a raw role identifier', () => {
    // Second pass: 'Site Engineer' has no underscore, so it is one "word" and everything after the
    // first character is lowercased — 'Site engineer'. Asserted rather than fixed, because the fix
    // (splitting on whitespace too) would guess at input this function is never given: every call
    // site reads a role enum straight off the API. Recorded so the next person double-formatting a
    // value gets a failing test here instead of a lowercase surprise on a screen.
    expect(formatRole(formatRole('SITE_ENGINEER'))).toBe('Site engineer');
  });

  it('returns an empty string for an empty role rather than throwing', () => {
    // `''.split('_')` is `['']`, so the mapping runs on an empty word — charAt(0) is '' and
    // slice(1) is ''. Asserted because a user with no role assigned is a real state.
    expect(formatRole('')).toBe('');
  });
});
