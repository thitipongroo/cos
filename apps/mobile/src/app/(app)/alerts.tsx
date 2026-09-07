// Alerts screen — the EXECUTIVE portfolio task roll-up.
// Implements mockup/mobile/08_executive/02_alerts/02_ex_alerts.
//
// THIS SCREEN WAS REPLACED ON 2026-09-07, and the replacement is a product-owner decision that
// deliberately reverses one made the same morning. It is worth stating plainly, because what was
// here before was working code with real data behind it.
//
// WHAT WAS HERE: a risk feed. One card per project from `GET /analytics/executive`, banded
// CRITICAL → HIGH → MEDIUM by `executiveSeverityOf`, sorted worst-first — which is exactly what
// spec §20.7.1 defines at `/alerts` ("Delay risk, budget overrun, critical issues sorted by
// severity"). That is why the morning's escalation resolved the name clash in its favour.
//
// WHAT THE DRAWING ACTUALLY SAYS. `02_alerts/02_ex_alerts` is the previous `02_tasks/02_ex_tasks`
// file with FOUR LINES CHANGED — the four labels in its `<nav>`. Measured, not assumed: diff the
// two blobs either side of commit a23b385b and the body is byte-identical. So the drawing behind
// the tab named "Alerts" draws the TASK ROLL-UP: overdue / due-this-week / blocked, the AI risk
// alert feed, and the critical path.
//
// THE PRODUCT OWNER CHOSE THE DRAWING (2026-09-07): make this screen the task roll-up, delete the
// risk feed, and amend the specification rather than deviate from it. §20.7.1 and ADR-098 were
// amended in the same commit (Rule 37).
//
// WHAT THAT COST, recorded rather than glossed. The per-project risk LIST is gone from the product.
// Nothing else lists projects by severity: Home's RISKS tile counts them from the same derivation
// and the Portfolio screen bands its cards, but neither is the feed. If it is wanted back it is a
// new screen, not a revert — this file no longer holds it.
//
// ONE SCREEN, ONE ROUTE. `<ExecTasks />` is the same component `/tasks` renders for this role, and
// this route now carries it. It is NOT offered twice: `/tasks` lost its EXECUTIVE drawer row in the
// same change (drawerLinks.ts), because a screen reachable under two names is the mistake
// `dashboard` and `home` made. The field roles keep `/tasks` untouched.
//
// EXECUTIVE-ONLY, which is why nothing here branches on role. `/alerts` is this role's tab and no
// other role's route — TENANT_ADMIN's bar carries a tab LABELLED "Alerts", but that is `sync-queue`,
// the conflict-review queue, a different screen at a different path.

import { ExecTasks } from '../../components/ExecTasks';

export default function AlertsScreen(): React.JSX.Element {
  return <ExecTasks />;
}
