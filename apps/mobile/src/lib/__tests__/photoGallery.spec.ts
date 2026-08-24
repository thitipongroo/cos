import { canDeletePhoto, GALLERY_COLUMNS } from '../photoGallery';

describe('GALLERY_COLUMNS', () => {
  it('is three, matching the mockup grid', () => {
    expect(GALLERY_COLUMNS).toBe(3);
  });
});

describe('canDeletePhoto', () => {
  it.each(['PENDING', 'FAILED'] as const)(
    'allows deleting a %s photo — its bytes never reached the server',
    (status) => {
      expect(canDeletePhoto(status)).toBe(true);
    },
  );

  it('refuses an UPLOADING photo — deleting mid-request would race the upload', () => {
    expect(canDeletePhoto('UPLOADING')).toBe(false);
  });

  it('refuses an UPLOADED photo — removing a stored file is Tenant Admin only (spec §14)', () => {
    expect(canDeletePhoto('UPLOADED')).toBe(false);
  });
});
