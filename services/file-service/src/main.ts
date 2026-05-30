// Construction OS — File Service (Fastify)
// Phase 9: File + Document System
// Runtime: Fastify (extracted from monolith for multipart upload throughput)
// See: context/00_master_construction_os.md §Phase 9

import Fastify from 'fastify';
import multipart from '@fastify/multipart';

const app = Fastify({ logger: true });

app.register(multipart, {
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB max (CAD files)
  },
});

app.get('/health/live', async () => ({ status: 'ok', service: 'file-service' }));

// Phase 9 routes added here:
// POST /api/v1/files/upload
// GET  /api/v1/files/:fileId/url
// GET  /api/v1/files/:fileId
// DELETE /api/v1/files/:fileId

const port = parseInt(process.env['PORT'] ?? '3001', 10);
app.listen({ port, host: '0.0.0.0' });
