import { ApiError } from '../api/client';
import { procurementActionErrorKey, type ProcurementAction } from '../procurementErrors';
import en from '../../i18n/en.json';
import th from '../../i18n/th.json';

const apiError = (
  status: number,
  messageKey?: string,
  code?: string,
  details?: Record<string, unknown>,
) => new ApiError(status, `Request failed: ${status}`, code, details, messageKey);

// Plan CW (product owner 2026-11-20): a TH/EN reason for each refused action, never the server's English text.
describe('procurementActionErrorKey', () => {
  it.each([
    ['create', 'procurement.project.closed', 'proc.err.projectClosed'],
    ['create', 'procurement.rfq.prOtherProject', 'proc.err.prOtherProject'],
    ['award', 'procurement.rfq.alreadyAwarded', 'proc.err.alreadyAwarded'],
    ['createRequest', 'procurement.pr.duplicateNumber', 'proc.err.prNumberTaken'],
    ['createRequest', 'procurement.project.closed', 'proc.err.projectClosed'],
  ] as const)('%s with messageKey %s → %s', (action, messageKey, key) => {
    // The statuses the API sends with each: 422 COS-PROC-422, and 409 COS-PROC-409 for an award already made.
    const status =
      messageKey.endsWith('alreadyAwarded') || messageKey.endsWith('duplicateNumber') ? 409 : 422;
    expect(procurementActionErrorKey(action, apiError(status, messageKey))).toBe(key);
  });

  it.each([
    ['create', 400, 'proc.err.deadlineNotFuture'],
    ['create', 404, 'proc.err.projectNotFound'],
    ['publish', 422, 'proc.err.publishRefused'],
    ['close', 422, 'proc.err.stateChanged'],
    ['cancel', 422, 'proc.err.stateChanged'],
    ['award', 404, 'proc.err.quotationGone'],
    ['award', 422, 'proc.err.stateChanged'],
    ['createRequest', 404, 'proc.err.projectNotFound'],
  ] as const)('%s answered %i → %s', (action, status, key) => {
    expect(procurementActionErrorKey(action, apiError(status, 'general.error.validation'))).toBe(
      key,
    );
  });

  it('403 on any action → no permission', () => {
    const actions: ProcurementAction[] = [
      'create',
      'publish',
      'close',
      'cancel',
      'award',
      'createRequest',
    ];
    for (const action of actions) {
      expect(procurementActionErrorKey(action, apiError(403, undefined, 'COS-PLAN-003'))).toBe(
        'proc.err.forbidden',
      );
    }
  });

  it.each([
    [
      "a create 400 from the request's own validation (field errors), not the deadline",
      apiError(400, 'general.error.validation', 'COS-GENERAL-400', {
        fieldErrors: ['rfq_number must be shorter than or equal to 50 characters'],
      }),
    ],
    ['an unmapped status', apiError(500)],
    ['a status this action does not map', apiError(422)], // create has no 422 of its own
    ['an unknown messageKey', apiError(409, 'procurement.something.else')],
    ['a network failure (not an ApiError)', new TypeError('Failed to fetch')],
  ])('falls back to the generic line for %s', (_n, error) => {
    expect(procurementActionErrorKey('create', error)).toBe('proc.err.generic');
  });

  it("a purchase request's 409 for another tenant's replayed id, and its 400, → the generic line", () => {
    expect(
      procurementActionErrorKey(
        'createRequest',
        apiError(409, 'procurement.pr.duplicateId', 'COS-PROC-409'),
      ),
    ).toBe('proc.err.generic');
    expect(
      procurementActionErrorKey('createRequest', apiError(400, 'general.error.validation')),
    ).toBe('proc.err.generic');
  });

  it('every key it can return exists in both languages', () => {
    const keys = [
      'generic',
      'forbidden',
      'projectClosed',
      'prOtherProject',
      'alreadyAwarded',
      'deadlineNotFuture',
      'projectNotFound',
      'publishRefused',
      'stateChanged',
      'quotationGone',
      'prNumberTaken',
    ];
    for (const dict of [en, th] as Array<{ proc: { err: Record<string, string> } }>) {
      for (const k of keys) expect(dict.proc.err[k]).toEqual(expect.any(String));
    }
    expect((en as { validation: Record<string, string> }).validation['notInFuture']).toBeTruthy();
    expect((th as { validation: Record<string, string> }).validation['notInFuture']).toBeTruthy();
  });
});
