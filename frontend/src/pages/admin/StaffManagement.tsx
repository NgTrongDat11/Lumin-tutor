import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi, messageApi, extractErrorMessage } from '../../services/api';
import type { AdminStaffResponse } from '../../types';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { getStatusBadge } from '../../components/ui/Badge';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { SearchIcon, ShieldCheckIcon, UsersIcon } from '../../components/ui/Icons';
import { EmptyPanel, MetricTile, PortalPage, SectionPanel } from '../../components/portal/PortalPage';
import Avatar from '../../components/ui/Avatar';

/* ── Types ───────────────────────────────────────── */

interface StaffForm {
  email: string;
  full_name: string;
  phone: string;
  password: string;
}

const emptyForm: StaffForm = { email: '', full_name: '', phone: '', password: '' };

type ConfirmAction = { type: 'toggle'; account: AdminStaffResponse } | { type: 'reset'; account: AdminStaffResponse };

/* ── Dropdown menu ───────────────────────────────── */

function ActionMenu({ account, onToggle, onReset, onChat, loading }: {
  account: AdminStaffResponse;
  onToggle: () => void;
  onReset: () => void;
  onChat?: () => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleLabel = account.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa';
  const toggleClass = account.status === 'ACTIVE' ? 'text-danger-600 hover:bg-danger-50' : 'text-success-700 hover:bg-success-50';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-primary disabled:opacity-50"
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border-light bg-white py-1 shadow-lg animate-fade-in">
          {onChat && (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onChat();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-secondary"
              >
                <svg
                  className="h-4 w-4 text-text-tertiary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                Nhắn tin
              </button>
              <div className="mx-2 border-t border-border-light" />
            </>
          )}
          <button type="button" onClick={() => { setOpen(false); onReset(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-secondary">
            <svg className="h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
            Cấp lại mật khẩu
          </button>
          <div className="mx-2 border-t border-border-light" />
          <button type="button" onClick={() => { setOpen(false); onToggle(); }} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${toggleClass}`}>
            {account.status === 'ACTIVE' ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
            {toggleLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Staff card (mobile) ─────────────────────────── */

function StaffCard({ account, onToggle, onReset, onChat, loading }: {
  account: AdminStaffResponse;
  onToggle: () => void;
  onReset: () => void;
  onChat?: () => void;
  loading: boolean;
}) {
  const suspended = account.status === 'SUSPENDED';
  return (
    <article className={`rounded-lg border p-4 transition-all ${suspended ? 'border-danger-200 bg-danger-50/20' : 'border-border-light bg-white hover:shadow-sm'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={account.full_name} src={account.avatar_url || undefined} size="sm" />
          <div className="min-w-0">
            <h3 className={`truncate font-semibold ${suspended ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
              {account.full_name}
            </h3>
            <p className="text-xs text-text-tertiary">{account.email}</p>
          </div>
        </div>
        <ActionMenu account={account} onToggle={onToggle} onReset={onReset} onChat={onChat} loading={loading} />
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-text-tertiary">
        {getStatusBadge(account.status)}
        <span>·</span>
        <span>{account.phone || 'Chưa có SĐT'}</span>
        <span>·</span>
        <span>{account.created_at ? new Date(account.created_at).toLocaleDateString('vi-VN') : '-'}</span>
      </div>
    </article>
  );
}

/* ── Main ────────────────────────────────────────── */

export default function AdminStaffManagement() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<AdminStaffResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const { toast } = useToast();

  const handleChat = async (staffId: number) => {
    setActionLoading(staffId);
    try {
      const thread = await messageApi.ensureThread({ target_account_id: staffId });
      navigate(`/staff/messages?threadId=${thread.id}`);
    } catch (err) {
      toast('error', extractErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const load = () => {
    adminApi.listStaff()
      .then(setStaff)
      .catch((err) => toast('error', extractErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((item) =>
      item.full_name.toLowerCase().includes(q) ||
      item.email.toLowerCase().includes(q) ||
      (item.phone || '').includes(q),
    );
  }, [search, staff]);

  const activeCount = staff.filter((item) => item.status === 'ACTIVE').length;
  const suspendedCount = staff.filter((item) => item.status === 'SUSPENDED').length;

  /* ── Confirm modal handler ── */

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    const account = confirmAction.account;

    setActionLoading(account.id);
    try {
      if (confirmAction.type === 'toggle') {
        const nextStatus = account.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        const label = nextStatus === 'SUSPENDED' ? 'khóa' : 'mở khóa';
        await adminApi.updateStaffStatus(account.id, nextStatus);
        toast('success', `Đã ${label} nhân viên ${account.full_name}`);
        load();
      } else {
        const result = await adminApi.resetStaffPassword(account.id);
        setResetResult({ name: account.full_name, password: result.temp_password });
        toast('success', `Đã cấp lại mật khẩu cho ${account.full_name}`);
      }
    } catch (err) {
      toast('error', extractErrorMessage(err));
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const confirmLabel = confirmAction
    ? confirmAction.type === 'toggle'
      ? confirmAction.account.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa'
      : 'Cấp lại mật khẩu'
    : '';

  const confirmDesc = confirmAction
    ? confirmAction.type === 'toggle'
      ? confirmAction.account.status === 'ACTIVE'
        ? `Nhân viên "${confirmAction.account.full_name}" sẽ không thể đăng nhập sau khi bị khóa.`
        : `Mở khóa để nhân viên "${confirmAction.account.full_name}" có thể đăng nhập lại.`
      : `Mật khẩu cũ của "${confirmAction.account.full_name}" sẽ bị hủy và thay bằng mật khẩu tạm mới.`
    : '';

  const confirmDanger = confirmAction?.type === 'toggle' && confirmAction.account.status === 'ACTIVE';

  if (loading) return <TableSkeleton />;

  return (
    <PortalPage
      title="Quản lý nhân viên"
      description="Tạo, khóa/mở và cấp lại mật khẩu tài khoản vận hành."
      actions={<Button onClick={() => setShowCreate(true)}>+ Tạo nhân viên</Button>}
    >
      {/* Metrics — chỉ hiện khi có đủ data */}
      {staff.length >= 2 && (
        <div className="grid gap-4 md:grid-cols-3">
          <MetricTile icon={UsersIcon} label="Tổng nhân viên" value={staff.length} hint="Tài khoản vận hành." tone="neutral" />
          <MetricTile icon={ShieldCheckIcon} label="Đang hoạt động" value={activeCount} hint="Có thể đăng nhập." tone="success" />
          <MetricTile icon={UsersIcon} label="Bị khóa" value={suspendedCount} hint="Không thể đăng nhập." tone={suspendedCount > 0 ? 'warning' : 'neutral'} />
        </div>
      )}

      <SectionPanel title="Danh sách nhân viên" description={`${staff.length} tài khoản.`}>
        <div className="mb-4">
          <div className="relative max-w-sm">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Tìm theo tên, email hoặc SĐT..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-primary-300 focus:ring-1 focus:ring-primary-200"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyPanel title="Không tìm thấy nhân viên" description={search ? 'Thử từ khóa khác.' : 'Chưa có tài khoản nhân viên nào.'} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-light text-left">
                    <th className="px-4 py-3 font-semibold text-text-secondary">Nhân viên</th>
                    <th className="px-4 py-3 font-semibold text-text-secondary">Email</th>
                    <th className="px-4 py-3 font-semibold text-text-secondary">SĐT</th>
                    <th className="px-4 py-3 font-semibold text-text-secondary">Ngày tạo</th>
                    <th className="px-4 py-3 font-semibold text-text-secondary">Trạng thái</th>
                    <th className="px-4 py-3 text-right font-semibold text-text-secondary" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {filtered.map((account) => (
                    <tr key={account.id} className={account.status === 'SUSPENDED' ? 'bg-danger-50/30' : 'hover:bg-surface-secondary'}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={account.full_name} src={account.avatar_url || undefined} size="sm" />
                          <span className={`font-medium ${account.status === 'SUSPENDED' ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                            {account.full_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{account.email}</td>
                      <td className="px-4 py-3 text-text-secondary">{account.phone || '-'}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {account.created_at ? new Date(account.created_at).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(account.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <ActionMenu
                            account={account}
                            onToggle={() => setConfirmAction({ type: 'toggle', account })}
                            onReset={() => setConfirmAction({ type: 'reset', account })}
                            onChat={() => handleChat(account.id)}
                            loading={actionLoading === account.id}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 md:hidden">
              {filtered.map((account) => (
                <StaffCard
                  key={account.id}
                  account={account}
                  onToggle={() => setConfirmAction({ type: 'toggle', account })}
                  onReset={() => setConfirmAction({ type: 'reset', account })}
                  onChat={() => handleChat(account.id)}
                  loading={actionLoading === account.id}
                />
              ))}
            </div>
          </>
        )}
      </SectionPanel>

      {/* Create modal */}
      {showCreate && (
        <CreateStaffModal
          onClose={() => setShowCreate(false)}
          onCreated={(name, password) => {
            setShowCreate(false);
            setResetResult({ name, password });
            load();
          }}
        />
      )}

      {/* Confirm action modal */}
      {confirmAction && (
        <Modal
          open={true}
          onClose={() => setConfirmAction(null)}
          title={confirmLabel}
          size="sm"
          footer={(
            <>
              <Button variant="outline" onClick={() => setConfirmAction(null)}>Hủy</Button>
              <Button
                variant={confirmDanger ? 'danger' : 'primary'}
                loading={actionLoading === confirmAction.account.id}
                onClick={executeConfirmAction}
              >
                {confirmLabel}
              </Button>
            </>
          )}
        >
          <p className="text-sm leading-6 text-text-secondary">{confirmDesc}</p>
        </Modal>
      )}

      {/* Password result modal */}
      {resetResult && (
        <Modal
          open={true}
          onClose={() => setResetResult(null)}
          title="Mật khẩu tạm"
          size="sm"
          footer={<Button onClick={() => setResetResult(null)}>Đã ghi nhận</Button>}
        >
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Mật khẩu tạm cho <strong>{resetResult.name}</strong>:
            </p>
            <div className="rounded-lg border border-border-light bg-surface-tertiary p-4 text-center">
              <code className="select-all text-2xl font-bold tracking-widest text-primary-700">{resetResult.password}</code>
            </div>
            <p className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs leading-5 text-warning-800">
              Mật khẩu này chỉ hiển thị một lần. Nhân viên nên đổi mật khẩu sau khi đăng nhập.
            </p>
          </div>
        </Modal>
      )}
    </PortalPage>
  );
}

/* ── Create staff modal ──────────────────────────── */

function CreateStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string, password: string) => void }) {
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        email: form.email,
        full_name: form.full_name,
        phone: form.phone || undefined,
        password: form.password || undefined,
      };
      const result = await adminApi.createStaff(payload);
      toast('success', `Đã tạo nhân viên ${result.staff.full_name}`);
      onCreated(result.staff.full_name, result.temp_password);
    } catch (err) {
      toast('error', extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Tạo tài khoản nhân viên"
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button loading={saving} onClick={(event) => handleSubmit(event as unknown as FormEvent)}>Tạo nhân viên</Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-semibold text-text-secondary">Họ tên <span className="text-danger-500">*</span></span>
          <input
            value={form.full_name}
            onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary-300 focus:ring-1 focus:ring-primary-200"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-text-secondary">Email <span className="text-danger-500">*</span></span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary-300 focus:ring-1 focus:ring-primary-200"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-text-secondary">Số điện thoại</span>
          <input
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary-300 focus:ring-1 focus:ring-primary-200"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-text-secondary">Mật khẩu tạm</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            minLength={6}
            placeholder="Bỏ trống để hệ thống tự sinh"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary-300 focus:ring-1 focus:ring-primary-200"
          />
        </label>
      </form>
    </Modal>
  );
}
