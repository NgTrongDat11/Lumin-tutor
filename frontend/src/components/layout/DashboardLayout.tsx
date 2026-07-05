import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { messageApi, notificationApi, privateRequestApi } from '../../services/api';
import type { NotificationResponse, UserRole } from '../../types';
import ChatBubble from '../chat/ChatBubble';

// Extracted Sub-components
import SidebarMenu, { menuConfig, isActiveItem } from './SidebarMenu';
import UserMenu from './UserMenu';
import NotificationDropdown from './NotificationDropdown';
import HelpMenu from './HelpMenu';
import ErrorBoundary from '../shared/ErrorBoundary';

const roleDashboard: Record<UserRole, string> = {
  STUDENT: '/student',
  TUTOR: '/tutor',
  STAFF: '/staff',
  SUPER_ADMIN: '/admin',
};

export default function DashboardLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMessagesPage = location.pathname.includes('/messages');

  // Dialog & drop down visibilities
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelpMenu, setShowHelpMenu] = useState(false);

  // Counts & Notifications data
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingOpportunities, setPendingOpportunities] = useState(0);
  const [notiLimit, setNotiLimit] = useState(5);
  const [notiLoading, setNotiLoading] = useState(false);

  const isStudent = user?.role === 'STUDENT';

  // Fetch unread notifications count
  useEffect(() => {
    notificationApi.unreadCount().then((d) => setUnreadCount(d.count)).catch(() => {});
  }, []);

  // Fetch unread messages
  const fetchUnreadMessages = useCallback(() => {
    messageApi.listThreads()
      .then((threads) => {
        const total = threads.reduce((sum, t) => sum + (t.unread_count || 0), 0);
        setUnreadMessages(total);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUnreadMessages();
    const interval = setInterval(fetchUnreadMessages, 30_000);
    return () => clearInterval(interval);
  }, [fetchUnreadMessages]);

  // Fetch pending tutor opportunities
  const fetchPendingOpps = useCallback(() => {
    if (user?.role !== 'TUTOR') return;
    privateRequestApi.list()
      .then((requests) => {
        const pending = requests.filter((r) => r.status === 'SENT').length;
        setPendingOpportunities(pending);
      })
      .catch(() => {});
  }, [user?.role]);

  useEffect(() => {
    fetchPendingOpps();
    const interval = setInterval(fetchPendingOpps, 30_000);
    return () => clearInterval(interval);
  }, [fetchPendingOpps]);

  // Notifications API Actions
  const fetchNotifications = useCallback((limit: number) => {
    setNotiLoading(true);
    notificationApi.list(limit)
      .then((data) => setNotifications(data))
      .catch(() => {})
      .finally(() => setNotiLoading(false));
    notificationApi.unreadCount().then((d) => setUnreadCount(d.count)).catch(() => {});
  }, []);

  const handleOpenNotifications = () => {
    const willOpen = !showNotifications;
    setShowNotifications(willOpen);
    setShowHelpMenu(false);
    if (willOpen) {
      setNotiLimit(5);
      fetchNotifications(5);
    }
  };

  const handleMarkAllRead = async () => {
    await notificationApi.markAllRead().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleNotiClick = async (noti: NotificationResponse) => {
    if (!noti.is_read) {
      notificationApi.markRead(noti.id).catch(() => {});
      setNotifications((prev) => prev.map((n) => n.id === noti.id ? { ...n, is_read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setShowNotifications(false);
    if (noti.reference_type === 'learning_session' && noti.reference_id) {
      navigate(`${roleDashboard[user!.role]}/schedule?sessionId=${noti.reference_id}`);
    } else if (noti.reference_type === 'message_thread' && noti.reference_id) {
      navigate(`${roleDashboard[user!.role]}/messages?threadId=${noti.reference_id}`);
    }
  };

  const handleShowAllNotifications = () => {
    setNotiLimit(10);
    fetchNotifications(10);
  };

  if (!user) return null;

  const sections = menuConfig[user.role] || [];
  const flatMenu = sections.flatMap((section) => section.items);

  return (
    <div className="flex min-h-screen bg-surface-secondary text-text-primary">
      {/* Desktop Sidebar Navigation */}
      <aside className="sticky top-0 hidden h-screen shrink-0 lg:block">
        <SidebarMenu
          userRole={user.role}
          pathname={location.pathname}
          unreadMessages={unreadMessages}
          pendingOpportunities={pendingOpportunities}
        />
      </aside>

      {/* Mobile Drawer Sidebar Navigation */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex w-full max-w-xs flex-col bg-white shadow-xl animate-slide-in-right">
            <SidebarMenu
              userRole={user.role}
              pathname={location.pathname}
              unreadMessages={unreadMessages}
              pendingOpportunities={pendingOpportunities}
              onCloseSidebar={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-h-screen max-w-full flex-1 flex-col overflow-hidden pb-24 lg:pb-0">
        <header className="sticky top-0 z-30 border-b border-border-light bg-white/88 px-4 py-3 shadow-xs backdrop-blur-xl md:px-6">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {!isStudent && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="-ml-2 rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary lg:hidden cursor-pointer"
                  aria-label="Mở menu"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
              {isStudent && (
                <Link to={roleDashboard[user.role] || '/'} className="flex shrink-0 items-center gap-2.5 lg:hidden">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-text-primary text-sm font-bold text-white shadow-xs">L</div>
                  <span className="block text-lg font-extrabold tracking-tight text-text-primary">Lumin</span>
                </Link>
              )}
              <div className="min-w-0">
              </div>
            </div>

            {/* Right Header Navigation Bar (Notifications, Help, Mobile Avatar) */}
            <div className="flex shrink-0 items-center gap-2 sm:gap-3 relative ml-auto">
              {/* Notification bell dropdown widget */}
              <div className="relative">
                <button
                  onClick={handleOpenNotifications}
                  className="relative p-2 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 cursor-pointer"
                  aria-label="Thông báo"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-pulse">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                <NotificationDropdown
                  open={showNotifications}
                  onClose={() => setShowNotifications(false)}
                  notifications={notifications}
                  unreadCount={unreadCount}
                  loading={notiLoading}
                  limit={notiLimit}
                  onMarkAllRead={handleMarkAllRead}
                  onNotiClick={handleNotiClick}
                  onShowAll={handleShowAllNotifications}
                />
              </div>

              {/* Help support dropdown widget */}
              <div className="relative hidden sm:block">
                <button
                  onClick={() => {
                    setShowHelpMenu(!showHelpMenu);
                    setShowNotifications(false);
                  }}
                  className="p-2 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 cursor-pointer"
                  aria-label="Trợ giúp"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>

                <HelpMenu
                  open={showHelpMenu}
                  onClose={() => setShowHelpMenu(false)}
                  userRole={user.role}
                  userName={user.full_name}
                />
              </div>

              {/* Mobile top avatar dropdown */}
              <div className="flex lg:hidden items-center gap-2">
                <div className="h-4 w-[1px] bg-border-light mx-1"></div>
                <UserMenu position="top" />
              </div>
            </div>
          </div>

        </header>

        {/* Mobile Bottom Navigation for student role */}
        {isStudent && (
          <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-6 border-t border-border-light bg-white/94 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] backdrop-blur-xl lg:hidden">
            {flatMenu.map((item) => {
              const active = isActiveItem(item, location.pathname);
              const mobileLabel = item.label === 'Thời khóa biểu'
                ? 'Lịch'
                : item.label === 'Việc học'
                  ? 'Học'
                  : item.label === 'Tin nhắn'
                    ? 'Nhắn'
                    : item.label;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex h-14 min-w-0 flex-col items-center justify-center rounded-lg px-1 transition-colors ${
                    active ? 'text-primary-750' : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  <div className="relative">
                    <item.icon className="mb-1 h-5 w-5" />
                    {item.label === 'Tin nhắn' && unreadMessages > 0 && (
                      <span className="absolute -right-1.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger-500 px-1 text-[9px] font-bold text-white">
                        {unreadMessages > 99 ? '99+' : unreadMessages}
                      </span>
                    )}
                  </div>
                  <span className="w-full truncate text-center text-[10px] font-medium leading-none">{mobileLabel}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {/* Nested Content View */}
        <main className={`flex-1 flex flex-col bg-surface-secondary ${isMessagesPage ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={`mx-auto flex w-full flex-col ${
            isMessagesPage
              ? 'p-2 md:p-3 lg:p-4 h-[calc(100vh-60px)] lg:h-[calc(100vh-60px)] overflow-hidden flex-1'
              : 'min-h-full p-4 md:p-6 lg:p-8'
          }`}>
            <div className="flex-1 min-h-0 flex flex-col">
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </div>

            {!isMessagesPage && (
              <footer className="mt-12 border-t border-border-light pt-8 pb-4 text-center">
                <div className="mb-2 flex items-center justify-center gap-2 text-text-tertiary">
                  <span className="font-bold text-primary-700">Lumin</span>
                  <span>•</span>
                  <span>Hệ thống Đề xuất Gia sư</span>
                </div>
                <p className="text-xs text-text-tertiary">
                  &copy; {new Date().getFullYear()} Lumin Education. Đã đăng ký bản quyền.
                </p>
              </footer>
            )}
          </div>
        </main>
      </div>

      {isStudent && !isMessagesPage && <ChatBubble />}
    </div>
  );
}
