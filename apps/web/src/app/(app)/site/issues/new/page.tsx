'use client';

import { issueCreateSchema } from '@cos/schemas';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { NativeSelectField } from '../../../../../components/form/NativeSelectField';
import { TextInputField } from '../../../../../components/form/TextInputField';
import { useI18n } from '../../../../../i18n';
import { useUpload, isQueued } from '../../../../../lib/api/client';
import { useCreateIssue, useProjects } from '../../../../../lib/api/queries';
import type { IssueSeverity, UploadedFileResult } from '../../../../../lib/api/types';
import { useValidatedForm } from '../../../../../lib/forms';

const SEVERITIES: IssueSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Quick issue with optional photo (§20.7.6 → POST /site/issues + POST /files/upload). */
export default function NewIssuePage() {
  const { t } = useI18n();
  const projects = useProjects();
  const create = useCreateIssue();
  const upload = useUpload();
  // The photo stays outside react-hook-form: it is not part of issueCreateSchema and is uploaded
  // in a second request, against the id the first one returns.
  const [photo, setPhoto] = useState<File | null>(null);
  const [done, setDone] = useState(false);
  // True when the create went to the offline queue instead of the server.
  const [queued, setQueued] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useValidatedForm({
    schema: issueCreateSchema,
    defaultValues: { project_id: '', title: '', description: '', severity: 'MEDIUM' as const },
  });

  // Messages arrive as i18n keys from @cos/schemas (QM-3) — resolved here, at the only layer that
  // knows the user's locale.
  const messageFor = (key?: string) => (key ? t(key) : undefined);

  const submit = handleSubmit(async (values) => {
    setDone(false);
    setQueued(false);
    const issue = await create.mutateAsync(values);
    // Offline: the issue is in the replay queue and has no server id yet, so there is nothing to
    // attach a photo to. The web client has no photo queue of its own — that is the React Native
    // client's local_photos (master:3571) — so rather than drop the image silently, the form says
    // the report was saved without it and keeps the user's selection on screen.
    if (isQueued(issue)) {
      setQueued(true);
      setDone(true);
      return;
    }
    if (photo) {
      const form = new FormData();
      form.append('file', photo);
      await upload<UploadedFileResult>(
        `/files/upload?entity_type=issue&entity_id=${issue.issue_id}`,
        form,
      );
    }
    setQueued(false);
    setDone(true);
  });

  const projectOptions =
    projects.data?.items.map((p) => ({ id: p.project_id, label: p.project_name })) ?? [];

  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('site.issuesNewTitle')}</h1>
      {/* role="status" so the confirmation is announced — a plain <p> appearing is announced by
          nothing (checklist item C8). */}
      {done && (
        <p role="status" className="mb-3 text-sm text-green-700">
          {/* Two different truths. "Submitted" would be a lie for a queued report — and if the user
              attached a photo, that photo is NOT in the queue, so saying so is the difference
              between them re-attaching it later and never knowing it was dropped. */}
          {queued ? t('sync.savedOffline') : t('site.submitted')}
        </p>
      )}
      {queued && photo && (
        <p role="status" className="mb-3 text-sm text-amber-700">
          {t('sync.photoNotQueued')}
        </p>
      )}
      {/* noValidate hands validation to the schema: the browser's own bubbles are unstyleable,
          untranslatable, and would fire before react-hook-form ever runs. */}
      <form onSubmit={submit} noValidate className="space-y-3">
        <Controller
          name="project_id"
          control={control}
          render={({ field }) => (
            <NativeSelectField
              {...field}
              label={t('site.selectProject')}
              placeholder={t('site.selectProject')}
              options={projectOptions}
              errorMessage={messageFor(errors.project_id?.message)}
            />
          )}
        />
        <Controller
          name="title"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              label={t('site.fieldTitle')}
              errorMessage={messageFor(errors.title?.message)}
            />
          )}
        />
        <Controller
          name="severity"
          control={control}
          render={({ field }) => (
            <NativeSelectField
              {...field}
              label={t('site.fieldSeverity')}
              options={SEVERITIES.map((s) => ({ id: s, label: s }))}
              errorMessage={messageFor(errors.severity?.message)}
            />
          )}
        />
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <TextInputField
              {...field}
              multiline
              rows={3}
              label={t('site.fieldDescription')}
              errorMessage={messageFor(errors.description?.message)}
            />
          )}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="issue-photo" className="block text-sm font-medium text-gray-700">
            {t('site.fieldPhoto')}
          </label>
          <input
            id="issue-photo"
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting || create.isPending}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('site.submit')}
        </button>
      </form>
    </div>
  );
}
