// Form schemas for the field-entry screens.
//
// Scope: the rules DESIGN.md §9 says the UI must encode — exact status vocabularies, numeric ranges,
// and the conditional requirements. Anything the server owns exclusively (approval thresholds,
// task-completion gates) is NOT duplicated here: those are server-side decisions returned as errors,
// and re-implementing them on the client would create two sources of truth.
import * as z from 'zod/mini';

import {
  assignableRole,
  incidentSeverity,
  issueSeverity,
  planType,
  projectType,
  riskCategory,
  riskStatus,
  taskStatus,
} from './enums.js';
import {
  currencyCode,
  intInRange,
  isoDate,
  isoDateTimeLocal,
  money,
  optionalEmail,
  optionalIsoDate,
  optionalMoney,
  optionalText,
  percent,
  progressPercent,
  quantity,
  requiredId,
  requiredText,
  riskScore,
} from './primitives.js';

/** POST /site/issues — apps/web/src/app/(app)/site/issues/new. */
export const issueCreateSchema = z.object({
  project_id: requiredId,
  title: requiredText(255),
  description: optionalText(2000),
  severity: issueSeverity,
});
export type IssueCreateValues = z.infer<typeof issueCreateSchema>;

/**
 * POST /site/inspections.
 *
 * DESIGN.md §9.1: "Inspection result: pass / fail / conditional (+ issue_severity when
 * fail/conditional)". The API vocabulary is PENDING | PASSED | FAILED | REQUIRES_REINSPECTION, so
 * the conditional applies to the two non-passing outcomes.
 */
export const inspectionSubmitSchema = z.object({
  // UpdateInspectionInput is exactly { status, notes } — the inspection page PATCHes an existing
  // inspection, so project_id and checklist_id are already on the record and are not resubmitted.
  // The FAILED → issue_severity rule DESIGN.md §9.1 describes belongs to the create path, which
  // this endpoint is not; re-adding it here would block a valid PATCH.
  status: z.enum(['PASSED', 'FAILED', 'REQUIRES_REINSPECTION'], {
    error: 'validation.invalidOption',
  }),
  notes: optionalText(2000),
});
export type InspectionSubmitValues = z.infer<typeof inspectionSubmitSchema>;

/** POST /safety/incidents — apps/web/src/app/(app)/safety/incidents. */
export const incidentReportSchema = z.object({
  project_id: requiredId,
  // `incident_type` (free text), not a `title` — CreateIncidentInput names this field and the
  // safety page submits it. An earlier version of this schema modelled title/description from
  // DESIGN.md prose; it would have rejected every payload the form actually sends.
  incident_type: requiredText(255),
  severity: incidentSeverity,
  task_id: z.optional(z.union([z.literal(''), requiredId])),
});
export type IncidentReportValues = z.infer<typeof incidentReportSchema>;

/** POST /site/reports — apps/web/src/app/(app)/site/reports/new. */
export const siteReportCreateSchema = z.object({
  project_id: requiredId,
  // isoDate, not requiredText(10): a length check accepts "03/08/2026" and any other 10-character
  // string. The API stores a DATE, so the shape has to be checked, not just the length.
  report_date: isoDate,
  summary: optionalText(2000), // §Phase 6: summary is max 2000 chars, enforced in the DTO
  blockers: optionalText(2000),
  weather: optionalText(100),
  manpower_count: z.optional(
    z.number().check(z.int('validation.notAnInteger'), z.gte(0, 'validation.outOfRange')),
  ),
});
export type SiteReportCreateValues = z.infer<typeof siteReportCreateSchema>;

/** POST /projects/:id/risks — ADR-065 register. score = likelihood × impact, 1–25. */
export const riskCreateSchema = z.object({
  title: requiredText(255),
  description: optionalText(2000),
  category: riskCategory,
  likelihood: intInRange(1, 5),
  impact: intInRange(1, 5),
  mitigation: optionalText(2000),
  owner: optionalText(200),
});

/**
 * Risk status is set by `UpdateRiskInput`, not at create time — CreateRiskInput has no `status`
 * field, so the create schema above must not require one. Exported separately for the update path.
 */
export const riskStatusUpdateSchema = z.object({ status: riskStatus });
export type RiskCreateValues = z.infer<typeof riskCreateSchema>;

/** Exported for callers that display the derived score; keeps the 1–25 bound in one place. */
export const computeRiskScore = (likelihood: number, impact: number) =>
  riskScore.safeParse(likelihood * impact);

// ── Schemas added 2026-08-03 for the remaining apps/web forms ────────────────────────────────
// Field names and optionality are taken verbatim from the `Create*Input` / `Record*Input` types in
// apps/web/src/lib/api/types.ts, which mirror the API contract. Where that type says a field is
// optional, so does the schema — tightening it client-side would reject payloads the API accepts.

/** §20.7 project create → POST /projects (`CreateProjectInput`). */
export const projectCreateSchema = z.object({
  project_code: requiredText(64),
  project_name: requiredText(200),
  project_type: projectType,
  budget_amount: optionalMoney,
  budget_currency: z.optional(z.union([z.literal(''), currencyCode])),
  start_date: optionalIsoDate,
  end_date: optionalIsoDate,
});

/** §20.7.3 purchase request → POST /procurement/requests (`CreatePurchaseRequestInput`). */
export const purchaseRequestCreateSchema = z.object({
  project_id: requiredId,
  pr_number: requiredText(64),
  required_date: optionalIsoDate,
});

/** §20.7.3 RFQ → POST /procurement/rfqs (`CreateRfqInput`). `deadline` is required by the API. */
export const rfqCreateSchema = z.object({
  project_id: requiredId,
  pr_id: z.optional(z.union([z.literal(''), requiredId])),
  rfq_number: requiredText(64),
  // These schemas validate what the *form* holds, not what is POSTed. The RFQ page collects the
  // deadline with an <input type="datetime-local"> and converts it with `new Date(...).toISOString()`
  // on submit, so the value reaching validation is `YYYY-MM-DDTHH:mm`, not a full ISO timestamp.
  deadline: isoDateTimeLocal,
});

/**
 * §20.7.3 goods receipt → POST /procurement/deliveries (`RecordDeliveryInput`).
 *
 * `items` must be non-empty: a delivery that received nothing is not a delivery, and an empty array
 * would post a receipt against the PO with no line effect at all.
 */
export const deliveryRecordSchema = z.object({
  po_id: requiredId,
  delivery_note: optionalText(200),
  delivered_at: isoDateTimeLocal,
  notes: optionalText(2000),
  items: z
    .array(z.object({ line_id: requiredId, quantity_received: quantity }))
    .check(z.minLength(1, 'validation.required')),
});

/** §20.7.4 payment → POST /finance/payments (`RecordPaymentInput`). */
export const paymentRecordSchema = z.object({
  project_id: requiredId,
  invoice_id: requiredId,
  amount: money,
  currency_code: currencyCode,
  payment_date: isoDate,
  payment_reference: optionalText(120),
});

/**
 * §20.7 task update → PATCH /tasks/:id (`UpdateTaskInput`).
 *
 * Both fields are optional in the contract, but a request that sets neither is a no-op — the
 * refinement rejects it client-side rather than spending a round trip to learn nothing changed.
 */
export const taskUpdateSchema = z
  .object({
    status: z.optional(taskStatus),
    progress_percent: z.optional(progressPercent),
  })
  .check(
    z.refine((v) => v.status !== undefined || v.progress_percent !== undefined, {
      error: 'validation.required',
      path: ['status'],
    }),
  );

/**
 * §20.7.8 user invite → POST /users (`CreateUserInput`).
 *
 * The API takes `email` and `phone_number` as optional, but a user reachable by neither can never
 * be invited, so at least one is required here. The message is attached to `email` because that is
 * the first of the two fields on screen.
 */
export const userCreateSchema = z
  .object({
    display_name: requiredText(200),
    role: assignableRole,
    email: optionalEmail,
    phone_number: optionalText(32),
  })
  .check(
    z.refine((v) => Boolean(v.email) || Boolean(v.phone_number), {
      error: 'validation.required',
      path: ['email'],
    }),
  );

/** §20.7.8 tenant settings → PATCH /tenants/settings (`UpdateTenantSettingsInput`). */
export const tenantSettingsSchema = z.object({
  // `percent`, not `intInRange`: both inputs carry step="0.01", so a 2.5% threshold is valid.
  variance_alert_threshold: z.optional(percent),
  retention_percentage: z.optional(percent),
  line_channel_token: optionalText(500),
  notifications_enabled: z.optional(z.boolean()),
});

/** §20.4 platform admin tenant provisioning → POST /platform/tenants (`CreateTenantInput`). */
export const tenantCreateSchema = z.object({
  tenantCode: requiredText(64),
  tenantName: requiredText(200),
  planType,
  dedicatedDbUrl: optionalText(500),
});

/**
 * §20.7.9 CRM lead → POST /crm/leads (`CreateLeadInput`).
 *
 * Every field is optional in the contract. A lead with nothing on it is not a lead, so at least a
 * contact name or a company is required — that is the minimum a salesperson can follow up on.
 */
export const leadCreateSchema = z
  .object({
    contact_name: optionalText(200),
    company: optionalText(200),
    source: optionalText(120),
  })
  .check(
    z.refine((v) => Boolean(v.contact_name) || Boolean(v.company), {
      error: 'validation.required',
      path: ['contact_name'],
    }),
  );

/** §20.7.9 CRM opportunity → POST /crm/opportunities (`CreateOpportunityInput`). */
export const opportunityCreateSchema = z.object({
  lead_id: requiredId,
  title: requiredText(200),
  value: optionalMoney,
  expected_close_date: optionalIsoDate,
});

/**
 * Vendor RFQ quotation → POST /vendor/rfq/:token/quotation (`SubmitQuotationInput`).
 *
 * This is the one form an unauthenticated outsider fills in — a vendor following a tokenised link.
 * Client validation here is convenience only; the endpoint is public, so the server remains the
 * only thing standing between this payload and the database (QM-4).
 */
export const quotationSubmitSchema = z.object({
  total_amount: money,
  currency_code: currencyCode,
  validity_days: intInRange(1, 365),
});

/** Vendor invoice → POST /vendor/invoices (`SubmitInvoiceInput`). */
export const vendorInvoiceSubmitSchema = z.object({
  po_id: requiredId,
  invoice_number: requiredText(64),
  amount: money,
  currency_code: currencyCode,
  invoice_date: isoDate,
  due_date: isoDate,
});

/**
 * Phone number for the SMS OTP login step (§20.6.1 Path A).
 *
 * E.164: a leading `+`, a non-zero country digit, then 7–14 more. The login page composes this
 * from a country dial code and a national number, so what is validated is the composed result, not
 * either half.
 *
 * There is no matching `Create*Input`: `/auth/otp/request` takes a bare `{ phoneNumber }` body, so
 * this schema is paired with nothing in check-schema-contract.sh.
 */
export const otpPhoneSchema = z.object({
  phoneNumber: z
    .string()
    .check(
      z.minLength(1, 'validation.required'),
      z.regex(/^\+[1-9]\d{7,14}$/, 'validation.notAPhone'),
    ),
});

/**
 * OTP verification (§20.6.1 Path A) — the six digits plus the number they were sent to.
 *
 * Six characters, digits only, matching `OTP_LENGTH` on the verify screen. Like `otpPhoneSchema`
 * this has no `Create*Input` counterpart: the values go to next-auth's `signIn('otp', …)`, not to
 * a REST body.
 */
export const otpVerifySchema = z.object({
  phoneNumber: otpPhoneSchema.shape.phoneNumber,
  otp: z
    .string()
    .check(z.minLength(1, 'validation.required'), z.regex(/^\d{6}$/, 'validation.notAnOtp')),
});
