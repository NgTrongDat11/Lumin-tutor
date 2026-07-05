import { useEffect, useState, useMemo } from 'react';
import { adminApi, extractErrorMessage } from '../../services/api';
import type { AuditLogResponse } from '../../types';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { EmptyPanel, PortalPage, SectionPanel, SegmentedTabs } from '../../components/portal/PortalPage';
import Button from '../../components/ui/Button';

// Shared Components
import SearchInput from '../../components/shared/SearchInput';
import FilterChips from '../../components/shared/FilterChips';

type Category = 'staff' | 'review' | 'account';
type TimeFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';

interface ActionConfig {
  label: string;
  category: Category;
}

const actionMap: Record<string, ActionConfig> = {
  STAFF_CREATED:          { label: 'Tạo nhân viên',                 category: 'staff' },
  STAFF_STATUS_UPDATED:   { label: 'Cập nhật trạng thái nhân viên', category: 'staff' },
  STAFF_PASSWORD_RESET:   { label: 'Cấp lại mật khẩu nhân viên',   category: 'staff' },
  ACCOUNT_STATUS_UPDATED: { label: 'Cập nhật trạng thái tài khoản', category: 'account' },
  ACCOUNT_PASSWORD_RESET: { label: 'Cập lại mật khẩu tài khoản',   category: 'account' },
  QUALIFICATION_APPROVED: { label: 'Duyệt chứng chỉ',          category: 'review' },
  QUALIFICATION_REJECTED: { label: 'Từ chối chứng chỉ',         category: 'review' },
  TUTOR_SUBJECT_APPROVED: { label: 'Duyệt môn dạy',            category: 'review' },
  TUTOR_SUBJECT_REJECTED: { label: 'Từ chối môn dạy',           category: 'review' },
  TUTOR_PROFILE_VERIFIED: { label: 'Duyệt hồ sơ gia sư',       category: 'review' },
  TUTOR_PROFILE_REJECTED: { label: 'Từ chối hồ sơ gia sư',     category: 'review' },
};

const categoryConfig: Record<Category, { dot: string; bg: string; icon: string }> = {
  staff:   { dot: 'bg-primary-500', bg: 'border-l-primary-400', icon: '👤' },
  review:  { dot: 'bg-warning-500', bg: 'border-l-warning-400', icon: '✓' },
  account: { dot: 'bg-danger-500',  bg: 'border-l-danger-400',  icon: '🔒' },
};

function prettifyAction(action: string) {
  return action.replaceAll('_', ' ').toLowerCase();
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    SUPER_ADMIN: 'Quản trị viên',
    STAFF: 'Nhân viên',
    TUTOR: 'Gia sư',
    STUDENT: 'Học viên',
  };
  return labels[role] || role;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: 'Đang hoạt động',
    SUSPENDED: 'Bị khóa',
    VERIFIED: 'Đã xác minh',
    REJECTED: 'Từ chối',
    PENDING_REVIEW: 'Chờ duyệt',
  };
  return labels[status] || status;
}

function getConfig(action: string): ActionConfig & { category: Category } {
  return actionMap[action] || { label: prettifyAction(action), category: 'account' };
}

/* ── Detail renderer ─────────────────────────────── */

function DetailView({ detail }: { detail: Record<string, unknown> }) {
  if (!detail || Object.keys(detail).length === 0) return null;

  const email = typeof detail.email === 'string' ? detail.email : null;
  const oldStatus = typeof detail.old_status === 'string' ? detail.old_status : null;
  const newStatus = typeof detail.new_status === 'string' ? detail.new_status : null;
  const reviewNote = typeof detail.review_note === 'string' ? detail.review_note : null;
  const role = typeof detail.role === 'string' ? detail.role : null;
  const fullName = typeof detail.full_name === 'string' ? detail.full_name : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {email && (
        <span className="rounded-md bg-surface-tertiary px-2 py-0.5 font-mono text-text-secondary">{email}</span>
      )}
      {fullName && (
        <span className="font-medium text-text-secondary">{fullName}</span>
      )}
      {role && (
        <span className="rounded-md bg-primary-50 px-2 py-0.5 font-semibold text-primary-700">{roleLabel(role)}</span>
      )}
      {oldStatus && newStatus && (
        <span className="flex items-center gap-1 text-text-tertiary">
          <span className="rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px]">{statusLabel(oldStatus)}</span>
          <span>→</span>
          <span className="rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px]">{statusLabel(newStatus)}</span>
        </span>
      )}
      {reviewNote && (
        <span className="italic text-text-tertiary">"{reviewNote}"</span>
      )}
    </div>
  );
}

/* ── Date helpers ─────────────────────────────────── */

function toDateKey(isoString: string | null): string {
  if (!isoString) return 'Không rõ';
  return new Date(isoString).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function toDateLabel(isoString: string | null): string {
  if (!isoString) return 'Không rõ';
  const d = new Date(isoString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/* ── Group entries by date ────────────────────────── */

function groupByDate(logs: AuditLogResponse[]): { dateKey: string; dateLabel: string; entries: AuditLogResponse[] }[] {
  const map = new Map<string, AuditLogResponse[]>();
  const labels = new Map<string, string>();

  for (const log of logs) {
    const key = toDateKey(log.created_at);
    if (!map.has(key)) {
      map.set(key, []);
      labels.set(key, toDateLabel(log.created_at));
    }
    map.get(key)!.push(log);
  }

  return Array.from(map.entries()).map(([dateKey, entries]) => ({
    dateKey,
    dateLabel: labels.get(dateKey) || dateKey,
    entries,
  }));
}

/* ── Summary bar ─────────────────────────────────── */

function CategoryBar({ logs }: { logs: AuditLogResponse[] }) {
  const counts: Record<Category, number> = { staff: 0, review: 0, account: 0 };
  for (const log of logs) {
    const { category } = getConfig(log.action);
    counts[category]++;
  }
  const total = logs.length || 1;

  return (
    <div className="space-y-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
        {(['staff', 'review', 'account'] as Category[]).map((cat) => {
          if (counts[cat] === 0) return null;
          return (
            <div
              key={cat}
              className={`${categoryConfig[cat].dot} transition-all duration-500`}
              style={{ width: `${(counts[cat] / total) * 100}%` }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {[
          { cat: 'staff' as Category, label: 'Quản lý nhân viên' },
          { cat: 'review' as Category, label: 'Duyệt vận hành' },
          { cat: 'account' as Category, label: 'Tài khoản & bảo mật' },
        ].map(({ cat, label }) => (
          <div key={cat} className="flex items-center gap-2 text-xs">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${categoryConfig[cat].dot}`} />
            <span className="font-bold text-text-primary">{counts[cat]}</span>
            <span className="text-text-tertiary">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────── */

export default function AdminAuditLog() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLogResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(40);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters state
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<'ALL' | Category>('ALL');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('ALL');
  const [mountTime] = useState(() => Date.now());

  const fetchLogs = (currentLimit: number, showLoading = true) => {
    if (showLoading) {
      if (currentLimit === 40) setLoading(true);
      else setLoadingMore(true);
    }
    adminApi
      .getAuditLog({ limit: currentLimit })
      .then(setLogs)
      .catch((err) => toast('error', extractErrorMessage(err)))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  };

  useEffect(() => {
    fetchLogs(limit);
  }, [limit]);

  const handleLoadMore = () => {
    setLimit((prev) => prev + 40);
  };

  const handleRefresh = () => {
    fetchLogs(limit);
  };

  // Filtered logs calculation
  const filteredLogs = useMemo(() => {
    const now = mountTime;
    return logs
      .filter((log) => {
        // Category Filter
        if (activeCategory === 'ALL') return true;
        const { category } = getConfig(log.action);
        return category === activeCategory;
      })
      .filter((log) => {
        // Time Filter
        if (timeFilter === 'ALL') return true;
        if (!log.created_at) return false;
        const createdTime = new Date(log.created_at).getTime();
        const diffDays = (now - createdTime) / 86400000;
        
        if (timeFilter === 'TODAY') return diffDays <= 1;
        if (timeFilter === 'WEEK') return diffDays <= 7;
        if (timeFilter === 'MONTH') return diffDays <= 30;
        return true;
      })
      .filter((log) => {
        // Search Filter
        if (!search) return true;
        const q = search.toLowerCase();
        const config = getConfig(log.action);
        return (
          config.label.toLowerCase().includes(q) ||
          (log.actor_name || '').toLowerCase().includes(q) ||
          (log.actor_email || '').toLowerCase().includes(q) ||
          log.target_type.toLowerCase().includes(q)
        );
      });
  }, [logs, activeCategory, timeFilter, search, mountTime]);

  const groups = useMemo(() => groupByDate(filteredLogs), [filteredLogs]);

  if (loading) return <TableSkeleton />;

  return (
    <PortalPage
      title="Nhật ký hệ thống"
      description="Ghi nhận nhật ký hoạt động thay đổi cấu hình dữ liệu của nhân sự vận hành."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            Làm mới
          </Button>
        </div>
      }
    >
      {/* Summary Category Bar */}
      {logs.length > 0 && (
        <div className="rounded-xl border border-border-light bg-white p-5 shadow-sm mb-6">
          <CategoryBar logs={logs} />
        </div>
      )}

      {/* Segmented Category Tabs */}
      <div className="mb-4">
        <SegmentedTabs
          value={activeCategory}
          onChange={setActiveCategory}
          tabs={[
            { value: 'ALL', label: 'Tất cả nhật ký', count: logs.length },
            { value: 'staff', label: 'Quản lý nhân viên' },
            { value: 'review', label: 'Duyệt vận hành' },
            { value: 'account', label: 'Tài khoản & bảo mật' },
          ]}
        />
      </div>

      <SectionPanel
        title="Dòng thời gian hoạt động"
        description={`${filteredLogs.length} sự kiện được hiển thị.`}
        action={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <SearchInput
              placeholder="Tìm theo nhân viên, hành động..."
              value={search}
              onChange={setSearch}
              className="w-full sm:w-64"
            />
          </div>
        }
      >
        {/* Time filters chip bar */}
        <div className="mb-4 border-b border-border-light pb-3">
          <FilterChips
            value={timeFilter}
            onChange={setTimeFilter}
            options={[
              { value: 'ALL', label: 'Tất cả thời gian' },
              { value: 'TODAY', label: 'Hôm nay' },
              { value: 'WEEK', label: '7 ngày qua' },
              { value: 'MONTH', label: '30 ngày qua' },
            ]}
          />
        </div>

        {filteredLogs.length === 0 ? (
          <EmptyPanel
            title="Không tìm thấy nhật ký"
            description={search || timeFilter !== 'ALL' || activeCategory !== 'ALL' ? 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.' : 'Chưa có thao tác nào được thực hiện.'}
          />
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.dateKey}>
                {/* Date separator header */}
                <div className="mb-3 flex items-center gap-3">
                  <h3 className="shrink-0 text-sm font-bold text-text-primary">{group.dateLabel}</h3>
                  <div className="h-px flex-1 bg-border-light" />
                  <span className="shrink-0 rounded-full bg-surface-tertiary px-2.5 py-0.5 text-xs font-semibold text-text-tertiary">
                    {group.entries.length}
                  </span>
                </div>

                {/* Timeline entries */}
                <div className="relative ml-3 border-l-2 border-border-light pl-6 space-y-3">
                  {group.entries.map((log) => {
                    const config = getConfig(log.action);
                    const catConfig = categoryConfig[config.category] || categoryConfig.account;

                    return (
                      <article
                        key={log.id}
                        className={`relative rounded-lg border border-border-light border-l-4 bg-white p-4 transition-all hover:shadow-xs ${catConfig.bg}`}
                      >
                        {/* Timeline dot */}
                        <div className={`absolute -left-[calc(1.5rem+5.5px)] top-[1.3rem] h-2.5 w-2.5 rounded-full ring-2 ring-white ${catConfig.dot}`} />

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{catConfig.icon}</span>
                              <p className="font-bold text-text-primary text-sm">{config.label}</p>
                            </div>
                            <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                              Thực hiện bởi:{' '}
                              <span className="font-semibold text-text-primary">
                                {log.actor_name || log.actor_email || 'Hệ thống'}
                              </span>{' '}
                              trên <span className="font-semibold text-text-primary">{log.target_type}</span>
                              {log.target_id ? ` (ID #${log.target_id})` : ''}
                            </p>
                            <DetailView detail={log.detail} />
                          </div>
                          <span className="shrink-0 text-[10px] font-bold text-text-tertiary bg-surface-secondary px-2 py-0.5 rounded-md">
                            {formatTime(log.created_at)}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Load More Button Container */}
            {logs.length >= limit && (
              <div className="pt-4 text-center">
                <Button variant="outline" size="md" onClick={handleLoadMore} loading={loadingMore}>
                  Tải thêm nhật ký
                </Button>
              </div>
            )}
          </div>
        )}
      </SectionPanel>
    </PortalPage>
  );
}
