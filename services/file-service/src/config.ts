// File Service — typed environment config
// All values injected at runtime via AWS Secrets Manager / Vault (QM-4)

export interface FileServiceConfig {
  port: number;
  nodeEnv: string;
  database: {
    url: string;
  };
  minio: {
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
  };
  clamav: {
    host: string;
    port: number;
    timeoutMs: number;
  };
  opensearch: {
    host: string;
  };
  kafka: {
    brokers: string[];
    clientId: string;
  };
  temporal: {
    address: string;
  };
  signedUrlTtlSeconds: number;
}

export function loadConfig(): FileServiceConfig {
  return {
    // Dedicated port — the shared PORT (3000) is the backend; web is 3001. File-service uses its own
    // FILE_SERVICE_PORT (default 3002) so the three don't collide under `turbo run dev --parallel`.
    port: parseInt(process.env['FILE_SERVICE_PORT'] ?? '3002', 10),
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
    database: {
      url: requireEnv('DATABASE_URL'),
    },
    minio: {
      endPoint: process.env['MINIO_ENDPOINT'] ?? 'localhost',
      port: parseInt(process.env['MINIO_PORT'] ?? '9100', 10),
      useSSL: process.env['MINIO_USE_SSL'] === 'true',
      // MinIO uses the server root credentials as the S3 access/secret key. The canonical env names
      // are MINIO_ROOT_USER / MINIO_ROOT_PASSWORD (docker-compose + .env) — not MINIO_ACCESS_KEY.
      accessKey: requireEnv('MINIO_ROOT_USER'),
      secretKey: requireEnv('MINIO_ROOT_PASSWORD'),
    },
    clamav: {
      host: process.env['CLAMAV_HOST'] ?? 'clamav',
      port: parseInt(process.env['CLAMAV_PORT'] ?? '3310', 10),
      timeoutMs: parseInt(process.env['CLAMAV_TIMEOUT_MS'] ?? '60000', 10),
    },
    opensearch: {
      host: process.env['OPENSEARCH_HOST'] ?? 'http://localhost:9200',
    },
    kafka: {
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
      clientId: 'file-service',
    },
    temporal: {
      address: process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233',
    },
    signedUrlTtlSeconds: parseInt(process.env['SIGNED_URL_TTL_SECONDS'] ?? '3600', 10),
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is not set`);
  return value;
}
