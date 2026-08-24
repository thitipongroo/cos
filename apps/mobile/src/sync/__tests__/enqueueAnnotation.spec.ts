import { enqueueAnnotationForUploadedPhoto } from '../enqueueAnnotation';

function deps(annotation: unknown) {
  const enqueue = jest.fn().mockReturnValue(42);
  const getAnnotation = jest.fn().mockResolvedValue(annotation);
  return { getAnnotation, enqueue };
}

describe('enqueueAnnotationForUploadedPhoto', () => {
  it('enqueues a photo_annotation keyed to the server file id, carrying strokes + base version', async () => {
    const d = deps({ strokes: [{ tool: 'pen' }], baseVersion: 2, dirty: true });

    const id = await enqueueAnnotationForUploadedPhoto('local-1', 'server-file-9', d);

    expect(id).toBe(42);
    expect(d.enqueue).toHaveBeenCalledWith('photo_annotation', 'server-file-9', 'UPDATE', {
      strokes: [{ tool: 'pen' }],
      version: 2,
    });
  });

  it('does nothing when the photo has no annotation', async () => {
    const d = deps(null);

    const id = await enqueueAnnotationForUploadedPhoto('local-1', 'server-file-9', d);

    expect(id).toBeNull();
    expect(d.enqueue).not.toHaveBeenCalled();
  });

  it('does nothing when the annotation is not dirty (already synced)', async () => {
    const d = deps({ strokes: [], baseVersion: 3, dirty: false });

    const id = await enqueueAnnotationForUploadedPhoto('local-1', 'server-file-9', d);

    expect(id).toBeNull();
    expect(d.enqueue).not.toHaveBeenCalled();
  });
});
