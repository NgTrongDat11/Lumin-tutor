import type { ReactNode } from 'react';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-surface-tertiary text-text-secondary',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
  info: 'bg-primary-50 text-primary-700',
};

export default function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {variant === 'success' && <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
      {variant === 'warning' && <svg className="mr-1 h-3 w-3 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
      {variant === 'danger' && <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
      {variant === 'info' && <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
      {children}
    </span>
  );
}

/* ── Helpers cho status mapping ────────────────── */
export function getStatusBadge(status: string) {
  const map: Record<string, { variant: Variant; label: string }> = {
    // Tutor verification
    DRAFT: { variant: 'default', label: 'Nháp' },
    PENDING_REVIEW: { variant: 'warning', label: 'Chờ duyệt' },
    VERIFIED: { variant: 'success', label: 'Đã xác minh' },
    REJECTED: { variant: 'danger', label: 'Từ chối' },
    // Qualification / Subject
    PENDING: { variant: 'warning', label: 'Chờ duyệt' },
    APPROVED: { variant: 'success', label: 'Đã duyệt' },
    // Private request
    SENT: { variant: 'info', label: 'Đã gửi' },
    SCHEDULE_PROPOSED: { variant: 'warning', label: 'Chờ đồng ý lịch' },
    TUTOR_CONFIRMED: { variant: 'success', label: 'Gia sư xác nhận' },
    TUTOR_REJECTED: { variant: 'danger', label: 'Gia sư từ chối' },
    PAYMENT_PENDING: { variant: 'warning', label: 'Chờ thanh toán' },
    PAID: { variant: 'success', label: 'Đã thanh toán' },
    ONGOING: { variant: 'info', label: 'Đang diễn ra' },
    COMPLETED: { variant: 'success', label: 'Hoàn thành' },
    CANCELLED: { variant: 'danger', label: 'Đã huỷ' },
    REFUNDED: { variant: 'warning', label: 'Hoàn tiền' },
    // Class status
    TUTOR_RECRUITING: { variant: 'info', label: 'Tuyển gia sư' },
    ENROLLING: { variant: 'info', label: 'Đăng ký' },
    READY: { variant: 'success', label: 'Sẵn sàng' },
    // Payment
    CREATED: { variant: 'default', label: 'Tạo mới' },
    SUCCEEDED: { variant: 'success', label: 'Thành công' },
    FAILED: { variant: 'danger', label: 'Thất bại' },
    REFUND_PENDING: { variant: 'warning', label: 'Chờ hoàn tiền' },
    // Session
    SCHEDULED: { variant: 'info', label: 'Đã lên lịch' },
    NO_SHOW: { variant: 'danger', label: 'Vắng mặt' },
    // Learning need
    ACTIVE: { variant: 'success', label: 'Đang hoạt động' },
    FULFILLED: { variant: 'success', label: 'Đã đáp ứng' },
    EXPIRED: { variant: 'default', label: 'Hết hạn' },
    // Contract
    TERMINATED: { variant: 'danger', label: 'Chấm dứt' },
    // Subject
    INACTIVE: { variant: 'default', label: 'Ngừng hoạt động' },
    SUSPENDED: { variant: 'danger', label: 'Bị khóa' },
    // Generic
    ACCEPTED: { variant: 'success', label: 'Đã chấp nhận' },
  };

  const entry = map[status] || { variant: 'default' as Variant, label: status };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
