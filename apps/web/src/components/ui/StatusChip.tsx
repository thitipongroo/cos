'use client';

import { useT } from '../../i18n';
import type { ProjectStatus } from '../../lib/api/types';

const STATUS_CLASS: Record<ProjectStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-green-100 text-green-700',
  ON_HOLD: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

/** Project status chip with i18n label and status-specific colour. */
export function StatusChip({ status }: { status: ProjectStatus }) {
  const t = useT();
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {t(`projectStatus.${status}`)}
    </span>
  );
}
