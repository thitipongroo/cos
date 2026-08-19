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
import PmHome from '../../components/home/PmHome';
import MinimalHome from '../../components/home/MinimalHome';

export default function HomeScreen() {
  const role = useAuthStore((s) => s.role);

  switch (role) {
    case CosRole.EXECUTIVE:
      return <ExecHome />;
    case CosRole.FINANCE:
      return <FinanceHome />;
    case CosRole.PROCUREMENT_OFFICER:
    case CosRole.PROC_MANAGER:
      return <ProcurementHome />;
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
