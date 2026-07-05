import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { extractErrorMessage, scheduleApi } from '../../services/api';
import type { ContractResponse, ContractStatus, LearningSessionResponse, SchedulePatternResponse, SessionStatus } from '../../types';
import Button from '../../components/ui/Button';
import { getStatusBadge } from '../../components/ui/Badge';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { CalendarIcon, ClipboardCheckIcon, ClockIcon, UserCheckIcon, ChevronLeftIcon, ChevronRightIcon } from '../../components/ui/Icons';
import { CalendarPlanner, EmptyPanel, MetricTile, PortalPage, SectionPanel, SegmentedTabs, type WeekEvent } from '../../components/portal/PortalPage';
import { appDayFromDate, FULL_DAY_NAMES } from '../../utils/days';

// Shared Components
import SearchInput from '../../components/shared/SearchInput';
import FilterChips from '../../components/shared/FilterChips';
import ConfirmActionModal from '../../components/shared/ConfirmActionModal';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';

type OperationTab = 'schedules' | 'contracts';
type SessionFilter = 'ALL' | 'DUE' | SessionStatus;

function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function sessionDateKey(session: LearningSessionResponse) {
  return session.session_date.slice(0, 10);
}

function sessionDay(dateValue: string) {
  return appDayFromDate(dateValue);
}

function timeRange(start?: string, end?: string) {
  return `${start?.slice(0, 5) || '--:--'} - ${end?.slice(0, 5) || '--:--'}`;
}

function sessionTitle(session: LearningSessionResponse) {
  return session.private_request_id
    ? session.private_request_title || `Yêu cầu 1-1 #${session.private_request_id}`
    : session.class_title || `Lớp học #${session.class_id}`;
}

function formatSessionDate(dateValue: string) {
  return new Date(dateValue).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function StaffOperations({ initialTab = 'schedules' }: { initialTab?: OperationTab }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<OperationTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [patterns, setPatterns] = useState<SchedulePatternResponse[]>([]);
  const [sessions, setSessions] = useState<LearningSessionResponse[]>([]);
  const [contracts, setContracts] = useState<ContractResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const urlSearch = searchParams.get('search') || '';
  const [search, setSearch] = useState(urlSearch);
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>(urlSearch ? 'ALL' : 'DUE');
  const [contractFilter, setContractFilter] = useState<'ALL' | ContractStatus>('PENDING');

  // Pagination State
  const [sessionPage, setSessionPage] = useState(1);
  const [contractPage, setContractPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setSessionPage(1);
  }, [sessionFilter, search]);

  useEffect(() => {
    setContractPage(1);
  }, [contractFilter, search]);

  const [confirmAction, setConfirmAction] = useState<{ id: number; action: ContractStatus; title: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [commissionContract, setCommissionContract] = useState<ContractResponse | null>(null);
  const [centerRate, setCenterRate] = useState(30);
  const [commissionReason, setCommissionReason] = useState('');
  const [showPatterns, setShowPatterns] = useState(false);

  const load = () => {
    Promise.all([
      scheduleApi.listPatterns().catch(() => []),
      scheduleApi.listSessions().catch(() => []),
      scheduleApi.listContracts().catch(() => []),
    ]).then(([patternList, sessionList, contractList]) => {
      setPatterns(patternList);
      setSessions(sessionList);
      setContracts(contractList);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const updateContract = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      await scheduleApi.updateContractStatus(confirmAction.id, { status: confirmAction.action });
      toast('success', 'Đã cập nhật trạng thái hợp đồng thành công');
      load();
    } catch {
      toast('error', 'Cập nhật trạng thái hợp đồng thất bại');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const openCommission = (contract: ContractResponse) => {
    setCommissionContract(contract);
    setCenterRate(Number(contract.center_rate_snapshot));
    setCommissionReason('');
  };

  const updateCommission = async () => {
    if (!commissionContract) return;
    if (commissionReason.trim().length < 3) {
      toast('error', 'Vui lòng nhập lý do điều chỉnh tỷ lệ.');
      return;
    }

    setActionLoading(true);
    try {
      await scheduleApi.updateContractCommission(commissionContract.id, {
        center_rate: String(centerRate),
        tutor_rate: String(100 - centerRate),
        reason: commissionReason.trim(),
      });
      toast('success', 'Đã cập nhật tỷ lệ phân chia của hợp đồng.');
      setCommissionContract(null);
      load();
    } catch (error) {
      toast('error', extractErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const today = localDateKey();
    return sessions
      .filter((s) => {
        if (sessionFilter === 'ALL') return true;
        if (sessionFilter === 'DUE') {
          return s.status === 'SCHEDULED' && sessionDateKey(s) <= today;
        }
        return s.status === sessionFilter;
      })
      .filter((s) => {
        if (!search) return true;
        const q = search.toLowerCase();
        const title = sessionTitle(s);
        return (
          (title || '').toLowerCase().includes(q) ||
          (s.tutor_name || '').toLowerCase().includes(q) ||
          s.id.toString().includes(q)
        );
      });
  }, [sessionFilter, sessions, search]);

  const paginatedSessions = useMemo(() => {
    const start = (sessionPage - 1) * ITEMS_PER_PAGE;
    return filteredSessions.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSessions, sessionPage]);

  const totalSessionPages = Math.ceil(filteredSessions.length / ITEMS_PER_PAGE);

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, LearningSessionResponse[]>();
    paginatedSessions
      .slice()
      .sort((a, b) => `${sessionDateKey(a)} ${a.start_time || ''}`.localeCompare(`${sessionDateKey(b)} ${b.start_time || ''}`))
      .forEach((session) => {
        const key = sessionDateKey(session);
        const current = groups.get(key) || [];
        current.push(session);
        groups.set(key, current);
      });
    return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
  }, [paginatedSessions]);

  const filteredContracts = useMemo(() => {
    return contracts
      .filter((c) => contractFilter === 'ALL' || c.status === contractFilter)
      .filter((c) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (c.tutor_name || '').toLowerCase().includes(q) ||
          (c.target_name || '').toLowerCase().includes(q) ||
          c.id.toString().includes(q)
        );
      });
  }, [contractFilter, contracts, search]);

  const paginatedContracts = useMemo(() => {
    const start = (contractPage - 1) * ITEMS_PER_PAGE;
    return filteredContracts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredContracts, contractPage]);

  const totalContractPages = Math.ceil(filteredContracts.length / ITEMS_PER_PAGE);

  const todayStr = localDateKey();
  const attendanceDue = useMemo(() => sessions.filter((s) => s.status === 'SCHEDULED' && sessionDateKey(s) <= todayStr).length, [sessions, todayStr]);
  const upcoming = useMemo(() => sessions.filter((s) => s.status === 'SCHEDULED' && sessionDateKey(s) > todayStr).length, [sessions, todayStr]);
  const scheduled = useMemo(() => sessions.filter((s) => s.status === 'SCHEDULED').length, [sessions]);
  const completed = useMemo(() => sessions.filter((s) => s.status === 'COMPLETED').length, [sessions]);
  const pendingContracts = useMemo(() => contracts.filter((c) => c.status === 'PENDING').length, [contracts]);
  const activeContracts = useMemo(() => contracts.filter((c) => c.status === 'ACTIVE').length, [contracts]);

  const weekEvents: WeekEvent[] = useMemo(() => {
    return sessions
      .filter((s) => s.status === 'SCHEDULED')
      .map((s) => ({
        id: s.id,
        dayOfWeek: sessionDay(s.session_date),
        date: s.session_date,
        title: s.private_request_id
          ? s.private_request_title || `Yêu cầu 1-1 #${s.private_request_id}`
          : s.class_title || `Lớp #${s.class_id}`,
        time: timeRange(s.start_time, s.end_time),
        meta: s.tutor_name || `Gia sư #${s.tutor_id}`,
        tone: 'primary',
      }));
  }, [sessions]);

  if (loading) return <DashboardSkeleton />;

  const contractStatusLabel = (status: ContractStatus) => {
    const labels: Partial<Record<ContractStatus, string>> = {
      PENDING: 'Chờ duyệt',
      ACTIVE: 'Đang hiệu lực',
      COMPLETED: 'Hoàn thành',
      CANCELLED: 'Đã hủy',
    };
    return labels[status] || status;
  };

  return (
    <PortalPage title="Lịch và hợp đồng" description="Quản lý lịch học của lớp, buổi học chi tiết và trạng thái hợp đồng.">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile 
          icon={CalendarIcon} 
          label="Cần điểm danh" 
          value={attendanceDue} 
          hint="Buổi đã tới ngày học nhưng chưa chốt." 
          tone={attendanceDue > 0 ? 'warning' : 'success'} 
          active={activeTab === 'schedules' && sessionFilter === 'DUE'}
          onClick={() => {
            navigate('/staff/schedules');
            setSessionFilter('DUE');
          }}
        />
        <MetricTile 
          icon={ClockIcon} 
          label="Sắp diễn ra" 
          value={upcoming} 
          hint="Buổi đã lên lịch trong tương lai." 
          tone="neutral" 
          active={activeTab === 'schedules' && sessionFilter === 'ALL'}
          onClick={() => {
            navigate('/staff/schedules');
            setSessionFilter('ALL');
          }}
        />
        <MetricTile 
          icon={ClipboardCheckIcon} 
          label="HĐ chờ duyệt" 
          value={pendingContracts} 
          hint="Hợp đồng cần ký duyệt." 
          tone="warning" 
          active={activeTab === 'contracts' && contractFilter === 'PENDING'}
          onClick={() => {
            navigate('/staff/contracts');
            setContractFilter('PENDING');
          }}
        />
        <MetricTile 
          icon={UserCheckIcon} 
          label="HĐ hiệu lực" 
          value={activeContracts} 
          hint={`${completed} buổi đã hoàn thành.`} 
          tone="neutral" 
          active={activeTab === 'contracts' && contractFilter === 'ACTIVE'}
          onClick={() => {
            navigate('/staff/contracts');
            setContractFilter('ACTIVE');
          }}
        />
      </div>

      <SegmentedTabs
        value={activeTab}
        onChange={(tab) => {
          navigate(tab === 'schedules' ? '/staff/schedules' : '/staff/contracts');
          setSearch('');
        }}
        tabs={[
          { value: 'schedules', label: 'Lịch & Buổi học', count: sessions.length },
          { value: 'contracts', label: 'Hợp đồng dạy', count: contracts.length },
        ]}
      />

      {activeTab === 'schedules' ? (
        <div className="space-y-6">
          {/* Week planner */}
          <SectionPanel title="Lịch tuần học vụ" description="Tổng quan lịch học đã lên lịch của trung tâm.">
            <CalendarPlanner events={weekEvents} emptyText="Không có lịch" />
          </SectionPanel>

          {/* Sessions list */}
          <SectionPanel
            title="Danh sách buổi học"
            description={`${filteredSessions.length} buổi học.`}
            action={
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowPatterns(!showPatterns)}>
                  {showPatterns ? 'Ẩn lịch định kỳ' : `Xem lịch định kỳ (${patterns.length})`}
                </Button>
                <SearchInput
                  placeholder="Tìm theo lớp, gia sư..."
                  value={search}
                  onChange={setSearch}
                  className="w-full sm:w-64"
                />
              </div>
            }
          >
            {/* Expandable patterns */}
            {showPatterns && patterns.length > 0 && (
              <div className="mb-4 rounded-xl border border-border-light bg-surface-secondary/70 p-4">
                <p className="mb-2 text-xs font-bold text-text-secondary uppercase tracking-wider">Khung giờ học định kỳ ({patterns.length})</p>
                <div className="flex flex-wrap gap-2">
                  {patterns.map((p) => (
                    <span key={p.id} className="rounded-lg border border-border-light bg-white px-3 py-1 text-xs text-text-secondary shadow-xs">
                      {FULL_DAY_NAMES[p.day_of_week]} {timeRange(p.start_time, p.end_time)} · {p.private_request_id ? `1-1 #${p.private_request_id}` : `Lớp #${p.class_id}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Session Filters */}
            <div className="mb-4 border-b border-border-light pb-3">
              <FilterChips
                value={sessionFilter}
                onChange={setSessionFilter}
                options={[
                  { value: 'ALL', label: 'Tất cả buổi', count: sessions.length },
                  { value: 'DUE', label: 'Cần điểm danh', count: attendanceDue },
                  { value: 'SCHEDULED', label: 'Đã lên lịch', count: scheduled },
                  { value: 'COMPLETED', label: 'Đã hoàn thành', count: completed },
                  { value: 'CANCELLED', label: 'Đã hủy', count: sessions.filter((s) => s.status === 'CANCELLED').length },
                ]}
              />
            </div>

            {filteredSessions.length === 0 ? (
              <EmptyPanel title="Không có buổi học nào" description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm." />
            ) : (
              <div className="space-y-4">
                {groupedSessions.map((group) => (
                  <div key={group.date} className="rounded-lg border border-border-light bg-white">
                    <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary/60 px-3 py-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">{formatSessionDate(group.date)}</p>
                      <span className="text-xs font-semibold text-text-tertiary">{group.items.length} buổi</span>
                    </div>
                    <div className="divide-y divide-border-light px-1">
                      {group.items.map((s) => {
                        const due = s.status === 'SCHEDULED' && sessionDateKey(s) <= todayStr;
                        return (
                          <div key={s.id} className="flex flex-col gap-2 rounded-lg px-2 py-3.5 transition-colors hover:bg-surface-secondary/40 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-text-primary">{sessionTitle(s)}</h3>
                                {getStatusBadge(s.status)}
                                {due && <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700">Cần điểm danh</span>}
                              </div>
                              <p className="mt-1 text-xs text-text-tertiary">
                                {timeRange(s.start_time, s.end_time)} · Gia sư: {s.tutor_name || `ID #${s.tutor_id}`}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalSessionPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-border-light pt-4 text-sm text-text-secondary">
                <div className="text-xs sm:text-sm">
                  Hiển thị <span className="font-semibold">{Math.min(filteredSessions.length, (sessionPage - 1) * ITEMS_PER_PAGE + 1)}</span>
                  <span>-</span>
                  <span className="font-semibold">{Math.min(filteredSessions.length, sessionPage * ITEMS_PER_PAGE)}</span>
                  <span> trong tổng số </span>
                  <span className="font-semibold">{filteredSessions.length}</span> buổi học
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sessionPage === 1}
                    onClick={() => setSessionPage((p) => Math.max(1, p - 1))}
                    className="p-1 px-2 text-xs"
                    icon={<ChevronLeftIcon className="h-4 w-4" />}
                  >
                    Trước
                  </Button>
                  <span className="text-xs sm:text-sm font-medium">
                    Trang {sessionPage} / {totalSessionPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sessionPage === totalSessionPages}
                    onClick={() => setSessionPage((p) => Math.min(totalSessionPages, p + 1))}
                    className="p-1 px-2 text-xs flex-row-reverse"
                    icon={<ChevronRightIcon className="h-4 w-4" />}
                  >
                    Sau
                  </Button>
                </div>
              </div>
            )}
          </SectionPanel>
        </div>
      ) : (
        <SectionPanel
          title="Hợp đồng giảng dạy"
          description={`${filteredContracts.length} hợp đồng.`}
          action={
            <SearchInput
              placeholder="Tìm theo gia sư, lớp học..."
              value={search}
              onChange={setSearch}
              className="w-full sm:w-64"
            />
          }
        >
          {/* Contract Filters */}
          <div className="mb-4 border-b border-border-light pb-3">
            <FilterChips
              value={contractFilter}
              onChange={setContractFilter}
              options={[
                { value: 'ALL', label: 'Tất cả hợp đồng', count: contracts.length },
                { value: 'PENDING', label: 'Chờ ký duyệt', count: pendingContracts },
                { value: 'ACTIVE', label: 'Đang hiệu lực', count: activeContracts },
                { value: 'COMPLETED', label: 'Đã hoàn thành', count: contracts.filter((c) => c.status === 'COMPLETED').length },
                { value: 'CANCELLED', label: 'Đã hủy', count: contracts.filter((c) => c.status === 'CANCELLED').length },
              ]}
            />
          </div>

          {filteredContracts.length === 0 ? (
            <EmptyPanel title="Không tìm thấy hợp đồng" description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm." />
          ) : (
            <div className="divide-y divide-border-light">
              {paginatedContracts.map((c) => {
                const target = c.target_name || (c.private_request_id ? `Yêu cầu 1-1 #${c.private_request_id}` : `Lớp học #${c.class_id}`);
                return (
                  <div key={c.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-3.5 hover:bg-surface-secondary/40 px-2 rounded-lg -mx-2 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-text-primary">Hợp đồng dạy #{c.id}</h3>
                        {getStatusBadge(c.status)}
                      </div>
                      <p className="mt-1 text-xs text-text-secondary">
                        Gia sư: <span className="font-semibold text-primary-900">{c.tutor_name || `ID #${c.tutor_id}`}</span> · Đối tượng: <span className="font-medium">{target}</span>
                      </p>
                      <p className="text-xs text-text-tertiary mt-0.5">
                        Biểu phí ({c.commission_name_snapshot}): Trung tâm hưởng {parseFloat(c.center_rate_snapshot).toFixed(0)}% · Gia sư nhận {parseFloat(c.tutor_rate_snapshot).toFixed(0)}%
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0 justify-end">
                      {(c.status === 'PENDING' || c.status === 'ACTIVE') && (
                        <Button size="sm" variant="ghost" onClick={() => openCommission(c)}>
                          Chỉnh tỷ lệ
                        </Button>
                      )}
                      {c.status === 'PENDING' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-danger-600 hover:bg-danger-50 border-danger-200"
                            onClick={() => setConfirmAction({ id: c.id, action: 'CANCELLED', title: 'Hủy hợp đồng' })}
                          >
                            Hủy hợp đồng
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setConfirmAction({ id: c.id, action: 'ACTIVE', title: 'Ký duyệt hợp đồng' })}
                          >
                            Duyệt hợp đồng
                          </Button>
                        </>
                      )}
                      {c.status === 'ACTIVE' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmAction({ id: c.id, action: 'COMPLETED', title: 'Hoàn thành hợp đồng' })}
                        >
                          Xác nhận hoàn thành
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {totalContractPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-border-light pt-4 text-sm text-text-secondary">
              <div className="text-xs sm:text-sm">
                Hiển thị <span className="font-semibold">{Math.min(filteredContracts.length, (contractPage - 1) * ITEMS_PER_PAGE + 1)}</span>
                <span>-</span>
                <span className="font-semibold">{Math.min(filteredContracts.length, contractPage * ITEMS_PER_PAGE)}</span>
                <span> trong tổng số </span>
                <span className="font-semibold">{filteredContracts.length}</span> hợp đồng
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={contractPage === 1}
                  onClick={() => setContractPage((p) => Math.max(1, p - 1))}
                  className="p-1 px-2 text-xs"
                  icon={<ChevronLeftIcon className="h-4 w-4" />}
                >
                  Trước
                </Button>
                <span className="text-xs sm:text-sm font-medium">
                  Trang {contractPage} / {totalContractPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={contractPage === totalContractPages}
                  onClick={() => setContractPage((p) => Math.min(totalContractPages, p + 1))}
                  className="p-1 px-2 text-xs flex-row-reverse"
                  icon={<ChevronRightIcon className="h-4 w-4" />}
                >
                  Sau
                </Button>
              </div>
            </div>
          )}
        </SectionPanel>
      )}

      {/* Confirm Action */}
      {confirmAction && (
        <ConfirmActionModal
          open={true}
          title={confirmAction.title}
          variant={confirmAction.action === 'CANCELLED' ? 'danger' : 'primary'}
          description={`Bạn có chắc chắn muốn chuyển hợp đồng #${confirmAction.id} sang trạng thái ${contractStatusLabel(confirmAction.action)} không?`}
          confirmLabel="Xác nhận"
          loading={actionLoading}
          onConfirm={updateContract}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      <Modal
        open={commissionContract !== null}
        onClose={() => setCommissionContract(null)}
        title={`Điều chỉnh tỷ lệ hợp đồng #${commissionContract?.id || ''}`}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCommissionContract(null)} disabled={actionLoading}>
              Hủy bỏ
            </Button>
            <Button loading={actionLoading} onClick={updateCommission}>
              Lưu tỷ lệ
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-border-light bg-surface-secondary p-4">
            <div className="mb-3 flex justify-between text-sm font-bold">
              <span>Trung tâm {centerRate}%</span>
              <span>Gia sư {100 - centerRate}%</span>
            </div>
            <input
              aria-label="Tỷ lệ phần trung tâm"
              type="range"
              min={0}
              max={100}
              step={1}
              value={centerRate}
              onChange={(event) => setCenterRate(Number(event.target.value))}
              className="w-full accent-primary-700"
            />
          </div>
          <Input
            label="Lý do điều chỉnh"
            value={commissionReason}
            onChange={(event) => setCommissionReason(event.target.value)}
            placeholder="Ví dụ: Tỷ lệ áp dụng riêng cho hợp đồng này"
          />
          <p className="text-xs leading-5 text-text-tertiary">
            Tỷ lệ chỉ có thể thay đổi trước khi hợp đồng phát sinh thanh toán đã được phân bổ.
          </p>
        </div>
      </Modal>
    </PortalPage>
  );
}
