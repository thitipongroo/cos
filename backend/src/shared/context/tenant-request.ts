// The shape TenantMiddleware and the auth guards decorate an incoming request with.
//
// Lives in shared/ rather than in the tenant MODULE because every controller that reads the tenant
// off a request needs it, and importing it from modules/tenant/tenant.middleware reached past that
// module's public API — `exports:` lists providers, and an interface can never appear there
// (master:1608; four call sites in identity and workforce). shared/ is not a module, so this is the
// same placement spec §6.9 already gives the concrete guards.
//
// NOT packages/@cos/types: it extends the express Request, and mobile and web must not pull express
// types in to describe a server-side request (master:1712-1716 keeps Node-only packages out of the
// mobile tsconfig for the same reason).

import type { Request } from 'express';

export interface TenantRequest extends Request {
  tenantId?: string;
  tenantCode?: string;
  userId?: string;
  userRole?: string;
  dedicatedDbUrl?: string;
}
