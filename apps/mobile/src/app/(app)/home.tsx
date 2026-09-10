// Home — the role switch, and nothing else.
//
// This file was 1401 lines: six role dashboards, the stylesheet they share and the four
// presentational bits built on it, all beside a switch that renders exactly ONE of them. Every
// role's screen was parsed to draw one role's screen.
//
// The six now live in components/home/, one file each, beside the three that were already there
// (SiteEngineerHome, TenantAdminHome, SafetyOfficerHome) — so the layout of this feature is finally
// uniform: one file per role, plus the kit they share.

import { CosRole } from '@cos/types';
import { useAuthStore } from '../../store/authStore';
import SiteEngineerHome from '../../components/SiteEngineerHome';
import TenantAdminHome from '../../components/TenantAdminHome';
import SafetyOfficerHome from '../../components/SafetyOfficerHome';
import FieldHome from '../../components/home/FieldHome';
import ExecHome from '../../components/home/ExecHome';
import FinanceHome from '../../components/home/FinanceHome';
import ProcurementHome from '../../components/home/ProcurementHome';
import ProcManagerHome from '../../components/home/ProcManagerHome';
import PmHome from '../../components/home/PmHome';
import CrmHome from '../../components/home/CrmHome';
import ViewerHome from '../../components/home/ViewerHome';
import MinimalHome from '../../components/home/MinimalHome';

export default function HomeScreen() {
  const role = useAuthStore((s) => s.role);

  switch (role) {
    case CosRole.EXECUTIVE:
      return <ExecHome />;
    case CosRole.FINANCE:
      return <FinanceHome />;
    case CosRole.PROCUREMENT_OFFICER:
      return <ProcurementHome />;
    // SPLIT FROM THE OFFICER ON 2026-09-09. Both roles shared one dashboard until
    // `mockup/mobile/11_proc_manager/01_home` arrived and turned out not to be the same screen with
    // different numbers: the officer's is four WORK QUEUES, the manager's is committed spend, the
    // approvals waiting on a signature and how the suppliers are performing.
    case CosRole.PROC_MANAGER:
      return <ProcManagerHome />;
    // Added 2026-09-09. This role fell through to <MinimalHome /> — a 22-line placeholder —
    // while its drawing had a full dashboard. §20.7.10 had deferred CRM dashboards to
    // post-MVP; the product owner lifted that for this screen and the section was amended in
    // the same commit. See CrmHome.tsx's header for what the screen does and does not claim.
    case CosRole.CRM_SALES_MANAGER:
      return <CrmHome />;
    // Added 2026-09-10, and the same gap as the two rows above: this role fell through to
    // <MinimalHome /> while `mockup/mobile/role_viewer/01_home/01_dashboard` had a full read-only
    // portfolio dashboard. The five VIEWER drawings were requested from Stitch by the product owner
    // that day. See components/home/ViewerHome.tsx for what the screen counts and what it draws.
    case CosRole.VIEWER:
      return <ViewerHome />;
    case CosRole.PROJECT_MANAGER:
      return <PmHome />;
    case CosRole.SITE_ENGINEER:
      return <SiteEngineerHome />;
    case CosRole.TENANT_ADMIN:
      return <TenantAdminHome />;
    case CosRole.SITE_WORKER:
      return <FieldHome />;
    // Added 2026-08-13 — this role used to fall through to <MinimalHome /> because master §Phase 10
    // enumerates no Home for it. `mockup/mobile/07_safety_officer/01_home/01_sa_home_dashboard` is
    // the drawing it is built from; see components/SafetyOfficerHome.tsx.
    case CosRole.SAFETY_OFFICER:
      return <SafetyOfficerHome />;
    default:
      return <MinimalHome />;
  }
}
