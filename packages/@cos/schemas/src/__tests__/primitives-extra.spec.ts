import {
  currencyCode,
  isoDate,
  isoDateTimeLocal,
  money,
  optionalEmail,
  optionalIsoDate,
  optionalMoney,
  percent,
  progressPercent,
  quantity,
} from '../primitives';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

describe('optionalEmail', () => {
  it.each([undefined, '', 'a@b.co'])('accepts %p', (v) => expect(ok(optionalEmail, v)).toBe(true));
  it.each(['not-an-email', 'a@', '@b.co'])('rejects %p', (v) =>
    expect(ok(optionalEmail, v)).toBe(false),
  );
  it('reports a malformed address with the i18n key', () => {
    const r = optionalEmail.safeParse('nope');
    expect(
      r.success === false && r.error.issues.some((i) => i.message === 'validation.notAnEmail'),
    ).toBe(true);
  });
});

describe('isoDate', () => {
  it.each(['2026-08-03', '1999-12-31'])('accepts %s', (v) => expect(ok(isoDate, v)).toBe(true));
  it.each(['', '2026-8-3', '03/08/2026', '2026-08-03T00:00', 'yesterday'])('rejects %p', (v) =>
    expect(ok(isoDate, v)).toBe(false),
  );
  it('reports an empty value as required, not as malformed', () => {
    const r = isoDate.safeParse('');
    expect(r.success === false && r.error.issues[0]?.message).toBe('validation.required');
  });
});

describe('optionalIsoDate', () => {
  it.each([undefined, '', '2026-08-03'])('accepts %p', (v) =>
    expect(ok(optionalIsoDate, v)).toBe(true),
  );
  it.each(['2026-8-3', 'nope'])('rejects %p', (v) => expect(ok(optionalIsoDate, v)).toBe(false));
});

describe('isoDateTimeLocal', () => {
  it.each(['2026-08-03T07:30', '2026-08-03T07:30:00'])('accepts %s', (v) =>
    expect(ok(isoDateTimeLocal, v)).toBe(true),
  );
  it.each(['', '2026-08-03', '2026-08-03 07:30', '2026-08-03T7:30'])('rejects %p', (v) =>
    expect(ok(isoDateTimeLocal, v)).toBe(false),
  );
});

describe('money', () => {
  it.each(['0', '1500', '1500.5', '1500.50'])('accepts %s', (v) => expect(ok(money, v)).toBe(true));
  it.each(['', '1500.505', '1,500', '฿1500', '-5', '1500.'])('rejects %p', (v) =>
    expect(ok(money, v)).toBe(false),
  );
  it('rejects three decimal places — currency minor units stop at two', () => {
    const r = money.safeParse('1.005');
    expect(r.success === false && r.error.issues[0]?.message).toBe('validation.notAnAmount');
  });
});

describe('optionalMoney', () => {
  it.each([undefined, '', '10.00'])('accepts %p', (v) => expect(ok(optionalMoney, v)).toBe(true));
  it('rejects a malformed amount', () => expect(ok(optionalMoney, '1,000')).toBe(false));
});

describe('currencyCode', () => {
  it.each(['THB', 'USD', 'JPY'])('accepts %s', (v) => expect(ok(currencyCode, v)).toBe(true));
  it.each(['', 'thb', 'THBX', 'TH', '123'])('rejects %p', (v) =>
    expect(ok(currencyCode, v)).toBe(false),
  );
});

describe('quantity', () => {
  it('accepts zero — a short delivery is recorded as zero received', () => {
    expect(ok(quantity, '0')).toBe(true);
  });
  it.each(['12', '12.5', '12.0001'])('accepts %s', (v) => expect(ok(quantity, v)).toBe(true));
  it.each(['', '12.00001', '-1', 'many'])('rejects %p', (v) => expect(ok(quantity, v)).toBe(false));
});

describe('percent', () => {
  it.each([0, 2.5, 99.99, 100])('accepts %p', (v) => expect(ok(percent, v)).toBe(true));
  it.each([-0.01, 100.01, -1, 101])('rejects %p', (v) => expect(ok(percent, v)).toBe(false));
  it('accepts a fraction that intInRange would reject — the reason it exists', () => {
    expect(ok(percent, 2.5)).toBe(true);
    expect(ok(progressPercent, 2.5)).toBe(false);
  });
});
