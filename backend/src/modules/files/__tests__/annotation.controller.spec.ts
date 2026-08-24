import { AnnotationController } from '../annotation.controller';

describe('AnnotationController', () => {
  it('getAnnotation delegates to the service', () => {
    const svc = { getByFileId: jest.fn().mockReturnValue('result') };
    const ctrl = new AnnotationController(svc as never);

    expect(ctrl.getAnnotation('f1')).toBe('result');
    expect(svc.getByFileId).toHaveBeenCalledWith('f1');
  });
});
