import { type ComponentType, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { UserRole } from '../../types';
import {
  BookOpenIcon,
  CalendarIcon,
  ChartIcon,
  ClipboardCheckIcon,
  LayersIcon,
  MessageCircleIcon,
  SearchIcon,
  SettingsIcon,
  UserCheckIcon,
  UsersIcon,
  WalletIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '../ui/Icons';
import UserMenu from './UserMenu';

export interface MenuItem {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  match?: string[];
  subItems?: { label: string; path: string }[];
}

export interface MenuSection {
  title: string;
  items: MenuItem[];
}

export const menuConfig: Record<UserRole, MenuSection[]> = {
  STUDENT: [
    {
      title: 'Không gian học',
      items: [
        { label: 'Khám phá', path: '/student', icon: SearchIcon },
        { label: 'Thời khóa biểu', path: '/student/schedule', icon: CalendarIcon },
        { label: 'Việc học', path: '/student/my-learning', icon: BookOpenIcon },
        { label: 'Thanh toán', path: '/student/payments', icon: WalletIcon },
        { label: 'Đánh giá', path: '/student/reviews', icon: UserCheckIcon },
        { label: 'Tin nhắn', path: '/student/messages', icon: MessageCircleIcon },
      ],
    },
  ],
  TUTOR: [
    {
      title: 'Không gian gia sư',
      items: [
        { label: 'Tổng quan', path: '/tutor', icon: ChartIcon },
        { label: 'Lịch dạy', path: '/tutor/schedule', icon: CalendarIcon, match: ['/tutor/sessions'] },
        { label: 'Công việc dạy', path: '/tutor/teaching', icon: BookOpenIcon, match: ['/tutor/subjects'] },
        { label: 'Yêu cầu dạy', path: '/tutor/opportunities', icon: ClipboardCheckIcon, match: ['/tutor/private-requests', '/tutor/applications'] },
        { label: 'Thu nhập', path: '/tutor/income', icon: WalletIcon },
        { label: 'Tin nhắn', path: '/tutor/messages', icon: MessageCircleIcon },
        { label: 'Hồ sơ gia sư', path: '/tutor/profile', icon: UserCheckIcon, match: ['/tutor/qualifications', '/tutor/availability'] },
      ],
    },
  ],
  STAFF: [
    {
      title: 'Vận hành trung tâm',
      items: [
        { label: 'Tổng quan', path: '/staff', icon: ChartIcon },
        {
          label: 'Gia sư',
          path: '/staff/tutors',
          icon: UserCheckIcon,
          subItems: [
            { label: 'Danh sách gia sư', path: '/staff/tutors' },
            { label: 'Duyệt hồ sơ', path: '/staff/tutors/verify' },
          ],
        },
        { label: 'Học viên', path: '/staff/students', icon: UsersIcon },
        {
          label: 'Học vụ',
          path: '/staff/classes',
          icon: LayersIcon,
          subItems: [
            { label: 'Lớp học nhóm', path: '/staff/classes' },
            { label: 'Yêu cầu 1-1', path: '/staff/requests' },
            { label: 'Danh mục môn', path: '/staff/subjects' },
          ],
        },
        {
          label: 'Lịch & hợp đồng',
          path: '/staff/schedules',
          icon: ClipboardCheckIcon,
          subItems: [
            { label: 'Lịch & Buổi học', path: '/staff/schedules' },
            { label: 'Hợp đồng dạy', path: '/staff/contracts' },
          ],
        },
        { label: 'Tài chính', path: '/staff/payments', icon: WalletIcon },
        { label: 'Tin nhắn', path: '/staff/messages', icon: MessageCircleIcon },
      ],
    },
  ],
  SUPER_ADMIN: [
    {
      title: 'Báo cáo & Vận hành',
      items: [
        { label: 'Tổng quan', path: '/staff', icon: ChartIcon },
        {
          label: 'Gia sư',
          path: '/staff/tutors',
          icon: UserCheckIcon,
          subItems: [
            { label: 'Danh sách gia sư', path: '/staff/tutors' },
            { label: 'Duyệt hồ sơ', path: '/staff/tutors/verify' },
          ],
        },
        { label: 'Học viên', path: '/staff/students', icon: UsersIcon },
        {
          label: 'Học vụ',
          path: '/staff/classes',
          icon: LayersIcon,
          subItems: [
            { label: 'Lớp học nhóm', path: '/staff/classes' },
            { label: 'Yêu cầu 1-1', path: '/staff/requests' },
            { label: 'Danh mục môn', path: '/staff/subjects' },
          ],
        },
        {
          label: 'Lịch & hợp đồng',
          path: '/staff/schedules',
          icon: ClipboardCheckIcon,
          subItems: [
            { label: 'Lịch & Buổi học', path: '/staff/schedules' },
            { label: 'Hợp đồng dạy', path: '/staff/contracts' },
          ],
        },
        { label: 'Tài chính', path: '/staff/payments', icon: WalletIcon },
        { label: 'Tin nhắn', path: '/staff/messages', icon: MessageCircleIcon },
      ],
    },
    {
      title: 'Quản trị hệ thống',
      items: [
        { label: 'Quản lý nhân viên', path: '/admin/staff', icon: UsersIcon },
        { label: 'Nhật ký hệ thống', path: '/admin/audit', icon: ClipboardCheckIcon },
        { label: 'Cấu hình', path: '/admin/system', icon: SettingsIcon },
      ],
    },
  ],
};

const rolePortalNames: Record<UserRole, string> = {
  STUDENT: 'Không gian học tập',
  TUTOR: 'Không gian gia sư',
  STAFF: 'Bảng vận hành',
  SUPER_ADMIN: 'Bảng quản trị',
};

export function isActiveItem(item: MenuItem, pathname: string) {
  const paths = [item.path, ...(item.match || []), ...(item.subItems?.map(s => s.path) || [])];
  return paths.some((path) => {
    if (path === '/student' || path === '/tutor' || path === '/staff' || path === '/admin') {
      return pathname === path;
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  });
}
function getActiveSubItemPath(subItems: NonNullable<MenuItem['subItems']>, pathname: string) {

  let activePath: string | null = null;

  for (const subItem of subItems) {
    const matches = pathname === subItem.path || pathname.startsWith(`${subItem.path}/`);
    if (matches && (!activePath || subItem.path.length > activePath.length)) {
      activePath = subItem.path;
    }
  }

  return activePath;
}

interface SidebarMenuProps {
  userRole: UserRole;
  pathname: string;
  unreadMessages: number;
  pendingOpportunities: number;
  onCloseSidebar?: () => void;
}

export function SidebarMenu({
  userRole,
  pathname,
  unreadMessages,
  pendingOpportunities,
  onCloseSidebar,
}: SidebarMenuProps) {
  const sections = menuConfig[userRole] || [];

  // State for expanded parent items
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    sections.forEach((sec) => {
      sec.items.forEach((item) => {
        if (item.subItems) {
          const hasActiveChild = item.subItems.some(
            (sub) => pathname === sub.path || pathname.startsWith(`${sub.path}/`)
          );
          initial[item.path] = hasActiveChild;
        }
      });
    });
    return initial;
  });

  // Auto-expand submenu if url changes to an active child
  useEffect(() => {
    sections.forEach((sec) => {
      sec.items.forEach((item) => {
        if (item.subItems) {
          const hasActiveChild = item.subItems.some(
            (sub) => pathname === sub.path || pathname.startsWith(`${sub.path}/`)
          );
          if (hasActiveChild) {
            setExpandedItems((prev) => ({ ...prev, [item.path]: true }));
          }
        }
      });
    });
  }, [pathname, sections]);

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedItems((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  return (
    <div className="flex h-full w-64 flex-col border-r border-border-light bg-surface-primary">
      {/* Logo Area */}
      <div className="border-b border-border-light px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            to={userRole === 'SUPER_ADMIN' ? '/admin' : userRole === 'STAFF' ? '/staff' : userRole === 'TUTOR' ? '/tutor' : '/student'}
            onClick={onCloseSidebar}
            className="flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-text-primary text-lg font-bold text-white shadow-sm ring-1 ring-border">
              L
            </div>
            <div className="min-w-0">
              <span className="block truncate text-xl font-extrabold tracking-tight text-text-primary">Lumin</span>
              <span className="block truncate text-[10px] font-bold uppercase tracking-[0.18em] text-primary-750">
                {rolePortalNames[userRole]}
              </span>
            </div>
          </Link>
          {onCloseSidebar && (
            <button
              onClick={onCloseSidebar}
              className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-tertiary hover:text-text-primary lg:hidden cursor-pointer"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Nav Menu */}
      <nav className="flex-1 overflow-y-auto px-4 py-5">
        {sections.map((section) => (
          <div key={section.title} className="mb-6 last:mb-0">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-text-tertiary">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = isActiveItem(item, pathname);
                const hasSubItems = item.subItems && item.subItems.length > 0;
                const isExpanded = !!expandedItems[item.path];
                const activeSubItemPath = hasSubItems ? getActiveSubItemPath(item.subItems!, pathname) : null;
                return (
                  <div key={item.path} className="space-y-1">
                    <Link
                      to={item.path}
                      onClick={() => {
                        // Expand the submenu upon navigation if it is collapsed
                        if (hasSubItems && !isExpanded) {
                          setExpandedItems((prev) => ({ ...prev, [item.path]: true }));
                        }
                        if (onCloseSidebar) onCloseSidebar();
                      }}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-150 ${
                        active && !hasSubItems
                          ? 'bg-primary-50 text-primary-800'
                          : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                      }`}
                    >
                      <item.icon className={`h-[18px] w-[18px] ${active ? 'text-primary-700' : 'text-text-tertiary'}`} />
                      <span className="truncate">{item.label}</span>
                      {item.label === 'Tin nhắn' && unreadMessages > 0 && (
                        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger-500 px-1.5 text-[10px] font-bold text-white shadow-xs">
                          {unreadMessages > 99 ? '99+' : unreadMessages}
                        </span>
                      )}
                      {item.path === '/tutor/opportunities' && pendingOpportunities > 0 && (
                        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-warning-500 px-1.5 text-[10px] font-bold text-white shadow-xs">
                          {pendingOpportunities}
                        </span>
                      )}
                      {hasSubItems && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => toggleExpand(item.path, e)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setExpandedItems((prev) => ({ ...prev, [item.path]: !prev[item.path] }));
                            }
                          }}
                          className="ml-auto rounded-md p-0.5 text-text-tertiary hover:bg-surface-tertiary hover:text-text-primary focus:outline-none cursor-pointer"
                        >
                          {isExpanded ? (
                            <ChevronDownIcon className="h-4 w-4" />
                          ) : (
                            <ChevronRightIcon className="h-4 w-4" />
                          )}
                        </span>
                      )}
                    </Link>

                    {hasSubItems && isExpanded && (
                      <div className="pl-9 space-y-1 pb-1">
                        {item.subItems?.map((sub) => {
                          const subActive = activeSubItemPath === sub.path;
                          return (
                            <Link
                              key={sub.path}
                              to={sub.path}
                              onClick={onCloseSidebar}
                              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
                                subActive
                                  ? 'text-primary-750 font-bold bg-primary-50/40'
                                  : 'text-text-secondary hover:bg-surface-secondary/50 hover:text-text-primary'
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${subActive ? 'bg-primary-600 scale-110 shadow-xs' : 'bg-text-tertiary/40'}`} />
                              <span className="truncate">{sub.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>



      {/* User Dropdown */}
      <div className="mt-auto border-t border-border-light bg-surface-secondary/70 p-4 relative">
        <UserMenu position="bottom" />
      </div>
    </div>
  );
}

export default SidebarMenu;
