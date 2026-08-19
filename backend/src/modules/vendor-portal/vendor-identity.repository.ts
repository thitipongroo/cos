// VendorIdentityRepository — platform.vendor_identities + platform.vendor_trading_relationships.
// These are CROSS-TENANT platform tables (no RLS, ADR-030), so access uses a plain PrismaClient —
// NOT TenantPrismaService (which is tenant-scoped). Same pattern as tenant.service / identity.service.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';

export interface VendorIdentityRow {
  vendor_identity_id: string;
  email: string;
  display_name: string;
  keycloak_user_id: string | null;
  is_active: boolean;
}

export interface TradingRelationshipRow {
  relationship_id: string;
  vendor_identity_id: string;
  tenant_id: string;
  vendor_id: string;
  status: 'ACTIVE' | 'REVOKED';
}

@Injectable()
export class VendorIdentityRepository implements OnModuleDestroy {
  private readonly prisma = createPrismaClient();

  /** Close the Prisma connection on shutdown so the query-engine socket does not leak. */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async findIdentityByEmail(email: string): Promise<VendorIdentityRow | null> {
    const rows = await this.prisma.$queryRaw<VendorIdentityRow[]>`
      SELECT vendor_identity_id, email, display_name, keycloak_user_id, is_active
      FROM platform.vendor_identities WHERE email = ${email}
    `;
    return rows[0] ?? null;
  }

  async createIdentity(email: string, displayName: string): Promise<VendorIdentityRow> {
    const rows = await this.prisma.$queryRaw<VendorIdentityRow[]>`
      INSERT INTO platform.vendor_identities (email, display_name)
      VALUES (${email}, ${displayName})
      RETURNING vendor_identity_id, email, display_name, keycloak_user_id, is_active
    `;
    return rows[0];
  }

  /** Get-or-create the network identity for an invited email. */
  async upsertIdentity(email: string, displayName: string): Promise<VendorIdentityRow> {
    return (
      (await this.findIdentityByEmail(email)) ?? (await this.createIdentity(email, displayName))
    );
  }

  async createRelationship(
    vendorIdentityId: string,
    tenantId: string,
    vendorId: string,
  ): Promise<TradingRelationshipRow> {
    const rows = await this.prisma.$queryRaw<TradingRelationshipRow[]>`
      INSERT INTO platform.vendor_trading_relationships (vendor_identity_id, tenant_id, vendor_id)
      VALUES (${vendorIdentityId}::uuid, ${tenantId}::uuid, ${vendorId}::uuid)
      ON CONFLICT (tenant_id, vendor_identity_id) DO UPDATE SET status = 'ACTIVE'
      RETURNING relationship_id, vendor_identity_id, tenant_id, vendor_id, status
    `;
    return rows[0];
  }

  /**
   * Active relationship for a vendor in a specific tenant (Tier-2 authorization).
   *
   * The JOIN onto vendor_identities is load-bearing, not decoration. A Tier-2 session token is a
   * stateless 7-day HMAC with no server-side revocation, so every request must re-derive the
   * vendor's standing from the database — the same reason KeycloakJwtStrategy re-reads
   * platform.users.is_active on each call instead of trusting the token's claims (ADR-077, findings
   * F1b/F2b). Only the RELATIONSHIP status was checked here, so `vendor_identities.is_active` was a
   * column nothing enforced: disabling a vendor across the network left every outstanding session
   * token working for up to a week, and an operator reading the schema would reasonably believe
   * otherwise. Revoking per-tenant (status) and disabling network-wide (is_active) are different
   * actions, and both must land.
   */
  async findActiveRelationship(
    vendorIdentityId: string,
    tenantId: string,
  ): Promise<TradingRelationshipRow | null> {
    const rows = await this.prisma.$queryRaw<TradingRelationshipRow[]>`
      SELECT r.relationship_id, r.vendor_identity_id, r.tenant_id, r.vendor_id, r.status
      FROM platform.vendor_trading_relationships r
      JOIN platform.vendor_identities i
        ON i.vendor_identity_id = r.vendor_identity_id
       AND i.is_active = true
      WHERE r.vendor_identity_id = ${vendorIdentityId}::uuid
        AND r.tenant_id = ${tenantId}::uuid AND r.status = 'ACTIVE'
    `;
    return rows[0] ?? null;
  }
}
