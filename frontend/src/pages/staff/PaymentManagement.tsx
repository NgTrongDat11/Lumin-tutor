import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { extractErrorMessage, financeApi, paymentApi, staffApi } from '../../services/api';
import type { FinanceQueryParams, FinanceReportRow, FinanceSummaryResponse, PaymentResponse, PaymentStatus } from '../../types';
import { getStatusBadge } from '../../components/ui/Badge';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { WalletIcon, ClipboardCheckIcon, UserCheckIcon, ChevronLeftIcon, ChevronRightIcon } from '../../components/ui/Icons';
import { EmptyPanel, MetricTile, PortalPage, SectionPanel } from '../../components/portal/PortalPage';
import { currency, formatDate } from '../../utils/format';

// Shared Components
import SearchInput from '../../components/shared/SearchInput';
import FilterChips from '../../components/shared/FilterChips';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

function PaymentCodeBadge({ code }: { code: string }) {
  return (
    <span className="inline-flex rounded bg-surface-tertiary px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-text-primary border border-border-light select-all">
      {code}
    </span>
  );
}

export default function StaffPayments() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [payments, setPayments] = useState<PaymentResponse[]>([]);
  const [studentNames, setStudentNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummaryResponse | null>(null);
  const [financeRows, setFinanceRows] = useState<FinanceReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(true);
  const financeRequestRef = useRef(0);
  const [reportMonth, setReportMonth] = useState('');
  const [reportTargetType, setReportTargetType] = useState('');
  const [reportStatus, setReportStatus] = useState('');
  // Search & Filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [filter, setFilter] = useState<'ALL' | PaymentStatus | 'PENDING_ALL'>('ALL');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Refund Modal State
  const [refundingPayment, setRefundingPayment] = useState<PaymentResponse | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Manual actions modal state
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'cancel';
    payment: PaymentResponse;
  } | null>(null);

  // Viewing payment details modal state
  const [viewingPayment, setViewingPayment] = useState<PaymentResponse | null>(null);

  // Reset page when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  const reportParams = useMemo<FinanceQueryParams>(() => {
    const params: FinanceQueryParams = {};
    if (reportMonth) {
      const [year, month] = reportMonth.split('-').map(Number);
      params.year = year;
      params.month = month;
    }
    if (reportTargetType) params.target_type = reportTargetType;
    if (reportStatus) params.payment_status = reportStatus;
    return params;
  }, [reportMonth, reportStatus, reportTargetType]);

  const load = useCallback(async () => {
    try {
      const [paymentList, studentList] = await Promise.all([
        paymentApi.list().catch(() => []),
        staffApi.getStudents().catch(() => []),
      ]);
      setPayments(paymentList);

      const studentsMap: Record<number, string> = {};
      studentList.forEach((s) => {
        studentsMap[s.id] = s.full_name;
      });
      setStudentNames(studentsMap);
    } catch {
      toast('error', 'Không thể tải danh sách giao dịch');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadFinanceReport = useCallback(async () => {
    const requestId = ++financeRequestRef.current;
    setReportLoading(true);
    try {
      const [summaryData, reportData] = await Promise.all([
        financeApi.summary(reportParams),
        financeApi.report(reportParams),
      ]);
      if (requestId !== financeRequestRef.current) return;
      setFinanceSummary(summaryData);
      setFinanceRows(reportData);
    } catch {
      if (requestId !== financeRequestRef.current) return;
      setFinanceSummary(null);
      setFinanceRows([]);
      toast('error', 'Không thể tải báo cáo phân chia doanh thu.');
    } finally {
      if (requestId === financeRequestRef.current) {
        setReportLoading(false);
      }
    }
  }, [reportParams, toast]);

  useEffect(() => {
    void loadFinanceReport();
  }, [loadFinanceReport]);

  const handleExportExcel = async () => {
    try {
      const blob = await financeApi.exportExcel(reportParams);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `lumin-finance-${reportMonth || 'toan-bo'}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast('error', 'Không thể xuất báo cáo Excel.');
    }
  };

  const handleRefund = async () => {
    if (!refundingPayment) return;
    const amount = Number(refundAmount);
    const maxAmount = Number(refundingPayment.amount);

    if (isNaN(amount) || amount <= 0) {
      toast('error', 'Số tiền hoàn không hợp lệ');
      return;
    }
    if (amount > maxAmount) {
      toast('error', `Số tiền hoàn tối đa là ${currency(maxAmount)}`);
      return;
    }

    setActionLoading(true);
    try {
      await paymentApi.refund(refundingPayment.id, {
        refund_amount: amount,
        refund_reason: refundReason || undefined,
      });
      toast('success', 'Đã ghi nhận yêu cầu hoàn tiền thành công');
      await Promise.all([load(), loadFinanceReport()]);
      setRefundingPayment(null);
    } catch {
      toast('error', 'Yêu cầu hoàn tiền thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredPayments = useMemo(() => {
    return payments
      .filter((payment) => {
        if (filter === 'ALL') return true;
        if (filter === 'PENDING_ALL') return ['CREATED', 'PENDING', 'REFUND_PENDING'].includes(payment.status);
        return payment.status === filter;
      })
      .filter((payment) => {
        if (!search) return true;
        const q = search.toLowerCase();
        const studentName = studentNames[payment.student_account_id] || '';
        const targetName = payment.transfer_content || '';
        return (
          studentName.toLowerCase().includes(q) ||
          payment.amount.toString().includes(q) ||
          targetName.toLowerCase().includes(q) ||
          payment.id.toString().includes(q)
        );
      });
  }, [payments, filter, search, studentNames]);

  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPayments.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPayments, currentPage, ITEMS_PER_PAGE]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredPayments.length / ITEMS_PER_PAGE);
  }, [filteredPayments.length, ITEMS_PER_PAGE]);

  const stats = useMemo(() => {
    return {
      totalRevenue: payments
        .filter((payment) => payment.status === 'SUCCEEDED')
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      totalPending: payments
        .filter((payment) => payment.status === 'PENDING' || payment.status === 'CREATED')
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      totalRefunded: payments
        .filter((payment) => payment.status === 'REFUNDED')
        .reduce((sum, payment) => sum + Number(payment.refund_amount || 0), 0),
      queue: payments.filter((payment) => ['CREATED', 'PENDING', 'REFUND_PENDING'].includes(payment.status)).length,
    };
  }, [payments]);

  if (loading) return <TableSkeleton />;

  return (
    <PortalPage title="Tài chính" description="Theo dõi nguồn thu và phần doanh thu được phân bổ theo hợp đồng.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <MetricTile icon={WalletIcon} label="Tổng thu" value={currency(financeSummary?.gross_amount || 0)} tone="primary" />
        <MetricTile icon={ClipboardCheckIcon} label="Hoàn tiền" value={currency(financeSummary?.refund_amount || 0)} tone="warning" />
        <MetricTile icon={WalletIcon} label="Doanh thu net" value={currency(financeSummary?.net_amount || 0)} tone="success" />
        <MetricTile icon={UserCheckIcon} label="Phần trung tâm" value={currency(financeSummary?.center_net || 0)} tone="neutral" />
        <MetricTile
          icon={UserCheckIcon}
          label="Phần gia sư"
          value={currency(financeSummary?.tutor_net || 0)}
          hint={financeSummary?.missing_snapshot_count ? `${financeSummary.missing_snapshot_count} giao dịch chưa phân bổ hợp lệ.` : undefined}
          tone={financeSummary?.missing_snapshot_count ? 'warning' : 'primary'}
        />
      </div>

      <SectionPanel
        title="Báo cáo phân chia doanh thu"
        description={`${financeRows.length} dòng chi tiết. Dữ liệu chỉ phản ánh tỷ lệ phân bổ, không theo dõi chuyển khoản.`}
        action={
          <div className="flex flex-wrap gap-2">
            <input
              type="month"
              value={reportMonth}
              onChange={(event) => setReportMonth(event.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            />
            <select
              value={reportTargetType}
              onChange={(event) => setReportTargetType(event.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Mọi nguồn</option>
              <option value="PRIVATE_TUTORING_REQUEST">Học 1-1</option>
              <option value="CLASS_REGISTRATION">Lớp nhóm</option>
            </select>
            <select
              value={reportStatus}
              onChange={(event) => setReportStatus(event.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Mọi trạng thái</option>
              <option value="SUCCEEDED">Thành công</option>
              <option value="REFUNDED">Đã hoàn tiền</option>
              <option value="PENDING_ALL">Đang chờ</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
            <Button variant="outline" onClick={handleExportExcel}>Xuất Excel</Button>
          </div>
        }
      >
        {reportLoading ? (
          <TableSkeleton />
        ) : financeRows.length === 0 ? (
          <EmptyPanel title="Chưa có dữ liệu báo cáo" description="Thử đổi bộ lọc hoặc kiểm tra các giao dịch đã ghi nhận." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border-light bg-white">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-surface-secondary text-xs font-bold uppercase tracking-wide text-text-tertiary">
                <tr>
                  <th className="px-4 py-3">Ngày</th>
                  <th className="px-4 py-3">Nguồn</th>
                  <th className="px-4 py-3">Học viên</th>
                  <th className="px-4 py-3">Gia sư</th>
                  <th className="px-4 py-3 text-right">Tổng tiền</th>
                  <th className="px-4 py-3 text-right">Hoàn tiền</th>
                  <th className="px-4 py-3 text-right">Trung tâm net</th>
                  <th className="px-4 py-3 text-right">Gia sư net</th>
                  <th className="px-4 py-3">Phân bổ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {financeRows.map((row) => (
                  <tr key={row.payment_id} className="hover:bg-surface-secondary/50">
                    <td className="px-4 py-3">{formatDate(row.paid_at || row.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-text-primary">{row.target_name || `Giao dịch #${row.payment_id}`}</p>
                      <p className="text-xs text-text-tertiary">{row.subject_name || row.target_type}</p>
                    </td>
                    <td className="px-4 py-3">{row.student_name}</td>
                    <td className="px-4 py-3">{row.tutor_name || 'Chưa xác định'}</td>
                    <td className="px-4 py-3 text-right">{currency(row.gross_amount)}</td>
                    <td className="px-4 py-3 text-right">{currency(row.refund_amount)}</td>
                    <td className="px-4 py-3 text-right">{currency(row.center_net)}</td>
                    <td className="px-4 py-3 text-right font-bold text-primary-800">{currency(row.tutor_net)}</td>
                    <td className="px-4 py-3">
                      {row.allocation_status === 'ALLOCATED' ? (
                        <span className="text-success-700">Đã tính tỷ lệ</span>
                      ) : row.allocation_status === 'NOT_RECOGNIZED' ? (
                        <span className="text-text-tertiary">Chưa ghi nhận</span>
                      ) : (
                        <span className="text-warning-700">Thiếu dữ liệu phân bổ</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>

      <SectionPanel
        title="Giao dịch thanh toán"
        description={`${filteredPayments.length} giao dịch được lọc.`}
        action={
          <SearchInput
            placeholder="Tìm theo tên học viên, số tiền..."
            value={search}
            onChange={setSearch}
            className="w-full sm:w-64"
          />
        }
      >
        {/* Status Filters */}
        <div className="mb-4 border-b border-border-light pb-3">
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ALL', label: 'Tất cả', count: payments.length },
              { value: 'PENDING_ALL', label: 'Chờ xử lý', count: stats.queue },
              { value: 'SUCCEEDED', label: 'Thành công', count: payments.filter((p) => p.status === 'SUCCEEDED').length },
              { value: 'REFUNDED', label: 'Đã hoàn tiền', count: payments.filter((p) => p.status === 'REFUNDED').length },
              { value: 'FAILED', label: 'Thất bại', count: payments.filter((p) => p.status === 'FAILED').length },
            ]}
          />
        </div>

        {filteredPayments.length === 0 ? (
          <EmptyPanel title="Không tìm thấy giao dịch phù hợp" description="Thử thay đổi từ khóa hoặc bộ lọc của bạn." />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto rounded-lg border border-border-light bg-white">
              <table className="w-full border-collapse text-left text-sm text-text-primary">
                <thead>
                  <tr className="border-b border-border-light bg-surface-secondary/50 text-xs font-bold uppercase tracking-wider text-text-tertiary">
                    <th className="px-4 py-3">Mã GD</th>
                    <th className="px-4 py-3">Học viên</th>
                    <th className="px-4 py-3">Cú pháp chuyển khoản</th>
                    <th className="px-4 py-3">Phân loại</th>
                    <th className="px-4 py-3 text-right">Số tiền</th>
                    <th className="px-4 py-3">Thời gian</th>
                    <th className="px-4 py-3 text-center">Trạng thái</th>
                    <th className="px-4 py-3 pr-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {paginatedPayments.map((payment) => {
                    const studentName = studentNames[payment.student_account_id] || `Học viên #${payment.student_account_id}`;
                    const isRefundable = payment.status === 'SUCCEEDED';
                    return (
                      <tr
                        key={payment.id}
                        onClick={() => setViewingPayment(payment)}
                        className="hover:bg-surface-secondary/20 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3.5 font-mono text-xs font-bold text-text-tertiary">
                          #{payment.id}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-text-primary">
                          {studentName}
                        </td>
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          {payment.transfer_content ? (
                            <PaymentCodeBadge code={payment.transfer_content} />
                          ) : (
                            <span className="text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-text-secondary">
                          {payment.target_type === 'PRIVATE_TUTORING_REQUEST' ? (
                            <span className="inline-flex items-center gap-1.5 text-primary-700 bg-primary-50 px-2 py-0.5 rounded font-medium">
                              Dạy 1-1
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-info-700 bg-info-50 px-2 py-0.5 rounded font-medium">
                              Lớp nhóm
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold text-text-primary">
                          {currency(payment.amount)}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-text-secondary">
                          <div className="space-y-0.5">
                            <div>Tạo: {payment.created_at ? formatDate(payment.created_at) : '—'}</div>
                            {payment.paid_at && (
                              <div className="text-success-700 font-medium">
                                Thanh toán: {new Date(payment.paid_at).toLocaleString('vi-VN')}
                              </div>
                            )}
                            {payment.refund_amount && (
                              <div className="text-danger-600 font-medium">
                                Hoàn: {currency(payment.refund_amount)}
                                {payment.refund_reason && (
                                  <span className="block text-2xs text-text-tertiary font-normal italic mt-0.5">
                                    Lý do: {payment.refund_reason}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <div className="inline-flex justify-center">{getStatusBadge(payment.status)}</div>
                        </td>
                        <td className="px-4 py-3.5 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                          {isRefundable && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => {
                                setRefundingPayment(payment);
                                setRefundAmount(payment.amount);
                                setRefundReason('');
                              }}
                            >
                              Hoàn tiền
                            </Button>
                          )}
                          {(payment.status === 'CREATED' || payment.status === 'PENDING') && (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="text-xs !py-1 bg-success-50 text-success-700 hover:bg-success-100 border border-success-200/50"
                                onClick={() => setConfirmAction({ type: 'approve', payment })}
                              >
                                Duyệt
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs !py-1 text-danger-600 hover:bg-danger-50 border-danger-200"
                                onClick={() => setConfirmAction({ type: 'cancel', payment })}
                              >
                                Hủy
                              </Button>
                            </div>
                          )}
                          {!isRefundable && payment.status !== 'CREATED' && payment.status !== 'PENDING' && (
                            <span className="text-xs text-text-tertiary">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="block md:hidden space-y-3">
              {paginatedPayments.map((payment) => {
                const studentName = studentNames[payment.student_account_id] || `Học viên #${payment.student_account_id}`;
                const isRefundable = payment.status === 'SUCCEEDED';
                return (
                  <article
                    key={payment.id}
                    onClick={() => setViewingPayment(payment)}
                    className="rounded-lg border border-border-light bg-white p-4 hover:shadow-sm hover:border-primary-200 cursor-pointer transition-all"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-text-tertiary">#{payment.id}</span>
                        {getStatusBadge(payment.status)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-primary-900">
                            Học viên: {studentName}
                          </h4>
                          <span className="text-base font-bold text-text-primary">{currency(payment.amount)}</span>
                        </div>
                        <p className="mt-1 text-xs text-text-tertiary">
                          {payment.target_type === 'PRIVATE_TUTORING_REQUEST' ? 'Yêu cầu dạy 1-1' : 'Đăng ký lớp học nhóm'}
                        </p>
                        <div className="mt-2 flex items-center justify-between border-t border-border-light pt-2" onClick={(e) => e.stopPropagation()}>
                          <div className="text-xs text-text-tertiary">Cú pháp:</div>
                          {payment.transfer_content ? (
                            <PaymentCodeBadge code={payment.transfer_content} />
                          ) : (
                            <span className="text-text-tertiary">—</span>
                          )}
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-text-tertiary border-t border-border-light pt-2">
                          <div>Ngày tạo: {payment.created_at ? formatDate(payment.created_at) : '—'}</div>
                          {payment.paid_at && (
                            <div className="text-success-700 font-medium">
                              Thanh toán: {new Date(payment.paid_at).toLocaleString('vi-VN')}
                            </div>
                          )}
                          {payment.refund_amount && (
                            <div className="text-danger-600 font-medium">
                              Đã hoàn tiền: {currency(payment.refund_amount)} (Lý do: {payment.refund_reason || 'Không có lý do'})
                            </div>
                          )}
                        </div>
                      </div>
                      {isRefundable && (
                        <div className="flex justify-end gap-2 border-t border-border-light pt-3" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setRefundingPayment(payment);
                              setRefundAmount(payment.amount);
                              setRefundReason('');
                            }}
                          >
                            Hoàn tiền
                          </Button>
                        </div>
                      )}
                      {(payment.status === 'CREATED' || payment.status === 'PENDING') && (
                        <div className="flex justify-end gap-2 border-t border-border-light pt-3" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="bg-success-50 text-success-700 hover:bg-success-100 border border-success-200/50"
                            onClick={() => setConfirmAction({ type: 'approve', payment })}
                          >
                            Duyệt thanh toán
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-danger-600 hover:bg-danger-50 border-danger-200"
                            onClick={() => setConfirmAction({ type: 'cancel', payment })}
                          >
                            Hủy hóa đơn
                          </Button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-border-light pt-4 text-sm text-text-secondary">
                <div className="text-xs sm:text-sm">
                  Hiển thị <span className="font-semibold">{Math.min(filteredPayments.length, (currentPage - 1) * ITEMS_PER_PAGE + 1)}</span>
                  <span>-</span>
                  <span className="font-semibold">{Math.min(filteredPayments.length, currentPage * ITEMS_PER_PAGE)}</span>
                  <span> trong tổng số </span>
                  <span className="font-semibold">{filteredPayments.length}</span> giao dịch
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1 px-2 text-xs"
                    icon={<ChevronLeftIcon className="h-4 w-4" />}
                  >
                    Trước
                  </Button>
                  <span className="text-xs sm:text-sm font-medium">
                    Trang {currentPage} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1 px-2 text-xs flex-row-reverse"
                    icon={<ChevronRightIcon className="h-4 w-4" />}
                  >
                    Sau
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </SectionPanel>

      {/* Refund Form Modal */}
      {refundingPayment && (
        <Modal
          open={true}
          onClose={() => setRefundingPayment(null)}
          title="Yêu cầu hoàn tiền"
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRefundingPayment(null)} disabled={actionLoading}>
                Hủy
              </Button>
              <Button variant="danger" loading={actionLoading} onClick={handleRefund}>
                Xác nhận hoàn
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Hoàn tiền cho học viên{' '}
              <strong>
                {studentNames[refundingPayment.student_account_id] || `Học viên #${refundingPayment.student_account_id}`}
              </strong>{' '}
              tổng số tiền lên tới <strong>{currency(refundingPayment.amount)}</strong>.
            </p>
            <Input
              label="Số tiền hoàn (VNĐ)"
              type="number"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder="VD: 500000"
              required
            />
            <Input
              label="Lý do hoàn tiền"
              type="text"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="VD: Lớp học bị hủy hoặc học viên xin nghỉ..."
            />
          </div>
        </Modal>
      )}

      {/* Manual Actions Confirm Modal */}
      {confirmAction && (
        <Modal
          open={true}
          onClose={() => setConfirmAction(null)}
          title={confirmAction.type === 'approve' ? 'Xác nhận duyệt thanh toán thủ công' : 'Xác nhận hủy thanh toán thủ công'}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={actionLoading}>
                Đóng
              </Button>
              <Button
                variant={confirmAction.type === 'approve' ? 'primary' : 'danger'}
                loading={actionLoading}
                onClick={async () => {
                  setActionLoading(true);
                  try {
                    if (confirmAction.type === 'approve') {
                      await paymentApi.approveManual(confirmAction.payment.id);
                      toast('success', 'Đã duyệt thanh toán thành công');
                    } else {
                      await paymentApi.cancelManual(confirmAction.payment.id);
                      toast('success', 'Đã hủy thanh toán thành công');
                    }
                    await Promise.all([load(), loadFinanceReport()]);
                    setConfirmAction(null);
                  } catch (error) {
                    toast('error', extractErrorMessage(error));
                  } finally {
                    setActionLoading(false);
                  }
                }}
              >
                {confirmAction.type === 'approve' ? 'Duyệt thanh toán' : 'Hủy hóa đơn'}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-text-secondary leading-relaxed">
            {confirmAction.type === 'approve' ? (
              <>
                Bạn có chắc chắn muốn duyệt giao dịch này không? Học viên{' '}
                <strong>
                  {studentNames[confirmAction.payment.student_account_id] || `Học viên #${confirmAction.payment.student_account_id}`}
                </strong>{' '}
                sẽ được ghi nhận thanh toán thành công số tiền <strong>{currency(confirmAction.payment.amount)}</strong>. Lớp học hoặc yêu cầu gia sư liên quan sẽ được tự động kích hoạt.
              </>
            ) : (
              <>
                Bạn có chắc chắn muốn hủy giao dịch này không? Số tiền{' '}
                <strong>{currency(confirmAction.payment.amount)}</strong> của học viên{' '}
                <strong>
                  {studentNames[confirmAction.payment.student_account_id] || `Học viên #${confirmAction.payment.student_account_id}`}
                </strong>{' '}
                sẽ bị hủy bỏ. Trạng thái của lớp học hoặc yêu cầu liên quan sẽ được đưa về trạng thái chờ thanh toán để học viên có thể thực hiện lại.
              </>
            )}
          </p>
        </Modal>
      )}

      {/* Viewing Payment Details Modal */}
      {viewingPayment && (
        <Modal
          open={true}
          onClose={() => setViewingPayment(null)}
          title={`Chi tiết giao dịch #${viewingPayment.id}`}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setViewingPayment(null)}>
                Đóng
              </Button>
              {viewingPayment.status === 'SUCCEEDED' && (
                <Button
                  variant="danger"
                  onClick={() => {
                    setRefundingPayment(viewingPayment);
                    setRefundAmount(viewingPayment.amount);
                    setRefundReason('');
                    setViewingPayment(null);
                  }}
                >
                  Hoàn tiền
                </Button>
              )}
              {(viewingPayment.status === 'CREATED' || viewingPayment.status === 'PENDING') && (
                <>
                  <Button
                    variant="outline"
                    className="text-danger-600 hover:bg-danger-50 border-danger-200"
                    onClick={() => {
                      setConfirmAction({ type: 'cancel', payment: viewingPayment });
                      setViewingPayment(null);
                    }}
                  >
                    Hủy hóa đơn
                  </Button>
                  <Button
                    variant="secondary"
                    className="bg-success-50 text-success-700 hover:bg-success-100 border border-success-200/50"
                    onClick={() => {
                      setConfirmAction({ type: 'approve', payment: viewingPayment });
                      setViewingPayment(null);
                    }}
                  >
                    Duyệt thanh toán
                  </Button>
                </>
              )}
            </div>
          }
        >
          <div className="space-y-6">
            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-light pb-4">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary">Số tiền giao dịch</p>
                <p className="mt-1 text-2xl font-bold text-text-primary">{currency(viewingPayment.amount)}</p>
              </div>
              <div className="text-right">
                <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary">Trạng thái</p>
                <div className="mt-1.5">{getStatusBadge(viewingPayment.status)}</div>
              </div>
            </div>

            {/* Grid details */}
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary border-b border-border-light pb-1.5">
                  Thông tin học tập
                </h4>
                <div>
                  <p className="text-xs text-text-tertiary">Học viên</p>
                  <p className="mt-0.5 text-sm font-semibold text-text-primary">
                    {studentNames[viewingPayment.student_account_id] || `Học viên #${viewingPayment.student_account_id}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Loại hình</p>
                  <p className="mt-0.5 text-sm font-medium text-text-secondary">
                    {viewingPayment.target_type === 'PRIVATE_TUTORING_REQUEST' ? 'Yêu cầu dạy 1-1' : 'Đăng ký lớp học nhóm'}
                  </p>
                </div>
                {viewingPayment.target_name && (
                  <div>
                    <p className="text-xs text-text-tertiary">Lớp học / Yêu cầu</p>
                    <p className="mt-0.5 text-sm font-semibold text-primary-900">{viewingPayment.target_name}</p>
                  </div>
                )}
                {viewingPayment.subject_name && (
                  <div>
                    <p className="text-xs text-text-tertiary">Môn học</p>
                    <p className="mt-0.5 text-sm text-text-primary font-medium">{viewingPayment.subject_name}</p>
                  </div>
                )}
                {viewingPayment.tutor_name && (
                  <div>
                    <p className="text-xs text-text-tertiary">Gia sư</p>
                    <p className="mt-0.5 text-sm text-text-primary font-medium">{viewingPayment.tutor_name}</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary border-b border-border-light pb-1.5">
                  Thanh toán & Đối soát
                </h4>
                <div>
                  <p className="text-xs text-text-tertiary">Cú pháp chuyển khoản</p>
                  <p className="mt-1">
                    {viewingPayment.transfer_content ? (
                      <PaymentCodeBadge code={viewingPayment.transfer_content} />
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </p>
                </div>
                {viewingPayment.sepay_transaction_id && (
                  <div>
                    <p className="text-xs text-text-tertiary">Mã giao dịch SePay</p>
                    <p className="mt-0.5 text-sm font-mono font-medium text-text-primary">
                      {viewingPayment.sepay_transaction_id}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-text-tertiary">Thời gian tạo</p>
                  <p className="mt-0.5 text-sm text-text-secondary">
                    {viewingPayment.created_at ? new Date(viewingPayment.created_at).toLocaleString('vi-VN') : '—'}
                  </p>
                </div>
                {viewingPayment.paid_at && (
                  <div>
                    <p className="text-xs text-text-tertiary">Thời gian thanh toán</p>
                    <p className="mt-0.5 text-sm text-success-700 font-semibold">
                      {new Date(viewingPayment.paid_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                )}
                {viewingPayment.refund_amount && (
                  <div className="rounded bg-danger-50/50 p-2.5 border border-danger-100">
                    <p className="text-xs text-danger-700 font-bold">Thông tin hoàn tiền</p>
                    <p className="mt-1 text-sm text-danger-600 font-semibold">
                      Đã hoàn: {currency(viewingPayment.refund_amount)}
                    </p>
                    {viewingPayment.refund_reason && (
                      <p className="mt-0.5 text-xs text-text-tertiary italic">
                        Lý do: {viewingPayment.refund_reason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </PortalPage>
  );
}
