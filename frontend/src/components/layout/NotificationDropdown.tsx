import type { NotificationResponse } from '../../types';
import { formatTimeAgo } from '../../utils/format';
import {
  BellIcon,
  XCircleIcon,
  RefreshIcon,
  MailIcon,
  MessageCircleIcon,
  BookOpenIcon
} from '../ui/Icons';

interface NotificationDropdownProps {
  open: boolean;
  onClose: () => void;
  notifications: NotificationResponse[];
  unreadCount: number;
  loading: boolean;
  limit: number;
  onMarkAllRead: () => void;
  onNotiClick: (noti: NotificationResponse) => void;
  onShowAll: () => void;
}

export function NotificationDropdown({
  open,
  onClose,
  notifications,
  unreadCount,
  loading,
  limit,
  onMarkAllRead,
  onNotiClick,
  onShowAll,
}: NotificationDropdownProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed left-4 right-4 top-[4.5rem] z-50 max-h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-border-light bg-white shadow-xl ring-1 ring-black/5 animate-scale-in sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 sm:max-w-[calc(100vw-32px)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-light bg-surface-secondary/50">
          <h3 className="text-sm font-bold text-text-primary">Thông báo mới</h3>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="text-xs font-semibold text-primary-600 hover:text-primary-800 transition-colors cursor-pointer"
            >
              Đánh dấu đã đọc
            </button>
          )}
        </div>
        <div className={`${limit > 5 ? 'max-h-96' : 'max-h-80'} overflow-y-auto divide-y divide-border-light`}>
          {loading && notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">Đang đồng bộ thông báo...</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <BellIcon className="mx-auto h-8 w-8 text-text-tertiary animate-pulse" />
              <p className="text-sm text-text-tertiary mt-2">Chưa có thông báo nào mới</p>
            </div>
          ) : (
            notifications.map((noti) => {
              const IconComponent =
                noti.notification_type === 'SESSION_CANCELLED'
                  ? XCircleIcon
                  : noti.notification_type === 'SESSION_RESCHEDULED'
                  ? RefreshIcon
                  : noti.notification_type === 'NEW_PRIVATE_REQUEST'
                  ? MailIcon
                  : noti.notification_type === 'NEW_MESSAGE'
                  ? MessageCircleIcon
                  : BookOpenIcon;
              const iconBg =
                noti.notification_type === 'SESSION_CANCELLED'
                  ? 'bg-danger-100 text-danger-700'
                  : noti.notification_type === 'SESSION_RESCHEDULED'
                  ? 'bg-warning-100 text-warning-700'
                  : 'bg-primary-100 text-primary-700';

              return (
                <div
                  key={noti.id}
                  onClick={() => onNotiClick(noti)}
                  className={`px-4 py-3 transition-colors cursor-pointer ${
                    noti.is_read ? 'hover:bg-surface-secondary/50' : 'bg-primary-50/20 hover:bg-primary-50/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBg}`}
                    >
                      <IconComponent className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm ${
                          noti.is_read ? 'font-medium text-text-secondary' : 'font-bold text-text-primary'
                        }`}
                      >
                        {noti.title}
                      </p>
                      {noti.body && <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">{noti.body}</p>}
                      <p className={`text-[10px] mt-1 ${noti.is_read ? 'text-text-tertiary' : 'text-primary-600 font-semibold'}`}>
                        {formatTimeAgo(noti.created_at)}
                      </p>
                    </div>
                    {!noti.is_read && <span className="mt-1.5 block h-2 w-2 shrink-0 rounded-full bg-primary-500"></span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
        {notifications.length > 0 && limit <= 5 && (
          <div className="border-t border-border-light px-4 py-2.5 text-center bg-surface-secondary/20">
            <button
              onClick={onShowAll}
              className="text-xs font-semibold text-primary-600 hover:text-primary-800 transition-colors cursor-pointer"
            >
              Xem tất cả thông báo
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default NotificationDropdown;
