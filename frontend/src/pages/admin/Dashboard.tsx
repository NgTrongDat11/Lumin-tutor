import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../services/api';
import type { AdminStatsResponse, AuditLogResponse } from '../../types';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import { ArrowRightIcon, ClipboardCheckIcon, LayersIcon, UsersIcon, WalletIcon } from '../../components/ui/Icons';
import { MetricTile, PortalPage, SectionPanel } from '../../components/portal/PortalPage';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { currency } from '../../utils/format';
import { emptyAdminStats } from '../../utils/constants';

/* ── Role distribution donut chart ─────────────────────── */

const roleConfig = [
  { key: 'STUDENT', label: 'Học viên', strokeColor: '#3b82f6' }, // blue-500
  { key: 'TUTOR', label: 'Gia sư', strokeColor: '#10b981' }, // green-500
  { key: 'STAFF', label: 'Nhân viên', strokeColor: '#f59e0b' }, // amber-500
  { key: 'SUPER_ADMIN', label: 'Quản trị viên', strokeColor: '#ef4444' }, // red-500
];

function RoleDistributionBar({ byRole, total }: { byRole: Partial<Record<string, number>>; total: number }) {
  if (total === 0) {
    return <p className="text-sm text-text-tertiary">Chưa có dữ liệu tài khoản.</p>;
  }

  const radius = 35;
  const circumference = 2 * Math.PI * radius; // ~219.91
  let accumulatedPercentage = 0;

  // Build segments data
  const segments = roleConfig.map(({ key, label, strokeColor }) => {
    const count = byRole[key] || 0;
    const percentage = total > 0 ? (count / total) * 100 : 0;
    return { key, label, count, percentage, strokeColor };
  });

  return (
    <div className="flex flex-col items-center justify-center gap-6 sm:flex-row py-2 animate-fade-in">
      {/* Donut SVG */}
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke="#f3f4f6"
            strokeWidth="9"
          />
          {segments.map((seg) => {
            if (seg.count === 0) return null;
            const strokeLength = (seg.percentage / 100) * circumference;
            const strokeOffset = -((accumulatedPercentage / 100) * circumference);
            accumulatedPercentage += seg.percentage;

            return (
              <circle
                key={seg.key}
                cx="50"
                cy="50"
                r={radius}
                fill="transparent"
                stroke={seg.strokeColor}
                strokeWidth="9"
                strokeDasharray={`${strokeLength} ${circumference}`}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                className="transition-all duration-300 ease-out hover:stroke-[11px]"
              />
            );
          })}
        </svg>
        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-extrabold text-text-primary">{total}</span>
          <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider">Tài khoản</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 space-y-2.5 w-full">
        {segments.map((seg) => {
          if (seg.count === 0) return null;
          return (
            <div key={seg.key} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.strokeColor }} />
                <span className="font-semibold text-text-secondary">{seg.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-text-primary">{seg.count}</span>
                <span className="text-[10px] text-text-tertiary">({Math.round(seg.percentage)}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



/* ── Alert card ────────────────────────────────── */

interface AlertItem {
  label: string;
  value: number;
  hint: string;
  href: string;
  tone: 'warning' | 'danger';
}

const toneStyles = {
  warning: 'border-l-warning-500 bg-warning-50/50',
  danger: 'border-l-danger-500 bg-danger-50/50',
};

const toneIcon = {
  warning: 'text-warning-600',
  danger: 'text-danger-600',
};

function AlertCard({ item }: { item: AlertItem }) {
  return (
    <Link
      to={item.href}
      className={`flex items-center gap-4 rounded-lg border border-border-light border-l-4 p-4 transition-all hover:shadow-sm ${toneStyles[item.tone]}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold ${toneIcon[item.tone]}`}>{item.value}</span>
          <span className="text-sm font-semibold text-text-primary">{item.label}</span>
        </div>
        <p className="mt-1 text-xs text-text-tertiary">{item.hint}</p>
      </div>
      <ArrowRightIcon className="h-4 w-4 shrink-0 text-text-tertiary" />
    </Link>
  );
}

const auditActionLabels: Record<string, string> = {
  STAFF_CREATED: 'Tạo nhân viên',
  STAFF_STATUS_UPDATED: 'Cập nhật trạng thái nhân viên',
  STAFF_PASSWORD_RESET: 'Cấp lại mật khẩu nhân viên',
  ACCOUNT_STATUS_UPDATED: 'Cập nhật trạng thái tài khoản',
  ACCOUNT_PASSWORD_RESET: 'Cập nhật mật khẩu tài khoản',
  QUALIFICATION_APPROVED: 'Duyệt chứng chỉ',
  QUALIFICATION_REJECTED: 'Từ chối chứng chỉ',
  TUTOR_SUBJECT_APPROVED: 'Duyệt môn dạy',
  TUTOR_SUBJECT_REJECTED: 'Từ chối môn dạy',
  TUTOR_PROFILE_VERIFIED: 'Duyệt hồ sơ gia sư',
  TUTOR_PROFILE_REJECTED: 'Từ chối hồ sơ gia sư',
};

function prettifyAuditAction(action: string) {
  return auditActionLabels[action] || action.replaceAll('_', ' ').toLowerCase();
}

/* ── Dashboard ─────────────────────────────────── */

export default function AdminDashboard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<AdminStatsResponse>(emptyAdminStats);
  const [auditLogs, setAuditLogs] = useState<AuditLogResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = (showSkeleton = true) => {
    if (showSkeleton) setLoading(true);
    else setRefreshing(true);

    Promise.all([
      adminApi.getStats(),
      adminApi.getAuditLog({ limit: 5 }).catch(() => [] as AuditLogResponse[]),
    ])
      .then(([statsData, logsData]) => {
        setStats(statsData);
        setAuditLogs(logsData);
      })
      .catch(() => {
        toast('error', 'Không thể đồng bộ số liệu thống kê hệ thống');
        setStats(emptyAdminStats);
        setAuditLogs([]);
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <DashboardSkeleton />;

  const activeClasses = (stats.classes_by_status.READY || 0) + (stats.classes_by_status.ONGOING || 0);

  // Build alert items — chỉ hiện khi > 0
  const alerts: AlertItem[] = [
    stats.pending_tutors > 0 && { label: 'Gia sư cần duyệt', value: stats.pending_tutors, hint: 'Vào Gia sư để xử lý.', href: '/staff/tutors', tone: 'warning' as const },
    stats.pending_contracts > 0 && { label: 'Hợp đồng chờ', value: stats.pending_contracts, hint: 'Vào Lịch & hợp đồng.', href: '/staff/operations', tone: 'warning' as const },
    stats.payment_queue > 0 && { label: 'Giao dịch chờ', value: stats.payment_queue, hint: 'Vào Tài chính.', href: '/staff/payments', tone: 'warning' as const },
    stats.suspended_staff > 0 && { label: 'Nhân viên bị khóa', value: stats.suspended_staff, hint: 'Kiểm tra quyền vận hành.', href: '/admin/staff', tone: 'danger' as const },
  ].filter(Boolean) as AlertItem[];

  return (
    <PortalPage
      title="Tổng quan quản trị"
      description="Sức khỏe hệ thống và các cảnh báo cần xử lý."
      actions={(
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => load(false)} loading={refreshing}>
            Làm mới
          </Button>
          <Link to="/admin/staff">
            <Button>
              Quản lý nhân viên <ArrowRightIcon className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}
    >
      {/* Hero metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile icon={WalletIcon} label="Doanh thu" value={currency(stats.paid_revenue)} hint="Giao dịch thành công." tone="success" />
        <MetricTile icon={LayersIcon} label="Lớp đang mở" value={activeClasses} hint="Sẵn sàng hoặc đang học." />
        <MetricTile icon={UsersIcon} label="Nhân viên" value={stats.active_staff} hint={`${stats.suspended_staff} bị khóa.`} href="/admin/staff" tone="neutral" />
        <MetricTile icon={ClipboardCheckIcon} label="Nhật ký hệ thống" value={stats.audit_log_count} hint="Thao tác nhạy cảm." href="/admin/audit" tone="primary" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        {/* Alerts */}
        <SectionPanel title="Cảnh báo" description="Các hàng chờ cần xử lý.">
          {alerts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-success-200 bg-success-50/30 p-5 text-center">
              <p className="text-sm font-semibold text-success-700">✓ Không có cảnh báo</p>
              <p className="mt-1 text-xs text-success-600/80">Các hàng chờ đang trống.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {alerts.map((item) => (
                <AlertCard key={item.label} item={item} />
              ))}
            </div>
          )}
        </SectionPanel>

        <div className="grid gap-6">
          <SectionPanel
            title="Nhật ký thao tác gần đây"
            description="Hoạt động mới nhất của nhân viên vận hành."
            action={
              <Link to="/admin/audit">
                <Button variant="ghost" size="sm">
                  Xem tất cả
                </Button>
              </Link>
            }
          >
            {auditLogs.length === 0 ? (
              <div className="text-center py-6 text-xs text-text-tertiary">Chưa có hoạt động nào ghi nhận.</div>
            ) : (
              <div className="flex flex-col gap-3 mt-2">
                {auditLogs.map((log) => {
                  const detail = (log.detail || {}) as Record<string, unknown>;
                  const detailText = (detail.email || detail.full_name || detail.review_note || '') as string;
                  return (
                    <div key={log.id} className="flex items-start gap-3 border-l-2 border-primary-500 pl-3 py-0.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-text-primary">
                          {log.actor_name || log.actor_email || 'Hệ thống'} · <span className="text-primary-700">{prettifyAuditAction(log.action)}</span>
                        </p>
                        {detailText && (
                          <p className="text-[11px] text-text-secondary mt-0.5 truncate">
                            {detailText}
                          </p>
                        )}
                        <p className="text-[10px] text-text-tertiary mt-0.5">
                          {log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionPanel>

          {/* Role distribution */}
          <SectionPanel title="Cơ cấu tài khoản" description={`${stats.total_users} tài khoản.`}>
            <RoleDistributionBar byRole={stats.users_by_role} total={stats.total_users} />

            {/* Quick links */}
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border-light pt-4">
              {[
                { label: 'Quản lý nhân viên', href: '/admin/staff' },
                { label: 'Nhật ký', href: '/admin/audit' },
                { label: 'Hệ thống', href: '/admin/system' },
              ].map((link) => (
                <Link key={link.label} to={link.href} className="rounded-md border border-border-light px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700">
                  {link.label}
                </Link>
              ))}
            </div>
          </SectionPanel>
        </div>
      </div>
    </PortalPage>
  );
}
