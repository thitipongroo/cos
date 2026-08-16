import {
  deliveryRecordSchema,
  leadCreateSchema,
  opportunityCreateSchema,
  otpPhoneSchema,
  otpVerifySchema,
  paymentRecordSchema,
  projectCreateSchema,
  purchaseRequestCreateSchema,
  quotationSubmitSchema,
  rfqCreateSchema,
  siteReportCreateSchema,
  taskUpdateSchema,
  tenantCreateSchema,
  tenantSettingsSchema,
  userCreateSchema,
  subjectRequestCreateSchema,
  subjectRequestCloseSchema,
  subjectRequestEraseSchema,
  vendorInvoiceSubmitSchema,
} from '../forms';

const UUID = '88803908-e4b5-57bd-8e6b-ed4662b5d67d';
const UUID2 = 'e1c9f0a2-3b4d-4c5e-8f60-7a8b9c0d1e2f';
const firstIssue = (r: {
  success: boolean;
  error?: { issues: { message: string; path: PropertyKey[] }[] };
}) => (r.success === false ? r.error!.issues[0] : undefined);

describe('projectCreateSchema', () => {
  const base = { project_code: 'P-001', project_name: 'Tower A', project_type: 'COMMERCIAL' };

  it('accepts the required fields alone', () => {
    expect(projectCreateSchema.safeParse(base).success).toBe(true);
  });

  it('accepts the full optional set', () => {
    expect(
      projectCreateSchema.safeParse({
        ...base,
        budget_amount: '1000000.00',
        budget_currency: 'THB',
        start_date: '2026-08-03',
        end_date: '2027-08-03',
      }).success,
    ).toBe(true);
  });

  it('accepts empty strings for the optional money and currency — an untouched field', () => {
    expect(
      projectCreateSchema.safeParse({ ...base, budget_amount: '', budget_currency: '' }).success,
    ).toBe(true);
  });

  it.each([
    ['a blank code', { project_code: '' }],
    ['a blank name', { project_name: '  ' }],
    ['a type outside the vocabulary', { project_type: 'MIXED_USE' }],
    ['a malformed budget', { budget_amount: '1,000' }],
    ['a lowercase currency', { budget_currency: 'thb' }],
    ['a malformed start date', { start_date: '03-08-2026' }],
  ])('rejects %s', (_label, patch) => {
    expect(projectCreateSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});

describe('purchaseRequestCreateSchema', () => {
  const base = { project_id: UUID, pr_number: 'PR-2026-001' };

  it('accepts without the optional required_date', () => {
    expect(purchaseRequestCreateSchema.safeParse(base).success).toBe(true);
  });

  it('accepts with a required_date', () => {
    expect(
      purchaseRequestCreateSchema.safeParse({ ...base, required_date: '2026-09-01' }).success,
    ).toBe(true);
  });

  it('rejects a non-uuid project', () => {
    expect(purchaseRequestCreateSchema.safeParse({ ...base, project_id: 'p1' }).success).toBe(
      false,
    );
  });

  it('rejects a blank pr_number', () => {
    expect(purchaseRequestCreateSchema.safeParse({ ...base, pr_number: '' }).success).toBe(false);
  });
});

describe('rfqCreateSchema', () => {
  // datetime-local, the value the RFQ form actually holds before it converts to ISO on submit.
  const base = { project_id: UUID, rfq_number: 'RFQ-001', deadline: '2026-09-15T17:00' };

  it('accepts without a pr_id', () => {
    expect(rfqCreateSchema.safeParse(base).success).toBe(true);
  });

  it('accepts an empty pr_id — the "no source PR" case', () => {
    expect(rfqCreateSchema.safeParse({ ...base, pr_id: '' }).success).toBe(true);
  });

  it('accepts a real pr_id', () => {
    expect(rfqCreateSchema.safeParse({ ...base, pr_id: UUID2 }).success).toBe(true);
  });

  it('rejects a non-uuid pr_id', () => {
    expect(rfqCreateSchema.safeParse({ ...base, pr_id: 'pr-1' }).success).toBe(false);
  });

  it('rejects a missing deadline — the API requires it', () => {
    expect(rfqCreateSchema.safeParse({ ...base, deadline: '' }).success).toBe(false);
  });

  it('rejects a date with no time — the field is datetime-local', () => {
    expect(rfqCreateSchema.safeParse({ ...base, deadline: '2026-09-15' }).success).toBe(false);
  });
});

describe('deliveryRecordSchema', () => {
  const base = {
    po_id: UUID,
    delivered_at: '2026-08-03T07:30',
    items: [{ line_id: UUID2, quantity_received: '10' }],
  };

  it('accepts a minimal receipt', () => {
    expect(deliveryRecordSchema.safeParse(base).success).toBe(true);
  });

  it('accepts optional note and notes', () => {
    expect(
      deliveryRecordSchema.safeParse({ ...base, delivery_note: 'DN-99', notes: 'partial' }).success,
    ).toBe(true);
  });

  it('accepts a zero-quantity line — how a short delivery is recorded', () => {
    expect(
      deliveryRecordSchema.safeParse({
        ...base,
        items: [{ line_id: UUID2, quantity_received: '0' }],
      }).success,
    ).toBe(true);
  });

  it('rejects an empty items array — a receipt with no lines changes nothing', () => {
    expect(deliveryRecordSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  });

  it('rejects a date without a time', () => {
    expect(deliveryRecordSchema.safeParse({ ...base, delivered_at: '2026-08-03' }).success).toBe(
      false,
    );
  });

  it('rejects a malformed quantity', () => {
    expect(
      deliveryRecordSchema.safeParse({
        ...base,
        items: [{ line_id: UUID2, quantity_received: 'ten' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a notes value over 2000 chars', () => {
    expect(deliveryRecordSchema.safeParse({ ...base, notes: 'x'.repeat(2001) }).success).toBe(
      false,
    );
  });
});

describe('paymentRecordSchema', () => {
  const base = {
    project_id: UUID,
    invoice_id: UUID2,
    amount: '5000.00',
    currency_code: 'THB',
    payment_date: '2026-08-03',
  };

  it('accepts a complete payment', () => {
    expect(paymentRecordSchema.safeParse(base).success).toBe(true);
  });

  it('accepts an optional reference', () => {
    expect(paymentRecordSchema.safeParse({ ...base, payment_reference: 'TT-991' }).success).toBe(
      true,
    );
  });

  it.each([
    ['a malformed amount', { amount: '5,000' }],
    ['a lowercase currency', { currency_code: 'thb' }],
    ['a missing date', { payment_date: '' }],
    ['a non-uuid invoice', { invoice_id: 'inv-1' }],
  ])('rejects %s', (_label, patch) => {
    expect(paymentRecordSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});

describe('taskUpdateSchema', () => {
  it('accepts a status-only update', () => {
    expect(taskUpdateSchema.safeParse({ status: 'IN_PROGRESS' }).success).toBe(true);
  });

  it('accepts a progress-only update', () => {
    expect(taskUpdateSchema.safeParse({ progress_percent: 40 }).success).toBe(true);
  });

  it('accepts both', () => {
    expect(taskUpdateSchema.safeParse({ status: 'COMPLETED', progress_percent: 100 }).success).toBe(
      true,
    );
  });

  it('accepts progress 0 — a real value, not "unset"', () => {
    expect(taskUpdateSchema.safeParse({ progress_percent: 0 }).success).toBe(true);
  });

  it('rejects an empty update and points at status', () => {
    const r = taskUpdateSchema.safeParse({});
    expect(r.success).toBe(false);
    expect(firstIssue(r)?.path).toEqual(['status']);
  });

  it('rejects progress above 100', () => {
    expect(taskUpdateSchema.safeParse({ progress_percent: 101 }).success).toBe(false);
  });

  it('rejects a status outside the vocabulary', () => {
    expect(taskUpdateSchema.safeParse({ status: 'PAUSED' }).success).toBe(false);
  });
});

describe('userCreateSchema', () => {
  const base = { display_name: 'Somchai P.', role: 'SITE_ENGINEER' };

  it('accepts an email-only invite', () => {
    expect(userCreateSchema.safeParse({ ...base, email: 'a@b.co' }).success).toBe(true);
  });

  it('accepts a phone-only invite', () => {
    expect(userCreateSchema.safeParse({ ...base, phone_number: '0812345678' }).success).toBe(true);
  });

  it('accepts both', () => {
    expect(
      userCreateSchema.safeParse({ ...base, email: 'a@b.co', phone_number: '0812345678' }).success,
    ).toBe(true);
  });

  it('rejects an invite with neither, and points at email', () => {
    const r = userCreateSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(firstIssue(r)?.path).toEqual(['email']);
  });

  it('treats empty strings as "neither supplied"', () => {
    expect(userCreateSchema.safeParse({ ...base, email: '', phone_number: '' }).success).toBe(
      false,
    );
  });

  it('rejects SYSTEM_ADMIN — cross-tenant, never provisioned to a tenant (spec §6.7)', () => {
    expect(
      userCreateSchema.safeParse({ ...base, role: 'SYSTEM_ADMIN', email: 'a@b.co' }).success,
    ).toBe(false);
  });

  it('rejects a blank display_name', () => {
    expect(
      userCreateSchema.safeParse({ ...base, display_name: ' ', email: 'a@b.co' }).success,
    ).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(userCreateSchema.safeParse({ ...base, email: 'nope' }).success).toBe(false);
  });
});

describe('tenantSettingsSchema', () => {
  it('accepts an empty patch — every field is optional in the contract', () => {
    expect(tenantSettingsSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a full patch', () => {
    expect(
      tenantSettingsSchema.safeParse({
        variance_alert_threshold: 10,
        retention_percentage: 5,
        line_channel_token: 'tok',
        notifications_enabled: true,
      }).success,
    ).toBe(true);
  });

  it('accepts a fractional threshold — both inputs carry step="0.01"', () => {
    expect(
      tenantSettingsSchema.safeParse({ variance_alert_threshold: 2.5, retention_percentage: 7.25 })
        .success,
    ).toBe(true);
  });

  it.each([
    ['a threshold above 100', { variance_alert_threshold: 101 }],
    ['a negative retention', { retention_percentage: -1 }],
    ['a non-boolean toggle', { notifications_enabled: 'yes' }],
  ])('rejects %s', (_label, patch) => {
    expect(tenantSettingsSchema.safeParse(patch).success).toBe(false);
  });
});

describe('tenantCreateSchema', () => {
  const base = { tenantCode: 'acme', tenantName: 'ACME Co', planType: 'PROFESSIONAL' };

  it('accepts without a dedicated DB url', () => {
    expect(tenantCreateSchema.safeParse(base).success).toBe(true);
  });

  it('accepts with one', () => {
    expect(tenantCreateSchema.safeParse({ ...base, dedicatedDbUrl: 'postgres://x' }).success).toBe(
      true,
    );
  });

  it('rejects a plan outside the vocabulary', () => {
    expect(tenantCreateSchema.safeParse({ ...base, planType: 'FREE' }).success).toBe(false);
  });

  it('rejects a blank code', () => {
    expect(tenantCreateSchema.safeParse({ ...base, tenantCode: '' }).success).toBe(false);
  });
});

describe('leadCreateSchema', () => {
  it('accepts a contact name alone', () => {
    expect(leadCreateSchema.safeParse({ contact_name: 'Somchai' }).success).toBe(true);
  });

  it('accepts a company alone', () => {
    expect(leadCreateSchema.safeParse({ company: 'ACME' }).success).toBe(true);
  });

  it('accepts both plus a source', () => {
    expect(
      leadCreateSchema.safeParse({ contact_name: 'Somchai', company: 'ACME', source: 'referral' })
        .success,
    ).toBe(true);
  });

  it('rejects a lead with neither, and points at contact_name', () => {
    const r = leadCreateSchema.safeParse({ source: 'referral' });
    expect(r.success).toBe(false);
    expect(firstIssue(r)?.path).toEqual(['contact_name']);
  });

  it('rejects a company over 200 chars', () => {
    expect(leadCreateSchema.safeParse({ company: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('opportunityCreateSchema', () => {
  const base = { lead_id: UUID, title: 'Tower A fit-out' };

  it('accepts the required fields alone', () => {
    expect(opportunityCreateSchema.safeParse(base).success).toBe(true);
  });

  it('accepts value and expected close date', () => {
    expect(
      opportunityCreateSchema.safeParse({
        ...base,
        value: '250000.00',
        expected_close_date: '2026-12-01',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-uuid lead', () => {
    expect(opportunityCreateSchema.safeParse({ ...base, lead_id: 'lead-1' }).success).toBe(false);
  });

  it('rejects a blank title', () => {
    expect(opportunityCreateSchema.safeParse({ ...base, title: '   ' }).success).toBe(false);
  });

  it('rejects a malformed value', () => {
    expect(opportunityCreateSchema.safeParse({ ...base, value: '250,000' }).success).toBe(false);
  });
});

describe('siteReportCreateSchema — fields the daily-report form actually submits', () => {
  const base = { project_id: UUID, report_date: '2026-08-03' };

  it('accepts blockers, which CreateSiteReportInput declares and the form sends', () => {
    expect(siteReportCreateSchema.safeParse({ ...base, blockers: 'crane down' }).success).toBe(
      true,
    );
  });

  it('rejects blockers over 2000 chars', () => {
    expect(siteReportCreateSchema.safeParse({ ...base, blockers: 'x'.repeat(2001) }).success).toBe(
      false,
    );
  });

  it('rejects a 10-character non-date — the reason report_date is isoDate, not requiredText(10)', () => {
    expect(siteReportCreateSchema.safeParse({ ...base, report_date: '03/08/2026' }).success).toBe(
      false,
    );
  });
});

describe('quotationSubmitSchema — the one public, unauthenticated form', () => {
  const base = { total_amount: '125000.00', currency_code: 'THB', validity_days: 30 };

  it('accepts a complete quotation', () => {
    expect(quotationSubmitSchema.safeParse(base).success).toBe(true);
  });

  it.each([1, 365])('accepts validity_days at the boundary %i', (validity_days) => {
    expect(quotationSubmitSchema.safeParse({ ...base, validity_days }).success).toBe(true);
  });

  it.each([0, 366])('rejects validity_days %i outside 1–365', (validity_days) => {
    expect(quotationSubmitSchema.safeParse({ ...base, validity_days }).success).toBe(false);
  });

  it('rejects a fractional validity', () => {
    expect(quotationSubmitSchema.safeParse({ ...base, validity_days: 30.5 }).success).toBe(false);
  });

  it('rejects a malformed amount', () => {
    expect(quotationSubmitSchema.safeParse({ ...base, total_amount: '125,000' }).success).toBe(
      false,
    );
  });
});

describe('vendorInvoiceSubmitSchema', () => {
  const base = {
    po_id: UUID,
    invoice_number: 'INV-2026-001',
    amount: '50000.00',
    currency_code: 'THB',
    invoice_date: '2026-08-03',
    due_date: '2026-09-02',
  };

  it('accepts a complete invoice', () => {
    expect(vendorInvoiceSubmitSchema.safeParse(base).success).toBe(true);
  });

  it.each([
    ['a non-uuid po', { po_id: 'po-1' }],
    ['a blank invoice number', { invoice_number: '' }],
    ['a malformed amount', { amount: '50000.005' }],
    ['a lowercase currency', { currency_code: 'thb' }],
    ['a missing due date', { due_date: '' }],
  ])('rejects %s', (_label, patch) => {
    expect(vendorInvoiceSubmitSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});

describe('otpPhoneSchema — E.164', () => {
  it.each(['+66812345678', '+112345678', '+123456789012345'])('accepts %s', (phoneNumber) => {
    expect(otpPhoneSchema.safeParse({ phoneNumber }).success).toBe(true);
  });

  it.each([
    ['a missing +', '66812345678'],
    ['a zero country code', '+0812345678'],
    ['too short', '+1234567'],
    ['too long', '+1234567890123456'],
    ['letters', '+66-81-234-5678'],
    ['empty', ''],
  ])('rejects %s', (_label, phoneNumber) => {
    expect(otpPhoneSchema.safeParse({ phoneNumber }).success).toBe(false);
  });

  it('reports an empty value as required, not as malformed', () => {
    const r = otpPhoneSchema.safeParse({ phoneNumber: '' });
    expect(r.success === false && r.error.issues[0]?.message).toBe('validation.required');
  });
});

describe('otpVerifySchema', () => {
  const base = { phoneNumber: '+66812345678', otp: '123456' };

  it('accepts a six-digit code', () => {
    expect(otpVerifySchema.safeParse(base).success).toBe(true);
  });

  it.each([
    ['five digits', '12345'],
    ['seven digits', '1234567'],
    ['letters', '12a456'],
    ['empty', ''],
  ])('rejects %s', (_label, otp) => {
    expect(otpVerifySchema.safeParse({ ...base, otp }).success).toBe(false);
  });

  it('rejects a malformed phone number even with a valid code', () => {
    expect(otpVerifySchema.safeParse({ ...base, phoneNumber: '0812345678' }).success).toBe(false);
  });
});

// ─── Subject requests (ADR-090; PDPA-48) ────────────────────────────────────────────────────────

describe('subjectRequestCreateSchema', () => {
  const base = { request_type: 'ACCESS' as const, received_at: '2026-08-14T09:00' };

  it('accepts an email-only request', () => {
    expect(subjectRequestCreateSchema.safeParse({ ...base, subject_email: 'a@b.co' }).success).toBe(
      true,
    );
  });

  it('accepts a phone-only request', () => {
    expect(
      subjectRequestCreateSchema.safeParse({ ...base, subject_phone: '0812345678' }).success,
    ).toBe(true);
  });

  it('rejects a request with neither identifier — it would authorise an unscoped search', () => {
    const result = subjectRequestCreateSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it('rejects a malformed received_at', () => {
    expect(
      subjectRequestCreateSchema.safeParse({
        ...base,
        subject_email: 'a@b.co',
        received_at: '14/08/2026',
      }).success,
    ).toBe(false);
  });
});

describe('subjectRequestCloseSchema', () => {
  it('accepts either outcome with a substantive note', () => {
    for (const status of ['FULFILLED', 'REJECTED'] as const) {
      expect(
        subjectRequestCloseSchema.safeParse({ status, outcome_note: 'Anonymised 2 CRM rows.' })
          .success,
      ).toBe(true);
    }
  });

  it('rejects a note too short to name a basis', () => {
    // "ok" is what an empty-by-default field collects; a refusal must name its law (ADR-090 §5).
    expect(
      subjectRequestCloseSchema.safeParse({ status: 'REJECTED', outcome_note: 'ok' }).success,
    ).toBe(false);
  });

  it('rejects an unknown outcome', () => {
    expect(
      subjectRequestCloseSchema.safeParse({
        status: 'PENDING',
        outcome_note: 'still working on it',
      }).success,
    ).toBe(false);
  });
});

describe('subjectRequestEraseSchema', () => {
  it('accepts an erasure with no hold — the default, so erasure really erases', () => {
    expect(subjectRequestEraseSchema.safeParse({}).success).toBe(true);
    expect(subjectRequestEraseSchema.safeParse({ legal_hold: false }).success).toBe(true);
  });

  it('requires a reason when a hold is asked for', () => {
    expect(subjectRequestEraseSchema.safeParse({ legal_hold: true }).success).toBe(false);
    expect(
      subjectRequestEraseSchema.safeParse({ legal_hold: true, legal_hold_reason: 'short' }).success,
    ).toBe(false);
    expect(
      subjectRequestEraseSchema.safeParse({
        legal_hold: true,
        legal_hold_reason: 'Labour Court case 123/2569',
      }).success,
    ).toBe(true);
  });
});
