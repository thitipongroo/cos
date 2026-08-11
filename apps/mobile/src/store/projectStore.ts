// The project the site worker is currently working on.
//
// WHY A STORE AND NOT A SCREEN'S STATE. The corrected `mockup/mobile/05_site_worker` set (2026-08-10)
// adds `00_sw_project_selection` in front of the dashboard and then prints the chosen project on
// EVERY screen after it — the dashboard's title, the issue form, the safety checklist, the task
// list, the quick-action sheet. Six screens have to agree about one answer, so the answer lives in
// one place.
//
// PERSISTED, because the question it answers does not change between app launches. A worker is on
// the same site tomorrow morning, and a field app that asks again at every cold start is asking
// someone in gloves to re-answer something it already knew. Kept in expo-secure-store like
// themeStore/localeStore/authStore — one storage mechanism for the app's small persistent state.
//
// WHAT IT DELIBERATELY DOES NOT DO: it does not verify that the worker still belongs to the stored
// project. Membership is the server's to enforce (§6.5 ABAC scopes every project-bound query), and a
// client-side check would be a second, weaker copy of that rule. What the store guarantees is only
// that the app remembers what it was told.

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const PROJECT_KEY = 'cos_active_project';

/** The chosen project, as much of it as the screens need to name it. */
export interface ActiveProject {
  projectId: string;
  projectCode: string;
  projectName: string;
  /**
   * The building the worker is on, from `projects.buildings`.
   *
   * This is the drawing's "Zone C - North Wing" line (PO decision 2026-08-11). There is no zone
   * field on a project or on a membership; the building name is the narrowest real location the
   * data has. Null where a project has no building recorded — the line is then not drawn, rather
   * than showing a placeholder that reads like a place.
   */
  buildingName: string | null;
}

interface ProjectState {
  active: ActiveProject | null;

  /** Load the remembered project on launch. A stored value that will not parse is discarded. */
  hydrate: () => Promise<void>;

  /** Choose a project and remember it. */
  select: (project: ActiveProject) => Promise<void>;

  /** Forget it — used on sign-out, so the next person on this handset picks their own. */
  clear: () => Promise<void>;

  /**
   * Is the picker sheet up?
   *
   * IT LIVES HERE BECAUSE IT IS NOT ONE SCREEN'S BUSINESS. The sheet is opened from the context bar
   * on every Site Worker screen and from inside the quick-actions overlay, and it is FORCED OPEN by
   * the shell when no site has been chosen. Those three have no parent in common but this store, and
   * routing was what carried it before — which is exactly what the product owner asked to stop:
   * a route makes the forced case a page you can press Back out of.
   */
  pickerOpen: boolean;

  /** Open it deliberately, mid-session — the dismissible case. */
  openPicker: () => void;

  /** Close it. Harmless when no site is chosen: the shell holds it open regardless. */
  closePicker: () => void;
}

/** Reject anything that is not a complete `ActiveProject`, whatever was in storage. */
function parse(stored: string | null): ActiveProject | null {
  if (stored === null) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== 'object' || value === null) return null;
    const row = value as Record<string, unknown>;
    if (
      typeof row['projectId'] !== 'string' ||
      typeof row['projectCode'] !== 'string' ||
      typeof row['projectName'] !== 'string' ||
      row['projectId'] === ''
    ) {
      return null;
    }
    return {
      projectId: row['projectId'],
      projectCode: row['projectCode'],
      projectName: row['projectName'],
      buildingName: typeof row['buildingName'] === 'string' ? row['buildingName'] : null,
    };
  } catch {
    // Storage held something this version cannot read. Starting from "no project chosen" sends the
    // worker through the picker, which is a working app; throwing on launch is not.
    return null;
  }
}

export const useProjectStore = create<ProjectState>((set) => ({
  active: null,
  pickerOpen: false,

  hydrate: async () => {
    const parsed = parse(await SecureStore.getItemAsync(PROJECT_KEY));
    if (parsed !== null) set({ active: parsed });
  },

  select: async (project) => {
    // Choosing closes it — the sheet asked one question and now has its answer.
    set({ active: project, pickerOpen: false });
    await SecureStore.setItemAsync(PROJECT_KEY, JSON.stringify(project));
  },

  clear: async () => {
    set({ active: null, pickerOpen: false });
    await SecureStore.deleteItemAsync(PROJECT_KEY);
  },
  openPicker: () => set({ pickerOpen: true }),
  closePicker: () => set({ pickerOpen: false }),
}));
