// Guards the Site Engineer Home's messages (QM-3).
//
// translate() swallows a malformed ICU message and returns the raw template, so a `{{value}}`-style
// mistake ships silently as literal braces on screen. These tests fail loudly instead.

import { translate } from '../translate';
import en from '../en.json';
import th from '../th.json';

const KEYS = [
  'appName',
  'notifications',
  'progressTitle',
  'progressEmpty',
  'phaseTitle',
  'phaseSeq',
  'workHours',
  'ahead',
  'onTrack',
  'behind',
  'quickActions',
  'reviewReports',
  'issues',
  'capturePhoto',
  'materialRequest',
  'activeIssues',
  'unit',
  'overdueLabel',
  'dueSoonLabel',
  'noIssues',
  'upcomingTasks',
  'noTasks',
  'starts',
] as const;

describe('home.engineer messages', () => {
  it('every key exists in both locales', () => {
    for (const key of KEYS) {
      expect(en.home.engineer).toHaveProperty(key);
      expect(th.home.engineer).toHaveProperty(key);
    }
  });

  it('th is translated, not copied from en', () => {
    // appName is the brand and is intentionally identical; everything else must differ.
    const shared = KEYS.filter(
      (k) => k !== 'appName' && en.home.engineer[k] === th.home.engineer[k],
    );
    expect(shared).toEqual([]);
  });

  it.each(['th', 'en'] as const)('interpolates starts (a date) in %s', (locale) => {
    const starts = translate(locale, 'home.engineer.starts', { date: '20 ก.ค.' });
    expect(starts).toContain('20 ก.ค.');
    expect(starts).not.toContain('{');
  });

  it.each(['th', 'en'] as const)('interpolates the schedule day-variance in %s', (locale) => {
    const behind = translate(locale, 'home.engineer.behind', { days: 21 });
    const ahead = translate(locale, 'home.engineer.ahead', { days: 3 });
    expect(behind).toContain('21');
    expect(ahead).toContain('3');
    expect(behind).not.toContain('{');
    expect(ahead).not.toContain('{');
  });

  it.each(['th', 'en'] as const)('interpolates the requisition item number in %s', (locale) => {
    const item = translate(locale, 'materialRequest.item', { n: 2 });
    expect(item).toContain('2');
    expect(item).not.toContain('{');
  });

  it('notifications screen keys exist in both locales', () => {
    for (const key of ['title', 'markAllRead', 'empty']) {
      expect(en.notifications).toHaveProperty(key);
      expect(th.notifications).toHaveProperty(key);
    }
  });

  it('material-request screen keys exist in both locales', () => {
    for (const key of [
      'title',
      'item',
      'descriptionPlaceholder',
      'quantityPlaceholder',
      'unitPlaceholder',
      'addItem',
      'removeItem',
      'requiredDate',
      'submit',
      'created',
      'queued',
      'error',
    ]) {
      expect(en.materialRequest).toHaveProperty(key);
      expect(th.materialRequest).toHaveProperty(key);
    }
  });
});
