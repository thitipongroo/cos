export const documentDirectory = '/mock/documents/';
export const cacheDirectory = '/mock/cache/';

export enum FileSystemUploadType {
  BINARY_CONTENT = 0,
  MULTIPART = 1,
}

export const uploadAsync = jest
  .fn()
  .mockResolvedValue({ status: 200, body: '{"file_id":"server-file-id"}' });
export const deleteAsync = jest.fn().mockResolvedValue(undefined);
export const getInfoAsync = jest.fn().mockResolvedValue({ exists: true, size: 1024 });
export const makeDirectoryAsync = jest.fn().mockResolvedValue(undefined);
