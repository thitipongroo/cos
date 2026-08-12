// One phase name, in ONE language.
//
// `projects.project_phases.name` is a single bilingual string — "งานฐานราก (Foundation)",
// "งานระบบประกอบอาคาร (MEP)" — because the column is one VARCHAR and the phases were seeded to be
// legible to both a Thai foreman and an English-speaking reviewer reading the same row. Printing it
// verbatim puts both languages on a heading that is already tight, and shows every reader half a
// label they did not ask for (PO decision 2026-08-12: "ต้องการให้แสดง 1 ภาษา").
//
// SPLIT AT RENDER, NOT IN THE DATABASE. Giving the table `name_th`/`name_en` columns would be the
// tidier model, but it is a migration plus a backfill of rows whose two halves only exist inside one
// string anyway — this reads the same string and picks the half the reader's locale asks for.
//
// A name with no parenthetical is returned whole, in either locale. That is the honest behaviour for
// a phase the office named in one language: showing nothing, or showing an empty string beside a
// phase number, would be worse than showing the name they actually typed.

/** The trailing "(…)" group, and only a trailing one — a bracket mid-name is part of the name. */
const TRAILING_PARENS = /^(.*?)\s*\(([^()]*)\)\s*$/;

/**
 * The phase's name for `locale`.
 *
 * "งานฐานราก (Foundation)" → `th` gives "งานฐานราก", `en` gives "Foundation".
 * The caller uppercases if its heading style does; this returns the name as recorded, because
 * casing is a typographic decision and Thai has no case to change.
 */
export function phaseName(name: string, locale: string): string {
  const trimmed = name.trim();
  const match = TRAILING_PARENS.exec(trimmed);
  if (match === null) return trimmed;

  const outside = (match[1] ?? '').trim();
  const inside = (match[2] ?? '').trim();

  // English wants the parenthetical; falls back to the outside when the brackets are empty, which
  // is what "งานฐานราก ()" — a name someone half-translated — should still read as.
  if (locale === 'en') return inside === '' ? outside : inside;
  // Thai wants what is outside them, and falls back the same way for "(Foundation)" with no Thai.
  return outside === '' ? inside : outside;
}
