// Swagger plugin — OpenAPI 3.0 spec generation for dev UI.
// Static OpenAPI 3.1 spec is at docs/api/file.openapi.yaml (QM-2).

import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

export const swaggerPlugin = fp(async (app: FastifyInstance) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Construction OS — File Service',
        description: 'File upload, storage, and retrieval (Phase 9)',
        version: '1.0.0',
      },
      servers: [{ url: '/api/v1' }],
      components: {
        securitySchemes: {
          KongJWT: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT validated by Kong Gateway',
          },
        },
      },
      security: [{ KongJWT: [] }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });
});
