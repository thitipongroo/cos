/**
 * Every user-facing string is in Thai and English, so th.json and en.json must hold the same keys.
 * `t()` falls back to English and then to the key itself, so a key added to one file only does not
 * fail anywhere else: a Thai user just sees English, or `leasing.wizard.x`. This test is what fails.
 *
 * It also compares the `{name}` placeholders each string carries, because callers fill them with
 * `.replace('{name}', value)`: a placeholder missing from one language leaves that value out of
 * the text, and one renamed in a translation is shown to the user as literal `{name}`.
 */
import en from '../en.json';
import th from '../th.json';

type Messages = { [key: string]: string | Messages };

function flatten(messages: Messages, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix + key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, `${path}.`)) out.set(k, v);
  }
  return out;
}

function placeholders(text: string): string[] {
  return [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
}

const enFlat = flatten(en as Messages);
const thFlat = flatten(th as Messages);

describe('th.json and en.json', () => {
  it('hold the same keys', () => {
    const onlyEn = [...enFlat.keys()].filter((key) => !thFlat.has(key));
    const onlyTh = [...thFlat.keys()].filter((key) => !enFlat.has(key));
    expect({ onlyEn, onlyTh }).toEqual({ onlyEn: [], onlyTh: [] });
    expect(enFlat.size).toBeGreaterThan(0);
  });

  it('give each key the same {placeholders} in both languages', () => {
    const differ = [...enFlat]
      .filter(([key]) => thFlat.has(key))
      .map(([key, text]) => ({ key, en: placeholders(text), th: placeholders(thFlat.get(key)!) }))
      .filter(({ en: e, th: t }) => e.join() !== t.join());
    expect(differ).toEqual([]);
  });
});
