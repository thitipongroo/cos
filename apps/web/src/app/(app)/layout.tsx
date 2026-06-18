import { AppShell } from '../../components/shell/AppShell';

/**
 * Layout for all authenticated operational pages (§20.7). Pages placed under
 * this route group render inside the role-aware app shell. The `(app)` group
 * does not affect URLs — e.g. `(app)/projects/page.tsx` serves `/projects`.
 * Auth pages (/login, /logout, ...) live outside this group and have no shell.
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
