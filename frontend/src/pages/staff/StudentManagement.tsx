import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { staffApi, messageApi, extractErrorMessage } from '../../services/api';
import { getStatusBadge } from '../../components/ui/Badge';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ShieldCheckIcon, UsersIcon } from '../../components/ui/Icons';
import { MetricTile, PortalPage, SectionPanel, EmptyPanel } from '../../components/portal/PortalPage';
import Avatar from '../../components/ui/Avatar';
import { removeAccents } from '../../utils/format';

// Shared Components
import SearchInput from '../../components/shared/SearchInput';
import ActionMenu from '../../components/shared/ActionMenu';
import ConfirmActionModal from '../../components/shared/ConfirmActionModal';
import PasswordResultModal from '../../components/shared/PasswordResultModal';

interface StudentRecord {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string | null;
}

interface ConfirmAction {
  type: 'toggle' | 'reset';
  student: StudentRecord;
}

/* ── Student card (mobile) ───────────────────────── */

function StudentCard({
  student,
  onToggle,
  onReset,
  onChat,
  loading,
}: {
  student: StudentRecord;
  onToggle: () => void;
  onReset: () => void;
  onChat?: () => void;
  loading: boolean;
}) {
  const suspended = student.status === 'SUSPENDED';
  return (
    <article
      className={`rounded-lg border p-4 transition-all ${
        suspended ? 'border-danger-200 bg-danger-50/10' : 'border-border-light bg-white hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={student.full_name} src={student.avatar_url || undefined} size="sm" />
          <div className="min-w-0">
            <h3 className={`truncate font-semibold ${suspended ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
              {student.full_name}
            </h3>
            <p className="text-xs text-text-tertiary">{student.email}</p>
          </div>
        </div>
        <ActionMenu
          status={student.status}
          onToggle={onToggle}
          onReset={onReset}
          onChat={onChat}
          loading={loading}
          roleLabel="học viên"
        />
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-text-tertiary">
        {getStatusBadge(student.status)}
        <span>·</span>
        <span>{student.phone || 'Chưa có SĐT'}</span>
        <span>·</span>
        <span>{student.created_at ? new Date(student.created_at).toLocaleDateString('vi-VN') : '-'}</span>
      </div>
    </article>
  );
}

/* ── Main ────────────────────────────────────────── */

export default function StaffStudentManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const handleChat = async (studentId: number) => {
    setActionLoading(studentId);
    try {
      const thread = await messageApi.ensureThread({ target_account_id: studentId });
      navigate(`/staff/messages?threadId=${thread.id}`);
    } catch (err) {
      toast('error', extractErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const load = () => {
    staffApi
      .getStudents()
      .then(setStudents)
      .catch(() => toast('error', 'Không thể tải danh sách học viên'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const activeCount = useMemo(() => students.filter((s) => s.status === 'ACTIVE').length, [students]);
  const suspendedCount = useMemo(() => students.filter((s) => s.status === 'SUSPENDED').length, [students]);

  const filtered = useMemo(() => {
    const q = removeAccents(search.trim());
    return students
      .filter((s) => filter === 'ALL' || s.status === filter)
      .filter((s) => {
        if (!q) return true;
        return (
          removeAccents(s.full_name).includes(q) ||
          removeAccents(s.email).includes(q) ||
          (s.phone || '').includes(q)
        );
      });
  }, [search, students, filter]);

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    const { student, type } = confirmAction;

    setActionLoading(student.id);
    try {
      if (type === 'toggle') {
        const nextStatus = student.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        const label = nextStatus === 'SUSPENDED' ? 'khóa' : 'mở khóa';
        await staffApi.updateAccountStatus(student.id, nextStatus);
        toast('success', `Đã ${label} tài khoản ${student.full_name}`);
        load();
      } else {
        const result = await staffApi.resetPassword(student.id);
        setResetResult({ name: student.full_name, password: result.temp_password });
        toast('success', `Đã cấp lại mật khẩu cho ${student.full_name}`);
      }
    } catch {
      toast('error', 'Thao tác thất bại');
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const confirmTitle = useMemo(() => {
    if (!confirmAction) return '';
    return confirmAction.type === 'toggle'
      ? confirmAction.student.status === 'ACTIVE'
        ? 'Khóa tài khoản học viên'
        : 'Mở khóa tài khoản học viên'
      : 'Cấp lại mật khẩu';
  }, [confirmAction]);

  const confirmDesc = useMemo(() => {
    if (!confirmAction) return '';
    return confirmAction.type === 'toggle'
      ? confirmAction.student.status === 'ACTIVE'
        ? `Học viên "${confirmAction.student.full_name}" sẽ không thể đăng nhập vào hệ thống sau khi bị khóa.`
        : `Mở khóa để học viên "${confirmAction.student.full_name}" có thể đăng nhập lại.`
      : `Mật khẩu cũ của học viên "${confirmAction.student.full_name}" sẽ bị vô hiệu hóa và thay bằng mật khẩu tạm mới.`;
  }, [confirmAction]);

  const confirmVariant = useMemo(() => {
    return confirmAction?.type === 'toggle' && confirmAction.student.status === 'ACTIVE' ? 'danger' : 'primary';
  }, [confirmAction]);

  if (loading) return <TableSkeleton />;

  return (
    <PortalPage title="Quản lý học viên" description="Quản lý thông tin tài khoản, khóa hoặc cấp lại mật khẩu.">
      {students.length >= 2 && (
        <div className="grid gap-4 md:grid-cols-3">
          <MetricTile 
            icon={UsersIcon} 
            label="Tổng học viên" 
            value={students.length} 
            hint="Đã đăng ký hệ thống." 
            tone="neutral" 
            active={filter === 'ALL'}
            onClick={() => setFilter('ALL')}
          />
          <MetricTile 
            icon={ShieldCheckIcon} 
            label="Đang hoạt động" 
            value={activeCount} 
            hint="Tài khoản bình thường." 
            tone="success" 
            active={filter === 'ACTIVE'}
            onClick={() => setFilter('ACTIVE')}
          />
          <MetricTile
            icon={UsersIcon}
            label="Bị khóa"
            value={suspendedCount}
            hint="Tài khoản tạm dừng."
            tone={suspendedCount > 0 ? 'warning' : 'neutral'}
            active={filter === 'SUSPENDED'}
            onClick={() => setFilter('SUSPENDED')}
          />
        </div>
      )}

      <SectionPanel
        title="Danh sách học viên"
        description={`${filtered.length} tài khoản.`}
        action={
          <SearchInput
            placeholder="Tìm theo tên, email, SĐT..."
            value={search}
            onChange={setSearch}
            className="w-full sm:w-64"
          />
        }
      >
        {filtered.length === 0 ? (
          <EmptyPanel
            title="Không tìm thấy học viên"
            description={search || filter !== 'ALL' ? 'Vui lòng thử lại bằng từ khóa hoặc bộ lọc khác.' : 'Chưa có học viên nào đăng ký.'}
          />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm text-text-primary">
                <thead>
                  <tr className="border-b border-border-light text-xs font-bold uppercase tracking-wider text-text-tertiary">
                    <th className="pb-3 pl-2">Học viên</th>
                    <th className="pb-3">Thông tin liên lạc</th>
                    <th className="pb-3">Ngày đăng ký</th>
                    <th className="pb-3 text-center">Trạng thái</th>
                    <th className="pb-3 pr-2 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {filtered.map((student) => {
                    const suspended = student.status === 'SUSPENDED';
                    return (
                      <tr key={student.id} className="hover:bg-surface-secondary/35 transition-colors">
                        <td className="py-3 pl-2">
                          <div className="flex items-center gap-3">
                            <Avatar name={student.full_name} src={student.avatar_url || undefined} size="sm" />
                            <span className={`font-semibold ${suspended ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                              {student.full_name}
                            </span>
                          </div>
                        </td>
                        <td className="py-3">
                          <p className="text-xs font-medium">{student.email}</p>
                          {student.phone && <p className="text-xs text-text-tertiary mt-0.5">{student.phone}</p>}
                        </td>
                        <td className="py-3 text-text-secondary text-xs">
                          {student.created_at ? new Date(student.created_at).toLocaleDateString('vi-VN') : '—'}
                        </td>
                        <td className="py-3 text-center">
                          <div className="inline-flex justify-center">{getStatusBadge(student.status)}</div>
                        </td>
                        <td className="py-3 pr-2 text-right">
                          <div className="inline-flex justify-end">
                            <ActionMenu
                              status={student.status}
                              onToggle={() => setConfirmAction({ type: 'toggle', student })}
                              onReset={() => setConfirmAction({ type: 'reset', student })}
                              onChat={() => handleChat(student.id)}
                              loading={actionLoading === student.id}
                              roleLabel="học viên"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="grid gap-3 md:hidden">
              {filtered.map((student) => (
                <StudentCard
                  key={student.id}
                  student={student}
                  onToggle={() => setConfirmAction({ type: 'toggle', student })}
                  onReset={() => setConfirmAction({ type: 'reset', student })}
                  onChat={() => handleChat(student.id)}
                  loading={actionLoading === student.id}
                />
              ))}
            </div>
          </>
        )}
      </SectionPanel>

      {/* Confirm Action */}
      {confirmAction && (
        <ConfirmActionModal
          open={true}
          title={confirmTitle}
          description={confirmDesc}
          variant={confirmVariant}
          confirmLabel={confirmAction.type === 'toggle' ? (confirmAction.student.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa') : 'Xác nhận'}
          loading={actionLoading === confirmAction.student.id}
          onConfirm={executeConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Reset Result */}
      {resetResult && (
        <PasswordResultModal
          open={true}
          onClose={() => setResetResult(null)}
          name={resetResult.name}
          password={resetResult.password}
          roleLabel="Học viên"
        />
      )}
    </PortalPage>
  );
}
