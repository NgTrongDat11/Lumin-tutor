import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import AdminDashboard from '../admin/Dashboard';
import { classApi, paymentApi, scheduleApi, staffApi, messageApi } from '../../services/api';
import type { CourseClassResponse, LearningSessionResponse, PaymentResponse, TutorPublicResponse, PrivateRequestResponse } from '../../types';
import Button from '../../components/ui/Button';
import { getStatusBadge } from '../../components/ui/Badge';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ArrowRightIcon, CalendarIcon, LayersIcon, UserCheckIcon, WalletIcon } from '../../components/ui/Icons';
import { EmptyPanel, MetricTile, PortalPage, SectionPanel } from '../../components/portal/PortalPage';
import { currency } from '../../utils/format';

// Components
import TutorDetailModal from '../../components/staff/TutorDetailModal';
import ErrorState from '../../components/shared/ErrorState';

function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function sessionDateKey(session: LearningSessionResponse) {
  return session.session_date.slice(0, 10);
}

function timeRange(start?: string, end?: string) {
  return `${start?.slice(0, 5) || '--:--'} - ${end?.slice(0, 5) || '--:--'}`;
}

function getStatusColorClass(status: string) {
  switch (status) {
    case 'PENDING_REVIEW':
    case 'TUTOR_RECRUITING':
    case 'PENDING':
    case 'REFUND_PENDING':
      return 'border-warning-500';
    case 'ENROLLING':
    case 'SCHEDULED':
      return 'border-primary-500';
    case 'READY':
    case 'VERIFIED':
    case 'COMPLETED':
    case 'SUCCEEDED':
      return 'border-success-500';
    case 'REJECTED':
    case 'FAILED':
    case 'CANCELLED':
    case 'NO_SHOW':
      return 'border-danger-500';
    default:
      return 'border-transparent';
  }
}

export default function StaffDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [pendingTutors, setPendingTutors] = useState<TutorPublicResponse[]>([]);
  const [classes, setClasses] = useState<CourseClassResponse[]>([]);
  const [payments, setPayments] = useState<PaymentResponse[]>([]);
  const [sessions, setSessions] = useState<LearningSessionResponse[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PrivateRequestResponse[]>([]);
  const [selectedTutor, setSelectedTutor] = useState<TutorPublicResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openingRequestThread, setOpeningRequestThread] = useState<number | null>(null);

  const handleOpenRequestThread = async (reqId: number) => {
    if (openingRequestThread) return;
    setOpeningRequestThread(reqId);
    try {
      const thread = await messageApi.ensureThread({ private_request_id: reqId });
      navigate(`/staff/messages?threadId=${thread.id}`);
    } catch (err) {
      toast('error', 'Không thể mở hộp thoại tin nhắn cho yêu cầu này.');
    } finally {
      setOpeningRequestThread(null);
    }
  };

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([
      staffApi.getPendingTutors(),
      classApi.list(),
      paymentApi.list(),
      scheduleApi.listSessions(),
      staffApi.getPendingPrivateRequests(),
    ])
      .then(([tutorList, classList, paymentList, sessionList, requestsList]) => {
        setPendingTutors(tutorList);
        setClasses(classList);
        setPayments(paymentList);
        setSessions(sessionList);
        setPendingRequests(requestsList);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(true);
        setLoading(false);
        toast('error', 'Không thể đồng bộ dữ liệu vận hành');
      });
  };

  useEffect(load, []);

  if (user?.role === 'SUPER_ADMIN') {
    return <AdminDashboard />;
  }

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <PortalPage title="Tổng quan vận hành" description="Không thể kết nối dịch vụ">
        <ErrorState onRetry={load} />
      </PortalPage>
    );
  }

  const coordinationClasses = classes.filter((course) => ['DRAFT', 'TUTOR_RECRUITING', 'ENROLLING', 'READY'].includes(course.status));
  const tutorRecruitingClasses = coordinationClasses.filter((course) => course.status === 'TUTOR_RECRUITING');
  const enrollingClasses = coordinationClasses.filter((course) => course.status === 'ENROLLING');
  const readyToStartClasses = coordinationClasses.filter((course) => course.status === 'READY');
  const paymentQueue = payments.filter((payment) => ['CREATED', 'PENDING', 'REFUND_PENDING'].includes(payment.status));

  const todayStr = localDateKey();
  const sessionsToday = sessions.filter((s) => sessionDateKey(s) === todayStr);
  const attendanceDueSessions = sessions.filter((s) => s.status === 'SCHEDULED' && sessionDateKey(s) <= todayStr);
  const upcomingSessions = sessions.filter((s) => s.status === 'SCHEDULED' && sessionDateKey(s) > todayStr);

  return (
    <PortalPage
      title="Tổng quan vận hành"
      description="Hàng chờ công việc hàng ngày của nhân viên vận hành."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
            Tải lại
          </Button>
          <Link to="/staff/tutors/verify">
            <Button>
              Duyệt gia sư <ArrowRightIcon className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      }
    >
      {/* Hero metrics */}
      <div className="grid gap-4 md:grid-cols-4 stagger-grid">
        <MetricTile
          icon={UserCheckIcon}
          label="Gia sư chờ duyệt"
          value={pendingTutors.length}
          hint="Cần xác minh hồ sơ mới."
          href="/staff/tutors/verify"
          tone={pendingTutors.length > 0 ? 'warning' : 'success'}
        />
        <MetricTile
          icon={LayersIcon}
          label="Lớp cần điều phối"
          value={coordinationClasses.length}
          hint={`${tutorRecruitingClasses.length} tuyển GS · ${enrollingClasses.length} tuyển HV · ${readyToStartClasses.length} sẵn sàng`}
          href="/staff/classes"
          tone="neutral"
        />
        <MetricTile
          icon={CalendarIcon}
          label="Buổi cần điểm danh"
          value={attendanceDueSessions.length}
          hint={`${sessionsToday.length} ca hôm nay · ${upcomingSessions.length} sắp tới`}
          href="/staff/schedules"
          tone={attendanceDueSessions.length > 0 ? 'warning' : 'neutral'}
        />
        <MetricTile
          icon={WalletIcon}
          label="Thanh toán chờ"
          value={paymentQueue.length}
          hint="Cần kiểm duyệt giao dịch."
          href="/staff/payments"
          tone={paymentQueue.length > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3 lg:grid-cols-2 mt-6 stagger-grid">
        {/* Pending Requests */}
        <SectionPanel
          title="Yêu cầu 1-1 mới"
          description={`${pendingRequests.length} yêu cầu đang chờ phản hồi.`}
          action={
            <Link to="/staff/messages">
              <Button variant="ghost" size="sm">
                Xử lý
              </Button>
            </Link>
          }
        >
          {pendingRequests.length === 0 ? (
            <EmptyPanel title="Không có yêu cầu 1-1 mới" description="Hệ thống đã xử lý hết các yêu cầu." />
          ) : (
            <div className="flex flex-col gap-1 mt-2">
              {pendingRequests.slice(0, 5).map((req) => {
                const isCurrentOpening = openingRequestThread === req.id;
                return (
                  <div
                    key={req.id}
                    onClick={() => handleOpenRequestThread(req.id)}
                    className="group flex items-center justify-between gap-3 rounded-lg border-l-4 border-warning-500 p-2.5 transition-colors hover:bg-surface-secondary cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary transition-colors group-hover:text-primary-700">{req.subject_name} - {req.grade_level}</p>
                      <p className="text-xs text-text-secondary">
                        <span className="font-medium text-text-primary">{req.student_name}</span> chọn GS <span className="font-medium text-primary-600">{req.tutor_name}</span>
                      </p>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className={`transition-opacity ${isCurrentOpening ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      loading={isCurrentOpening}
                    >
                      {isCurrentOpening ? 'Đang mở' : 'Xem'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </SectionPanel>



        {/* Today's Sessions */}
        <SectionPanel
          title="Lịch cần theo dõi hôm nay"
          description={`${sessionsToday.length} ca hôm nay · ${attendanceDueSessions.length} buổi cần điểm danh.`}
          action={
            <Link to="/staff/schedules">
              <Button variant="ghost" size="sm">
                Mở lịch vận hành
              </Button>
            </Link>
          }
        >
          {sessionsToday.length === 0 ? (
            <EmptyPanel title="Không có ca học nào" description="Hôm nay không có lịch học nào diễn ra." />
          ) : (
            <div className="flex flex-col gap-1 mt-2">
              {sessionsToday.slice(0, 5).map((session) => {
                const title = session.private_request_id
                  ? session.private_request_title || `Học 1-1 #${session.private_request_id}`
                  : session.class_title || `Lớp #${session.class_id}`;
                return (
                  <div
                    key={session.id}
                    onClick={() => navigate(`/staff/schedules?search=${title}`)}
                    className={`group flex items-center justify-between gap-3 rounded-lg border-l-4 ${getStatusColorClass(session.status)} p-2.5 transition-colors hover:bg-surface-secondary cursor-pointer`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary transition-colors group-hover:text-primary-700">{title}</p>
                      <p className="text-xs text-text-secondary">
                        {timeRange(session.start_time, session.end_time)} · GS: {session.tutor_name || `ID #${session.tutor_id}`}
                      </p>
                    </div>
                    {getStatusBadge(session.status)}
                  </div>
                );
              })}
            </div>
          )}
        </SectionPanel>

        {/* Payment Queue */}
        <SectionPanel
          title="Giao dịch thanh toán chờ duyệt"
          description={`${paymentQueue.length} hóa đơn chưa chốt.`}
          action={
            <Link to="/staff/payments">
              <Button variant="ghost" size="sm">
                Ví tài chính
              </Button>
            </Link>
          }
        >
          {paymentQueue.length === 0 ? (
            <EmptyPanel title="Hàng chờ thanh toán trống" description="Không có giao dịch thanh toán nào đang chờ." />
          ) : (
            <div className="flex flex-col gap-1 mt-2">
              {paymentQueue.slice(0, 5).map((payment) => (
                <div
                  key={payment.id}
                  onClick={() => navigate(`/staff/payments?search=${payment.transfer_content || payment.id}`)}
                  className={`group flex items-center justify-between gap-3 rounded-lg border-l-4 ${getStatusColorClass(payment.status)} p-2.5 transition-colors hover:bg-surface-secondary cursor-pointer`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary transition-colors group-hover:text-primary-700">{currency(payment.amount)}</p>
                    <p className="text-xs text-text-secondary">
                      {payment.target_type === 'PRIVATE_TUTORING_REQUEST' ? 'Dạy 1-1' : 'Lớp nhóm'} · {payment.transfer_content || 'Giao dịch chuyển khoản'}
                    </p>
                  </div>
                  {getStatusBadge(payment.status)}
                </div>
              ))}
            </div>
          )}
        </SectionPanel>
      </div>

      {selectedTutor && (
        <TutorDetailModal
          tutor={selectedTutor}
          onClose={() => setSelectedTutor(null)}
          onUpdated={() => {
            setSelectedTutor(null);
            load();
          }}
        />
      )}
    </PortalPage>
  );
}
