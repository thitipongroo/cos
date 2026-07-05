import { categoryFor, isValidCategory, FILE_CATEGORIES } from '../util/category';

describe('categoryFor', () => {
  it('maps each MIME family to its category', () => {
    expect(categoryFor('image/png')).toBe('image');
    expect(categoryFor('application/pdf')).toBe('document');
    expect(categoryFor('application/vnd.ms-excel')).toBe('document');
    expect(categoryFor('application/dxf')).toBe('cad');
    expect(categoryFor('image/vnd.dwg')).toBe('cad');
    expect(categoryFor('video/mp4')).toBe('video');
    expect(categoryFor('application/zip')).toBe('archive');
  });

  it('falls back to "other" for unknown MIME types', () => {
    expect(categoryFor('text/plain')).toBe('other');
  });
});

describe('isValidCategory', () => {
  it('accepts the five real categories', () => {
    for (const c of FILE_CATEGORIES) expect(isValidCategory(c)).toBe(true);
  });
  it('rejects unknown / "other"', () => {
    expect(isValidCategory('other')).toBe(false);
    expect(isValidCategory('nope')).toBe(false);
  });
});
