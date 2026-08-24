import {
  MESSAGE_KEYS,
  email,
  intInRange,
  optionalText,
  progressPercent,
  requiredId,
  requiredText,
  riskScore,
} from '../primitives';

const firstMessage = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? undefined : r.error?.issues[0]?.message;

const UUID = '88803908-e4b5-57bd-8e6b-ed4662b5d67d';

describe('MESSAGE_KEYS', () => {
  it('are all namespaced under validation. so consumers can find them', () => {
    expect(MESSAGE_KEYS.every((k) => k.startsWith('validation.'))).toBe(true);
  });

  it('has no duplicates', () => {
    expect(new Set(MESSAGE_KEYS).size).toBe(MESSAGE_KEYS.length);
  });
});

describe('requiredText', () => {
  const s = requiredText(5);

  it('accepts text within the bound', () => {
    expect(s.safeParse('abc').success).toBe(true);
  });

  it('trims before measuring, so whitespace alone is required-failure not length-failure', () => {
    expect(firstMessage(s.safeParse('   '))).toBe('validation.required');
  });

  it('trims the parsed output', () => {
    const r = s.safeParse('  ab  ');
    expect(r.success && r.data).toBe('ab');
  });

  it('rejects an empty string as required', () => {
    expect(firstMessage(s.safeParse(''))).toBe('validation.required');
  });

  it('rejects text over the bound as tooLong', () => {
    expect(firstMessage(s.safeParse('abcdef'))).toBe('validation.tooLong');
  });

  it('accepts text exactly at the bound', () => {
    expect(s.safeParse('abcde').success).toBe(true);
  });
});

describe('optionalText', () => {
  const s = optionalText(3);

  it('accepts undefined', () => {
    expect(s.safeParse(undefined).success).toBe(true);
  });

  it('accepts an empty string', () => {
    expect(s.safeParse('').success).toBe(true);
  });

  it('rejects text over the bound', () => {
    expect(firstMessage(s.safeParse('abcd'))).toBe('validation.tooLong');
  });
});

describe('requiredId', () => {
  it('accepts a uuid', () => {
    expect(requiredId.safeParse(UUID).success).toBe(true);
  });

  it('reports an empty select as required, not as a malformed uuid', () => {
    expect(firstMessage(requiredId.safeParse(''))).toBe('validation.required');
  });

  it('rejects a non-uuid string', () => {
    expect(firstMessage(requiredId.safeParse('not-a-uuid'))).toBe('validation.notAUuid');
  });
});

describe('intInRange', () => {
  const s = intInRange(2, 4);

  it.each([2, 3, 4])('accepts %i inside the inclusive range', (n) => {
    expect(s.safeParse(n).success).toBe(true);
  });

  it.each([1, 5])('rejects %i outside the range', (n) => {
    expect(firstMessage(s.safeParse(n))).toBe('validation.outOfRange');
  });

  it('rejects a non-integer', () => {
    expect(firstMessage(s.safeParse(2.5))).toBe('validation.notAnInteger');
  });
});

describe('progressPercent — DESIGN.md §9.1 says 0–100', () => {
  it.each([0, 50, 100])('accepts %i', (n) => {
    expect(progressPercent.safeParse(n).success).toBe(true);
  });

  it.each([-1, 101])('rejects %i', (n) => {
    expect(progressPercent.safeParse(n).success).toBe(false);
  });
});

describe('riskScore — ADR-065 says 1–25', () => {
  it.each([1, 25])('accepts %i', (n) => {
    expect(riskScore.safeParse(n).success).toBe(true);
  });

  it.each([0, 26])('rejects %i', (n) => {
    expect(riskScore.safeParse(n).success).toBe(false);
  });
});

describe('email', () => {
  it('accepts a valid address', () => {
    expect(email.safeParse('a@b.co').success).toBe(true);
  });

  it('reports a blank field as required', () => {
    expect(firstMessage(email.safeParse(''))).toBe('validation.required');
  });

  it('rejects a malformed address', () => {
    expect(firstMessage(email.safeParse('nope'))).toBe('validation.notAnEmail');
  });
});
