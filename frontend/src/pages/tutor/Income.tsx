import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tutorIncomeApi } from '../../services/api';
import type { TutorIncomeSummaryResponse, TutorIncomeTransaction } from '../../types';
import { WalletIcon, ChartIcon, ClipboardCheckIcon } from '../../components/ui/Icons';
import { EmptyPanel, MetricTile, PortalPage, SectionPanel } from '../../components/portal/PortalPage';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { currency, formatDate } from '../../utils/format';

function monthParams(value: string) {
  if (!value) return undefined;
  const [year, month] = value.split('-').map(Number);
  return { year, month };
}

export default function TutorIncome() {
  const { toast } = useToast();
  const [summary, setSummary] = useState<TutorIncomeSummaryResponse | null>(null);
  const [transactions, setTransactions] = useState<TutorIncomeTransaction[]>([]);
  const [month, setMonth] = useState('');
  const [targetType, setTargetType] = useState('');
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);

  const params = useMemo(
    () => ({ ...monthParams(month), target_type: targetType || undefined }),
    [month, targetType],
  );

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const [summaryData, transactionData] = await Promise.all([
        tutorIncomeApi.summary(),
        tutorIncomeApi.transactions(params),
      ]);
      if (requestId !== requestRef.current) return;
      setSummary(summaryData);
      setTransactions(transactionData);
    } catch {
      if (requestId !== requestRef.current) return;
      setSummary(null);
      setTransactions([]);
      toast('error', 'Không thể tải thông tin thu nhập.');
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [params, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !summary) return <TableSkeleton />;

  return (
    <PortalPage
      title="Thu nhập"
      description="Theo dõi phần thu nhập được phân bổ từ các giao dịch học phí đã ghi nhận."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile icon={WalletIcon} label="Tháng này" value={currency(summary?.this_month || 0)} tone="primary" />
        <MetricTile icon={ChartIcon} label="Năm nay" value={currency(summary?.this_year || 0)} tone="success" />
        <MetricTile icon={WalletIcon} label="Tổng phần được phân bổ" value={currency(summary?.total || 0)} tone="neutral" />
        <MetricTile
          icon={ClipboardCheckIcon}
          label="Khấu trừ do hoàn tiền"
          value={Number(summary?.refund_adjustment || 0) > 0 ? `-${currency(summary?.refund_adjustment || 0)}` : currency(0)}
          hint={`${summary?.transaction_count || 0} giao dịch được ghi nhận.`}
          tone="warning"
        />
      </div>

      <SectionPanel
        title="Chi tiết phần thu nhập"
        description={`${transactions.length} giao dịch phù hợp bộ lọc.`}
        action={
          <div className="flex flex-wrap gap-2">
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            />
            <select
              value={targetType}
              onChange={(event) => setTargetType(event.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Mọi loại lớp</option>
              <option value="PRIVATE_TUTORING_REQUEST">Học 1-1</option>
              <option value="CLASS_REGISTRATION">Lớp nhóm</option>
            </select>
          </div>
        }
      >
        {transactions.length === 0 ? (
          <EmptyPanel
            title="Chưa có dữ liệu thu nhập"
            description="Phần thu nhập sẽ xuất hiện khi học phí được ghi nhận thành công."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border-light bg-white">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-surface-secondary text-xs font-bold uppercase tracking-wide text-text-tertiary">
                <tr>
                  <th className="px-4 py-3">Ngày ghi nhận</th>
                  <th className="px-4 py-3">Nguồn</th>
                  <th className="px-4 py-3">Môn học</th>
                  <th className="px-4 py-3 text-right">Học phí</th>
                  <th className="px-4 py-3 text-right">Tỷ lệ</th>
                  <th className="px-4 py-3 text-right">Phần ban đầu</th>
                  <th className="px-4 py-3 text-right">Khấu trừ</th>
                  <th className="px-4 py-3 text-right">Phần thu nhập</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {transactions.map((item) => (
                  <tr key={item.payment_id} className="hover:bg-surface-secondary/50">
                    <td className="px-4 py-3">{item.paid_at ? formatDate(item.paid_at) : '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-text-primary">{item.target_name || `Giao dịch #${item.payment_id}`}</p>
                      <p className="text-xs text-text-tertiary">
                        {item.target_type === 'PRIVATE_TUTORING_REQUEST' ? 'Học 1-1' : 'Lớp nhóm'}
                      </p>
                    </td>
                    <td className="px-4 py-3">{item.subject_name || '—'}</td>
                    <td className="px-4 py-3 text-right">{currency(item.gross_amount)}</td>
                    <td className="px-4 py-3 text-right">{Number(item.tutor_rate || 0).toFixed(0)}%</td>
                    <td className="px-4 py-3 text-right">{currency(item.tutor_gross)}</td>
                    <td className="px-4 py-3 text-right text-warning-700">
                      {Number(item.tutor_refund_adjustment) > 0 ? `-${currency(item.tutor_refund_adjustment)}` : currency(0)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-primary-800">{currency(item.tutor_net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>
    </PortalPage>
  );
}
