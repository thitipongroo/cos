import { MinioService } from '../services/minio.service';
import type { FileServiceConfig } from '../config';

const mockBucketExists = jest.fn();
const mockMakeBucket = jest.fn();
const mockPutObject = jest.fn();
const mockPresignedGet = jest.fn();
const mockRemoveObject = jest.fn();

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: mockBucketExists,
    makeBucket: mockMakeBucket,
    putObject: mockPutObject,
    presignedGetObject: mockPresignedGet,
    removeObject: mockRemoveObject,
  })),
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
});
