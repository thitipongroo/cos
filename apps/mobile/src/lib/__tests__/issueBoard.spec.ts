import {
  ISSUE_FILTERS,
  isIssueClosed,
  issueSeverityTone,
  issueStripTone,
  matchesIssueFilter,
} from '../issueBoard';

const issue = (severity: string, status: string) => ({ severity, status });

describe('ISSUE_FILTERS', () => {
  it('is the drawing’s five chips, with `all` first', () => {
    expect(ISSUE_FILTERS).toEqual(['all', 'critical', 'high', 'open', 'resolved']);
  });
});

describe('isIssueClosed()', () => {
  it('treats RESOLVED and CLOSED as finished', () => {
    expect(isIssueClosed('RESOLVED')).toBe(true);
    expect(isIssueClosed('CLOSED')).toBe(true);
  });

  it('leaves every working status open', () => {
    expect(isIssueClosed('OPEN')).toBe(false);
    expect(isIssueClosed('IN_PROGRESS')).toBe(false);
  });
});

describe('matchesIssueFilter()', () => {
  it('`all` keeps everything', () => {
    expect(matchesIssueFilter(issue('LOW', 'CLOSED'), 'all')).toBe(true);
  });

  it('`critical` and `high` filter on severity alone', () => {
    expect(matchesIssueFilter(issue('CRITICAL', 'OPEN'), 'critical')).toBe(true);
    expect(matchesIssueFilter(issue('HIGH', 'OPEN'), 'critical')).toBe(false);
    expect(matchesIssueFilter(issue('HIGH', 'OPEN'), 'high')).toBe(true);
    expect(matchesIssueFilter(issue('MEDIUM', 'OPEN'), 'high')).toBe(false);
  });

  // A resolved CRITICAL is still CRITICAL: the severity chips say how bad, not whether it is done.
  it('keeps a finished issue under its own severity chip', () => {
    expect(matchesIssueFilter(issue('CRITICAL', 'RESOLVED'), 'critical')).toBe(true);
  });

  it('`open` and `resolved` split on status', () => {
    expect(matchesIssueFilter(issue('LOW', 'IN_PROGRESS'), 'open')).toBe(true);
    expect(matchesIssueFilter(issue('LOW', 'CLOSED'), 'open')).toBe(false);
    expect(matchesIssueFilter(issue('LOW', 'RESOLVED'), 'resolved')).toBe(true);
    expect(matchesIssueFilter(issue('LOW', 'OPEN'), 'resolved')).toBe(false);
  });
});

describe('issueSeverityTone()', () => {
  it('maps the drawing’s three severities', () => {
    expect(issueSeverityTone('CRITICAL')).toBe('danger');
    expect(issueSeverityTone('HIGH')).toBe('warning');
    expect(issueSeverityTone('MEDIUM')).toBe('primary');
  });

  it('gives LOW — and any value the enum grows later — the neutral', () => {
    expect(issueSeverityTone('LOW')).toBe('muted');
    expect(issueSeverityTone('WHATEVER')).toBe('muted');
  });
});

describe('issueStripTone()', () => {
  it('is the severity while the issue is still open', () => {
    expect(issueStripTone(issue('CRITICAL', 'OPEN'))).toBe('danger');
    expect(issueStripTone(issue('MEDIUM', 'IN_PROGRESS'))).toBe('primary');
  });

  it('turns green once the issue is finished, whatever its severity was', () => {
    expect(issueStripTone(issue('CRITICAL', 'RESOLVED'))).toBe('success');
    expect(issueStripTone(issue('LOW', 'CLOSED'))).toBe('success');
  });
});
