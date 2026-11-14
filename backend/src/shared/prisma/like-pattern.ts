/**
 * `%<text>%` for an `ILIKE` that matches the user's text literally.
 *
 * `%` and `_` are LIKE wildcards and `\` is PostgreSQL's default LIKE escape, so each is escaped
 * with a backslash. Passed as a bound parameter (never written into a Prisma.sql template, where a
 * backslash is dropped — see admin-audit-log.service.ts `likeLiteral`), and used without an ESCAPE
 * clause, so the default `\` applies. Same rule as central-price-queries.ts `escapeLike`.
 */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
