/**
 * Why a procurement action was refused, as an i18n key (plan CW; the purchase request page, plan CX).
 *
 * The RFQs page (create, publish, close, cancel) and the quotation comparison page (award) showed nothing when the
 * server refused. Product owner, 2026-11-20: show a TH/EN line for the case — the API's own `messageKey` when it is
 * one this page knows, then what the action and status mean here — else a generic line. Never the server's English
 * message or the ids in it.
 *
 * The statuses below are the procurement service's refusals for these routes (backend procurement.service.ts):
 * create 400 without field errors = a deadline at or before now (plan CT; the form checks first, so this is the
 * clock-skew case) — a 400 with `details.fieldErrors` is the request's own validation (e.g. an RFQ number the form
 * allows but the API does not), shown as the generic line; 404 = the project is not the tenant's; publish 422 = the deadline has passed or the RFQ is no longer DRAFT; close /
 * cancel 422 = the RFQ is no longer in the state the button was drawn for; award 404 = the quotation or its vendor
 * (deactivated, plan CP) is gone, 422 = the RFQ is no longer EVALUATED.
 */
import { ApiError } from './api/client';

/** `create` is the RFQ's; `createRequest` the purchase request's (plan CX). */
export type ProcurementAction =
  'create' | 'publish' | 'close' | 'cancel' | 'award' | 'createRequest';

/** The API's messageKeys these pages can meet, and the line each one shows. */
const KNOWN_MESSAGE_KEYS: Record<string, string> = {
  'procurement.project.closed': 'proc.err.projectClosed',
  'procurement.rfq.prOtherProject': 'proc.err.prOtherProject',
  'procurement.rfq.alreadyAwarded': 'proc.err.alreadyAwarded',
  'procurement.pr.duplicateNumber': 'proc.err.prNumberTaken',
};

const BY_ACTION_AND_STATUS: Record<ProcurementAction, Partial<Record<number, string>>> = {
  create: { 400: 'proc.err.deadlineNotFuture', 404: 'proc.err.projectNotFound' },
  publish: { 422: 'proc.err.publishRefused' },
  close: { 422: 'proc.err.stateChanged' },
  cancel: { 422: 'proc.err.stateChanged' },
  award: { 404: 'proc.err.quotationGone', 422: 'proc.err.stateChanged' },
  // 409 without the number's key is a replayed id of another tenant (offline only) — the generic line.
  createRequest: { 404: 'proc.err.projectNotFound' },
};

export function procurementActionErrorKey(action: ProcurementAction, error: unknown): string {
  if (!(error instanceof ApiError)) return 'proc.err.generic';
  const known = error.messageKey ? KNOWN_MESSAGE_KEYS[error.messageKey] : undefined;
  if (known) return known;
  if (error.status === 403) return 'proc.err.forbidden';
  // A ValidationPipe 400 lists its field errors; the service's own deadline refusal has none (found by /doubt).
  if (error.status === 400 && error.details?.['fieldErrors'] !== undefined)
    return 'proc.err.generic';
  return BY_ACTION_AND_STATUS[action][error.status] ?? 'proc.err.generic';
}
