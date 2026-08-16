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

const logger = createLogger('subject-request');

export interface SubjectMatchResult {
  request_id: string;
  matches: SubjectMatch[];
  /** True when the request carries an email but the tenant holds leads reachable only by name. */
  note: string | null;
}

export interface ErasureResult {
  request_id: string;
  anonymised: { contacts: number; leads: number; vendors: number };
  total: number;
}

@Injectable()
export class SubjectRequestService {
  constructor(private readonly repo: SubjectRequestRepository) {}

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
  async erase(requestId: string, actorId: string): Promise<ErasureResult> {
    const request = await this.mustFindOpen(requestId);
    if (request.request_type !== 'ERASURE') {
      throw new BadRequestException('request_type must be ERASURE to anonymise');
    }

    const anonymised = await this.repo.anonymise(request.subject_email, request.subject_phone);
    const total = anonymised.contacts + anonymised.leads + anonymised.vendors;

    await this.repo.writeAudit({
      actorId,
      action: 'ERASE /api/v1/subject-requests/:id/erase',
      requestId,
      matches: total,
    });
    logger.info({ requestId, ...anonymised }, 'subject-request.erase');

    return { request_id: requestId, anonymised, total };
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
