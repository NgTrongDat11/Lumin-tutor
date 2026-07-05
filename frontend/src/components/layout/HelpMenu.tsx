import { useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserRole } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import {
  BookOpenIcon,
  HelpCircleIcon,
  MessageCircleIcon,
  KeyboardIcon,
  GraduationCapIcon,
  UserCheckIcon,
  BriefcaseIcon,
  SettingsIcon
} from '../ui/Icons';

interface HelpMenuProps {
  open: boolean;
  onClose: () => void;
  userRole: UserRole;
  userName: string;
}

export function HelpMenu({ open, onClose, userRole, userName }: HelpMenuProps) {
  const navigate = useNavigate();
  const [activeSubModal, setActiveSubModal] = useState<'guide' | 'faq' | 'shortcuts' | null>(null);
  const [guideRoleTab, setGuideRoleTab] = useState<UserRole>(userRole);

  const roleDashboardMap: Record<UserRole, string> = {
    STUDENT: '/student',
    TUTOR: '/tutor',
    STAFF: '/staff',
    SUPER_ADMIN: '/admin',
  };

  const handleContactSupport = () => {
    onClose();
    const basePath = roleDashboardMap[userRole] || '/student';
    navigate(`${basePath}/messages`);
  };

  if (!open && !activeSubModal) return null;

  return (
    <>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-32px)] rounded-xl border border-border-light bg-white shadow-xl ring-1 ring-black/5 z-50 animate-scale-in overflow-hidden">
            <div className="px-4 py-3 border-b border-border-light bg-surface-secondary/50">
              <h3 className="text-sm font-bold text-text-primary">Trợ giúp & Hỗ trợ</h3>
              <p className="text-[11px] text-text-secondary mt-0.5 truncate">Xin chào, {userName}</p>
            </div>
            <div className="p-1.5">
              <button
                onClick={() => {
                  onClose();
                  setActiveSubModal('guide');
                }}
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors flex items-center gap-3 cursor-pointer"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-50 text-primary-600">
                  <BookOpenIcon className="h-4 w-4" />
                </span>
                <span>Hướng dẫn sử dụng</span>
              </button>
              <button
                onClick={() => {
                  onClose();
                  setActiveSubModal('faq');
                }}
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors flex items-center gap-3 cursor-pointer"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-warning-50 text-warning-600">
                  <HelpCircleIcon className="h-4 w-4" />
                </span>
                <span>Câu hỏi thường gặp</span>
              </button>
              <button
                onClick={handleContactSupport}
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors flex items-center gap-3 cursor-pointer"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-success-50 text-success-600">
                  <MessageCircleIcon className="h-4 w-4" />
                </span>
                <span>Liên hệ hỗ trợ</span>
              </button>
              <button
                onClick={() => {
                  onClose();
                  setActiveSubModal('shortcuts');
                }}
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors flex items-center gap-3 cursor-pointer"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-tertiary text-text-tertiary">
                  <KeyboardIcon className="h-4 w-4" />
                </span>
                <span>Phím tắt hệ thống</span>
              </button>
            </div>
            <div className="border-t border-border-light px-4 py-2.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-text-tertiary">Lumin v1.1.0</span>
              <span className="text-[10px] text-text-tertiary">© 2026 Lumin</span>
            </div>
          </div>
        </>
      )}

      {/* Guide Modal */}
      {activeSubModal === 'guide' && (
        <Modal
          open={true}
          onClose={() => setActiveSubModal(null)}
          title="📖 Hướng dẫn sử dụng hệ thống Lumin"
          size="lg"
          footer={<Button onClick={() => setActiveSubModal(null)}>Đóng</Button>}
        >
          <div className="space-y-5">
            {/* Custom styled role selection tabs */}
            <div className="flex flex-wrap gap-2 border-b border-border-light pb-3">
              {(['STUDENT', 'TUTOR', 'STAFF', 'SUPER_ADMIN'] as UserRole[]).map((role) => {
                const isActive = guideRoleTab === role;
                const roleLabels: Record<UserRole, { label: string; icon: ComponentType<{ className?: string }>; activeBg: string }> = {
                  STUDENT: { label: 'Học viên', icon: GraduationCapIcon, activeBg: 'bg-primary-50 text-primary-750 border-primary-300' },
                  TUTOR: { label: 'Gia sư', icon: UserCheckIcon, activeBg: 'bg-success-50 text-success-700 border-success-300' },
                  STAFF: { label: 'Vận hành', icon: BriefcaseIcon, activeBg: 'bg-warning-50 text-warning-700 border-warning-300' },
                  SUPER_ADMIN: { label: 'Quản trị', icon: SettingsIcon, activeBg: 'bg-danger-50 text-danger-700 border-danger-300' },
                };
                const config = roleLabels[role];
                const IconComp = config.icon;
                return (
                  <button
                    key={role}
                    onClick={() => setGuideRoleTab(role)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                      isActive
                        ? `${config.activeBg} shadow-xs`
                        : 'border-transparent text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                    }`}
                  >
                    <IconComp className="h-3.5 w-3.5" />
                    <span>{config.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-4">
              {guideRoleTab === 'STUDENT' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <GraduationCapIcon className="h-5 w-5 text-primary-600" />
                    <p className="font-bold text-text-primary text-base">Quy trình dành cho Học viên (Student)</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { title: 'Tìm kiếm gia sư', desc: 'Sử dụng bộ lọc thông minh AI đề xuất gia sư phù hợp nhất theo điểm Match Score.' },
                      { title: 'Đăng ký lớp nhóm', desc: 'Xem danh sách các lớp học nhóm đang tuyển sinh, chọn lớp và gửi yêu cầu đăng ký.' },
                      { title: 'Yêu cầu học 1-1', desc: 'Tạo yêu cầu thuê gia sư dạy riêng với môn học, lịch trình và học phí tự chọn.' },
                      { title: 'Thanh toán học phí', desc: 'Quét mã QR động chuyển khoản ngân hàng để hệ thống tự động xác nhận tham gia lớp.' },
                      { title: 'Học tập & Tương tác', desc: 'Chat trực tiếp trao đổi tài liệu với gia sư và xem lịch học chi tiết trên thời khóa biểu.' },
                      { title: 'Đánh giá gia sư', desc: 'Gửi nhận xét và số sao đánh giá gia sư sau khi kết thúc khóa học để nâng cao chất lượng.' },
                    ].map((step, idx) => (
                      <div key={idx} className="p-3 border border-border-light rounded-xl bg-surface-secondary/20 hover:bg-surface-secondary/40 transition-colors flex gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <h4 className="font-bold text-text-primary text-xs">{step.title}</h4>
                          <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {guideRoleTab === 'TUTOR' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <UserCheckIcon className="h-5 w-5 text-success-600" />
                    <p className="font-bold text-text-primary text-base">Quy trình dành cho Gia sư (Tutor)</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { title: 'Hoàn thiện hồ sơ', desc: 'Cập nhật lý lịch, môn dạy và tải lên các chứng chỉ sư phạm để được duyệt tài khoản.' },
                      { title: 'Đăng ký lịch rảnh', desc: 'Thiết lập khung thời gian rảnh cố định trong tuần để học viên dễ dàng đặt lịch học.' },
                      { title: 'Ứng tuyển lớp học', desc: 'Xem danh sách lớp nhóm đang mở tuyển hoặc các yêu cầu 1-1 từ học viên để apply.' },
                      { title: 'Quản lý lịch dạy', desc: 'Theo dõi thời khóa biểu dạy, thời gian của từng buổi học đã lên lịch cụ thể.' },
                      { title: 'Điểm danh buổi dạy', desc: 'Tiến hành điểm danh học viên sau mỗi ca dạy để hệ thống ghi nhận làm căn cứ thanh toán.' },
                      { title: 'Trao đổi & Hỗ trợ', desc: 'Nhắn tin trực tiếp với học viên để gửi tài liệu học tập và thông báo lịch trình.' },
                    ].map((step, idx) => (
                      <div key={idx} className="p-3 border border-border-light rounded-xl bg-surface-secondary/20 hover:bg-surface-secondary/40 transition-colors flex gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600 text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <h4 className="font-bold text-text-primary text-xs">{step.title}</h4>
                          <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {guideRoleTab === 'STAFF' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <BriefcaseIcon className="h-5 w-5 text-warning-600" />
                    <p className="font-bold text-text-primary text-base">Nhiệm vụ của Nhân viên vận hành (Staff)</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { title: 'Duyệt hồ sơ gia sư', desc: 'Thẩm định hồ sơ lý lịch, xác thực các chứng chỉ môn dạy của gia sư mới đăng ký.' },
                      { title: 'Điều phối lớp học', desc: 'Khởi tạo lớp nhóm mới, duyệt học viên, mở tuyển gia sư và phê duyệt phân công dạy.' },
                      { title: 'Vận hành tài chính', desc: 'Theo dõi giao dịch học phí (tự động nhận qua SePay) và thực hiện các lệnh hoàn tiền.' },
                      { title: 'Quản lý lịch học', desc: 'Xử lý các vấn đề nghỉ học, đổi lịch dạy, và giám sát lịch giảng dạy toàn trung tâm.' },
                      { title: 'Lưu trữ hợp đồng', desc: 'Quản lý, phê duyệt các hợp đồng giảng dạy được tạo tự động giữa trung tâm và gia sư.' },
                      { title: 'Hỗ trợ & CSKH', desc: 'Sử dụng cổng Chat trực tuyến hỗ trợ giải quyết thắc mắc cho học viên và gia sư.' },
                    ].map((step, idx) => (
                      <div key={idx} className="p-3 border border-border-light rounded-xl bg-surface-secondary/20 hover:bg-surface-secondary/40 transition-colors flex gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-600 text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <h4 className="font-bold text-text-primary text-xs">{step.title}</h4>
                          <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {guideRoleTab === 'SUPER_ADMIN' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <SettingsIcon className="h-5 w-5 text-danger-600" />
                    <p className="font-bold text-text-primary text-base">Quyền hạn của Quản trị viên (Super Admin)</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { title: 'Quản lý nhân viên', desc: 'Khởi tạo tài khoản, phân quyền thao tác cho nhân viên vận hành (Staff) trong trung tâm.' },
                      { title: 'Kiểm toán hệ thống', desc: 'Giám sát chi tiết mọi hoạt động thay đổi dữ liệu nhạy cảm thông qua Audit Log.' },
                      { title: 'Cấu hình tích hợp', desc: 'Quản lý tham số và kiểm tra kết nối API Gemini AI và Cổng thanh toán SePay.' },
                    ].map((step, idx) => (
                      <div key={idx} className="p-3 border border-border-light rounded-xl bg-surface-secondary/20 hover:bg-surface-secondary/40 transition-colors flex gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger-500/10 text-danger-600 text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <h4 className="font-bold text-text-primary text-xs">{step.title}</h4>
                          <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* FAQ Modal */}
      {activeSubModal === 'faq' && (
        <Modal
          open={true}
          onClose={() => setActiveSubModal(null)}
          title="❓ Các câu hỏi thường gặp (FAQ)"
          size="md"
          footer={<Button onClick={() => setActiveSubModal(null)}>Đóng</Button>}
        >
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="border border-border-light rounded-xl p-3.5 bg-surface-secondary/20 hover:bg-surface-secondary/40 transition-all space-y-2">
              <div className="flex gap-2 items-start">
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[10px] font-bold mt-0.5 shrink-0">HỎI</span>
                <p className="font-bold text-xs text-text-primary">Quy trình duyệt hồ sơ gia sư mất bao lâu?</p>
              </div>
              <div className="pl-7 border-l border-primary-100">
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Thông thường nhân viên vận hành sẽ thẩm định chứng chỉ và duyệt môn đăng ký dạy trong vòng 24 giờ làm việc. Gia sư sẽ nhận được thông báo qua hệ thống khi hoàn tất duyệt.
                </p>
              </div>
            </div>

            <div className="border border-border-light rounded-xl p-3.5 bg-surface-secondary/20 hover:bg-surface-secondary/40 transition-all space-y-2">
              <div className="flex gap-2 items-start">
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[10px] font-bold mt-0.5 shrink-0">HỎI</span>
                <p className="font-bold text-xs text-text-primary">Học viên có thể hủy lớp học và hoàn tiền học phí không?</p>
              </div>
              <div className="pl-7 border-l border-primary-100">
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Có. Trong trường hợp lớp học nhóm không đủ chỉ tiêu khai giảng hoặc xảy ra sự cố đột xuất từ phía trung tâm, nhân viên vận hành sẽ hỗ trợ làm lệnh hoàn tiền. Số tiền hoàn sẽ chuyển về tài khoản ngân hàng đăng ký.
                </p>
              </div>
            </div>

            <div className="border border-border-light rounded-xl p-3.5 bg-surface-secondary/20 hover:bg-surface-secondary/40 transition-all space-y-2">
              <div className="flex gap-2 items-start">
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[10px] font-bold mt-0.5 shrink-0">HỎI</span>
                <p className="font-bold text-xs text-text-primary">Hệ thống tự động đề xuất gia sư hoạt động thế nào?</p>
              </div>
              <div className="pl-7 border-l border-primary-100">
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Lumin sử dụng trí tuệ nhân tạo Gemini AI để phân tích sự tương thích giữa yêu cầu của học viên (cấp lớp, môn học, lịch rảnh, địa điểm) với hồ sơ gia sư, sau đó hiển thị điểm Match Score trực quan.
                </p>
              </div>
            </div>

            <div className="border border-border-light rounded-xl p-3.5 bg-surface-secondary/20 hover:bg-surface-secondary/40 transition-all space-y-2">
              <div className="flex gap-2 items-start">
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[10px] font-bold mt-0.5 shrink-0">HỎI</span>
                <p className="font-bold text-xs text-text-primary">Làm sao để thay đổi mật khẩu tài khoản cá nhân?</p>
              </div>
              <div className="pl-7 border-l border-primary-100">
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Bạn có thể nhấn vào biểu tượng Avatar góc trên bên phải màn hình (hoặc góc dưới bên trái), chọn "Thiết lập tài khoản" để mở khung đổi mật khẩu bảo mật mới.
                </p>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Shortcuts Modal */}
      {activeSubModal === 'shortcuts' && (
        <Modal
          open={true}
          onClose={() => setActiveSubModal(null)}
          title="⌨️ Phím tắt hệ thống"
          size="sm"
          footer={<Button onClick={() => setActiveSubModal(null)}>Đã hiểu</Button>}
        >
          <div className="space-y-4">
            <p className="text-xs text-text-tertiary">Sử dụng các phím tắt sau để điều hướng nhanh hơn:</p>
            <div className="divide-y divide-border-light">
              <div className="flex justify-between py-2 text-sm">
                <span className="text-text-secondary">Mở khung tìm kiếm nhanh</span>
                <kbd className="px-2 py-0.5 bg-surface-secondary border border-border rounded shadow-xs text-xs font-semibold">Ctrl + K</kbd>
              </div>
              <div className="flex justify-between py-2 text-sm">
                <span className="text-text-secondary">Đóng hộp thoại Modal</span>
                <kbd className="px-2 py-0.5 bg-surface-secondary border border-border rounded shadow-xs text-xs font-semibold">Esc</kbd>
              </div>
              <div className="flex justify-between py-2 text-sm">
                <span className="text-text-secondary">Trở lại trang tổng quan</span>
                <kbd className="px-2 py-0.5 bg-surface-secondary border border-border rounded shadow-xs text-xs font-semibold">G + D</kbd>
              </div>
              <div className="flex justify-between py-2 text-sm">
                <span className="text-text-secondary">Đăng xuất tài khoản</span>
                <kbd className="px-2 py-0.5 bg-surface-secondary border border-border rounded shadow-xs text-xs font-semibold">G + L</kbd>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default HelpMenu;
