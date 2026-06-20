// VendorIdentityRepository — platform.vendor_identities + platform.vendor_trading_relationships.
// These are CROSS-TENANT platform tables (no RLS, ADR-030), so access uses a plain PrismaClient —
// NOT TenantPrismaService (which is tenant-scoped). Same pattern as tenant.service / identity.service.

import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

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
export class VendorIdentityRepository {
  private readonly prisma = new PrismaClient();

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

  /** Active relationship for a vendor in a specific tenant (Tier-2 authorization). */
  async findActiveRelationship(
    vendorIdentityId: string,
    tenantId: string,
  ): Promise<TradingRelationshipRow | null> {
    const rows = await this.prisma.$queryRaw<TradingRelationshipRow[]>`
      SELECT relationship_id, vendor_identity_id, tenant_id, vendor_id, status
      FROM platform.vendor_trading_relationships
      WHERE vendor_identity_id = ${vendorIdentityId}::uuid
        AND tenant_id = ${tenantId}::uuid AND status = 'ACTIVE'
    `;
    return rows[0] ?? null;
  }
}
