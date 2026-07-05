import { useEffect, useState, useMemo } from 'react';
import { scheduleApi } from '../../services/api';
import type { ContractResponse, ContractStatus } from '../../types';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import { getStatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

export default function StaffContracts() {
  const [contracts, setContracts] = useState<ContractResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | ContractStatus>('ALL');
  const [confirmAction, setConfirmAction] = useState<{ id: number; action: ContractStatus } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const load = () => {
    scheduleApi.listContracts().then(setContracts).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleUpdateStatus = async (id: number, status: ContractStatus) => {
    setActionLoading(true);
    try {
      await scheduleApi.updateContractStatus(id, { status });
      toast('success', 'Đã cập nhật trạng thái hợp đồng');
      load();
    } catch {
      toast('error', 'Cập nhật thất bại');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const filteredContracts = useMemo(() => {
    if (filter === 'ALL') return contracts;
    return contracts.filter((c) => c.status === filter);
  }, [contracts, filter]);

  const stats = useMemo(() => {
    return {
      total: contracts.length,
      active: contracts.filter(c => c.status === 'ACTIVE').length,
      pending: contracts.filter(c => c.status === 'PENDING').length,
    };
  }, [contracts]);

  if (loading) return <TableSkeleton />;

  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader title="Hợp đồng giảng dạy" description="Quản lý hợp đồng giữa trung tâm và gia sư." />

      {/* Stats */}
      {contracts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-primary-50 dark:bg-primary-900/20 border-primary-100 dark:border-primary-800/30">
            <p className="text-sm text-primary-600 dark:text-primary-400 font-medium mb-1">Tổng hợp đồng</p>
            <p className="text-2xl font-bold text-primary-900 dark:text-primary-50">{stats.total}</p>
          </Card>
          <Card className="bg-success-50 dark:bg-success-900/20 border-success-100 dark:border-success-800/30">
            <p className="text-sm text-success-600 dark:text-success-400 font-medium mb-1">Đang hoạt động</p>
            <p className="text-2xl font-bold text-success-900 dark:text-success-50">{stats.active}</p>
          </Card>
          <Card className="bg-warning-50 dark:bg-warning-900/20 border-warning-100 dark:border-warning-800/30">
            <p className="text-sm text-warning-600 dark:text-warning-400 font-medium mb-1">Chờ duyệt</p>
            <p className="text-2xl font-bold text-warning-900 dark:text-warning-50">{stats.pending}</p>
          </Card>
        </div>
      )}

      {/* Filters */}
      {contracts.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {(['ALL', 'PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filter === f ? 'bg-primary-600 text-white' : 'bg-surface hover:bg-surface-hover text-text-secondary border border-border'
              }`}
            >
              {f === 'ALL' ? 'Tất cả' : f}
            </button>
          ))}
        </div>
      )}

      {filteredContracts.length === 0 ? (
        <EmptyState title="Chưa có hợp đồng" description="Không có hợp đồng nào phù hợp với bộ lọc." />
      ) : (
        <div className="space-y-3">
          {filteredContracts.map((c) => (
            <Card key={c.id} className="hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg text-text-primary">
                      Hợp đồng #{c.id}
                    </h3>
                    {getStatusBadge(c.status)}
                  </div>
                  <p className="text-base text-text-secondary font-medium">
                    {c.tutor_name || `Gia sư #${c.tutor_id}`}
                  </p>
                  <p className="text-sm text-text-tertiary">
                    {c.target_name || (c.private_request_id ? `Yêu cầu 1-1 #${c.private_request_id}` : `Lớp #${c.class_id}`)}
                  </p>
                  <p className="text-sm text-text-tertiary">
                    {c.commission_name_snapshot}: Trung tâm {parseFloat(c.center_rate_snapshot).toFixed(0)}% — Gia sư {parseFloat(c.tutor_rate_snapshot).toFixed(0)}%
                  </p>
                </div>
                {c.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setConfirmAction({ id: c.id, action: 'CANCELLED' })}>
                      Huỷ
                    </Button>
                    <Button size="sm" onClick={() => setConfirmAction({ id: c.id, action: 'ACTIVE' })}>
                      Duyệt
                    </Button>
                  </div>
                )}
                {c.status === 'ACTIVE' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setConfirmAction({ id: c.id, action: 'COMPLETED' })}>
                      Hoàn thành
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction && handleUpdateStatus(confirmAction.id, confirmAction.action)}
        title="Xác nhận cập nhật"
        description={`Bạn có chắc chắn muốn chuyển hợp đồng #${confirmAction?.id} sang trạng thái ${confirmAction?.action}?`}
        confirmText="Xác nhận"
        danger={confirmAction?.action === 'CANCELLED'}
        loading={actionLoading}
      />
    </div>
  );
}
