import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { classApi, subjectApi, privateRequestApi, messageApi } from '../../services/api';
import type { CourseClassResponse, SubjectResponse, PrivateRequestResponse } from '../../types';
import Button from '../../components/ui/Button';
import { getStatusBadge } from '../../components/ui/Badge';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { BookOpenIcon, ClipboardCheckIcon, LayersIcon, UsersIcon } from '../../components/ui/Icons';
import { EmptyPanel, MetricTile, PortalPage, SectionPanel } from '../../components/portal/PortalPage';
import { currency, removeAccents } from '../../utils/format';

// Shared & Sub-modals
import SearchInput from '../../components/shared/SearchInput';
import FilterChips from '../../components/shared/FilterChips';
import ConfirmActionModal from '../../components/shared/ConfirmActionModal';
import CreateClassModal from '../../components/staff/CreateClassModal';
import CreateSubjectModal from '../../components/staff/CreateSubjectModal';
import ClassDetailModal from '../../components/staff/ClassDetailModal';

type ClassFilter = 'ALL' | 'DRAFT' | 'TUTOR_RECRUITING' | 'ENROLLING' | 'READY' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' | 'SENT' | 'TUTOR_CONFIRMED' | 'PAID' | 'TUTOR_REJECTED';

const nextStepMap: Record<string, { label: string; next: CourseClassResponse['status']; desc: string } | null> = {
  DRAFT: {
    label: 'Mở tuyển GS',
    next: 'TUTOR_RECRUITING',
    desc: 'mở tuyển gia sư cho lớp học này. Các gia sư sẽ bắt đầu nhìn thấy và ứng tuyển vào lớp',
  },
  TUTOR_RECRUITING: {
    label: 'Mở đăng ký HV',
    next: 'ENROLLING',
    desc: 'mở đăng ký cho học viên. Học viên có thể tìm thấy lớp và đăng ký học',
  },
  ENROLLING: {
    label: 'Sẵn sàng',
    next: 'READY',
    desc: 'chuyển lớp học sang trạng thái sẵn sàng để chuẩn bị bắt đầu học',
  },
  READY: {
    label: 'Bắt đầu lớp',
    next: 'ONGOING',
    desc: 'chính thức bắt đầu lớp học này. Lịch học sẽ có hiệu lực và các buổi học sẽ diễn ra',
  },
};

const classConfig: { key: string; label: string; color: string }[] = [
  { key: 'DRAFT', label: 'Bản nháp', color: 'bg-slate-300' },
  { key: 'TUTOR_RECRUITING', label: 'Tuyển GS', color: 'bg-amber-400' },
  { key: 'ENROLLING', label: 'Tuyển sinh', color: 'bg-blue-500' },
  { key: 'READY', label: 'Sẵn sàng', color: 'bg-emerald-500' },
  { key: 'ONGOING', label: 'Đang học', color: 'bg-green-600' },
  { key: 'COMPLETED', label: 'Đã xong', color: 'bg-gray-500' },
  { key: 'CANCELLED', label: 'Đã hủy', color: 'bg-red-500' },
];

function ClassDistributionBar({ classes }: { classes: CourseClassResponse[] }) {
  const total = classes.length;
  
  if (total === 0) {
    return null;
  }

  const byStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    classes.forEach((c) => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return counts;
  }, [classes]);

  return (
    <div className="mb-6 rounded-xl border border-border-light bg-surface-primary p-4 shadow-sm">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-secondary">
        Phân bổ trạng thái lớp học nhóm ({total} lớp)
      </h4>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-secondary">
        {classConfig.map(({ key, label, color }) => {
          const count = byStatus[key] || 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={key}
              className={`${color} transition-all duration-500`}
              style={{ width: `${pct}%` }}
              title={`${label}: ${count}/${total} lớp`}
            />
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {classConfig.map(({ key, label, color }) => {
          const count = byStatus[key] || 0;
          if (count === 0) return null;
          const pct = Math.round((count / total) * 100);
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
              <span className="font-semibold text-text-primary">
                {label}: <span className="font-bold text-primary-700">{count}/{total}</span> lớp
              </span>
              <span className="text-[10px] text-text-tertiary">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


interface RowActionMenuProps {
  actions: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    variant?: 'default' | 'danger' | 'success';
  }[];
}

function RowActionMenu({ actions }: RowActionMenuProps) {
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-primary focus:outline-none"
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border-light bg-white py-1 shadow-lg animate-fade-in">
          {actions.map((act, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setOpen(false);
                act.onClick();
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-surface-secondary ${
                act.variant === 'danger' ? 'text-danger-600' : 
                act.variant === 'success' ? 'text-success-700' : 'text-text-primary'
              }`}
            >
              {act.icon}
              {act.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


export default function StaffAcademic({ mode = 'classes' }: { mode?: 'classes' | 'subjects' | 'requests' }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [classes, setClasses] = useState<CourseClassResponse[]>([]);
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [requests, setRequests] = useState<PrivateRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState<ClassFilter>('ALL');

  useEffect(() => {
    setSearchQuery('');
    setStatusFilter('ALL');
  }, [mode]);

  // Modals state
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [showCreateSubject, setShowCreateSubject] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectResponse | null>(null);
  const [editingClass, setEditingClass] = useState<CourseClassResponse | null>(null);
  const [confirmDeleteClass, setConfirmDeleteClass] = useState<CourseClassResponse | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailTitle, setDetailTitle] = useState('');
  const [confirmHide, setConfirmHide] = useState<SubjectResponse | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    id: number;
    title: string;
    nextStatus: CourseClassResponse['status'];
    actionDesc: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = () => {
    Promise.all([
      classApi.list().catch(() => []),
      subjectApi.list({ include_inactive: true }).catch(() => []),
      privateRequestApi.list().catch(() => []),
    ]).then(([classList, subjectList, requestList]) => {
      setClasses(classList);
      setSubjects(subjectList);
      setRequests(requestList);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const handleClassStatus = async () => {
    if (!pendingStatusChange) return;
    setActionLoading(true);
    try {
      await classApi.updateStatus(pendingStatusChange.id, { status: pendingStatusChange.nextStatus });
      toast('success', 'Đã cập nhật trạng thái lớp thành công');
      load();
    } catch {
      toast('error', 'Cập nhật trạng thái thất bại');
    } finally {
      setActionLoading(false);
      setPendingStatusChange(null);
    }
  };

  const handleDeleteSubject = async () => {
    if (!confirmHide) return;
    setActionLoading(true);
    try {
      const result = await subjectApi.delete(confirmHide.id);
      toast(
        'success',
        result.mode === 'HARD_DELETED'
          ? 'Đã xoá hẳn môn học vì chưa có dữ liệu liên quan.'
          : 'Môn học đã có dữ liệu liên quan nên đã ngừng dùng để giữ lịch sử.',
      );
      load();
    } catch {
      toast('error', 'Thao tác xử lý môn học thất bại');
    } finally {
      setActionLoading(false);
      setConfirmHide(null);
    }
  };

  const handleDeleteClass = async () => {
    if (!confirmDeleteClass) return;
    setActionLoading(true);
    try {
      await classApi.delete(confirmDeleteClass.id);
      toast('success', `Đã xóa lớp học "${confirmDeleteClass.title}" thành công.`);
      load();
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || 'Xóa lớp học thất bại';
      toast('error', errMsg);
    } finally {
      setActionLoading(false);
      setConfirmDeleteClass(null);
    }
  };

  const classStats = useMemo(() => {
    return {
      draft: classes.filter((c) => c.status === 'DRAFT').length,
      recruiting: classes.filter((c) => c.status === 'TUTOR_RECRUITING').length,
      enrolling: classes.filter((c) => c.status === 'ENROLLING').length,
      active: classes.filter((c) => ['READY', 'ONGOING'].includes(c.status)).length,
      cancelled: classes.filter((c) => c.status === 'CANCELLED').length,
    };
  }, [classes]);

  const requestStats = useMemo(() => {
    return {
      sent: requests.filter((r) => r.status === 'SENT').length,
      confirmed: requests.filter((r) => r.status === 'TUTOR_CONFIRMED').length,
      paid: requests.filter((r) => r.status === 'PAID').length,
      rejected: requests.filter((r) => r.status === 'TUTOR_REJECTED').length,
    };
  }, [requests]);

  // Filtered lists
  const filteredClasses = useMemo(() => {
    const q = removeAccents(searchQuery.trim());
    return classes
      .filter((c) => statusFilter === 'ALL' || c.status === statusFilter)
      .filter((c) => {
        if (!q) return true;
        return (
          removeAccents(c.title).includes(q) ||
          removeAccents(c.grade_level || '').includes(q) ||
          removeAccents(c.tutor_name || '').includes(q)
        );
      });
  }, [classes, searchQuery, statusFilter]);

  const filteredRequests = useMemo(() => {
    const q = removeAccents(searchQuery.trim());
    return requests
      .filter((r) => statusFilter === 'ALL' || r.status === statusFilter)
      .filter((r) => {
        if (!q) return true;
        return (
          removeAccents(r.student_name || '').includes(q) ||
          removeAccents(r.tutor_name || '').includes(q) ||
          removeAccents(r.subject_name || '').includes(q) ||
          removeAccents(r.grade_level || '').includes(q)
        );
      });
  }, [requests, searchQuery, statusFilter]);

  const filteredSubjects = useMemo(() => {
    const q = removeAccents(searchQuery.trim());
    return subjects.filter((s) => {
      if (!q) return true;
      return removeAccents(s.name).includes(q) || removeAccents(s.description || '').includes(q);
    });
  }, [subjects, searchQuery]);

  if (loading) return <DashboardSkeleton />;

  return (
    <PortalPage
      title={
        mode === 'classes' ? 'Quản lý lớp học' :
        mode === 'requests' ? 'Yêu cầu dạy 1-1' : 'Danh mục môn học'
      }
      description={
        mode === 'classes' ? 'Quản lý danh sách lớp học nhóm, tuyển gia sư và học viên.' :
        mode === 'requests' ? 'Quản lý và điều phối các yêu cầu học 1-1 từ học viên gửi đến gia sư.' : 'Quản lý danh mục môn học hệ thống.'
      }
      actions={
        mode === 'classes' ? (
          <Button onClick={() => setShowCreateClass(true)}>+ Tạo lớp</Button>
        ) : mode === 'subjects' ? (
          <Button onClick={() => setShowCreateSubject(true)}>+ Thêm môn</Button>
        ) : null
      }
    >
      {mode === 'classes' ? (
        <div className="grid gap-4 md:grid-cols-4">
          <MetricTile
            icon={BookOpenIcon}
            label="Tổng số lớp"
            value={classes.length}
            hint="Tất cả lớp học nhóm."
            active={statusFilter === 'ALL'}
            onClick={() => setStatusFilter('ALL')}
          />
          <MetricTile
            icon={LayersIcon}
            label="Đang chuẩn bị"
            value={classStats.draft + classStats.recruiting}
            hint="Chờ mở tuyển hoặc chọn GS."
            tone="warning"
            active={statusFilter === 'DRAFT' || statusFilter === 'TUTOR_RECRUITING'}
            onClick={() => setStatusFilter('TUTOR_RECRUITING')}
          />
          <MetricTile
            icon={UsersIcon}
            label="Tuyển học viên"
            value={classStats.enrolling}
            hint="Đang mở đăng ký học."
            tone="primary"
            active={statusFilter === 'ENROLLING'}
            onClick={() => setStatusFilter('ENROLLING')}
          />
          <MetricTile
            icon={ClipboardCheckIcon}
            label="Đang mở"
            value={classStats.active}
            hint="Sẵn sàng hoặc đang học."
            tone="success"
            active={statusFilter === 'READY' || statusFilter === 'ONGOING'}
            onClick={() => setStatusFilter('ONGOING')}
          />
        </div>
      ) : mode === 'requests' ? (
        <div className="grid gap-4 md:grid-cols-4">
          <MetricTile
            icon={BookOpenIcon}
            label="Tổng số yêu cầu"
            value={requests.length}
            hint="Tất cả yêu cầu học 1-1."
            active={statusFilter === 'ALL'}
            onClick={() => setStatusFilter('ALL')}
          />
          <MetricTile
            icon={LayersIcon}
            label="Chờ phản hồi"
            value={requestStats.sent}
            hint="Đang chờ gia sư trả lời."
            tone="warning"
            active={statusFilter === 'SENT'}
            onClick={() => setStatusFilter('SENT')}
          />
          <MetricTile
            icon={UsersIcon}
            label="Gia sư xác nhận"
            value={requestStats.confirmed}
            hint="Gia sư đồng ý nhận lớp."
            tone="primary"
            active={statusFilter === 'TUTOR_CONFIRMED'}
            onClick={() => setStatusFilter('TUTOR_CONFIRMED')}
          />
          <MetricTile
            icon={ClipboardCheckIcon}
            label="Đã thanh toán"
            value={requestStats.paid}
            hint="Học viên đã hoàn tất phí."
            tone="success"
            active={statusFilter === 'PAID'}
            onClick={() => setStatusFilter('PAID')}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <MetricTile
            icon={BookOpenIcon}
            label="Tổng số môn học"
            value={subjects.length}
            hint="Danh mục môn hệ thống."
            tone="neutral"
          />
          <MetricTile
            icon={ClipboardCheckIcon}
            label="Môn đang hoạt động"
            value={subjects.filter((s) => s.status === 'ACTIVE').length}
            hint="Đang cho phép lựa chọn."
            tone="success"
          />
          <MetricTile
            icon={LayersIcon}
            label="Môn tạm ngưng"
            value={subjects.filter((s) => s.status === 'INACTIVE').length}
            hint="Đã ngừng kích hoạt."
            tone="warning"
          />
        </div>
      )}

      {mode === 'classes' ? (
        <SectionPanel
          title="Danh sách lớp"
          description={`${filteredClasses.length} lớp học.`}
          action={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput
                placeholder="Tìm lớp học, cấp lớp..."
                value={searchQuery}
                onChange={setSearchQuery}
                className="w-full sm:w-64"
              />
            </div>
          }
        >
          <ClassDistributionBar classes={classes} />

          {/* Status Filters */}
          <div className="mb-4 border-b border-border-light pb-3">
            <FilterChips
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'ALL', label: 'Tất cả', count: classes.length },
                { value: 'DRAFT', label: 'Bản nháp', count: classStats.draft },
                { value: 'TUTOR_RECRUITING', label: 'Tuyển gia sư', count: classStats.recruiting },
                { value: 'ENROLLING', label: 'Tuyển học viên', count: classStats.enrolling },
                { value: 'READY', label: 'Sẵn sàng', count: classes.filter((c) => c.status === 'READY').length },
                { value: 'ONGOING', label: 'Đang dạy', count: classes.filter((c) => c.status === 'ONGOING').length },
                { value: 'COMPLETED', label: 'Đã kết thúc', count: classes.filter((c) => c.status === 'COMPLETED').length },
                { value: 'CANCELLED', label: 'Đã hủy', count: classStats.cancelled },
              ]}
            />
          </div>

          {filteredClasses.length === 0 ? (
            <EmptyPanel
              title="Không tìm thấy lớp học"
              description={searchQuery || statusFilter !== 'ALL' ? 'Vui lòng thử bộ lọc hoặc từ khóa tìm kiếm khác.' : 'Chưa có lớp học nhóm nào.'}
              action={
                !searchQuery && statusFilter === 'ALL' ? (
                  <Button onClick={() => setShowCreateClass(true)}>Tạo lớp mới</Button>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y divide-border-light">
              {filteredClasses.map((course) => {
                const step = nextStepMap[course.status];
                return (
                  <div 
                    key={course.id} 
                    className="flex items-center justify-between gap-4 py-3.5 hover:bg-surface-secondary/40 px-2 rounded-lg -mx-2 transition-colors cursor-pointer"
                    onClick={() => {
                      setDetailId(course.id);
                      setDetailTitle(course.title);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-text-primary truncate">{course.title}</h3>
                        {getStatusBadge(course.status)}
                      </div>
                      <p className="mt-1 text-xs text-text-tertiary">
                        {course.grade_level} · {course.total_sessions} buổi · {currency(course.fee_per_session_per_student)}/HV/buổi · {course.min_students}-{course.max_students} HV
                        · {course.mode === 'ONLINE' ? 'Trực tuyến' : course.location || 'Trực tiếp'}
                        {course.start_date && <span className="ml-2">· Bắt đầu: {new Date(course.start_date).toLocaleDateString('vi-VN')}</span>}
                        {course.end_date && <span className="ml-1">– {new Date(course.end_date).toLocaleDateString('vi-VN')}</span>}
                        {course.tutor_name && <span className="ml-2 text-primary-700 font-medium">· Gia sư: {course.tutor_name}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {step && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setPendingStatusChange({
                              id: course.id,
                              title: course.title,
                              nextStatus: step.next,
                              actionDesc: step.desc,
                            })
                          }
                        >
                          {step.label}
                        </Button>
                      )}
                      <RowActionMenu
                        actions={[
                          {
                            label: 'Chi tiết',
                            onClick: () => {
                              setDetailId(course.id);
                              setDetailTitle(course.title);
                            },
                            icon: (
                              <svg className="h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )
                          },
                          {
                            label: 'Sửa',
                            onClick: () => setEditingClass(course),
                            icon: (
                              <svg className="h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            )
                          },
                          ...(course.status !== 'CANCELLED' && course.status !== 'COMPLETED' ? [
                            {
                              label: 'Hủy lớp',
                              onClick: () => {
                                setPendingStatusChange({
                                  id: course.id,
                                  title: course.title,
                                  nextStatus: 'CANCELLED' as const,
                                  actionDesc: 'hủy lớp học này. Trạng thái lớp sẽ chuyển sang CANCELLED và không thể thay đổi tiếp',
                                });
                              },
                              variant: 'danger' as const,
                              icon: (
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              )
                            }
                          ] : []),
                          {
                            label: 'Xóa',
                            onClick: () => setConfirmDeleteClass(course),
                            variant: 'danger',
                            icon: (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )
                          }
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionPanel>
      ) : mode === 'requests' ? (
        <SectionPanel
          title="Danh sách yêu cầu 1-1"
          description={`${filteredRequests.length} yêu cầu.`}
          action={
            <SearchInput
              placeholder="Tìm học viên, gia sư, môn học..."
              value={searchQuery}
              onChange={setSearchQuery}
              className="w-full sm:w-64"
            />
          }
        >
          {/* Status Filters */}
          <div className="mb-4 border-b border-border-light pb-3">
            <FilterChips
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'ALL', label: 'Tất cả', count: requests.length },
                { value: 'SENT', label: 'Chờ phản hồi', count: requestStats.sent },
                { value: 'TUTOR_CONFIRMED', label: 'Gia sư đã xác nhận', count: requestStats.confirmed },
                { value: 'PAID', label: 'Đã thanh toán', count: requestStats.paid },
                { value: 'TUTOR_REJECTED', label: 'Gia sư từ chối', count: requestStats.rejected },
              ]}
            />
          </div>

          {filteredRequests.length === 0 ? (
            <EmptyPanel
              title="Không tìm thấy yêu cầu 1-1"
              description="Vui lòng thử bộ lọc hoặc từ khóa tìm kiếm khác."
            />
          ) : (
            <div className="divide-y divide-border-light">
              {filteredRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between gap-4 py-3.5 hover:bg-surface-secondary/40 px-2 rounded-lg -mx-2 transition-colors cursor-pointer"
                  onClick={async () => {
                    if (req.thread_id) {
                      navigate(`/staff/messages?thread=${req.thread_id}`);
                    } else {
                      try {
                        const thread = await messageApi.ensureThread({
                          private_request_id: req.id,
                        });
                        navigate(`/staff/messages?thread=${thread.id}`);
                      } catch {
                        toast('error', 'Không thể mở hộp thoại chat.');
                      }
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">
                        Yêu cầu 1-1 môn {req.subject_name} ({req.grade_level})
                      </h3>
                      {getStatusBadge(req.status)}
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      Học viên: <span className="font-medium text-text-secondary">{req.student_name}</span> {req.student_phone && `(${req.student_phone})`}
                      {' · '} Gia sư: <span className="font-medium text-primary-700">{req.tutor_name}</span> {req.tutor_phone && `(${req.tutor_phone})`}
                      {req.agreed_fee_per_session ? (
                        <span className="ml-2 font-medium text-success-700">· Học phí đồng ý: {currency(Number(req.agreed_fee_per_session))}/buổi</span>
                      ) : (
                        <span className="ml-2 font-medium text-text-secondary">· Chưa đề xuất phí</span>
                      )}
                      {' · '} Thời lượng: {req.requested_sessions} buổi
                    </p>
                    {req.goal && (
                      <p className="mt-1 text-xs text-text-secondary italic">
                        Mục tiêu: "{req.goal}"
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        if (req.thread_id) {
                          navigate(`/staff/messages?thread=${req.thread_id}`);
                        } else {
                          try {
                            const thread = await messageApi.ensureThread({
                              private_request_id: req.id,
                            });
                            navigate(`/staff/messages?thread=${thread.id}`);
                          } catch {
                            toast('error', 'Không thể mở cuộc trò chuyện.');
                          }
                        }
                      }}
                    >
                      Nhắn tin / Chi tiết
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionPanel>
      ) : (
        <SectionPanel
          title="Danh mục môn học"
          description={`${filteredSubjects.length} môn.`}
          action={
            <SearchInput
              placeholder="Tìm môn học..."
              value={searchQuery}
              onChange={setSearchQuery}
              className="w-full sm:w-64"
            />
          }
        >
          {filteredSubjects.length === 0 ? (
            <EmptyPanel
              title="Không tìm thấy môn học"
              description={searchQuery ? 'Thử lại với từ khóa khác.' : 'Chưa có môn học nào trong danh mục.'}
              action={
                !searchQuery ? (
                  <Button onClick={() => setShowCreateSubject(true)}>Thêm môn học</Button>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y divide-border-light">
              {filteredSubjects.map((subject) => (
                <div key={subject.id} className="flex items-center justify-between gap-4 py-3 hover:bg-surface-secondary/40 px-2 rounded-lg -mx-2 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">{subject.name}</h3>
                      {getStatusBadge(subject.status)}
                    </div>
                    {subject.description && <p className="mt-1 text-xs text-text-tertiary truncate">{subject.description}</p>}
                  </div>
                  <RowActionMenu
                    actions={[
                      {
                        label: 'Sửa',
                        onClick: () => setEditingSubject(subject),
                        icon: (
                          <svg className="h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        )
                      },
                      subject.status === 'INACTIVE' ? {
                        label: 'Kích hoạt lại',
                        variant: 'success',
                        onClick: async () => {
                          try {
                            await subjectApi.update(subject.id, {
                              name: subject.name,
                              description: subject.description || undefined,
                              status: 'ACTIVE',
                            });
                            toast('success', `Đã kích hoạt lại môn học "${subject.name}"`);
                            load();
                          } catch {
                            toast('error', 'Kích hoạt lại môn học thất bại');
                          }
                        },
                        icon: (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )
                      } : {
                        label: 'Ngừng dùng',
                        variant: 'danger',
                        onClick: () => setConfirmHide(subject),
                        icon: (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        )
                      }
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </SectionPanel>
      )}

      {/* Extracted Sub-modals */}
      <CreateClassModal
        open={showCreateClass || Boolean(editingClass)}
        editingClass={editingClass}
        onClose={() => {
          setShowCreateClass(false);
          setEditingClass(null);
        }}
        subjects={subjects}
        onCreated={() => {
          setShowCreateClass(false);
          setEditingClass(null);
          load();
        }}
      />

      <CreateSubjectModal
        open={showCreateSubject || Boolean(editingSubject)}
        subject={editingSubject}
        onClose={() => {
          setShowCreateSubject(false);
          setEditingSubject(null);
        }}
        onCreated={() => {
          setShowCreateSubject(false);
          setEditingSubject(null);
          load();
        }}
      />

      {detailId && (
        <ClassDetailModal
          classId={detailId}
          classTitle={detailTitle}
          onClose={() => setDetailId(null)}
          onRefresh={load}
        />
      )}

      {/* Confirm Hide Subject */}
      {confirmHide && (
        <ConfirmActionModal
          open={true}
          title="Xóa hoặc ngừng dùng môn học"
          variant="danger"
          description={`Hệ thống sẽ xoá hẳn "${confirmHide.name}" nếu môn này chưa có lớp, gia sư, nhu cầu học viên hoặc yêu cầu 1-1 nào. Nếu đã có dữ liệu liên quan, hệ thống chỉ ngừng dùng môn này để giữ lịch sử học và dạy.`}
          confirmLabel="Xử lý môn học"
          loading={actionLoading}
          onConfirm={handleDeleteSubject}
          onCancel={() => setConfirmHide(null)}
        />
      )}

      {/* Confirm Delete Class */}
      {confirmDeleteClass && (
        <ConfirmActionModal
          open={true}
          title="Xóa lớp học"
          variant="danger"
          description={`Bạn có chắc chắn muốn xóa lớp học "${confirmDeleteClass.title}" không? Hành động này sẽ xóa toàn bộ đơn ứng tuyển gia sư liên quan và không thể hoàn tác.`}
          confirmLabel="Xóa lớp học"
          loading={actionLoading}
          onConfirm={handleDeleteClass}
          onCancel={() => setConfirmDeleteClass(null)}
        />
      )}

      {/* Confirm Class Status Change */}
      {pendingStatusChange && (
        <ConfirmActionModal
          open={true}
          title="Cập nhật trạng thái lớp"
          description={`Bạn có chắc chắn muốn ${pendingStatusChange.actionDesc} "${pendingStatusChange.title}"?`}
          confirmLabel="Đồng ý"
          loading={actionLoading}
          onConfirm={handleClassStatus}
          onCancel={() => setPendingStatusChange(null)}
        />
      )}
    </PortalPage>
  );
}
