import { containsPattern } from '../like-pattern';

describe('containsPattern', () => {
  it('wraps the text in % for a substring match', () => {
    expect(containsPattern('ปูน')).toBe('%ปูน%');
  });

  // `%` and `_` are LIKE wildcards; unescaped, "50%" would match "50 bags" and "a_b" any "a?b".
  it('escapes LIKE metacharacters and the escape itself, so the text matches literally', () => {
    expect(containsPattern('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
  });
});
