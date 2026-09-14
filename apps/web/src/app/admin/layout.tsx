import { AdminShell } from '../../components/admin/AdminShell';

/**
 * `/admin/**` — the SYSTEM_ADMIN panel (§20.4), outside the tenant app's `(app)` shell on purpose:
 * §20.7.11 keeps cross-tenant administration separate from the tenant client.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
