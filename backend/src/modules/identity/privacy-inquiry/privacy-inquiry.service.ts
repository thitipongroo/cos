// Privacy inquiries lodged from the PRE-AUTH Privacy Policy screen (ADR-091).
//
// NOT TenantPrismaService. That service reads the tenant from CLS and throws "Tenant context missing"
// when there is none — and there is none here by design: the sender has no account and may not know
// which organisation on this platform holds their data (ADR-091 §1). `platform.privacy_inquiries` is
// the one platform table with no `tenant_id` and no RLS policy, so it is reached with a plain client
// on the app_user role, exactly as ConsentService and DataExportService reach their platform tables.
//
// app_user, not the bootstrap superuser: `cos` bypasses RLS even under FORCE ROW LEVEL SECURITY, and
// a service that happens not to need RLS today must still never hold a connection that ignores it.

import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { createPrismaClient } from '../../../shared/prisma/create-prisma-client';
import { appDatabaseUrl } from '../../../shared/prisma/app-database-url';
import { createLogger } from '@cos/logger';
import type { CreatePrivacyInquiryDto } from './dto/create-privacy-inquiry.dto';

const logger = createLogger('privacy-inquiry');

/**
 * Crockford base32 minus the vowels that make an unintended word, and minus the characters a person
 * mis-copies off a screen: no I/L/O (1/0), no U. The reference is read aloud and retyped into an
 * email, which is the whole reason it is not the UUID.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * `REQ-XXXX-XXXX` — 40 bits of randomness, not a sequence.
 *
 * A monotonic public reference discloses how many inquiries the platform receives, and lets anyone
 * holding two references measure the rate between them. Randomness costs nothing here: the column is
 * UNIQUE, and a collision is retried rather than tolerated.
 */
function generateReference(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `REQ-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

/** Collisions to absorb before an error is treated as real. See the loop in `create`. */
const MAX_REFERENCE_ATTEMPTS = 3;

export interface PrivacyInquiryReceipt {
  reference: string;
  received_at: string;
}

@Injectable()
export class PrivacyInquiryService implements OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient(appDatabaseUrl());

  /** ADR-034 / Rule 39 — close the query-engine socket on shutdown. */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * Accept an inquiry from an unauthenticated sender.
   *
   * Returns ONLY the reference and the timestamp. Nothing the sender supplied is echoed back: an
   * endpoint that reflects its input is a free oracle for probing what the platform stores, and the
   * sender already has everything they typed.
   */
  async create(dto: CreatePrivacyInquiryDto): Promise<PrivacyInquiryReceipt> {
    // Retry only the collision. `reference` is UNIQUE and 40 bits is far more than this table will
    // ever need, so a second attempt is already vanishingly unlikely and a third is not worth
    // pretending to handle — after it, the error is real and should surface.
    //
    // `for (;;)` rather than a counted loop with a throw after it: a counted loop leaves a trailing
    // statement the compiler needs and no test can reach, and QM-1's 100% line gate has no exemption
    // for "unreachable by construction". Here the only exits are the return and the rethrow, both
    // covered.
    for (let attempt = 1; ; attempt++) {
      const reference = generateReference();
      try {
        const row = await this.prisma.privacyInquiry.create({
          data: {
            reference,
            senderName: dto.full_name,
            senderEmail: dto.email,
            ...(dto.phone === undefined ? {} : { senderPhone: dto.phone }),
            ...(dto.category === undefined ? {} : { category: dto.category }),
            subject: dto.subject,
            message: dto.message,
          },
          select: { reference: true, receivedAt: true },
        });
        // No PII in the log line (QM-8): the reference is the handle, and it resolves to the row for
        // anyone entitled to read it.
        logger.info({ reference: row.reference }, 'privacy inquiry received');
        return { reference: row.reference, received_at: row.receivedAt.toISOString() };
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === MAX_REFERENCE_ATTEMPTS) throw err;
      }
    }
  }

  /** The SYSTEM_ADMIN triage queue, oldest first — the order a deadline is worked in. */
  async list(status?: string): Promise<unknown[]> {
    return this.prisma.privacyInquiry.findMany({
      where: status === undefined ? {} : { status: status as never },
      orderBy: { receivedAt: 'asc' },
    });
  }

  /** One inquiry, by the reference the sender was given. */
  async findByReference(reference: string): Promise<unknown> {
    const row = await this.prisma.privacyInquiry.findUnique({ where: { reference } });
    if (!row) throw new NotFoundException('No inquiry with that reference');
    return row;
  }
}

/** Prisma's unique-constraint code, checked without importing the error class into the hot path. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
