// VendorIdentityRepository — platform.vendor_identities + platform.vendor_trading_relationships.
// These are CROSS-TENANT platform tables (no RLS, ADR-030), so access uses a plain PrismaClient —
// NOT TenantPrismaService (which is tenant-scoped). Same pattern as tenant.service / identity.service.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { readSubscriptionStatus } from '../tenant/public/plan-limits';

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

  /**
   * The identity for an e-mail, whatever its letter case (fix/vendor-reinvite-refuse): `Somchai@ACME.co` and
   * `somchai@acme.co` are one person, and an exact match let the second spelling become a second identity — and
   * so act for a second vendor of the tenant. The column's UNIQUE is case-sensitive, so rows from before this
   * change may differ only in case; the oldest is the one used.
   */
  async findIdentityByEmail(email: string): Promise<VendorIdentityRow | null> {
    const rows = await this.prisma.$queryRaw<VendorIdentityRow[]>`
      SELECT vendor_identity_id, email, display_name, keycloak_user_id, is_active
      FROM platform.vendor_identities WHERE lower(email) = lower(${email})
      ORDER BY created_at, vendor_identity_id
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  /**
   * Inserts the identity, or returns null when a row with this exact e-mail already exists — another request
   * inserted it between our find and this insert (fix/vendor-identity-upsert-race). A plain INSERT failed there
   * on `vendor_identities_email_key`, and the invitation answered 500.
   */
  async createIdentity(email: string, displayName: string): Promise<VendorIdentityRow | null> {
    const rows = await this.prisma.$queryRaw<VendorIdentityRow[]>`
      INSERT INTO platform.vendor_identities (email, display_name)
      VALUES (${email}, ${displayName})
      ON CONFLICT (email) DO NOTHING
      RETURNING vendor_identity_id, email, display_name, keycloak_user_id, is_active
    `;
    return rows[0] ?? null;
  }

  /**
   * Get-or-create the network identity for an invited email. Found first — the lookup ignores case, so a row from
   * before the e-mail was lower-cased is still the one used; then inserted; and when a concurrent request won the
   * insert, found again (that row is committed: ON CONFLICT DO NOTHING waits for the other insert to finish).
   */
  async upsertIdentity(email: string, displayName: string): Promise<VendorIdentityRow> {
    const found = await this.findIdentityByEmail(email);
    if (found) return found;
    const created = await this.createIdentity(email, displayName);
    if (created) return created;
    const winner = await this.findIdentityByEmail(email);
    if (!winner) {
      // Inserted by another request and gone again before we read it — not expected; fail loudly, not silently.
      throw new Error('vendor identity conflicted on insert but could not be read back');
    }
    return winner;
  }

  /**
   * The identity's trading relationship with this tenant, for this vendor: created, or re-activated when it
   * already names the same vendor. One identity acts for one vendor of a tenant (product owner, 2026-11-16):
   * when the tenant's relationship with this identity names ANOTHER vendor — active or revoked — nothing is
   * written and null is returned, so the caller refuses the invitation (fix/vendor-reinvite-refuse). It used to
   * re-activate the row and keep its old vendor, so the person's quotations were filed under the first vendor.
   * One statement: two invitations racing cannot both pass.
   */
  async createRelationship(
    vendorIdentityId: string,
    tenantId: string,
    vendorId: string,
  ): Promise<TradingRelationshipRow | null> {
    const rows = await this.prisma.$queryRaw<TradingRelationshipRow[]>`
      INSERT INTO platform.vendor_trading_relationships (vendor_identity_id, tenant_id, vendor_id)
      VALUES (${vendorIdentityId}::uuid, ${tenantId}::uuid, ${vendorId}::uuid)
      ON CONFLICT (tenant_id, vendor_identity_id) DO UPDATE SET status = 'ACTIVE'
        WHERE vendor_trading_relationships.vendor_id = EXCLUDED.vendor_id
      RETURNING relationship_id, vendor_identity_id, tenant_id, vendor_id, status
    `;
    return rows[0] ?? null;
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
  /** subscription_status of the tenant a vendor is acting in (§7.10) — read through the tenant module's helper. */
  async tenantSubscriptionStatus(tenantId: string): Promise<string | null> {
    return readSubscriptionStatus(this.prisma, tenantId);
  }

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
