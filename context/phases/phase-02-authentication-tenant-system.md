# Phase 2 — Authentication + Tenant System

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 1 · SaaS Maturity Stage 1.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build Identity Service and Tenant Service.

Authentication Decision (TWO PATHS — from file 01):

  ONE ACCOUNT, ONE PATH (PO decision 2026-08-23, superseding "unified login" in part —
  spec §5.4.4, ADR-017). Role does not bind the path: any role may be PROVISIONED on either,
  except the two below. What no account can do is hold both identifiers. Keycloak stores one
  password credential per user and Path A overwrites it on every OTP login, so an account on
  both paths loses its password to its own login — measured on 26.6.4, and irreversible because
  the stored hash cannot be read back. Token exchange cannot avoid it either: the standard V2
  grant refuses `requested_subject`, and the legacy variant that accepts it is PREVIEW +
  deprecated. POST /api/v1/users rejecting both identifiers is the design, not a gap.

  Path A — Phone number + SMS OTP:
    Who:      ANY role EXCEPT TENANT_ADMIN and FINANCE (spec §5.4.4, PO decision 2026-08-21).
              Those two are Path B only: Direct Grant cannot carry the ADR-067 MFA condition,
              and NIST SP 800-63B Rev 4 makes SMS a restricted authenticator below AAL2.
    Method:   Phone number + SMS OTP
    Rationale: "No password to forget" — field workers must never be required
               to remember a password (file 01 §A). That is why the path exists; since
               2026-08-21 it is not restricted to them.
    Session:  JWT access token (15 min) + refresh token, issued by Keycloak via Direct Grant
              (grant_type=password) after OTP verification succeeds. The grant asks for
              scope=offline_access, so the refresh token does not expire (typ=Offline,
              refresh_expires_in=0) and the offline session idles out after 30 days.
    Offline:  30 days without internet; the handset re-validates silently on reconnect with no
              new SMS. CORRECTED 2026-08-23 (TDD OQ-14): this line said 7 days, and the realm
              delivered THIRTY MINUTES. The 7 days is ssoSessionMaxLifespan, a ceiling; what
              actually killed the session was ssoSessionIdleTimeout=1800, measured as
              refresh_expires_in=1800 on Keycloak 26.6.4. A worker who lost signal for half an
              hour came back to a dead refresh token and had to redo SMS OTP — on a site where
              the reason they were offline is that there is no signal to receive an SMS on.
              offline_access closes it; the mobile OFFLINE_SESSION_TTL_MS is matched to the same
              30 days so the local session and the token expire together.
              PATH A ONLY — a non-expiring refresh token belongs on a field handset, not in an
              office browser tab. Revocation still works: enabled=false blocks an offline refresh
              (measured), and both disableUser and eraseUser set it before logging the user out.
    Biometric: OPTIONAL — device-side Face ID/fingerprint unlock after first login

  Path B — Email + password via Keycloak OIDC:
    Who:      ANY role. REQUIRED for TENANT_ADMIN and FINANCE (spec §5.4.4).
    Method:   Email + password via Keycloak
    Protocol: OpenID Connect (OIDC) over OAuth2
    Token:    JWT (RS256 signed by Keycloak)
    Session:  Access token TTL 15 min, refresh token TTL 7 days
    MFA:      REQUIRED for TENANT_ADMIN and FINANCE (TOTP)

  SMS OTP Service:
    Implementation: Custom lightweight NestJS module within monolith (identity module)
    OTP send/verify: custom NestJS logic — NOT a Keycloak extension
    Token issuance: Keycloak Direct Grant (grant_type=password) after successful OTP verification
      — ephemeral credential set via Keycloak Admin API, used once, then discarded
    SMS Gateway provider: cloud = AWS SNS (ap-southeast-1)
      Implementation: AWS SDK v3 @aws-sdk/client-sns — SNSClient.publish()
      On-prem: pluggable SmsSender provider (in-country aggregator / SMPP / customer gateway) — ADR-040
      Interface: { sendOTP(phoneNumber: string, otp: string): Promise<void> }
      Fallback: Thai SMS fallback when +66 delivery rate < 95%
      Pre-launch: submit AWS Support case to exit SMS sandbox (1-2 business days)
    OTP: 6-digit numeric, TTL 5 minutes, max 3 attempts per session
    Rate limit: 10 OTP requests per phone per day

  Future SSO hook: Keycloak SAML 2.0 IdP configuration (admin console, no code change); configure per tenant realm when enterprise customer with existing IdP onboards

RBAC Role Definitions (authoritative — all modules must use these):
  Spec §6.2 roles (9 — seeded at tenant provisioning per spec §6.6):
  SYSTEM_ADMIN        — Platform admin (cross-tenant; NOT provisioned to any tenant per spec §6.7)
  TENANT_ADMIN        — Tenant administrator (full access within tenant)
  EXECUTIVE           — Company owner or C-level; sees all projects and financial data
  PROJECT_MANAGER     — Full access to assigned projects
  PROCUREMENT_OFFICER — Procurement data entry, RFQ, PO, vendors, and deliveries
  FINANCE             — Cost, billing, payments, and cash flow
  SAFETY_OFFICER      — Safety checklists, incidents, and compliance
  SITE_ENGINEER       — Site operations and daily field work
  CRM_SALES_MANAGER   — Leads, opportunities, and customer accounts

  Implementation sub-roles (not in spec §6.2; defined for implementation granularity):
  PROC_MANAGER  — Procurement approval authority tier (above PROCUREMENT_OFFICER)
  SITE_WORKER   — Site operations read + report submission (field worker sub-role)
  VIEWER        — Read-only across all modules (per project assignment)

  External principals (NOT a CosRole — external network users, spec §6.8b / ADR-030):
  VENDOR_PORTAL — vendor-network users on the Vendor Portal; authenticated via magic-link (Tier 1)
                  or a vendor session token (Tier 2), scoped by platform.vendor_trading_relationships
                  (NOT tenant RLS). Never provisioned to a tenant.

Permission granularity: resource:action (e.g. project:read, boq:write)
RBAC enforcement: NestJS Guards using JWT claims
Tenant isolation: shared-db + tenant_id + RLS (see below) — tenant resolved in JWT auth (strategy.validate → JwtAuthGuard publishes to CLS; TenantContextInterceptor projects to req.* as secondary), TenantPrismaService (singleton) reads CLS + sets app.current_tenant_id as app_user (ADR-031)

Authorization: RBAC + ABAC (from source §13.2):
  RBAC (Role-Based Access Control):
    - Role assigned per user per tenant (roles defined above)
    - Enforced via NestJS Guards + JWT claims

  ABAC (Attribute-Based Access Control):
    - Required attributes checked on every resource access:
        project_membership: user must be member of project_id in request context
        tenant_match:       user's tenant must match resource's tenant (always)
        resource_ownership: for PATCH/DELETE, user must be creator OR have manager role
    - Implementation: NestJS PolicyGuard (custom, separate from RolesGuard)
    - Advanced configurable policies: custom NestJS PolicyGuard (swap in via DI when triggered)

Tenant Isolation Model (FINAL — spec §7, §7.7, §21-mvp-scope):
  Model: Shared DB + tenant_id + PostgreSQL RLS (SMB tier, MVP baseline)
  Rationale: Industry-standard SaaS pattern. Simpler operations (one migration run).
             Enables cross-tenant analytics for AI features. RLS enforces isolation at DB level.

  Implementation:
    - One PostgreSQL database (shared across all tenants)
    - One named PostgreSQL schema per domain module (global, not per-tenant):
        platform, projects, boq, procurement, site_ops, finance, files,
        notifications, equipment, workforce, ai, equipment_telemetry, workforce_telemetry,
        digital_twin (TimescaleDB, Phase 24 — see spec §7.7, §11.0, §33.4)
    - tenant_id UUID NOT NULL on every domain table (platform tables exempt)
    - All SQL must use schema-qualified names: procurement.vendors, finance.project_budgets
    - PostgreSQL RLS enabled on every domain table (MANDATORY, spec §7.7 + §9.7.3):
        SET LOCAL app.current_tenant_id = '{tenant_id}' at request start
        ENABLE and FORCE must be applied TOGETHER (FORCE = table owner cannot bypass RLS):
          ALTER TABLE {schema}.{table} ENABLE ROW LEVEL SECURITY;
          ALTER TABLE {schema}.{table} FORCE ROW LEVEL SECURITY;
          -- Exactly ONE policy per domain table, AS PERMISSIVE, named rls_tenant_isolation (ADR-031).
          -- NOT RESTRICTIVE: a lone RESTRICTIVE policy grants no access; NULLIF guards an empty/unset GUC.
          CREATE POLICY rls_tenant_isolation ON {schema}.{table}
            AS PERMISSIVE
            FOR ALL
            TO app_user
            USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
            WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);
        The application role (app_user) must NEVER be granted BYPASSRLS (spec §9.7.3).
        RLS migration rollback must DISABLE ROW LEVEL SECURITY and DROP POLICY for every policy created.
    - Application layer also filters WHERE tenant_id = $1 as secondary defense-in-depth
    - Migrations run once (not per-tenant) — CREATE SCHEMA IF NOT EXISTS {schema}
    - identity module tables live in schema "platform" (cross-tenant, no RLS needed)

  ORM configuration (Prisma):
    - Prisma multiSchema: schemas listed in datasource.schemas
    - Raw SQL via $queryRaw / $executeRaw using schema-qualified table names
    - No TenantPrismaService search_path routing — tenant isolation via RLS + tenant_id

  Future model — Dedicated DB (ENTERPRISE plan):
    Trigger: tenant.dedicated_db_url IS NOT NULL

Secret Management: conditional per deployment type (spec §5.2)
  Cloud (AWS EKS):   AWS Secrets Manager — External Secrets Operator syncs SM secrets → K8s Secret → pod env
  On-premise/hybrid: HashiCorp Vault 1.16+ — Vault Agent sidecar injector
  Local dev:         HashiCorp Vault: dev mode container (Docker Compose)
  Secret injection: environment variables at pod startup (both paths)
  Dynamic secrets: cloud → AWS SM rotation Lambda (per resource type); on-prem → Vault DB engine (PostgreSQL TTL 24h)

Entities (PostgreSQL — all in schema: platform):
  tenants:
    tenant_id        UUID PK DEFAULT gen_random_uuid()
    tenant_code      VARCHAR(50) UNIQUE NOT NULL
    tenant_name      VARCHAR(255) NOT NULL
    keycloak_realm   VARCHAR(100) UNIQUE NOT NULL
    plan_type        ENUM('STARTER','PROFESSIONAL','ENTERPRISE') NOT NULL
    is_active        BOOLEAN DEFAULT true
    dedicated_db_url VARCHAR(500) NULL  -- NULL = shared DB; non-NULL = enterprise dedicated DB URL
    data_region      VARCHAR(20) NOT NULL DEFAULT 'ap-southeast-1'  -- data-residency region; Thai→ap-southeast-7, EU→eu-west-1, default→ap-southeast-1 (spec §5.6); immutable after first write
    created_at       TIMESTAMPTZ DEFAULT now()
    updated_at       TIMESTAMPTZ DEFAULT now()

  users:
    user_id         UUID PK DEFAULT gen_random_uuid()
    tenant_id       UUID FK → tenants NOT NULL
    keycloak_user_id VARCHAR(255) UNIQUE NOT NULL  -- a Keycloak UUID on BOTH paths; the phone lives in phone_number, not here
    email           VARCHAR(255) NOT NULL  -- Path A: empty string
    phone_number    VARCHAR(20) NULL  -- Path A identifier; UNIQUE only WHERE NOT NULL, so Path B users all leave it NULL
    display_name    VARCHAR(255) NOT NULL
    department      VARCHAR(255) NULL  -- free text for directory display; NOT a role and not an authorisation input
    photo_url       TEXT NULL  -- profile photo via the file service; NULL → clients show initials
    is_active       BOOLEAN DEFAULT true
    mfa_enabled     BOOLEAN DEFAULT false
    mfa_totp_secret VARCHAR(255) NULL  -- encrypted at rest (app-layer AES-256-GCM, ADR-035)
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()  -- touched by JwtAuthGuard per authenticated request
    created_at      TIMESTAMPTZ DEFAULT now()
    updated_at      TIMESTAMPTZ DEFAULT now()
    INDEX: (tenant_id, email)
    UNIQUE: (phone_number) WHERE phone_number IS NOT NULL

  tenant_memberships:
    membership_id   UUID PK
    tenant_id       UUID FK NOT NULL
    user_id         UUID FK NOT NULL
    role            ENUM(role list above) NOT NULL  -- the PRIMARY role; additional roles live in the next table
    assigned_at     TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, user_id)

  user_additional_roles:   -- roles held ALONGSIDE the primary; effective permissions are the UNION (spec §6.4.1)
    user_id         UUID FK → users NOT NULL
    tenant_id       UUID FK → tenants NOT NULL
    role            ENUM(role list above) NOT NULL  -- never duplicates the primary
    assigned_by     UUID NULL
    assigned_at     TIMESTAMPTZ DEFAULT now()
    PK: (user_id, tenant_id, role)
    INDEX: (user_id, tenant_id)
    Enforcement: RolesGuard falls back to this table when the JWT's primary role does not
                 satisfy an endpoint; PermissionsGuard unions ROLE_PERMISSIONS across all
                 roles held. Both keep a primary-role fast path, so the common request
                 never reads it. There are NO per-user permission overrides.

  audit_logs:
    log_id          UUID PK
    tenant_id       UUID NOT NULL (denormalized for query performance)
    actor_id        UUID NOT NULL
    action          VARCHAR(255) NOT NULL
    resource_type   VARCHAR(100) NOT NULL
    resource_id     UUID
    ip_address      INET
    user_agent      TEXT
    occurred_at     TIMESTAMPTZ DEFAULT now()
    metadata        JSONB
    INDEX: (tenant_id, occurred_at DESC)

Generate:

- Keycloak Docker Compose service with realm import template
    IMPORTANT: realm import template MUST include protocol mappers for tenant_id, user_id, role
    (see spec §05-security-compliance §5.4.2 and §07-multi-tenant-architecture §7.6 step 3)
- NestJS Identity Service: Keycloak adapter, JWT validation middleware
- NestJS Tenant Service: tenant CRUD, realm assignment on tenant create
    Realm model (spec §05 §5, §07 §7.6 step 3):
      STARTER/PROFESSIONAL → shared realm 'construction-os'
      ENTERPRISE → dedicated realm 'cos-{tenantCode}' (Phase 25 EnterpriseProvisioningWorkflow)
- @cos/rbac package: role enum, permission map, NestJS guard decorators and metadata keys
    (@cos/rbac contains: CosRole enum, ROLE_PERMISSIONS map, @Roles/@RequirePermissions decorators,
     ROLES_KEY/PERMISSIONS_KEY metadata constants — NOT concrete CanActivate implementations;
     concrete guards RolesGuard and PolicyGuard live in backend/src/shared/guards/ because they
     depend on JwtPayload and ExecutionContext which are application-layer concerns;
     source: spec §06-rbac-permission-matrix §6.9)
- PostgreSQL migration files for all entities above
- DTOs with class-validator decorators for all API inputs
- OpenAPI 3.1 specs — two separate files (QM-2: one file per service):
    docs/api/auth.openapi.yaml   — OTP request/verify, refresh, logout endpoints
    docs/api/tenant.openapi.yaml — tenant lifecycle endpoints (SYSTEM_ADMIN) AND
                                   user management endpoints (TENANT_ADMIN):
                                     GET  /api/v1/users                         — list users (paginated)
                                     POST /api/v1/users                         — create user (Path A: phone_number; Path B: email)
                                     PATCH /api/v1/users/{userId}/role          — change role
                                     PATCH /api/v1/users/{userId}/deactivate    — deactivate user
                                     GET  /api/v1/admin/tenants                 — list all tenants (SYSTEM_ADMIN, §20.4.1)
                                     POST /api/v1/admin/tenants                 — create tenant (SYSTEM_ADMIN, §20.4.2)
                                     PATCH /api/v1/admin/tenants/{id}/dedicated-db — attach dedicated DB → EnterpriseProvisioningWorkflow (SYSTEM_ADMIN, §20.4.3)
                                     PATCH /api/v1/admin/tenants/{id}/deactivate   — deactivate tenant (SYSTEM_ADMIN, §20.4.5)
                                     GET  /api/v1/tenant/settings               — get tenant settings (TENANT_ADMIN, ADR-028)
                                     PATCH /api/v1/tenant/settings              — update tenant settings (variance/retention/LINE/notif)
- Refresh token rotation flow
- MFA enrollment and verification endpoints (TOTP) — required for TENANT_ADMIN and FINANCE roles:
    POST /api/v1/auth/mfa/enroll    — initiate TOTP setup (returns QR code URI)
    POST /api/v1/auth/mfa/verify    — confirm TOTP code to complete enrollment
    POST /api/v1/auth/mfa/authenticate — verify TOTP during login (TENANT_ADMIN / FINANCE; Path B only per §5.4.4)
- Tenant isolation middleware
- Unit tests: guards, middleware, token validation
- Integration tests: full OTP auth flow with Testcontainers (PostgreSQL + Redis containers, real DB)
    Implemented in Phase 2 — NOT deferred to Phase 18
    Covers: requestOtp → verifyOtp → issueTokens (Keycloak Direct Grant) → refresh → logout
    packages: @testcontainers/postgresql, @testcontainers/redis (devDependencies)
- User management API (TENANT_ADMIN only — see spec §14.3 User Management APIs and §6.4):
    Module location: backend/src/modules/tenant/ (tenant module owns user lifecycle)
    Endpoints:
      GET    /api/v1/users                    — list users in tenant (paginated)
      POST   /api/v1/users                    — create user (Path A: phone; Path B: email+Keycloak)
      PATCH  /api/v1/users/:userId/role       — change the PRIMARY role (leaves additional roles untouched)
      GET    /api/v1/users/:userId/roles      — primary + additional roles
      PUT    /api/v1/users/:userId/roles      — set primary + additional set, replaced atomically
      PATCH  /api/v1/users/:userId/deactivate — deactivate user
    Service:  UserService (new — separate from TenantService)
    Guards:   JwtAuthGuard + RolesGuard (TENANT_ADMIN only)
    DTOs:     CreateUserDto, ChangeRoleDto (class-validator)
    Path A user creation (TWO STEPS — via KeycloakAdminService):
      Step 1 — Keycloak: KeycloakAdminService.provisionPhoneUser(phone, displayName, realm)
               POST /admin/realms/{realm}/users → get keycloakUserId
               PUT /admin/realms/{realm}/users/{id}/reset-password (ephemeral one-time credential)
               Set user attributes: tenant_id, user_id, role (see spec §5.4.2)
      Step 2 — COS: create platform.users record with keycloak_user_id = keycloakUserId
               create platform.tenant_memberships record; emit identity.user.created.v1
    Path B user creation (TWO STEPS — via KeycloakAdminService):
      Step 1 — Keycloak: KeycloakAdminService.createEmailUser(email, displayName, realm)
               POST /admin/realms/{realm}/users → get keycloakUserId
               Set user attributes: tenant_id, user_id, role (see spec §5.4.2)
      Step 2 — COS: create platform.users record with keycloak_user_id = keycloakUserId
               create platform.tenant_memberships record; emit identity.user.created.v1
    Keycloak Admin API integration implemented in Phase 2 — KD-AUTH-001 READY
    (see spec §32-implementation-specifications §32.8 for full implementation spec)

- Kafka events:

    identity.tenant.created.v1         { tenant_id, tenant_code, tenant_name, plan_type, dedicated_db_url? }
    identity.tenant.deactivated.v1     { tenant_id }
    platform.enterprise.contract_signed  { tenant_id, contract_reference? }  ← Phase 25; Admin Panel OR CRM webhook
    platform.enterprise.db_provisioned   { tenant_id, rds_endpoint }         ← Phase 25; EnterpriseProvisioningWorkflow completion
    identity.user.created.v1       { tenant_id, user_id, email, role }  ← emitted from POST /api/v1/users
    identity.user.role_changed.v1  { tenant_id, user_id, old_role, new_role }  ← emitted from PATCH /api/v1/users/:userId/role

npm packages required in backend/package.json — add BEFORE implementing (Rule 26):
  dependencies:    @nestjs/passport, @nestjs/jwt, passport, passport-jwt, @aws-sdk/client-sns, @keycloak/keycloak-admin-client
  devDependencies: @types/passport-jwt, @types/passport, @types/express, @testcontainers/postgresql, @testcontainers/redis

Constraints:

- No insecure auth patterns (no MD5 passwords, no symmetric JWT signing)
- No business logic in auth layer
- Enterprise-ready: stateless JWT validation, no server-side session store
- Keycloak must be the single source of truth for authentication
- Before marking Phase 2 complete: read every Generate item above line by line, run ls/grep
  to verify each exists on disk, show output — Rule 36

Decisions in Phase 2 (documented in spec):

  AdvancedABACPolicy:
    DECIDED: custom NestJS PolicyGuard; swap in via NestJS DI (no change to guard interface);
    implement when enterprise customer requires configurable per-tenant ABAC rules beyond
    default (project_membership, tenant_match, resource_ownership)

  EnterpriseSSOProvider:
    DECIDED: Keycloak Identity Provider configuration (admin console, no code change);
    configure SAML 2.0 IdP per tenant realm when enterprise customer with existing IdP
    (Active Directory, Okta, etc.) onboards; Keycloak supports SAML 2.0 out of the box

  DedicatedDBIsolation:
    DECIDED: 6-step process — (1) provision new RDS instance, (2) run migrations,
    (3) copy data from shared PostgreSQL schema, (4) update TenantPrismaService routing,
    (5) validate, (6) cut over; trigger: tenant.plan_type = ENTERPRISE AND dedicated DB requested

  BiometricCheckIn (spec §13.5):
    DECIDED: generic SDK interface — vendor SDK injected via DI at deployment time
    Interface: { verifyCheckIn(workerId, projectId, method: FINGERPRINT/FACE_ID/IRIS): Promise<boolean> }
    Each site configures their vendor adapter; credentials stored in AWS SM / Vault per-site
              this covers dedicated hardware scanners at site entry points
```
