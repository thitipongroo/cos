jest.mock('@cos/logger', () => {
  const warn = jest.fn();
  const names: string[] = [];
  const createLogger = jest.fn((module: string) => {
    names.push(module);
    return { info: jest.fn(), warn, error: jest.fn(), debug: jest.fn(), child: jest.fn() };
  });
  return { createLogger, __loggerMock: { warn, names } };
});
const { __loggerMock: loggerMock } = jest.requireMock('@cos/logger');

import { LIST_CAP, capLimit, applyCap } from '../list-cap';

const rows = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe('list-cap', () => {
  beforeEach(() => loggerMock.warn.mockClear());

  it('creates the module logger with the exact name', () => {
    expect(loggerMock.names).toContain('list-cap');
  });

  // Fetching cap+1 is the whole detection mechanism: selecting exactly `cap` cannot tell
  // "exactly cap rows" apart from "cap rows and more behind them".
  it('capLimit asks the database for one row beyond the cap', () => {
    expect(capLimit()).toBe(LIST_CAP + 1);
    expect(capLimit(10)).toBe(11);
  });

  it('returns a short result untouched and stays silent', () => {
    const input = rows(5);
    expect(applyCap(input, 'x', 10)).toBe(input);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  // Exactly `cap` rows is not truncation — the extra probe row never came back.
  it('does not warn when the result lands exactly on the cap', () => {
    expect(applyCap(rows(10), 'x', 10)).toHaveLength(10);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it('trims to the cap and warns when the probe row comes back', () => {
    const out = applyCap(rows(11), 'workforce.workers', 10);
    expect(out).toHaveLength(10);
    expect(out[9]).toBe(9);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'workforce.workers', cap: 10 }),
      expect.stringContaining('list-cap: result truncated'),
    );
  });

  it('defaults to LIST_CAP when no cap is given', () => {
    expect(applyCap(rows(LIST_CAP + 1), 'x')).toHaveLength(LIST_CAP);
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
  });

  it('handles an empty result', () => {
    expect(applyCap([], 'x')).toEqual([]);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});
