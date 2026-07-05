import { useEffect, useState } from 'react';
import { adminApi, extractErrorMessage } from '../../services/api';
import { FormSkeleton } from '../../components/ui/Skeleton';
import { PortalPage, SectionPanel } from '../../components/portal/PortalPage';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { SettingsIcon, ChartIcon, ClipboardCheckIcon } from '../../components/ui/Icons';

/* ── Health check ────────────────────────────────── */

interface HealthStatus {
  ok: boolean;
  message: string;
  latency: number;
}

async function checkHealth(): Promise<HealthStatus> {
  const start = performance.now();
  try {
    const res = await fetch('/api/v1/health');
    const latency = Math.round(performance.now() - start);
    if (!res.ok) return { ok: false, message: `Lỗi HTTP ${res.status}`, latency };
    const data = await res.json();
    return { ok: data.status === 'ok', message: data.message || 'Ổn định', latency };
  } catch {
    const latency = Math.round(performance.now() - start);
    return { ok: false, message: 'Không kết nối được', latency };
  }
}

/* ── Status dot ──────────────────────────── */

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className="relative flex h-3 w-3">
      {ok && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />}
      <span className={`relative inline-flex h-3 w-3 rounded-full ${ok ? 'bg-success-500' : 'bg-danger-500'}`} />
    </span>
  );
}

/* ── Permissions matrix data ──────────────────────────── */

const permissionsData = [
  { role: 'Quản trị viên (Admin)', color: 'bg-danger-500', perms: 'Quản lý tài khoản nhân viên · Xem nhật ký kiểm toán hệ thống (Audit Log) · Cấu hình biểu phí chiết khấu hoa hồng · Theo dõi sức khỏe hệ thống' },
  { role: 'Nhân viên (Staff)', color: 'bg-warning-500', perms: 'Xác minh hồ sơ & chứng chỉ gia sư · Quản lý danh sách học viên · Tạo & điều phối lớp học nhóm · Quản lý thanh toán & hoàn tiền' },
  { role: 'Gia sư (Tutor)', color: 'bg-success-500', perms: 'Cập nhật hồ sơ năng lực · Đăng ký môn giảng dạy · Báo lịch rảnh · Nhận yêu cầu học 1-1 · Điểm danh ca dạy' },
  { role: 'Học viên (Student)', color: 'bg-primary-500', perms: 'Đăng tải nhu cầu học · Xem gợi ý AI Match · Đăng ký lớp nhóm · Thực hiện thanh toán học phí · Đánh giá chất lượng gia sư' },
];

/* ── System Configuration Types ────────────────────────── */

interface SystemConfig {
  app_name?: string;
  debug?: boolean;
  payment_provider?: string;
  payment_expires_minutes?: number;
  sepay_bank_name?: string;
  sepay_bank_account?: string;
  sepay_account_name?: string;
  gemini_enabled?: boolean;
  gemini_model?: string;
  jwt_algorithm?: string;
  access_token_expire_minutes?: number;
  cors_origins?: string[];
  commission_rate_center?: number;
  commission_rate_tutor?: number;
}

type SystemTab = 'health' | 'config' | 'permissions';

export default function AdminSystem() {
  const [activeTab, setActiveTab] = useState<SystemTab>('health');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  // Commission editing states
  const [centerRate, setCenterRate] = useState<number>(30);
  const [tutorRate, setTutorRate] = useState<number>(70);
  const [saving, setSaving] = useState(false);

  const loadData = (showSkeleton = true) => {
    if (showSkeleton) setLoading(true);
    else setRefreshing(true);

    Promise.all([
      checkHealth(),
      adminApi.getConfig().catch(() => null),
    ]).then(([healthData, configData]) => {
      setHealth(healthData);
      if (configData) {
        const cfg = configData as SystemConfig;
        setConfig(cfg);
        setCenterRate(cfg.commission_rate_center ?? 30);
        setTutorRate(cfg.commission_rate_tutor ?? 70);
      }
      setLoading(false);
      setRefreshing(false);
    });
  };

  useEffect(() => {
    loadData();

    // Auto health check every 60 seconds
    const interval = setInterval(() => {
      checkHealth().then(setHealth);
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const handleSaveCommission = async () => {
    if (centerRate + tutorRate !== 100) {
      toast('error', 'Tổng tỷ lệ hoa hồng phải bằng 100%');
      return;
    }
    setSaving(true);
    try {
      await adminApi.updateConfig({
        commission_rate_center: centerRate,
        commission_rate_tutor: tutorRate,
      });
      toast('success', 'Đã lưu cấu hình tỷ lệ hoa hồng');
      if (config) {
        setConfig({
          ...config,
          commission_rate_center: centerRate,
          commission_rate_tutor: tutorRate,
        });
      }
    } catch (err) {
      toast('error', extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const syncTutorRate = (val: number) => {
    setCenterRate(val);
    setTutorRate(100 - val);
  };

  const syncCenterRate = (val: number) => {
    setTutorRate(val);
    setCenterRate(100 - val);
  };

  if (loading) return <FormSkeleton />;

  return (
    <PortalPage
      title="Cấu hình hệ thống"
      description="Quản trị tham số vận hành, cài đặt cổng kết nối và giám sát hoạt động máy chủ trung tâm."
      actions={
        <Button variant="outline" onClick={() => loadData(false)} loading={refreshing}>
          Đồng bộ lại
        </Button>
      }
    >
      {/* Sleek Glassmorphic Tabs Navigation */}
      <div className="mb-6 flex overflow-x-auto rounded-xl border border-border-light bg-surface-secondary/40 p-1 backdrop-blur-xs md:w-fit">
        <button
          onClick={() => setActiveTab('health')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
            activeTab === 'health'
              ? 'bg-white text-text-primary shadow-xs'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <ChartIcon className="h-4 w-4" />
          Sức khỏe máy chủ
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
            activeTab === 'config'
              ? 'bg-white text-text-primary shadow-xs'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <SettingsIcon className="h-4 w-4" />
          Cấu hình tham số
        </button>
        <button
          onClick={() => setActiveTab('permissions')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
            activeTab === 'permissions'
              ? 'bg-white text-text-primary shadow-xs'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <ClipboardCheckIcon className="h-4 w-4" />
          Ma trận quyền hạn
        </button>
      </div>

      <div className="grid gap-6">
        {/* Tab 1: Sức khỏe dịch vụ */}
        {activeTab === 'health' && (
          <div className="animate-fade-in">
            <SectionPanel title="Trạng thái máy chủ" description="Kết nối thời gian thực đến cổng API và Database.">
              <div className="divide-y divide-border-light">
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-3">
                    <StatusDot ok={health?.ok ?? false} />
                    <div>
                      <span className="block text-sm font-semibold text-text-primary">API Gateway (Máy chủ trung tâm)</span>
                      <span className="block text-xs text-text-tertiary">URL: /api/v1/health</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold ${health?.ok ? 'text-success-700' : 'text-danger-600'}`}>
                      {health?.ok ? 'Đang hoạt động tốt' : 'Mất kết nối'}
                    </span>
                    {health && (
                      <span className="ml-2 text-xs text-text-tertiary">({health.latency}ms)</span>
                    )}
                  </div>
                </div>

                <div className="py-4">
                  <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider block mb-2">Thông tin hệ thống</span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-surface-secondary/40 p-3 border border-border-light">
                      <p className="text-xs text-text-tertiary">Tên ứng dụng</p>
                      <p className="text-sm font-bold text-text-primary mt-0.5">{config?.app_name || 'Lumin Portal'}</p>
                    </div>
                    <div className="rounded-lg bg-surface-secondary/40 p-3 border border-border-light">
                      <p className="text-xs text-text-tertiary">Chế độ vận hành (Debug)</p>
                      <p className="text-sm font-bold text-text-primary mt-0.5">{config?.debug ? 'DEVELOPMENT (Bật)' : 'PRODUCTION (Tắt)'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </SectionPanel>
          </div>
        )}

        {/* Tab 2: Cấu hình tham số */}
        {activeTab === 'config' && config && (
          <div className="animate-fade-in space-y-6">
            {/* Business Commission Setup */}
            <SectionPanel title="Quy tắc biểu phí & Hoa hồng" description="Điều chỉnh chiết khấu hoa hồng trung tâm. Tỷ lệ này áp dụng khi tạo hợp đồng giảng dạy mới.">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
                      Tỷ lệ Trung tâm nhận (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={centerRate}
                      onChange={(e) => syncTutorRate(Number(e.target.value))}
                      className="w-full rounded-lg border border-border-light bg-surface-secondary/60 px-3 py-2 text-sm text-text-primary outline-none transition-all focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
                      Tỷ lệ Gia sư nhận (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={tutorRate}
                      onChange={(e) => syncCenterRate(Number(e.target.value))}
                      className="w-full rounded-lg border border-border-light bg-surface-secondary/60 px-3 py-2 text-sm text-text-primary outline-none transition-all focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-500/20"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button loading={saving} disabled={centerRate + tutorRate !== 100} onClick={handleSaveCommission}>
                    Lưu cấu hình hoa hồng
                  </Button>
                </div>
              </div>
            </SectionPanel>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Payment Settings */}
              <SectionPanel title="Cổng thanh toán (Sepay)" description="Thông tin kết nối tự động soát nguồn thu.">
                <div className="text-xs space-y-2.5">
                  <div className="flex justify-between border-b border-border-light/60 pb-2">
                    <span className="text-text-tertiary">Chế độ thanh toán:</span>
                    <span className="font-semibold text-text-primary">{config.payment_provider?.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between border-b border-border-light/60 pb-2">
                    <span className="text-text-tertiary">Thời hạn mã QR thanh toán:</span>
                    <span className="font-semibold text-text-primary">{config.payment_expires_minutes} phút</span>
                  </div>
                  {config.sepay_bank_name && (
                    <>
                      <div className="flex justify-between border-b border-border-light/60 pb-2">
                        <span className="text-text-tertiary">Ngân hàng:</span>
                        <span className="font-semibold text-text-primary">{config.sepay_bank_name}</span>
                      </div>
                      <div className="flex justify-between border-b border-border-light/60 pb-2">
                        <span className="text-text-tertiary">Số tài khoản:</span>
                        <span className="font-semibold text-text-primary">{config.sepay_bank_account}</span>
                      </div>
                      <div className="flex justify-between pb-1">
                        <span className="text-text-tertiary">Chủ tài khoản:</span>
                        <span className="font-semibold text-text-primary">{config.sepay_account_name}</span>
                      </div>
                    </>
                  )}
                </div>
              </SectionPanel>

              {/* AI Gemini Settings */}
              <SectionPanel title="Trí tuệ nhân tạo (Gemini AI)" description="Trạng thái kết nối LLM gợi ý thông minh.">
                <div className="text-xs space-y-2.5">
                  <div className="flex justify-between border-b border-border-light/60 pb-2">
                    <span className="text-text-tertiary">Trạng thái kết nối AI:</span>
                    <span className={`font-semibold ${config.gemini_enabled ? 'text-success-700' : 'text-text-tertiary'}`}>
                      {config.gemini_enabled ? 'Đã bật' : 'Chưa kích hoạt'}
                    </span>
                  </div>
                  {config.gemini_enabled && (
                    <div className="flex justify-between pb-1">
                      <span className="text-text-tertiary">Mẫu AI sử dụng:</span>
                      <span className="font-mono font-semibold text-text-primary">{config.gemini_model}</span>
                    </div>
                  )}
                </div>
              </SectionPanel>

              {/* Security and Domain Settings */}
              <SectionPanel title="Bảo mật & Tên miền" description="Cấu hình an toàn đường truyền và JWT Tokens.">
                <div className="text-xs space-y-2.5">
                  <div className="flex justify-between border-b border-border-light/60 pb-2">
                    <span className="text-text-tertiary">Thời hạn Token đăng nhập:</span>
                    <span className="font-semibold text-text-primary">{config.access_token_expire_minutes} phút ({(Number(config.access_token_expire_minutes) / 60).toFixed(0)} giờ)</span>
                  </div>
                  <div className="flex justify-between border-b border-border-light/60 pb-2">
                    <span className="text-text-tertiary">Thuật toán ký hiệu:</span>
                    <span className="font-mono font-semibold text-text-primary">{config.jwt_algorithm}</span>
                  </div>
                  <div className="flex justify-between flex-col gap-1.5 pb-1">
                    <span className="text-text-tertiary">CORS domains được phép:</span>
                    <code className="text-[10px] bg-surface-secondary px-2 py-1 rounded font-mono text-primary-700 break-all">{JSON.stringify(config.cors_origins)}</code>
                  </div>
                </div>
              </SectionPanel>
            </div>
          </div>
        )}

        {/* Tab 3: Ma trận quyền hạn */}
        {activeTab === 'permissions' && (
          <div className="animate-fade-in space-y-4">
            <SectionPanel title="Ma trận quyền hạn" description="Chi tiết phân bổ quyền thực thi tác vụ theo từng vai trò trong hệ thống.">
              <div className="grid gap-4 md:grid-cols-2">
                {permissionsData.map((item) => (
                  <div key={item.role} className="rounded-lg border border-border-light bg-white p-4 hover:shadow-xs transition-all">
                    <div className="flex items-center gap-2.5">
                      <span className={`inline-block h-3 w-3 rounded-full ${item.color}`} />
                      <h3 className="text-sm font-bold text-text-primary">{item.role}</h3>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-text-secondary">{item.perms}</p>
                  </div>
                ))}
              </div>
            </SectionPanel>
          </div>
        )}
      </div>
    </PortalPage>
  );
}
