'use client';
import type { ReactNode } from 'react';
import { BarChart3, BookOpen, Building2, CalendarRange, ClipboardList, FileClock, GraduationCap, LayoutDashboard, Library, Settings, Shapes, Users } from 'lucide-react';
import { useLogout, useRequireRole } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/format';
import { AppShell, type NavItem } from './app-shell';

export const NAV: Record<'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT', NavItem[]> = {
  SCHOOL_ADMIN: [
    { href: '/admin', label: 'Tổng quan', icon: LayoutDashboard, exact: true },
    { href: '/admin/teachers', label: 'Giáo viên', icon: Users },
    { href: '/admin/students', label: 'Học sinh', icon: GraduationCap },
    { href: '/admin/classes', label: 'Lớp học', icon: Building2 },
    { href: '/admin/subjects', label: 'Môn học', icon: Library },
    { href: '/admin/school-years', label: 'Năm học', icon: CalendarRange },
    { href: '/admin/assignments', label: 'Bài tập toàn trường', icon: ClipboardList },
    { href: '/admin/audit', label: 'Nhật ký hoạt động', icon: FileClock },
    { href: '/admin/settings', label: 'Cấu hình', icon: Settings },
  ],
  TEACHER: [
    { href: '/teacher', label: 'Tổng quan', icon: LayoutDashboard, exact: true },
    { href: '/teacher/classes', label: 'Lớp học', icon: Shapes },
    { href: '/teacher/assignments', label: 'Bài tập', icon: ClipboardList },
  ],
  STUDENT: [
    { href: '/student', label: 'Tổng quan', icon: LayoutDashboard, exact: true },
    { href: '/student/assignments', label: 'Bài tập của tôi', icon: BookOpen },
    { href: '/student/grades', label: 'Kết quả học tập', icon: BarChart3 },
  ],
};

export function RoleShell({ role, children }: { role: 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT'; children: ReactNode }) {
  const { me, ready, error } = useRequireRole(role);
  const logout = useLogout();
  return (
    <AppShell nav={NAV[role]} roleLabel={ROLE_LABEL[role]} userName={me?.fullName} orgName={me?.tenant.name} onLogout={() => logout()} ready={ready} error={error}>
      {children}
    </AppShell>
  );
}
