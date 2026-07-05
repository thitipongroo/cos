import { MinioService } from '../services/minio.service';
import type { FileServiceConfig } from '../config';

const mockBucketExists = jest.fn();
const mockMakeBucket = jest.fn();
const mockPutObject = jest.fn();
const mockPresignedGet = jest.fn();
const mockRemoveObject = jest.fn();
const mockCopyObject = jest.fn();
const mockGetObject = jest.fn();

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: mockBucketExists,
    makeBucket: mockMakeBucket,
    putObject: mockPutObject,
    presignedGetObject: mockPresignedGet,
    removeObject: mockRemoveObject,
    copyObject: mockCopyObject,
    getObject: mockGetObject,
  })),
  // minio 7.1.4's only typed copyObject overload requires a CopyConditions arg, so the service
  // constructs `new CopyConditions()`. Defined inline (constructable jest.fn) so the factory does
  // not eagerly read an out-of-scope const (TDZ) — without it the runtime throws "not a constructor".
  CopyConditions: jest.fn(),
}));

const config = {
  minio: { endPoint: 'localhost', port: 9100, useSSL: false, accessKey: 'k', secretKey: 's' },
  signedUrlTtlSeconds: 3600,
} as FileServiceConfig;

describe('MinioService', () => {
  let svc: MinioService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new MinioService(config);
  });

  describe('bucketName', () => {
    it('returns cos-{tenantId}', () => {
      expect(svc.bucketName('tid-1')).toBe('cos-tid-1');
    });
  });

  describe('quarantineBucketName', () => {
    it('returns cos-quarantine-{tenantId}', () => {
      expect(svc.quarantineBucketName('tid-1')).toBe('cos-quarantine-tid-1');
    });
  });

  describe('ensureBucket', () => {
    it('creates bucket when it does not exist', async () => {
      mockBucketExists.mockResolvedValue(false);
      mockMakeBucket.mockResolvedValue(undefined);
      await svc.ensureBucket('tid-1');
      expect(mockMakeBucket).toHaveBeenCalledWith('cos-tid-1', 'ap-southeast-1');
    });

    it('skips creation when bucket already exists', async () => {
      mockBucketExists.mockResolvedValue(true);
      await svc.ensureBucket('tid-1');
      expect(mockMakeBucket).not.toHaveBeenCalled();
    });
  });

  describe('ensureQuarantineBucket', () => {
    it('creates quarantine bucket when it does not exist', async () => {
      mockBucketExists.mockResolvedValue(false);
      mockMakeBucket.mockResolvedValue(undefined);
      await svc.ensureQuarantineBucket('tid-1');
      expect(mockMakeBucket).toHaveBeenCalledWith('cos-quarantine-tid-1', 'ap-southeast-1');
    });

    it('skips creation when quarantine bucket already exists', async () => {
      mockBucketExists.mockResolvedValue(true);
      await svc.ensureQuarantineBucket('tid-1');
      expect(mockMakeBucket).not.toHaveBeenCalled();
    });
  });

  describe('uploadFile', () => {
    it('ensures bucket then uploads', async () => {
      mockBucketExists.mockResolvedValue(true);
      mockPutObject.mockResolvedValue(undefined);
      const buffer = Buffer.from('data');
      await svc.uploadFile({ tenantId: 'tid-1', storedKey: 'key', buffer, mimeType: 'image/jpeg' });
      expect(mockPutObject).toHaveBeenCalledWith('cos-tid-1', 'key', buffer, buffer.length, {
        'Content-Type': 'image/jpeg',
      });
    });

    it('propagates MinIO error', async () => {
      mockBucketExists.mockResolvedValue(true);
      mockPutObject.mockRejectedValue(new Error('minio error'));
      await expect(
        svc.uploadFile({
          tenantId: 'tid-1',
          storedKey: 'key',
          buffer: Buffer.from('x'),
          mimeType: 'image/jpeg',
        }),
      ).rejects.toThrow('minio error');
    });
  });

  describe('getSignedUrl', () => {
    it('returns pre-signed URL', async () => {
      mockPresignedGet.mockResolvedValue('https://minio/signed');
      const url = await svc.getSignedUrl('tid-1', 'key');
      expect(url).toBe('https://minio/signed');
      expect(mockPresignedGet).toHaveBeenCalledWith('cos-tid-1', 'key', 3600);
    });
  });

  describe('deleteFile', () => {
    it('removes object from bucket', async () => {
      mockRemoveObject.mockResolvedValue(undefined);
      await svc.deleteFile('tid-1', 'key');
      expect(mockRemoveObject).toHaveBeenCalledWith('cos-tid-1', 'key');
    });
  });

  describe('downloadToBuffer', () => {
    it('streams the object from cos-{tenantId} into a single Buffer', async () => {
      async function* chunks() {
        yield Buffer.from('hello ');
        yield Buffer.from('world');
      }
      mockGetObject.mockResolvedValue(chunks());
      const buf = await svc.downloadToBuffer('tid-1', '2026/07/fid-1/plan.pdf');
      expect(mockGetObject).toHaveBeenCalledWith('cos-tid-1', '2026/07/fid-1/plan.pdf');
      expect(buf.toString()).toBe('hello world');
    });
  });

  describe('moveToQuarantine', () => {
    it('ensures quarantine bucket, copies object, then removes from original', async () => {
      mockBucketExists.mockResolvedValue(true);
      mockCopyObject.mockResolvedValue(undefined);
      mockRemoveObject.mockResolvedValue(undefined);

      await svc.moveToQuarantine('tid-1', '2026/06/fid-1/test.jpg');

      expect(mockCopyObject).toHaveBeenCalledWith(
        'cos-quarantine-tid-1',
        '2026/06/fid-1/test.jpg',
        '/cos-tid-1/2026/06/fid-1/test.jpg',
        expect.anything(),
      );
      expect(mockRemoveObject).toHaveBeenCalledWith('cos-tid-1', '2026/06/fid-1/test.jpg');
    });

    it('propagates copyObject error', async () => {
      mockBucketExists.mockResolvedValue(true);
      mockCopyObject.mockRejectedValue(new Error('copy failed'));
      await expect(svc.moveToQuarantine('tid-1', 'key')).rejects.toThrow('copy failed');
    });
  });

  describe('moveFromQuarantine', () => {
    it('ensures regular bucket, copies from quarantine, then removes quarantine copy', async () => {
      mockBucketExists.mockResolvedValue(true);
      mockCopyObject.mockResolvedValue(undefined);
      mockRemoveObject.mockResolvedValue(undefined);

      await svc.moveFromQuarantine('tid-1', '2026/06/fid-1/test.jpg');

      expect(mockCopyObject).toHaveBeenCalledWith(
        'cos-tid-1',
        '2026/06/fid-1/test.jpg',
        '/cos-quarantine-tid-1/2026/06/fid-1/test.jpg',
        expect.anything(),
      );
      expect(mockRemoveObject).toHaveBeenCalledWith(
        'cos-quarantine-tid-1',
        '2026/06/fid-1/test.jpg',
      );
    });

    it('propagates copyObject error', async () => {
      mockBucketExists.mockResolvedValue(true);
      mockCopyObject.mockRejectedValue(new Error('copy failed'));
      await expect(svc.moveFromQuarantine('tid-1', 'key')).rejects.toThrow('copy failed');
    });
  });

  describe('deleteFromQuarantine', () => {
    it('removes object from quarantine bucket', async () => {
      mockRemoveObject.mockResolvedValue(undefined);
      await svc.deleteFromQuarantine('tid-1', 'key');
      expect(mockRemoveObject).toHaveBeenCalledWith('cos-quarantine-tid-1', 'key');
    });
  });
});
