// Unit tests — multipart reading and field validation for the central price import (ADR-061).

import {
  IMPORT_MULTIPART_LIMITS,
  MAX_IMPORT_FILE_BYTES,
  readCentralPriceUpload,
  uploadFileName,
  validateImportFields,
  type MultipartRequest,
} from '../central-price-upload';

interface Part {
  type: 'file' | 'field';
  fieldname: string;
  filename?: string;
  toBuffer?: () => Promise<Buffer>;
  value?: unknown;
  valueTruncated?: boolean;
}

function fileWith(bytes: Buffer, fieldname = 'file', filename = 'prices.csv'): Part {
  return { type: 'file', fieldname, filename, toBuffer: async () => bytes };
}

function field(fieldname: string, value: unknown, valueTruncated = false): Part {
  return { type: 'field', fieldname, value, valueTruncated };
}

function requestOf(parts: Part[] | (() => AsyncIterable<Part>)): MultipartRequest & {
  parts: jest.Mock;
} {
  const iterate =
    typeof parts === 'function'
      ? parts
      : async function* () {
          for (const p of parts) yield p;
        };
  return { isMultipart: () => true, parts: jest.fn(() => iterate()) };
}

const JUSTIFICATION = 'Comptroller General circular for 2569 published';

describe('readCentralPriceUpload', () => {
  it('collects one file and the three fields, passing the limits to busboy', async () => {
    const req = requestOf([
      field('effective_period', '2569'),
      fileWith(Buffer.from('code\r\n')),
      field('source_ref', 'ว 123'),
      field('justification', JUSTIFICATION),
    ]);
    await expect(readCentralPriceUpload(req)).resolves.toEqual({
      fields: { effective_period: '2569', source_ref: 'ว 123', justification: JUSTIFICATION },
      file: { filename: 'prices.csv', bytes: Buffer.from('code\r\n') },
    });
    expect(req.parts).toHaveBeenCalledWith({ limits: IMPORT_MULTIPART_LIMITS });
  });

  it('records a missing filename as empty and a missing field value as empty text', async () => {
    const req = requestOf([
      { type: 'file', fieldname: 'file', toBuffer: async () => Buffer.from('x') },
      field('source_ref', undefined),
    ]);
    await expect(readCentralPriceUpload(req)).resolves.toEqual({
      fields: { source_ref: '' },
      file: { filename: '', bytes: Buffer.from('x') },
    });
  });

  it.each([
    ['no isMultipart decorator (Express, or the plugin is not registered)', { parts: jest.fn() }],
    ['no parts decorator', { isMultipart: (): boolean => true }],
    ['not a multipart request', { isMultipart: (): boolean => false, parts: jest.fn() }],
  ])('400 COS-CPRICE-001 when there is %s', async (_label, req) => {
    await expect(readCentralPriceUpload(req as MultipartRequest)).rejects.toMatchObject({
      status: 400,
      response: { error: { code: 'COS-CPRICE-001' } },
    });
  });

  it.each([
    [
      'a file in another field',
      [fileWith(Buffer.from('x'), 'upload')],
      'Unexpected file field "upload"',
    ],
    [
      'a file part without a buffer reader',
      [{ type: 'file', fieldname: 'file' } as Part],
      'Unexpected file field "file"',
    ],
    ['an unknown field', [field('published_at', 'x')], 'Unexpected field "published_at"'],
    [
      'a truncated field',
      [field('justification', 'x', true)],
      'Field "justification" is too long.',
    ],
    [
      'a repeated field',
      [field('effective_period', 'a'), field('effective_period', 'b')],
      'Field "effective_period" was sent more than once.',
    ],
    ['no file', [field('effective_period', '2569')], 'No file was uploaded'],
    ['an empty file', [fileWith(Buffer.alloc(0))], 'The uploaded file is empty.'],
  ])('400 for %s', async (_label, parts, message) => {
    await expect(readCentralPriceUpload(requestOf(parts as Part[]))).rejects.toMatchObject({
      status: 400,
      response: { error: { code: 'COS-CPRICE-001', message: expect.stringContaining(message) } },
    });
  });

  it('413 COS-CPRICE-003 when busboy reports the file over the limit', async () => {
    const req = requestOf(async function* () {
      yield {
        type: 'file' as const,
        fieldname: 'file',
        filename: 'big.csv',
        toBuffer: async () => {
          throw Object.assign(new Error('request file too large'), {
            code: 'FST_REQ_FILE_TOO_LARGE',
          });
        },
      };
    });
    await expect(readCentralPriceUpload(req)).rejects.toMatchObject({
      status: 413,
      response: {
        error: { code: 'COS-CPRICE-003', details: { max_file_bytes: MAX_IMPORT_FILE_BYTES } },
      },
    });
  });

  it.each(['FST_PARTS_LIMIT', 'FST_FILES_LIMIT', 'FST_FIELDS_LIMIT'])(
    '400 COS-CPRICE-001 when busboy reports %s',
    async (code) => {
      const req = requestOf(async function* () {
        yield field('effective_period', '2569');
        throw Object.assign(new Error('limit'), { code });
      });
      await expect(readCentralPriceUpload(req)).rejects.toMatchObject({
        status: 400,
        response: { error: { code: 'COS-CPRICE-001' } },
      });
    },
  );

  it('rethrows any other stream failure untouched', async () => {
    const boom = new Error('socket hang up');
    const noCode = requestOf(async function* () {
      yield field('effective_period', '2569');
      throw boom;
    });
    await expect(readCentralPriceUpload(noCode)).rejects.toBe(boom);

    const otherCode = Object.assign(new Error('x'), { code: 'ECONNRESET' });
    const withCode = requestOf(async function* () {
      yield field('effective_period', '2569');
      throw otherCode;
    });
    await expect(readCentralPriceUpload(withCode)).rejects.toBe(otherCode);
  });
});

describe('validateImportFields', () => {
  it('accepts, trims, and treats a blank source_ref as absent', async () => {
    const dto = await validateImportFields({
      effective_period: ' 2569 ',
      source_ref: '   ',
      justification: `  ${JUSTIFICATION}  `,
    });
    expect(dto).toMatchObject({ effective_period: '2569', justification: JUSTIFICATION });
    expect(dto.source_ref).toBeUndefined();
  });

  it('400 with every constraint message, as the global ValidationPipe would', async () => {
    const err = (await validateImportFields({
      effective_period: 'bad period',
      justification: 'short',
    }).catch((e: unknown) => e)) as { status: number; response: { message: string[] } };
    expect(err.status).toBe(400);
    expect(err.response.message).toEqual(
      expect.arrayContaining([
        expect.stringContaining('effective_period must be'),
        expect.stringContaining('justification must be longer than or equal to 10 characters'),
      ]),
    );
  });

  it('refuses a field the DTO does not declare', async () => {
    await expect(
      validateImportFields({ effective_period: '2569', justification: JUSTIFICATION, extra: 'x' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('uploadFileName', () => {
  it.each([
    ['prices.csv', 'prices.csv'],
    ['C:\\Users\\me\\ราคากลาง 2569.xlsx', 'ราคากลาง 2569.xlsx'],
    ['../../etc/passwd', 'passwd'],
    ['bad\u0000name\u001f.csv', 'badname.csv'],
    ['', 'upload'],
    ['dir/', 'upload'],
    [`${'x'.repeat(300)}.csv`, 'x'.repeat(255)],
  ])('%p → %p', (input, expected) => {
    expect(uploadFileName(input)).toBe(expected);
  });
});
