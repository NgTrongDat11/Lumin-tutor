import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { UserRole } from '../../types';
import Avatar from '../ui/Avatar';
import AccountSettingsModal from '../auth/AccountSettingsModal';

interface UserMenuProps {
  position?: 'top' | 'bottom';
}

const roleBadges: Record<UserRole, string> = {
  STUDENT: 'Học viên',
  TUTOR: 'Gia sư',
  STAFF: 'Nhân viên',
  SUPER_ADMIN: 'Quản trị viên',
};

export function UserMenu({ position = 'bottom' }: UserMenuProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) return null;

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <div ref={ref} className="relative">
      {position === 'bottom' ? (
        // Desktop bottom sidebar profile area
        <>
          {open && (
            <div className="absolute bottom-[4.5rem] left-0 right-0 bg-white border border-border-light rounded-xl shadow-lg overflow-hidden z-10 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowSettings(true);
                }}
                className="w-full px-4 py-3 text-sm font-semibold text-text-secondary hover:bg-surface-secondary hover:text-text-primary text-left border-b border-border-light transition-colors cursor-pointer"
              >
                ⚙️ Thông tin tài khoản
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full px-4 py-3 text-sm font-semibold text-danger-600 hover:bg-danger-50 transition-colors text-left cursor-pointer"
              >
                🚪 Đăng xuất
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="w-full flex items-center gap-3 rounded-lg bg-white p-2 border border-border-light shadow-sm hover:border-primary-200 hover:shadow transition-all cursor-pointer"
          >
            <Avatar name={user.full_name} src={user.avatar_url || undefined} size="sm" shape="square" />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-bold text-text-primary">{user.full_name}</p>
              <p className="truncate text-[10px] font-semibold text-text-tertiary">{roleBadges[user.role]}</p>
            </div>
            <svg
              className={`w-4 h-4 text-text-tertiary transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </>
      ) : (
        // Mobile header avatar dropdown
        <>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all cursor-pointer"
            aria-label="Menu tài khoản"
          >
            <Avatar name={user.full_name} src={user.avatar_url || undefined} size="sm" />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-32px)] rounded-xl border border-border-light bg-white py-1 shadow-xl ring-1 ring-black/5 z-50 animate-scale-in">
                <div className="px-4 py-3 border-b border-border-light bg-surface-secondary/50">
                  <p className="truncate text-sm font-bold text-text-primary">{user.full_name}</p>
                  <p className="truncate text-[11px] font-semibold text-text-tertiary mt-0.5">{roleBadges[user.role]}</p>
                </div>
                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setShowSettings(true);
                    }}
                    className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors flex items-center gap-2.5 cursor-pointer"
                  >
                    <span>⚙️</span>
                    <span>Tài khoản</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-danger-600 hover:bg-danger-50 transition-colors flex items-center gap-2.5 cursor-pointer"
                  >
                    <span>🚪</span>
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {showSettings && <AccountSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default UserMenu;
