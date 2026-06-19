'use client';

import { useState } from 'react';
import { useI18n } from '../../../../../i18n';
import { useProjects, useCreateIssue } from '../../../../../lib/api/queries';
import { useUpload } from '../../../../../lib/api/client';
import type { IssueSeverity, UploadedFileResult } from '../../../../../lib/api/types';

const SEVERITIES: IssueSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Quick issue with optional photo (§20.7.6 → POST /site/issues + POST /files/upload). */
export default function NewIssuePage() {
  const { t } = useI18n();
  const projects = useProjects();
  const create = useCreateIssue();
  const upload = useUpload();
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IssueSeverity>('MEDIUM');
  const [photo, setPhoto] = useState<File | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    const issue = await create.mutateAsync({
      project_id: projectId,
      title,
      description: description || undefined,
      severity,
    });
    if (photo) {
      const form = new FormData();
      form.append('file', photo);
      await upload<UploadedFileResult>(
        `/files/upload?entity_type=issue&entity_id=${issue.issue_id}`,
        form,
      );
    }
    setDone(true);
  };

  const field = 'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm';

  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-2xl font-bold text-gray-800">{t('site.issuesNewTitle')}</h1>
      {done && <p className="mb-3 text-sm text-green-700">{t('site.submitted')}</p>}
      <form onSubmit={submit} className="space-y-3">
        <select
          required
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={field}
        >
          <option value="">{t('site.selectProject')}</option>
          {projects.data?.items.map((p) => (
            <option key={p.project_id} value={p.project_id}>
              {p.project_name}
            </option>
          ))}
        </select>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('site.fieldTitle')}
          className={field}
        />
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
          className={field}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('site.fieldDescription')}
          className={field}
          rows={3}
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          className="block text-sm"
          aria-label={t('site.fieldPhoto')}
        />
        <button
          type="submit"
          disabled={create.isPending || !projectId || !title}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t('site.submit')}
        </button>
      </form>
    </div>
  );
}
