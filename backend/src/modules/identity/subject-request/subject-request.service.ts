// Subject requests from people with NO platform account (ADR-090; PDPA-48).
//
// The tenant is the controller for CRM contacts, CRM leads and the named contact at a vendor;
// Construction OS is the processor. So this service does not answer a data subject — it gives the
// tenant's admin the three things a controller needs in order to answer: find the person, see what is
// held, and erase them. A request that arrives at Construction OS is routed to the tenant.
//
// WHY THE SEARCH IS BOUND TO A REQUEST ROW. A free lookup by email would answer "is this address one
// of your customers" to anyone with the tab open, which is both an enumeration surface and a use of
// the tenant's data for a purpose no data subject asked for. The request row is created first and
// every search cites it. That binding is the control — NOT a step-up from the admin, who is not the
// party whose identity is in question; GDPR Art 12(2)/12(6) makes over-verification an infringement
// in its own right rather than a free precaution.
//
// WHY ACCESS RETURNS INLINE AND NOT AN ARCHIVE. ADR-078's export is asynchronous because a worker's
// own record spans a dozen tables and years of rows. What is held about an external person is at most
// a handful of rows across three tables, and it goes to the TENANT (who then answers the subject in
// whatever form it agreed), not to the subject over a mailed link. A second async archive pipeline
// would add a File Service round trip and an expiry sweep to move a payload that fits in a response.

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { createLogger } from '@cos/logger';
import {
  SubjectRequestRepository,
  type SubjectMatch,
  type SubjectRequestRow,
} from './subject-request.repository';
import type { CreateSubjectRequestDto } from './dto/create-subject-request.dto';
import type { CloseSubjectRequestDto } from './dto/close-subject-request.dto';
import type { EraseSubjectRequestDto } from './dto/erase-subject-request.dto';
import { FileServiceClient } from '../../files/file-service-client.service';
import { FileLegalHoldService } from '../../files/file-legal-hold.service';
import { SubjectVerificationService } from './subject-verification.service';
import { SendGridAdapter } from '../../notification/adapters/sendgrid.adapter';
import { KeycloakAdminService } from '../keycloak-admin.service';

const logger = createLogger('subject-request');

export interface SubjectMatchResult {
  request_id: string;
  matches: SubjectMatch[];
  /** True when the request carries an email but the tenant holds leads reachable only by name. */
  note: string | null;
}

export interface ErasureResult {
  request_id: string;
  anonymised: {
    contacts: number;
    leads: number;
    vendors: number;
    workers: number;
    users: number;
  };
  total: number;
  /** File id of the pre-anonymisation snapshot, when a legal hold was asked for. */
  archived_file_id: string | null;
  /**
   * COS user ids whose DATABASE row was anonymised but whose KEYCLOAK account was not (TDD OQ-48).
   *
   * Normally empty. A non-empty list means the person is erased in Construction OS and still named
   * and able to log in at the identity provider — the erasure is incomplete and someone has to
   * finish it by hand. It is surfaced rather than thrown because the database half cannot be undone.
   */
  keycloak_erase_failed: string[];
}

@Injectable()
export class SubjectRequestService {
  constructor(
    private readonly repo: SubjectRequestRepository,
    private readonly files: FileServiceClient,
    private readonly legalHold: FileLegalHoldService,
    private readonly verification: SubjectVerificationService,
    private readonly email: SendGridAdapter,
    private readonly keycloak: KeycloakAdminService,
  ) {}

  async create(dto: CreateSubjectRequestDto, actorId: string): Promise<SubjectRequestRow> {
    // The DTO's ValidateIf pair already rejects "neither", and the DB CHECK rejects it again. This
    // third guard exists because both of those describe the SHAPE of the payload: a caller can
    // satisfy them with whitespace, which would create a row authorising a search that matches
    // nothing and reads afterwards as "the tenant holds nothing about this person".
    const email = normalise(dto.subject_email);
    const phone = normalise(dto.subject_phone);
    if (email === null && phone === null) {
      throw new BadRequestException('subject_email or subject_phone is required');
    }

    // `received_at` starts the PDPA §30 clock and cannot be in the future: a future receipt date
    // would push the deadline out, and nothing else in the row would show it had been done.
    const receivedAt = new Date(dto.received_at);
    if (receivedAt.getTime() > Date.now()) {
      throw new BadRequestException('received_at cannot be in the future');
    }

    return this.repo.create({
      request_type: dto.request_type,
      subject_email: email,
      subject_phone: phone,
      received_at: receivedAt,
      opened_by: actorId,
      note: normalise(dto.note),
    });
  }

  list(status?: string): Promise<SubjectRequestRow[]> {
    return this.repo.list(status);
  }

  /**
   * What the tenant holds about the subject of this request.
   *
   * Reads the identifiers from the REQUEST ROW, never from the caller's query string — that is what
   * makes the row the authorisation rather than a label attached to a search someone else chose.
   */
  async findMatches(requestId: string, actorId: string): Promise<SubjectMatchResult> {
    const request = await this.mustFindOpen(requestId);

    const matches = await this.repo.findMatches(request.subject_email, request.subject_phone);
    await this.repo.writeAudit({
      actorId,
      action: 'SEARCH /api/v1/subject-requests/:id/matches',
      requestId,
      matches: matches.length,
    });
    logger.info({ requestId, matches: matches.length }, 'subject-request.search');

    return {
      request_id: requestId,
      matches,
      note: matches.length === 0 ? EMPTY_RESULT_NOTE : null,
    };
  }

  /**
   * Anonymise in place (QM-5; ADR-090 §5).
   *
   * ERASURE requests only. Running this from an ACCESS request would destroy data the subject asked
   * to SEE, and no undo exists — anonymisation is irreversible by design, which is the point.
   */
  async erase(
    requestId: string,
    dto: EraseSubjectRequestDto,
    actorId: string,
  ): Promise<ErasureResult> {
    const request = await this.mustFindOpen(requestId);
    if (request.request_type !== 'ERASURE') {
      throw new BadRequestException('request_type must be ERASURE to anonymise');
    }

    // VERIFICATION GATES THE IRREVERSIBLE STEP. Anonymisation cannot be undone, so acting on an
    // unproved request risks destroying a real person's record on a stranger's say-so. Regulators
    // describe the same shape: processing pauses while verification is pending and proceeds once it
    // is confirmed. Disclosure (`matches`) stays open before verification because the operator needs
    // it to find the address to challenge — and it is read by the tenant, not handed to the subject.
    if (request.verified_at === null) {
      throw new BadRequestException(
        'Subject identity is not verified — send the verification link before anonymising',
      );
    }

    // THE SNAPSHOT IS TAKEN BEFORE THE UPDATE, or it is not a pre-image at all. Anonymisation is
    // irreversible, so there is exactly one moment when the values still exist to be archived.
    const archivedFileId =
      dto.legal_hold === true
        ? await this.archiveUnderHold(request, dto.legal_hold_reason!, actorId)
        : null;

    const anonymised = await this.repo.anonymise(request.subject_email, request.subject_phone);
    const counts = {
      contacts: anonymised.contacts.length,
      leads: anonymised.leads.length,
      vendors: anonymised.vendors.length,
      workers: anonymised.workers.length,
      users: anonymised.users.length,
    };
    const total = counts.contacts + counts.leads + counts.vendors + counts.workers + counts.users;

    // THE KEYCLOAK HALF. Anonymising `platform.users` on its own is not an erasure: Keycloak holds the
    // person's username (their email on Path B, their phone number on Path A), their email and their
    // display name, and the account stays enabled — so they remain fully named in the identity
    // provider and can still complete a fresh login. `eraseUser` disables, logs out every live
    // session, and overwrites those fields (TDD OQ-48).
    //
    // Failure here is REPORTED, NOT SWALLOWED, and does not roll back. The database columns are
    // already gone and cannot be put back, so throwing would leave the operator with a request that
    // looks failed and data that is half erased. Instead the identity provider is named in the
    // outcome so somebody finishes the job — a silent catch would let a live account survive an
    // erasure that reported success.
    const realm = anonymised.users.length > 0 ? await this.repo.findTenantRealm() : null;
    const keycloakFailures: string[] = [];
    for (const { userId, keycloakUserId } of anonymised.users) {
      if (realm === null) {
        keycloakFailures.push(userId);
        continue;
      }
      try {
        await this.keycloak.eraseUser(keycloakUserId, realm, userId);
      } catch (err) {
        keycloakFailures.push(userId);
        logger.error(
          { requestId, userId, err },
          'subject-request.erase.keycloak_failed — the account is still live in the identity provider',
        );
      }
    }

    // The per-REQUEST record: which request was fulfilled, and how many rows it reached.
    await this.repo.writeAudit({
      actorId,
      action: 'ERASE /api/v1/subject-requests/:id/erase',
      requestId,
      matches: total,
    });

    // The per-ENTITY records — one row per erased record, naming the table and the id (§11.4).
    // Written after the request-level row so the trail reads request-then-detail, and written from the
    // ids the UPDATEs returned rather than from a re-query: by now the rows no longer name the person,
    // so there is nothing left to search for.
    await this.repo.writeErasureAudit(actorId, requestId, [
      ...anonymised.contacts.map((id) => ({
        resourceType: 'crm.contacts' as const,
        resourceId: id,
      })),
      ...anonymised.leads.map((id) => ({ resourceType: 'crm.leads' as const, resourceId: id })),
      ...anonymised.vendors.map((id) => ({
        resourceType: 'procurement.vendors' as const,
        resourceId: id,
      })),
      ...anonymised.workers.map((id) => ({
        resourceType: 'workforce.workers' as const,
        resourceId: id,
      })),
      ...anonymised.users.map((u) => ({
        resourceType: 'platform.users' as const,
        resourceId: u.userId,
      })),
    ]);

    // `held` is a boolean, never the reason: the reason names a live dispute and belongs in
    // files.files.legal_hold_reason, not in an application log (QM-8).
    logger.info(
      {
        requestId,
        ...counts,
        held: archivedFileId !== null,
        keycloakFailures: keycloakFailures.length,
      },
      'subject-request.erase',
    );

    return {
      request_id: requestId,
      anonymised: counts,
      total,
      archived_file_id: archivedFileId,
      keycloak_erase_failed: keycloakFailures,
    };
  }

  /**
   * Write the pre-anonymisation rows to a file and put that file beyond deletion.
   *
   * Uses the platform's existing per-file legal hold (migration 20260706000003 — "legal hold blocks
   * ALL deletion, soft + hard"), so the archive is the File Service's WORM object rather than a new
   * store invented for this one flow. The backend has no MinIO client and must not grow one (master
   * fixes Main App <-> File Service as REST), which is why this goes through FileServiceClient.
   *
   * If the hold cannot be placed, the erasure DOES NOT PROCEED: an archive that the retention sweep
   * can delete is not an archive, and going ahead would destroy the operational copy while leaving
   * the evidence copy deletable. Better to fail with both still intact.
   */
  private async archiveUnderHold(
    request: SubjectRequestRow,
    reason: string,
    actorId: string,
  ): Promise<string> {
    const matches = await this.repo.findMatches(request.subject_email, request.subject_phone);
    const snapshot = {
      request_id: request.request_id,
      taken_at: new Date().toISOString(),
      legal_hold_reason: reason,
      matches,
    };

    const { file_id } = await this.files.upload({
      buffer: Buffer.from(JSON.stringify(snapshot, null, 2), 'utf-8'),
      filename: `subject-request-${request.request_id}-pre-erasure.json`,
      contentType: 'application/json',
      entityType: 'subject_request',
      entityId: request.request_id,
    });

    const held = await this.legalHold.place({
      tenantId: request.tenant_id,
      fileId: file_id,
      reason,
      placedBy: actorId,
    });
    if (!held) {
      throw new BadRequestException(
        'Legal hold could not be placed on the archive — erasure aborted, nothing was changed',
      );
    }
    return file_id;
  }

  /**
   * Send the verification challenge (ADR-090 §6).
   *
   * THE ADDRESS COMES FROM THE MATCHED RECORD, NOT FROM THE REQUEST. This is the whole security
   * property: challenging the address an operator typed in would prove control of a CLAIMED address
   * and say nothing about the person the tenant holds data about. Challenging the address ON FILE
   * proves the answerer controls the identifier the tenant already had — which is what "we checked it
   * was them" can honestly mean here, and what regulators call proportionate verification built on
   * information already held.
   *
   * It therefore requires at least one match, and refuses when the held records carry no email: a
   * phone challenge is a second method this deliberately does not fake (the column records
   * 'EMAIL_LINK' because that is what was actually done).
   */
  async sendVerification(requestId: string, actorId: string): Promise<{ sent_to: string }> {
    const request = await this.mustFindOpen(requestId);
    const matches = await this.repo.findMatches(request.subject_email, request.subject_phone);

    const onFile = matches
      .map((m) => m.fields['email'] ?? m.fields['contact_email'] ?? null)
      .find((e): e is string => typeof e === 'string' && e.length > 0);

    if (onFile === undefined) {
      throw new BadRequestException(
        'No email on the matched records to challenge — verification cannot be evidenced by this platform',
      );
    }

    const issued = await this.verification.issue(request.tenant_id, requestId);
    await this.repo.recordChallenge({ requestId, tokenHash: issued.tokenHash, sentTo: onFile });

    // The ONE place in this repo that sends mail without going through NotificationService, and the
    // reason is structural rather than a preference: the recipient here is a crm.contacts row
    // matched on the email in the request, NOT a platform user. notifications.recipient_id is a
    // NOT NULL UUID naming a platform user, so there is no row this notification could be written
    // against. A data-subject request may come from a customer contact who has never had a login.
    //
    // step-up and the data-export activity used to sit beside this and were moved onto
    // NotificationService.notifyUserCritical on 2026-08-26; this one stayed, and the conformance
    // test in phase-20 names it explicitly rather than allowing the whole module.
    await this.email.send({
      to: onFile,
      subject: 'Confirm your data request',
      body: [
        'A request about your personal data was received.',
        'Confirm it was you by opening this link:',
        `${publicBaseUrl()}/subject-requests/verify/${issued.token}`,
        'The link expires in 7 days and can be used once.',
        'If you did not make this request, ignore this email.',
      ].join('\n\n'),
    });

    await this.repo.writeAudit({
      actorId,
      action: 'VERIFY-SEND /api/v1/subject-requests/:id/verify',
      requestId,
      matches: matches.length,
    });
    // The address is NOT logged — it is the subject's, and it is already recorded on the row where an
    // auditor can find it under access control (QM-8: IDs only).
    logger.info({ requestId }, 'subject-request.verification-sent');

    return { sent_to: maskEmail(onFile) };
  }

  /**
   * The subject confirms. Runs on the public endpoint, after the guard has established the tenant
   * from the token's own signed claim.
   *
   * Single use: the UPDATE requires `verified_at IS NULL`, so a replayed link reports failure rather
   * than silently re-stamping a fresh timestamp over the original proof.
   */
  async confirmVerification(token: string): Promise<{ verified: boolean }> {
    const tokenHash = await this.verification.hashToken(token);
    const verified = await this.repo.markVerifiedByTokenHash(tokenHash);
    if (!verified) {
      throw new BadRequestException('This link has already been used, or is no longer current');
    }
    return { verified: true };
  }

  /**
   * Close the request.
   *
   * The outcome note is required by the DTO on BOTH outcomes and is stored verbatim: a refusal that
   * does not name its basis is itself a breach (ADR-090 §5). Only an OPEN request can be closed — the
   * repository's `status = 'OPEN'` predicate makes the second attempt a no-op rather than a silent
   * overwrite of the first answer, and a missing row here means exactly that.
   */
  async close(
    requestId: string,
    dto: CloseSubjectRequestDto,
    _actorId: string,
  ): Promise<SubjectRequestRow> {
    const closed = await this.repo.close(requestId, dto.status, dto.outcome_note);
    if (closed === null) {
      // Either it does not exist in this tenant, or it is already closed. Both are 404 to the caller:
      // distinguishing them would tell an admin of tenant A that a request id belongs to tenant B.
      throw new NotFoundException('Open subject request not found');
    }
    return closed;
  }

  private async mustFindOpen(requestId: string): Promise<SubjectRequestRow> {
    const request = await this.repo.findById(requestId);
    if (request === null) {
      throw new NotFoundException('Subject request not found');
    }
    if (request.status !== 'OPEN') {
      // A closed request has been answered. Re-running a search against it would produce a fresh
      // disclosure with no live authorisation behind it.
      throw new BadRequestException('Subject request is already closed');
    }
    return request;
  }
}

/**
 * Said plainly rather than reported as a clean "nothing held".
 *
 * `crm.leads` carries `contact_name` but no email or phone of its own, so a lead whose contacts were
 * never created cannot be reached by an identifier at all. Returning an empty list without saying so
 * would let the tenant answer "we hold nothing about you" when the honest answer is "nothing matched
 * the identifier you gave".
 */
const EMPTY_RESULT_NOTE =
  'No record matched the identifiers on this request. Leads carry a contact name but no email or ' +
  'phone of their own, so a lead with no contact row cannot be matched by identifier — check by ' +
  'name before answering that nothing is held.';

/** Trim to null: whitespace is not an identifier, and '' would defeat the DB CHECK. */
function normalise(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

/** Where the subject's confirm link points. Per-deployment; no default that would mail a dead link. */
function publicBaseUrl(): string {
  const configured = process.env['PUBLIC_WEB_URL'];
  if (configured) return configured;
  throw new BadRequestException(
    'PUBLIC_WEB_URL is not configured — cannot send a verification link',
  );
}

/**
 * `s***@example.com` for the response to the ADMIN.
 *
 * The operator needs to know a challenge went out and roughly where, not to read the subject's
 * address back off a screen they may be sharing. The full value is on the row for an auditor.
 */
function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) return '***';
  return `${value[0]}***${value.slice(at)}`;
}
