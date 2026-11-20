import { RoleShell } from '@/components/shell/role-shell';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RoleShell role="TEACHER">{children}</RoleShell>;
}
