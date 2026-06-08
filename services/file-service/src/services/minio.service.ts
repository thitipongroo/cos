// MinioService — per-tenant bucket management and signed URL generation.
// Bucket naming: cos-{tenant_id} (one bucket per tenant, spec §Phase 9).
// Quarantine: cos-quarantine-{tenant_id} (separate bucket; 30-day retention).
// Signed URL TTL: 1 hour by default (configurable via SIGNED_URL_TTL_SECONDS).

import * as Minio from 'minio';
import type { FileServiceConfig } from '../config';

export class MinioService {
  private readonly client: Minio.Client;
  private readonly ttlSeconds: number;

  constructor(config: FileServiceConfig) {
    this.client = new Minio.Client({
      endPoint: config.minio.endPoint,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
    this.ttlSeconds = config.signedUrlTtlSeconds;
  }

  bucketName(tenantId: string): string {
    return `cos-${tenantId}`;
  }

  quarantineBucketName(tenantId: string): string {
    return `cos-quarantine-${tenantId}`;
  }

  async ensureBucket(tenantId: string): Promise<void> {
    const bucket = this.bucketName(tenantId);
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      await this.client.makeBucket(bucket, 'ap-southeast-1');
    }
  }

  async ensureQuarantineBucket(tenantId: string): Promise<void> {
    const bucket = this.quarantineBucketName(tenantId);
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      await this.client.makeBucket(bucket, 'ap-southeast-1');
    }
  }

  async uploadFile(params: {
    tenantId: string;
    storedKey: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<void> {
    const bucket = this.bucketName(params.tenantId);
    await this.ensureBucket(params.tenantId);
    await this.client.putObject(bucket, params.storedKey, params.buffer, params.buffer.length, {
      'Content-Type': params.mimeType,
    });
  }

  async getSignedUrl(tenantId: string, storedKey: string): Promise<string> {
    const bucket = this.bucketName(tenantId);
    return this.client.presignedGetObject(bucket, storedKey, this.ttlSeconds);
  }

  async deleteFile(tenantId: string, storedKey: string): Promise<void> {
    const bucket = this.bucketName(tenantId);
    await this.client.removeObject(bucket, storedKey);
  }

  // Copies file from cos-{tenantId} to cos-quarantine-{tenantId}, then removes original.
  async moveToQuarantine(tenantId: string, storedKey: string): Promise<void> {
    const srcBucket = this.bucketName(tenantId);
    const destBucket = this.quarantineBucketName(tenantId);
    await this.ensureQuarantineBucket(tenantId);
    await this.client.copyObject(destBucket, storedKey, `/${srcBucket}/${storedKey}`);
    await this.client.removeObject(srcBucket, storedKey);
  }

  // Copies file from cos-quarantine-{tenantId} back to cos-{tenantId}, then removes quarantine copy.
  async moveFromQuarantine(tenantId: string, storedKey: string): Promise<void> {
    const srcBucket = this.quarantineBucketName(tenantId);
    const destBucket = this.bucketName(tenantId);
    await this.ensureBucket(tenantId);
    await this.client.copyObject(destBucket, storedKey, `/${srcBucket}/${storedKey}`);
    await this.client.removeObject(srcBucket, storedKey);
  }

  // Permanently removes a file from the quarantine bucket (30-day retention purge).
  async deleteFromQuarantine(tenantId: string, storedKey: string): Promise<void> {
    const bucket = this.quarantineBucketName(tenantId);
    await this.client.removeObject(bucket, storedKey);
  }
}
