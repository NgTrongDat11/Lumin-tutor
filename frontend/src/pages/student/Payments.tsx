import { useCallback, useEffect, useMemo, useState } from 'react';
import { paymentApi, classApi } from '../../services/api';
import type { PaymentResponse, ClassRegistrationResponse } from '../../types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { WalletIcon, ClipboardCheckIcon, CalendarIcon, UsersIcon, UserCheckIcon } from '../../components/ui/Icons';
import { EmptyPanel, MetricTile, PortalPage, SectionPanel } from '../../components/portal/PortalPage';
import QRPaymentModal from '../../components/payment/QRPaymentModal';
import { LearningDetailModal } from '../../components/learning/LearningDetailModal';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

const QrIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="5" height="5" x="3" y="3" rx="1" />
    <rect width="5" height="5" x="16" y="3" rx="1" />
    <rect width="5" height="5" x="3" y="16" rx="1" />
    <path d="M21 16V21H16" />
    <path d="M21 16H16V21" />
    <path d="M10 3v2" />
    <path d="M3 10h2" />
    <path d="M14 10h3" />
    <path d="M10 14h2" />
    <path d="M10 18v3" />
    <path d="M14 14v2" />
  </svg>
);

function getPaymentStatusBadge(status: string) {
  const map: Record<string, { variant: BadgeVariant; label: string }> = {
    CREATED: { variant: 'warning', label: 'Chờ thanh toán' },
    PENDING: { variant: 'info', label: 'Đang xử lý' },
    SUCCEEDED: { variant: 'success', label: 'Thành công' },
    FAILED: { variant: 'danger', label: 'Thất bại' },
    CANCELLED: { variant: 'default', label: 'Đã hủy' },
    REFUND_PENDING: { variant: 'warning', label: 'Chờ hoàn tiền' },
    REFUNDED: { variant: 'info', label: 'Đã hoàn tiền' },
  };

  const entry = map[status] || { variant: 'default' as BadgeVariant, label: status };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

const getStatusClasses = (status: string) => {
  switch (status) {
    case 'SUCCEEDED':
      return {
        border: 'border-l-4 border-l-success-500',
        bg: 'bg-white',
        indicator: 'text-success-600',
      };
    case 'CREATED':
      return {
        border: 'border-l-4 border-l-warning-500',
        bg: 'bg-white',
        indicator: 'text-warning-600',
      };
    case 'PENDING':
      return {
        border: 'border-l-4 border-l-primary-500',
        bg: 'bg-white',
        indicator: 'text-primary-600',
      };
    case 'FAILED':
    case 'CANCELLED':
      return {
        border: 'border-l-4 border-l-text-tertiary',
        bg: 'bg-white/95 opacity-85',
        indicator: 'text-text-tertiary',
      };
    default:
      return {
        border: 'border-l-4 border-l-border',
        bg: 'bg-white',
        indicator: 'text-text-secondary',
      };
  }
};

export default function StudentPayments() {
  const [payments, setPayments] = useState<PaymentResponse[]>([]);
  const [registrations, setRegistrations] = useState<ClassRegistrationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<number | null>(null);
  const [confirmPayId, setConfirmPayId] = useState<number | null>(null);
  const [qrPayment, setQrPayment] = useState<PaymentResponse | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'SUCCEEDED'>('ALL');
  const [detailTarget, setDetailTarget] = useState<{ type: 'CLASS' | 'PRIVATE', id: number } | null>(null);
  const { toast } = useToast();

  const load = useCallback(() => {
    Promise.all([
      paymentApi.list().catch(() => []),
      classApi.myRegistrations().catch(() => [])
    ]).then(([payList, regList]) => {
      setPayments(payList);
      setRegistrations(regList);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openPaymentFlow = (payment: PaymentResponse) => {
    if (payment.provider?.toUpperCase() === 'SEPAY') {
      setQrPayment(payment);
      return;
    }
    setConfirmPayId(payment.id);
  };

  const handlePay = async (id: number) => {
    setPaying(id);
    try {
      await paymentApi.pay(id);
      toast('success', 'Thanh toán thành công!');
      load();
    } catch {
      toast('error', 'Thanh toán thất bại');
    } finally {
      setPaying(null);
      setConfirmPayId(null);
    }
  };

  const handleQrPaid = useCallback(() => {
    toast('success', 'Thanh toán thành công!');
    setQrPayment(null);
    load();
  }, [load, toast]);

  const handleCancel = async (id: number) => {
    setCancelling(id);
    try {
      await paymentApi.cancel(id);
      toast('success', 'Đã hủy giao dịch thành công!');
      load();
    } catch {
      toast('error', 'Hủy giao dịch thất bại');
    } finally {
      setCancelling(null);
      setConfirmCancelId(null);
    }
  };

  const filteredPayments = useMemo(() => {
    if (filter === 'ALL') return payments;
    if (filter === 'PENDING') {
      return payments.filter((p) => p.status === 'PENDING' || p.status === 'CREATED');
    }
    return payments.filter((p) => p.status === filter);
  }, [payments, filter]);

  const groupedPayments = useMemo(() => {
    const groups: Record<string, PaymentResponse[]> = {};
    filteredPayments.forEach((p) => {
      const dateStr = p.created_at || p.paid_at || new Date().toISOString();
      const date = new Date(dateStr);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const groupKey = `Tháng ${month.toString().padStart(2, '0')}/${year}`;

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(p);
    });

    // Sort groups by date descending
    return Object.keys(groups)
      .sort((a, b) => {
        const [mA, yA] = a.replace('Tháng ', '').split('/').map(Number);
        const [mB, yB] = b.replace('Tháng ', '').split('/').map(Number);
        return yB - yA || mB - mA;
      })
      .reduce<Record<string, PaymentResponse[]>>((acc, key) => {
        acc[key] = groups[key];
        return acc;
      }, {});
  }, [filteredPayments]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast('success', `Đã sao chép ${label}!`);
  };

  const stats = useMemo(() => {
    return {
      totalPaid: payments.filter(p => p.status === 'SUCCEEDED').reduce((sum, p) => sum + parseFloat(p.amount), 0),
      totalPending: payments.filter(p => p.status === 'PENDING' || p.status === 'CREATED').reduce((sum, p) => sum + parseFloat(p.amount), 0)
    };
  }, [payments]);

  const getModalTarget = useCallback((payment: PaymentResponse): { type: 'CLASS' | 'PRIVATE', id: number } | null => {
    if (payment.target_type === 'PRIVATE_TUTORING_REQUEST') {
      return { type: 'PRIVATE', id: payment.target_id };
    }
    if (payment.target_type === 'CLASS_REGISTRATION') {
      const reg = registrations.find(r => r.id === payment.target_id);
      if (reg) {
        return { type: 'CLASS', id: reg.class_id };
      }
    }
    return null;
  }, [registrations]);

  const formatCurrency = (amount: number) => `${amount.toLocaleString('vi-VN')}đ`;

  if (loading) return <TableSkeleton />;

  return (
    <PortalPage 
      title="Lịch sử thanh toán" 
      description="Theo dõi các giao dịch thanh toán của bạn."
    >
      {/* Stats */}
      {payments.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <MetricTile 
            icon={WalletIcon} 
            label="Đã thanh toán" 
            value={formatCurrency(stats.totalPaid)} 
            tone="success" 
            className="border-l-4 border-l-success-500 hover:border-l-success-500"
          />
          <MetricTile 
            icon={ClipboardCheckIcon} 
            label="Chờ thanh toán" 
            value={formatCurrency(stats.totalPending)} 
            tone="warning" 
            className="border-l-4 border-l-warning-500 hover:border-l-warning-500"
          />
        </div>
      )}

      {payments.length > 0 && (
        <SectionPanel
          title="Giao dịch"
          description={`${filteredPayments.length} giao dịch.`}
          action={
            <div className="flex w-full gap-1 rounded-lg border border-border-light bg-surface-secondary p-1 sm:w-auto">
              {(['ALL', 'PENDING', 'SUCCEEDED'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold sm:flex-none ${
                    filter === f ? 'bg-white text-text-primary shadow-xs' : 'text-text-secondary hover:bg-white/70'
                  }`}
                >
                  {f === 'ALL' ? 'Tất cả' : f === 'PENDING' ? 'Chờ thanh toán' : 'Đã thanh toán'}
                </button>
              ))}
            </div>
          }
        >
          {filteredPayments.length === 0 ? (
            <EmptyPanel title="Không có giao dịch phù hợp" />
          ) : (
            <div className="space-y-8 stagger-grid">
              {Object.entries(groupedPayments).map(([month, monthPayments]) => (
                <section key={month} className="space-y-4">
                  <h4 className="text-sm font-bold text-text-secondary sticky top-0 bg-surface-secondary/90 backdrop-blur-sm py-2.5 z-10 flex items-center gap-2 border-b border-border-light select-none">
                    <CalendarIcon className="w-4.5 h-4.5 text-primary-500" />
                    <span>{month}</span>
                    <span className="text-xs font-normal text-text-tertiary">({monthPayments.length} giao dịch)</span>
                  </h4>
                  <div className="space-y-3">
                    {monthPayments.map((p) => {
                      const target = getModalTarget(p);
                      const statusClasses = getStatusClasses(p.status);
                      return (
                        <article
                          key={p.id}
                          className={`rounded-xl border border-border-light ${statusClasses.border} ${statusClasses.bg} p-5 transition-all duration-200 hover:scale-[1.01] hover:shadow-md`}
                        >
                          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  onClick={() => handleCopy(`#LMN-${p.id}`, 'mã giao dịch')}
                                  className="cursor-pointer text-xs font-semibold px-2 py-0.5 rounded bg-surface-tertiary text-text-secondary hover:bg-border transition-colors flex items-center gap-1 select-none"
                                  title="Click để sao chép"
                                >
                                  <span>Mã GD: #LMN-{p.id}</span>
                                  <svg className="w-3 h-3 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
                                  </svg>
                                </span>
                                {getPaymentStatusBadge(p.status)}
                              </div>
                              <h3 className="text-2xl font-extrabold text-text-primary mt-1">
                                {parseFloat(p.amount).toLocaleString('vi-VN')}đ
                              </h3>
                              <p className="text-base font-bold text-text-secondary">
                                {p.subject_name ? `${p.subject_name} — ` : ''}{p.tutor_name || 'Hệ thống'}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-tertiary">
                                <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full bg-surface-secondary text-xs">
                                  {p.target_type === 'PRIVATE_TUTORING_REQUEST' ? (
                                    <>
                                      <UserCheckIcon className="w-3.5 h-3.5 text-primary-600" />
                                      <span>Yêu cầu 1-1</span>
                                    </>
                                  ) : (
                                    <>
                                      <UsersIcon className="w-3.5 h-3.5 text-primary-600" />
                                      <span>Đăng ký lớp</span>
                                    </>
                                  )}
                                </span>
                                <span>·</span>
                                <span className="font-medium text-text-secondary">{p.target_name || `#${p.target_id}`}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-4 text-xs text-text-tertiary mt-3 pt-3 border-t border-border-light">
                                <span className="inline-flex items-center gap-1">
                                  <CalendarIcon className="w-3.5 h-3.5 text-text-tertiary" />
                                  <span>Tạo: {new Date(p.created_at || p.paid_at || '').toLocaleString('vi-VN')}</span>
                                </span>
                                {p.paid_at && (
                                  <span className="inline-flex items-center gap-1 text-success-700 bg-success-50 px-2 py-0.5 rounded-full font-medium">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    <span>Thanh toán: {new Date(p.paid_at).toLocaleString('vi-VN')}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:flex-wrap sm:items-center">
                              {target && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDetailTarget(target)}
                                  className="w-full border-border-light text-text-secondary hover:bg-surface-secondary sm:w-auto"
                                >
                                  Xem chi tiết
                                </Button>
                              )}
                              {(p.status === 'CREATED' || p.status === 'PENDING') && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setConfirmCancelId(p.id)}
                                    className="w-full text-danger-600 hover:bg-danger-50 sm:w-auto"
                                  >
                                    Hủy
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => openPaymentFlow(p)}
                                    className="w-full font-semibold shadow-sm sm:w-auto"
                                    icon={<QrIcon className="w-4 h-4" />}
                                  >
                                    {p.provider?.toUpperCase() === 'SEPAY' ? 'Quét QR' : 'Thanh toán'}
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </SectionPanel>
      )}

      {payments.length === 0 && (
        <EmptyPanel title="Chưa có giao dịch nào" description="Bạn chưa có lịch sử thanh toán nào." />
      )}

      <ConfirmDialog
        open={confirmPayId !== null}
        onClose={() => setConfirmPayId(null)}
        onConfirm={() => confirmPayId && handlePay(confirmPayId)}
        title="Xác nhận thanh toán"
        description={`Bạn sắp thanh toán ${confirmPayId ? parseFloat(payments.find(p => p.id === confirmPayId)?.amount || '0').toLocaleString('vi-VN') : 0}đ. Bạn có chắc chắn muốn tiếp tục?`}
        confirmText="Thanh toán"
        loading={paying === confirmPayId}
      />

      <QRPaymentModal
        open={qrPayment !== null}
        payment={qrPayment}
        onClose={() => setQrPayment(null)}
        onPaid={handleQrPaid}
        onPaymentRecreated={(payment) => {
          setQrPayment(payment);
          load();
        }}
      />

      <ConfirmDialog
        open={confirmCancelId !== null}
        onClose={() => setConfirmCancelId(null)}
        onConfirm={() => confirmCancelId && handleCancel(confirmCancelId)}
        title="Xác nhận hủy giao dịch"
        description="Bạn có chắc chắn muốn hủy giao dịch này không? Thao tác này không thể hoàn tác."
        confirmText="Hủy giao dịch"
        loading={cancelling === confirmCancelId}
      />

      <LearningDetailModal
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
      />
    </PortalPage>
  );
}
