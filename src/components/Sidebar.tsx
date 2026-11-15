import type { ComponentType } from 'react';
import {
  Bot,
  CheckSquare,
  Database,
  FilePlus2,
  LayoutDashboard,
  LogOut,
  Users,
} from 'lucide-react';
import type { User, UserRole } from '../types/database';

export interface SidebarNavItem {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
}

const ROLE_NAV_ITEMS: Record<UserRole, SidebarNavItem[]> = {
  STAFF: [
    {
      label: 'Khai báo & Lịch sử',
      path: '/staff/declare',
      icon: FilePlus2,
    },
  ],
  MANAGER: [
    {
      label: 'Bảng điều khiển Dashboard',
      path: '/manager/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'Đối soát & Kiểm duyệt MRV',
      path: '/manager/audit',
      icon: CheckSquare,
    },
    {
      label: 'Trợ lý AI DSS',
      path: '/manager/dss',
      icon: Bot,
    },
  ],
  ADMIN: [
    {
      label: 'Quản trị Hệ số EF & Sao lưu',
      path: '/admin/ef-config',
      icon: Database,
    },
    {
      label: 'Quản lý Tài khoản & Phòng ban',
      path: '/admin/users-depts',
      icon: Users,
    },
  ],
};

export interface SidebarProps {
  user: User;
  activePath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export function Sidebar({ user, activePath, onNavigate, onLogout }: SidebarProps) {
  const navItems = ROLE_NAV_ITEMS[user.role] ?? [];

  return (
    <aside className="w-[220px] shrink-0 h-screen sticky top-0 bg-[#FAFAFA] border-r border-[#E4E4E7] flex flex-col justify-between select-none">
      <div>
        {/* Top Brand Header */}
        <div className="px-4 py-4 border-b border-[#E4E4E7] flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#18181B] text-[#FFFFFF] rounded-[4px] flex items-center justify-center font-mono text-[12px] font-bold tracking-tight shrink-0">
            CS
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold tracking-[0.04em] text-[#09090B] uppercase leading-none">
              CARBONSME
            </div>
            <div className="text-[10px] font-mono text-[#71717A] tracking-[0.02em] mt-1 leading-none">
              MRV &amp; ESG LEDGER
            </div>
          </div>
        </div>

        {/* Active User Context Card */}
        <div className="p-3">
          <div className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-[6px] p-2.5 space-y-1.5">
            <div className="text-[12px] font-semibold text-[#09090B] truncate">
              {user.full_name}
            </div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="inline-flex items-center h-5 px-1.5 rounded-[4px] bg-[#F4F4F5] border border-[#E4E4E7] font-mono text-[11px] font-medium uppercase text-[#09090B]">
                {user.role}
              </span>
              <span className="font-mono text-[11px] text-[#71717A] truncate">
                {user.department_id}
              </span>
            </div>
          </div>
        </div>

        {/* Role-Based Navigation Links */}
        <nav className="px-3 space-y-1" aria-label="Điều hướng chính">
          <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-[0.04em] text-[#71717A]">
            Phân hệ {user.role}
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePath === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => onNavigate(item.path)}
                className={`w-full min-h-[34px] px-2.5 py-1.5 rounded-[6px] flex items-center gap-2 text-left text-[12px] transition-colors ${
                  isActive
                    ? 'bg-[#FFFFFF] border border-[#E4E4E7] text-[#09090B] font-semibold'
                    : 'border border-transparent text-[#3F3F46] hover:bg-[#F4F4F5] hover:text-[#09090B]'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isActive ? 'text-[#09090B]' : 'text-[#71717A]'
                  }`}
                />
                <span className="leading-snug">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Sign-Out Action */}
      <div className="p-3 border-t border-[#E4E4E7]">
        <button
          type="button"
          onClick={onLogout}
          className="w-full h-[34px] px-2.5 rounded-[6px] border border-transparent text-[12px] font-medium text-[#3F3F46] hover:bg-[#FFFFFF] hover:border-[#E4E4E7] hover:text-[#09090B] flex items-center gap-2 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5 text-[#71717A] shrink-0" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}

