import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { classApi, extractErrorMessage, messageApi, privateRequestApi } from '../../services/api';
import type { CourseClassResponse, PrivateRequestResponse, TutorApplicationResponse } from '../../types';
import Button from '../../components/ui/Button';
import { useConfirmDialog } from '../../components/ui/ConfirmDialog';
import { getStatusBadge } from '../../components/ui/Badge';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { BookOpenIcon, ClipboardCheckIcon, UsersIcon, WalletIcon } from '../../components/ui/Icons';
import { EmptyPanel, MetricTile, PortalPage, SectionPanel, SegmentedTabs } from '../../components/portal/PortalPage';
import ConfirmRequestModal from '../../components/messages/ConfirmRequestModal';
import StudentProfileModal from '../../components/messages/StudentProfileModal';
import ContactDetails from '../../components/shared/ContactDetails';
import { isPrivateRequestContactVisible } from '../../utils/constants';
import { currency } from '../../utils/format';

type OpportunityTab = 'classes' | 'requests' | 'history';


export default function TutorOpportunities({ initialTab = 'classes' }: { initialTab?: OpportunityTab }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<OpportunityTab>(initialTab);
  const [requests, setRequests] = useState<PrivateRequestResponse[]>([]);
  const [recruitingClasses, setRecruitingClasses] = useState<CourseClassResponse[]>([]);
  const [applications, setApplications] = useState<TutorApplicationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<PrivateRequestResponse | null>(null);
  const [profileRequestId, setProfileRequestId] = useState<number | null>(null);
  const { toast } = useToast();
  const { confirm: confirmAction, ConfirmDialogElement } = useConfirmDialog();

  const load = () => {
    Promise.all([
      privateRequestApi.list().catch(() => []),
      classApi.list({ for_tutor: true }).catch(() => []),
      classApi.myApplications().catch(() => []),
    ]).then(([requestList, classList, applicationList]) => {
      setRequests(requestList);
      setRecruitingClasses(classList.filter((c) => c.status === 'TUTOR_RECRUITING'));
      setApplications(applicationList);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const handleApplyClass = async (classId: number) => {
    setApplyingId(classId);
    try {
      await classApi.apply(classId, {});
      toast('success', 'Đã ứng tuyển thành công!');
      load();
    } catch (err) {
      toast('error', extractErrorMessage(err));
    } finally {
      setApplyingId(null);
    }
  };

  const handleReject = async (id: number) => {
    const shouldReject = await confirmAction({
      title: 'Từ chối yêu cầu này?',
      description: 'Học viên sẽ được thông báo rằng bạn không nhận yêu cầu 1-1 này. Thao tác không thể hoàn tác.',
      confirmLabel: 'Từ chối',
      variant: 'danger',
    });
    if (!shouldReject) return;
    try {
      await privateRequestApi.reject(id);
      toast('success', 'Đã từ chối yêu cầu');
      load();
    } catch {
      toast('error', 'Thao tác thất bại');
    }
  };

  const handleOpenRequestThread = async (request: PrivateRequestResponse) => {
    try {
      const thread = await messageApi.ensureThread({
        private_request_id: request.id,
        title: `Yêu cầu 1-1${request.student_name ? ` - ${request.student_name}` : ''}`,
      });
      navigate(`/tutor/messages?threadId=${thread.id}`);
    } catch (err) {
      toast('error', extractErrorMessage(err));
    }
  };

  const pendingRequests = useMemo(() => requests.filter((request) => request.status === 'SENT'), [requests]);
  const activeRequests = useMemo(() => requests.filter((request) => ['SCHEDULE_PROPOSED', 'TUTOR_CONFIRMED', 'PAID', 'ONGOING'].includes(request.status)), [requests]);
  const historyRequests = useMemo(() => requests.filter((request) => request.status !== 'SENT'), [requests]);
  const appliedClassIds = useMemo(() => new Set(applications.map((application) => application.class_id)), [applications]);

  if (loading) return <DashboardSkeleton />;

  return (
    <PortalPage
      title="Cơ hội dạy"
      description="Ứng tuyển lớp nhóm đang tuyển và quản lý yêu cầu 1-1 từ học viên."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile icon={BookOpenIcon} label="Lớp đang tuyển" value={recruitingClasses.length} hint="Lớp nhóm cần gia sư ứng tuyển." tone="primary" />
        <MetricTile icon={UsersIcon} label="Chờ phản hồi" value={pendingRequests.length} hint="Cần phản hồi sớm để giữ học viên." />
        <MetricTile icon={ClipboardCheckIcon} label="Đang xử lý" value={activeRequests.length} hint="Đã xác nhận hoặc đang vận hành." tone="success" />
        <MetricTile icon={WalletIcon} label="Lịch sử" value={historyRequests.length + applications.length} hint="Theo dõi trạng thái yêu cầu và ứng tuyển." tone="neutral" />
      </div>

      <SegmentedTabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: 'classes', label: 'Lớp đang tuyển', count: recruitingClasses.length },
          { value: 'requests', label: 'Yêu cầu 1-1', count: pendingRequests.length },
          { value: 'history', label: 'Lịch sử', count: historyRequests.length + applications.length },
        ]}
      />

      {activeTab === 'classes' && (
        <SectionPanel title="Lớp nhóm đang tuyển gia sư" description="Ứng tuyển vào các lớp phù hợp với môn dạy và cấp lớp của bạn.">
          {recruitingClasses.length === 0 ? (
            <EmptyPanel title="Chưa có lớp phù hợp" description="Hiện chưa có lớp nào đang tuyển phù hợp với môn dạy của bạn. Hãy đảm bảo môn dạy đã được Staff duyệt." />
          ) : (
            <div className="space-y-3">
              {recruitingClasses.map((cls) => (
                <article key={cls.id} className="rounded-lg border border-border-light bg-white p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-text-primary">{cls.title}</span>
                        {getStatusBadge(cls.status)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">
                          {cls.grade_level}
                        </span>
                        <span className="rounded-full border border-border-light bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                          {cls.total_sessions} buổi
                        </span>
                        <span className="rounded-full border border-border-light bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                          {currency(cls.fee_per_session_per_student)}/buổi/HV
                        </span>
                        <span className="rounded-full border border-border-light bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                          {cls.mode === 'ONLINE' ? '🌐 Trực tuyến' : cls.mode === 'OFFLINE' ? '📍 Trực tiếp' : '🔄 Linh hoạt'}
                        </span>
                        <span className="rounded-full border border-border-light bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                          {cls.min_students}–{cls.max_students} HV
                        </span>
                      </div>
                      {cls.goal && (
                        <div className="mt-3 rounded-lg border border-border-light bg-surface-secondary p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary mb-1">Mục tiêu lớp học</p>
                          <p className="text-sm leading-6 text-text-secondary">{cls.goal}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleApplyClass(cls.id)}
                        loading={applyingId === cls.id}
                        disabled={appliedClassIds.has(cls.id)}
                      >
                        {appliedClassIds.has(cls.id) ? 'Đã ứng tuyển' : 'Ứng tuyển'}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionPanel>
      )}

      {activeTab === 'requests' && (
        <SectionPanel title="Yêu cầu 1-1 cần phản hồi" description="Bấm vào tên học viên để xem hồ sơ chi tiết trước khi quyết định.">
          {pendingRequests.length === 0 ? (
            <EmptyPanel title="Không có yêu cầu mới" description="Yêu cầu mới từ học viên sẽ xuất hiện tại đây." />
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <article key={request.id} className="rounded-lg border border-border-light bg-white p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setProfileRequestId(request.id)}
                          className="font-semibold text-primary-700 hover:text-primary-800 hover:underline transition-colors"
                        >
                          {request.student_name || `Học viên #${request.student_account_id}`}
                        </button>
                        {getStatusBadge(request.status)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {request.subject_name && (
                          <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">
                            {request.subject_name}
                          </span>
                        )}
                        <span className="rounded-full border border-border-light bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                          {request.grade_level}
                        </span>
                        <span className="rounded-full border border-border-light bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                          {request.requested_sessions} buổi
                        </span>
                        <span className="rounded-full border border-border-light bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                          {request.mode === 'ONLINE' ? '🌐 Trực tuyến' : request.mode === 'OFFLINE' ? '📍 Trực tiếp' : '🔄 Linh hoạt'}
                        </span>
                      </div>
                      {request.goal && (
                        <div className="mt-3 rounded-lg border border-border-light bg-surface-secondary p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary mb-1">Mục tiêu học tập</p>
                          <p className="text-sm leading-6 text-text-secondary">{request.goal}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:shrink-0">
                      <Button size="sm" variant="outline" onClick={() => handleOpenRequestThread(request)}>Trao đổi</Button>
                      <Button size="sm" onClick={() => setConfirmRequest(request)}>Xác nhận</Button>
                      <Button size="sm" variant="outline" className="text-danger-600 hover:bg-danger-50" onClick={() => handleReject(request.id)}>Từ chối</Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionPanel>
      )}

      {activeTab === 'history' && (
        <SectionPanel title="Yêu cầu đã xử lý" description="Lưu lại các yêu cầu đã xác nhận, đang học, hoàn tất hoặc đã từ chối.">
          {historyRequests.length === 0 && applications.length === 0 ? (
            <EmptyPanel title="Chưa có lịch sử xử lý" />
          ) : (
            <div className="space-y-5">
              {applications.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">Ứng tuyển lớp nhóm</h3>
                    <p className="mt-0.5 text-xs text-text-tertiary">Các lớp bạn đã gửi ứng tuyển sẽ được lưu tại đây.</p>
                  </div>
                  {applications.map((application) => (
                    <article key={application.id} className="rounded-lg border border-border-light bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-text-primary">{application.class_title || `Lớp #${application.class_id}`}</span>
                            {getStatusBadge(application.status)}
                          </div>
                          <p className="mt-1 text-sm text-text-secondary">
                            {application.subject_name || 'Môn học'} · {application.grade_level || 'Chưa rõ cấp lớp'}
                            {application.total_sessions ? ` · ${application.total_sessions} buổi` : ''}
                            {application.fee_per_session_per_student ? ` · ${currency(application.fee_per_session_per_student)}/buổi/HV` : ''}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-text-tertiary">
                          Trạng thái lớp: {application.class_status || 'Chưa rõ'}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {historyRequests.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">Yêu cầu 1-1 đã xử lý</h3>
                  </div>
              {historyRequests.map((request) => (
                <article key={request.id} className="rounded-lg border border-border-light bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setProfileRequestId(request.id)}
                          className="font-semibold text-primary-700 hover:text-primary-800 hover:underline transition-colors"
                        >
                          {request.student_name || `Học viên #${request.student_account_id}`}
                        </button>
                        {request.subject_name && (
                          <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
                            {request.subject_name}
                          </span>
                        )}
                        {getStatusBadge(request.status)}
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">
                        {request.requested_sessions} buổi{request.agreed_fee_per_session ? ` · ${currency(request.agreed_fee_per_session)}/buổi` : ''}
                      </p>
                      {isPrivateRequestContactVisible(request.status) && (
                        <ContactDetails
                          title="Liên hệ học viên"
                          phone={request.student_phone}
                          address={request.student_address}
                          compact
                          className="mt-3"
                          emptyMessage="Học viên chưa cập nhật số điện thoại."
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-text-tertiary">{request.confirmed_at ? new Date(request.confirmed_at).toLocaleDateString('vi-VN') : 'Chưa xác nhận'}</p>
                      <Button size="sm" variant="outline" onClick={() => handleOpenRequestThread(request)}>Trao đổi</Button>
                    </div>
                  </div>
                </article>
              ))}
                </div>
              )}
            </div>
          )}
        </SectionPanel>
      )}

      <ConfirmRequestModal
        request={confirmRequest}
        onClose={() => setConfirmRequest(null)}
        onConfirmed={(updatedRequest) => {
          setConfirmRequest(null);
          setRequests((current) => current.map((item) => item.id === updatedRequest.id ? updatedRequest : item));
          load();
        }}
      />
      {ConfirmDialogElement}
      <StudentProfileModal requestId={profileRequestId} onClose={() => setProfileRequestId(null)} />
    </PortalPage>
  );
}
