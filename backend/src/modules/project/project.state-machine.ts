// Project Status State Machine
// Source: context/00_master_construction_os.md §Phase 3 Project Status State Machine
// DO NOT add states or transitions beyond those specified here.

export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export interface TransitionContext {
  currentStatus: ProjectStatus;
  toStatus: ProjectStatus;
  actorRole: string;
  endDate?: string | null;
  reason?: string;
}

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

// Allowed transitions: from → set of allowed targets
const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['ACTIVE', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [], // terminal
};

// Roles allowed to trigger each target status
const TRANSITION_ROLES: Record<ProjectStatus, string[]> = {
  DRAFT: [],
  ACTIVE: ['PROJECT_MANAGER', 'TENANT_ADMIN'],
  ON_HOLD: ['PROJECT_MANAGER', 'TENANT_ADMIN'],
  COMPLETED: ['TENANT_ADMIN'],
  CANCELLED: ['TENANT_ADMIN'],
};

export function validateTransition(ctx: TransitionContext): TransitionResult {
  const { currentStatus, toStatus, actorRole, endDate, reason } = ctx;

  if (currentStatus === 'CANCELLED') {
    return {
      allowed: false,
      reason: 'CANCELLED is a terminal state — no further transitions allowed',
    };
  }

  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed.includes(toStatus)) {
    return {
      allowed: false,
      reason: `Transition ${currentStatus} → ${toStatus} is not permitted`,
    };
  }

  const requiredRoles = TRANSITION_ROLES[toStatus];
  if (!requiredRoles.includes(actorRole)) {
    return {
      allowed: false,
      reason: `Role ${actorRole} cannot transition to ${toStatus}. Required: ${requiredRoles.join(', ')}`,
    };
  }

  if (toStatus === 'COMPLETED') {
    if (!endDate) {
      return { allowed: false, reason: 'Project end_date must be set before completing' };
    }
    const today = new Date().toISOString().slice(0, 10);
    if (endDate > today) {
      return {
        allowed: false,
        reason: `end_date (${endDate}) must be <= today (${today}) to complete`,
      };
    }
  }

  if ((toStatus === 'ON_HOLD' || toStatus === 'CANCELLED') && !reason) {
    return { allowed: false, reason: `reason is required when transitioning to ${toStatus}` };
  }

  return { allowed: true };
}

/** Returns the set of valid target statuses given a current status (for API docs / UI). */
export function allowedTransitions(current: ProjectStatus): ProjectStatus[] {
  return ALLOWED_TRANSITIONS[current] ?? [];
}
