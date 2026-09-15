// Builds a minimal, valid .xlsx workbook in memory for tests of the central price import (ADR-061).
//
// An .xlsx is a ZIP of SpreadsheetML parts. The four parts below are the smallest set Excel and
// read-excel-file accept: content types, the package relationship, the workbook with one sheet, and the
// sheet. Strings are written inline (`t="inlineStr"`) so no shared-strings part is needed; numbers are
// written as `<v>` exactly as given, which is how a real workbook stores them — as text the reader hands
// back verbatim when told to (`parseNumber: (s) => s`).
//
// yazl is already a backend dependency (the data export writes ZIPs with it), so this adds no package.

import { ZipFile } from 'yazl';

export type XlsxCell = string | { number: string } | null;

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(rows: XlsxCell[][]): string {
  const body = rows
    .map((cells, r) => {
      const xmlCells = cells
        .map((cell, c) => {
          const ref = `${columnName(c)}${r + 1}`;
          if (cell === null) return '';
          if (typeof cell === 'object') return `<c r="${ref}"><v>${cell.number}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${xmlCells}</row>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '</Types>';

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const WORKBOOK =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>';

const WORKBOOK_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '</Relationships>';

/** A one-sheet .xlsx holding `rows`. `{ number: '2450.5' }` writes a numeric cell. */
export function buildXlsx(rows: XlsxCell[][]): Promise<Buffer> {
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(CONTENT_TYPES), '[Content_Types].xml');
  zip.addBuffer(Buffer.from(ROOT_RELS), '_rels/.rels');
  zip.addBuffer(Buffer.from(WORKBOOK), 'xl/workbook.xml');
  zip.addBuffer(Buffer.from(WORKBOOK_RELS), 'xl/_rels/workbook.xml.rels');
  zip.addBuffer(Buffer.from(sheetXml(rows)), 'xl/worksheets/sheet1.xml');
  zip.end();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream
      .on('data', (chunk: Buffer) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}
