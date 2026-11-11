import { fill } from '../fill';

describe('fill', () => {
  it('puts each value in its {name}', () => {
    expect(fill('{a} of {b}', { a: 3, b: '5' })).toBe('3 of 5');
  });

  it('fills a name every time it appears', () => {
    expect(fill('{x}-{x}', { x: 'y' })).toBe('y-y');
  });

  it('leaves a name it has no value for as written', () => {
    expect(fill('{a} {missing}', { a: 1 })).toBe('1 {missing}');
  });

  it('does not read $ patterns in a value', () => {
    expect(fill('[{v}]', { v: "$& $' $` $1" })).toBe("[$& $' $` $1]");
  });

  it('does not fill a placeholder that a value brought in', () => {
    expect(fill('{a} {b}', { a: '{b}', b: 'B' })).toBe('{b} B');
  });

  it('does not take names from the object prototype', () => {
    expect(fill('{toString} {constructor}', {})).toBe('{toString} {constructor}');
  });

  it('keeps an empty value and zero', () => {
    expect(fill('<{a}|{b}>', { a: '', b: 0 })).toBe('<|0>');
  });
});
