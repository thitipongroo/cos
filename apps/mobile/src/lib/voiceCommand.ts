// Voice-command routing (ADR-073). The AI gateway classifies a transcript into an intent; this pure
// function turns that into a concrete mobile action. Kept out of the FAB component so it carries a
// 100% unit gate — the component only records, calls the gateway, and dispatches what this returns.
//
// Routing is grounded in screens that actually exist (ห้ามเดา): SEARCH has no screen yet, so it maps
// to `unsupported` — never a route to nowhere. UNKNOWN (the classifier's "unsure") does the same, so a
// misheard command never fires a wrong action.

export type VoiceIntent = 'DAILY_REPORT' | 'LOG_ISSUE' | 'NAVIGATE' | 'SEARCH' | 'UNKNOWN';

export interface ParsedCommand {
  intent: VoiceIntent;
  target?: string | null; // NAVIGATE screen key (home/issues/inspections/reports/tasks)
  text?: string | null; // the dictated content, prefilled into report/issue
}

export type VoiceAction =
  | { kind: 'route'; route: string; params?: Record<string, string> }
  | { kind: 'unsupported'; reason: 'search' | 'destination' | 'unrecognized' };

// NAVIGATE targets → routes. Only screens that exist in app/(app) are here.
const NAV_ROUTES: Record<string, string> = {
  home: '/home',
  issues: '/issues',
  inspections: '/inspections',
  reports: '/reports',
  tasks: '/tasks',
};

function toRoute(route: string, text?: string | null): VoiceAction {
  return text ? { kind: 'route', route, params: { note: text } } : { kind: 'route', route };
}

export function actionForCommand(cmd: ParsedCommand): VoiceAction {
  switch (cmd.intent) {
    case 'DAILY_REPORT':
      return toRoute('/report', cmd.text);
    case 'LOG_ISSUE':
      return toRoute('/issues', cmd.text);
    case 'NAVIGATE': {
      const route = cmd.target ? NAV_ROUTES[cmd.target] : undefined;
      return route ? { kind: 'route', route } : { kind: 'unsupported', reason: 'destination' };
    }
    case 'SEARCH':
      // Recognised, but no search screen exists yet (ADR-073) — never route to nowhere.
      return { kind: 'unsupported', reason: 'search' };
    default:
      return { kind: 'unsupported', reason: 'unrecognized' };
  }
}
