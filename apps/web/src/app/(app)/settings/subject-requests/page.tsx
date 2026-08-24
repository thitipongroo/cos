'use client';

import { useState } from 'react';
import { subjectRequestCreateSchema } from '@cos/schemas';
import { Controller } from 'react-hook-form';
import { NativeSelectField } from '../../../../components/form/NativeSelectField';
import { TextInputField } from '../../../../components/form/TextInputField';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useI18n } from '../../../../i18n';
import {
  useSubjectRequests,
  useCreateSubjectRequest,
  useSubjectMatches,
  useEraseSubjectRequest,
  useCloseSubjectRequest,
  useSendSubjectVerification,
} from '../../../../lib/api/queries';
import type { SubjectRequestRow } from '../../../../lib/api/types';
import { useValidatedForm } from '../../../../lib/forms';

/**
 * Subject requests — the tenant's compliance desk (§20.7.8 → /api/v1/subject-requests; ADR-090).
 *
 * These are requests from people with NO account here: a CRM contact, a lead, the named contact at a
 * vendor. This organisation is their CONTROLLER and Construction OS is the processor, so the desk
 * lives with the tenant and not with the subject — there is no self-service screen for them.
 *
 * NOTHING IS LOOKED UP UNTIL A REQUEST IS SELECTED. `useSubjectMatches` stays disabled while
 * `selected` is null, so opening this page never searches, and the identifiers a search runs on come
 * from the request row on the server rather than from anything typed here. That binding is what
 * stops the screen becoming an oracle answering "is this address one of our customers" (ADR-090 §4);
 * the server audits every call with the actor, the request and the match count.
 */
export default function SettingsSubjectRequestsPage() {
  const { t } = useI18n();
  const query = useSubjectRequests();
  const create = useCreateSubjectRequest();
  const erase = useEraseSubjectRequest();
  const close = useCloseSubjectRequest();
  const verify = useSendSubjectVerification();

  const [selected, setSelected] = useState<string | null>(null);
  const matches = useSubjectMatches(selected);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: subjectRequestCreateSchema,
    defaultValues: {
      request_type: 'ACCESS' as const,
      subject_email: '',
      subject_phone: '',
      received_at: '',
      note: '',
    },
  });

  const columns: Column<SubjectRequestRow>[] = [
    { headerKey: 'settings.srType', cell: (r) => r.request_type },
    // Whichever identifier the subject actually gave. Each is optional on its own; the schema and
    // the server both require at least one.
    { headerKey: 'settings.srSubject', cell: (r) => r.subject_email ?? r.subject_phone ?? '—' },
    {
      headerKey: 'settings.srStatus',
      // Verification state sits beside the status because it is what decides whether the
      // irreversible action is available at all (ADR-090 §6).
      cell: (r) =>
        `${r.status} · ${r.verified_at !== null ? t('settings.srVerified') : t('settings.srUnverified')}`,
    },
    { headerKey: 'settings.srReceived', cell: (r) => r.received_at },
    {
      headerKey: 'settings.srViewMatches',
      cell: (r) => (
        <button type="button" className="underline" onClick={() => setSelected(r.request_id)}>
          {t('settings.srViewMatches')}
        </button>
      ),
    },
  ];

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-h1 font-semibold">{t('settings.srTitle')}</h1>
        {/* Says who the controller is, on the screen rather than only in an ADR: the operator here is
            answering on their own organisation's behalf, and the platform is not answering for them. */}
        <p className="max-w-3xl text-small text-gray-400">{t('settings.srIntro')}</p>
      </header>

      <form
        className="grid max-w-3xl gap-4 md:grid-cols-2"
        onSubmit={handleSubmit(async (values) => {
          await create.mutateAsync({
            request_type: values.request_type,
            subject_email: values.subject_email || undefined,
            subject_phone: values.subject_phone || undefined,
            // The form collects a local datetime; the API takes an instant.
            received_at: new Date(values.received_at).toISOString(),
            note: values.note || undefined,
          });
          reset();
        })}
      >
        <Controller
          control={control}
          name="request_type"
          render={({ field }) => (
            <NativeSelectField
              label={t('settings.srType')}
              errorMessage={errors.request_type ? t(errors.request_type.message ?? '') : undefined}
              options={[
                { id: 'ACCESS', label: t('settings.srAccess') },
                { id: 'ERASURE', label: t('settings.srErasure') },
              ]}
              {...field}
            />
          )}
        />
        <Controller
          control={control}
          name="received_at"
          render={({ field }) => (
            <TextInputField
              label={t('settings.srReceivedAt')}
              placeholder="2026-08-14T09:00"
              errorMessage={errors.received_at ? t(errors.received_at.message ?? '') : undefined}
              {...field}
            />
          )}
        />
        <Controller
          control={control}
          name="subject_email"
          render={({ field }) => (
            <TextInputField
              type="email"
              label={t('settings.srEmail')}
              errorMessage={
                errors.subject_email ? t(errors.subject_email.message ?? '') : undefined
              }
              {...field}
            />
          )}
        />
        <Controller
          control={control}
          name="subject_phone"
          render={({ field }) => (
            <TextInputField
              type="tel"
              label={t('settings.srPhone')}
              errorMessage={
                errors.subject_phone ? t(errors.subject_phone.message ?? '') : undefined
              }
              {...field}
            />
          )}
        />
        <Controller
          control={control}
          name="note"
          render={({ field }) => (
            <TextInputField
              label={t('settings.srNote')}
              multiline
              errorMessage={errors.note ? t(errors.note.message ?? '') : undefined}
              {...field}
            />
          )}
        />
        <div className="md:col-span-2">
          <button type="submit" disabled={isSubmitting} className="rounded bg-blue-600 px-4 py-2">
            {t('settings.srCreate')}
          </button>
        </div>
      </form>

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(r) => r.request_id}
        isLoading={query.isLoading}
        emptyKey="settings.srNoMatches"
      />

      {selected !== null && (
        <section className="max-w-3xl space-y-3" aria-live="polite">
          <h2 className="text-h2 font-semibold">{t('settings.srMatches')}</h2>

          {/* An empty result is reported with the server's own note, not as "nothing is held": a lead
              carries a contact name but no email or phone of its own, so a lead with no contact row
              cannot be reached by identifier at all. */}
          {matches.data && matches.data.matches.length === 0 && (
            <p className="text-small text-gray-400">
              {matches.data.note ?? t('settings.srNoMatches')}
            </p>
          )}

          <ul className="space-y-2">
            {(matches.data?.matches ?? []).map((m) => (
              <li key={`${m.source}:${m.id}`} className="rounded border p-3">
                <p className="text-small font-medium">{m.source}</p>
                <dl className="grid grid-cols-2 gap-x-4 text-small">
                  {Object.entries(m.fields).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-gray-400">{k}</dt>
                      <dd>{v ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>

          {/* Says why the destructive button may refuse, before it is pressed. */}
          <p className="text-small text-gray-400">{t('settings.srVerifyHint')}</p>

          <div className="flex flex-wrap gap-2">
            {/* Erasure with no legal hold: the default, so an erasure really erases. A hold is
                something the operator asks for when a dispute exists (ADR-090 §5). */}
            <button
              type="button"
              className="rounded border px-4 py-2"
              onClick={() => verify.mutate(selected)}
            >
              {t('settings.srVerify')}
            </button>
            <button
              type="button"
              className="rounded bg-red-700 px-4 py-2"
              onClick={() => erase.mutate({ requestId: selected, input: {} })}
            >
              {t('settings.srErase')}
            </button>
            <button
              type="button"
              className="rounded border px-4 py-2"
              onClick={() =>
                close.mutate({
                  requestId: selected,
                  input: { status: 'FULFILLED', outcome_note: t('settings.srFulfilled') },
                })
              }
            >
              {t('settings.srClose')}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
