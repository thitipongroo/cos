/**
 * Fills every `{name}` in a translated template in one pass: `fill(t('x.y'), { unit: '10-4' })`.
 *
 * A chain of `.replace('{x}', value)` reads `$&`, `$'` and `` $` `` in a value as replacement
 * patterns, and can fill a placeholder that an earlier value brought in. Values shown on screen
 * are often typed by the user or taken from the URL, so neither may happen. A name the template
 * uses but `values` lacks is left as written, so a missing value shows up as `{name}` on screen.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}
