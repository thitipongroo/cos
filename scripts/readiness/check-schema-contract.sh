#!/usr/bin/env bash
# Verifies @cos/schemas has not drifted from the API request types in apps/web/src/lib/api/types.ts.
#
# This check exists because the drift already happened, silently, three times. The first schemas
# were written from DESIGN.md prose rather than from the request types, so:
#
#   - incidentReportSchema validated title/description while the safety page submits
#     incident_type/task_id — it would have rejected every payload the form actually sends;
#   - riskCreateSchema required a `status` that CreateRiskInput has no field for, and omitted
#     `description` and `owner`;
#   - inspectionSubmitSchema demanded project_id and checklist_id on a PATCH that takes neither.
#
# None of that shows up until a user submits a form, and TypeScript only catches it at whichever
# call site happens to be wired up. Comparing field names catches all of it here.
#
# It lives in scripts/readiness/ rather than as a jest spec for two reasons: it is a cross-package
# structural invariant (same shape as check-i18n-completeness.sh), and it needs to read files from
# two packages, which neither package's jest config is set up to do.
#
# Usage: scripts/readiness/check-schema-contract.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

python3 - "$ROOT" <<'PY'
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
types_path = root / 'apps' / 'web' / 'src' / 'lib' / 'api' / 'types.ts'
forms_path = root / 'packages' / '@cos' / 'schemas' / 'src' / 'forms.ts'

for p in (types_path, forms_path):
    if not p.is_file():
        print(f'  ✗ not found: {p}')
        sys.exit(1)

# encoding='utf-8' is required: Windows defaults to cp1252 and these files contain em dashes.
# The vendor tier declares its own request interfaces in api/vendor.ts rather than api/types.ts;
# both are searched so a schema can be paired with either.
vendor_path = root / 'apps' / 'web' / 'src' / 'lib' / 'api' / 'vendor.ts'
types = types_path.read_text(encoding='utf-8') + '\n' + vendor_path.read_text(encoding='utf-8')
forms = forms_path.read_text(encoding='utf-8')

# schema export -> the request interface it must mirror.
PAIRS = [
    ('issueCreateSchema', 'CreateIssueInput'),
    ('incidentReportSchema', 'CreateIncidentInput'),
    ('siteReportCreateSchema', 'CreateSiteReportInput'),
    ('riskCreateSchema', 'CreateRiskInput'),
    ('inspectionSubmitSchema', 'UpdateInspectionInput'),
    ('projectCreateSchema', 'CreateProjectInput'),
    ('purchaseRequestCreateSchema', 'CreatePurchaseRequestInput'),
    ('rfqCreateSchema', 'CreateRfqInput'),
    ('deliveryRecordSchema', 'RecordDeliveryInput'),
    ('paymentRecordSchema', 'RecordPaymentInput'),
    ('taskUpdateSchema', 'UpdateTaskInput'),
    ('userCreateSchema', 'CreateUserInput'),
    ('tenantSettingsSchema', 'UpdateTenantSettingsInput'),
    ('tenantCreateSchema', 'CreateTenantInput'),
    ('leadCreateSchema', 'CreateLeadInput'),
    ('opportunityCreateSchema', 'CreateOpportunityInput'),
    ('quotationSubmitSchema', 'SubmitQuotationInput'),
    ('vendorInvoiceSubmitSchema', 'SubmitInvoiceInput'),
    # ADR-090 — the tenant's compliance desk for subject requests from people with no account.
    ('subjectRequestCreateSchema', 'CreateSubjectRequestInput'),
    ('subjectRequestCloseSchema', 'CloseSubjectRequestInput'),
    ('subjectRequestEraseSchema', 'EraseSubjectRequestInput'),
]

# Schemas with no `Create*Input` / `Record*Input` counterpart to mirror:
#   riskStatusUpdateSchema — one field of UpdateRiskInput, not a whole request body
#   otpPhoneSchema         — /auth/otp/request takes a bare { phoneNumber } body
# The vendor pair mirrors interfaces that live in api/vendor.ts, not api/types.ts, and are checked
# against that file below.
#   otpVerifySchema        — goes to next-auth signIn('otp', ...), not a REST body
EXEMPT = {'riskStatusUpdateSchema', 'otpPhoneSchema', 'otpVerifySchema'}


def object_body(source, schema):
    r"""Text between the braces of `export const <schema> = z.object({ ... })`.

    Brace-counted rather than regex-matched. A non-greedy `\{(.*?)\n\s*\}\)` stops at the first
    `\n  })` in the body, which for inspectionSubmitSchema is the close of its nested
    `z.enum([...], { ... })` — silently truncating the field list and reporting the real fields
    after it as missing. That false positive is exactly the kind of thing this script exists to
    catch, so it must not produce one itself.
    """
    m = re.search(rf'export const {schema} = z\s*\.?object\(\{{', source)
    if not m:
        return None
    start = m.end()
    depth = 1
    for i in range(start, len(source)):
        c = source[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return source[start:i]
    return None


def top_level_keys(body):
    """Keys declared at the top level of an object-literal body.

    Comments are stripped first — several schemas carry a `// name: value` note that would
    otherwise read as a field — and nesting is tracked so a key inside `z.enum([...], {error: ...})`
    or `items: z.array(z.object({...}))` is not mistaken for a field of the outer object.
    `planType,` shorthand counts, hence ',' terminates a match as well as ':'.
    """
    keys, depth = set(), 0
    for line in re.sub(r'//[^\n]*', '', body).split('\n'):
        if depth == 0:
            m = re.match(r'\s*(\w+)\s*[:,]', line)
            if m:
                keys.add(m.group(1))
        depth += len(re.findall(r'[{\[(]', line)) - len(re.findall(r'[}\])]', line))
    return keys


failures = []

exported = set(re.findall(r'^export const (\w+Schema) =', forms, re.M))
uncovered = sorted(exported - {s for s, _ in PAIRS} - EXEMPT)
if uncovered:
    failures.append(f'schemas with no contract pairing: {uncovered}')

for schema, iface in PAIRS:
    mi = re.search(rf'(?:export )?interface {iface} \{{(.*?)\n\}}', types, re.S)
    body = object_body(forms, schema)
    if not mi:
        failures.append(f'{iface}: interface not found in types.ts')
        continue
    if body is None:
        failures.append(f'{schema}: schema not found in forms.ts')
        continue
    want = set(re.findall(r'^\s*(\w+)\??:', mi.group(1), re.M))
    got = top_level_keys(body)
    missing, extra = sorted(want - got), sorted(got - want)
    if missing or extra:
        failures.append(
            f'{schema} vs {iface}: missing {missing or "-"}, extra {extra or "-"}'
        )

print(f'  schema/contract pairs checked: {len(PAIRS)}')
if failures:
    print(f'\n  ✗ {len(failures)} mismatch(es):')
    for f in failures:
        print(f'    {f}')
    sys.exit(1)

print('  ✓ every schema mirrors its API request type')
PY
