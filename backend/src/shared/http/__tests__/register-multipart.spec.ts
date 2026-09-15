// Unit test — @fastify/multipart registration carries the import form's limits (ADR-061 amendment).

import multipart from '@fastify/multipart';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { IMPORT_MULTIPART_LIMITS } from '../register-multipart';
import { registerMultipart } from '../register-multipart';

describe('registerMultipart', () => {
  it('registers the plugin with the import limits and a throwing file-size limit', async () => {
    const app = { register: jest.fn().mockResolvedValue(undefined) };
    await registerMultipart(app as unknown as NestFastifyApplication);
    expect(app.register).toHaveBeenCalledWith(multipart, {
      limits: { ...IMPORT_MULTIPART_LIMITS },
      throwFileSizeLimit: true,
    });
    // Never the plugin's defaults: 1000 parts and a file as large as Fastify's bodyLimit.
    expect(IMPORT_MULTIPART_LIMITS.fileSize).toBe(5 * 1024 * 1024);
    expect(IMPORT_MULTIPART_LIMITS.parts).toBe(4);
  });
});
