import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { classApi, extractErrorMessage, messageApi, privateRequestApi, scheduleApi, subjectApi, tutorApi } from '../../services/api';
import type {
  CourseClassResponse,
  LearningSessionResponse,
  PrivateRequestResponse,
  QualificationResponse,
  SubjectResponse,
  TutorAvailabilityResponse,
  TutorProfileResponse,
  TutorSubjectResponse,
} from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { getStatusBadge } from '../../components/ui/Badge';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import {
  ArrowRightIcon,
  BookOpenIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClipboardCheckIcon,
  MessageCircleIcon,
  ShieldCheckIcon,
  UserCheckIcon,
  UsersIcon,
  WalletIcon,
} from '../../components/ui/Icons';
import Avatar from '../../components/ui/Avatar';
import { MetricTile } from '../../components/portal/PortalPage';
import ConfirmRequestModal from '../../components/messages/ConfirmRequestModal';

type IconType = ComponentType<{ className?: string }>;

function formatMoney(value: string | number | null | undefined) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}


function teachingModeLabel(mode: string | null | undefined) {
  if (mode === 'ONLINE') return 'Trực tuyến';
  if (mode === 'OFFLINE') return 'Trực tiếp';
  if (mode === 'BOTH') return 'Trực tuyến hoặc trực tiếp';
  return 'Chưa rõ';
}

function requestModeLabel(mode: string | null | undefined) {
  if (mode === 'ONLINE') return 'Trực tuyến';
  if (mode === 'OFFLINE') return 'Trực tiếp';
  if (mode === 'BOTH') return 'Linh hoạt';
  return 'Chưa rõ';
}

function getProfileScore(
  profile: TutorProfileResponse | null,
  subjects: TutorSubjectResponse[],
  qualifications: QualificationResponse[],
  availabilities: TutorAvailabilityResponse[],
) {
  const checks = [
    Boolean(profile?.bio),
    Boolean(profile?.qualification_level),
    Number(profile?.years_experience || 0) > 0,
    subjects.length > 0,
    qualifications.length > 0,
    availabilities.length > 0,
    profile?.verification_status === 'VERIFIED',
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export default function TutorDashboard() {
  const { user, tutorProfile } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<TutorProfileResponse | null>(null);
  const [subjects, setSubjects] = useState<TutorSubjectResponse[]>([]);
  const [subjectCatalog, setSubjectCatalog] = useState<SubjectResponse[]>([]);
  const [qualifications, setQualifications] = useState<QualificationResponse[]>([]);
  const [availabilities, setAvailabilities] = useState<TutorAvailabilityResponse[]>([]);
  const [requests, setRequests] = useState<PrivateRequestResponse[]>([]);
  const [classes, setClasses] = useState<CourseClassResponse[]>([]);
  const [sessions, setSessions] = useState<LearningSessionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmRequest, setConfirmRequest] = useState<PrivateRequestResponse | null>(null);
  const [applyingClassId, setApplyingClassId] = useState<number | null>(null);
  const { toast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      tutorApi.getProfile().catch(() => null),
      tutorApi.getSubjects().catch(() => []),
      subjectApi.list().catch(() => []),
      tutorApi.getQualifications().catch(() => []),
      tutorApi.getAvailabilities().catch(() => []),
      privateRequestApi.list().catch(() => []),
      classApi.list({ for_tutor: true }).catch(() => []),
      scheduleApi.listSessions().catch(() => []),
    ]).then(([p, s, allSubjects, q, a, r, c, sessionList]) => {
      setProfile(p);
      setSubjects(s);
      setSubjectCatalog(allSubjects);
      setQualifications(q);
      setAvailabilities(a);
      setRequests(r);
      setClasses(c);
      setSessions(sessionList);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const handleApply = async (course: CourseClassResponse) => {
    setApplyingClassId(course.id);
    try {
      await classApi.apply(course.id, { message: 'Tôi muốn ứng tuyển dạy lớp này.' });
      toast('success', 'Đã gửi ứng tuyển lớp nhóm');
      load();
    } catch (err) {
      toast('error', extractErrorMessage(err));
    } finally {
      setApplyingClassId(null);
    }
  };

  if (loading) return <DashboardSkeleton />;

  const pendingRequests = requests.filter((r) => r.status === 'SENT');
  const recruitingClasses = classes.filter((c) => c.status === 'TUTOR_RECRUITING').slice(0, 4);
  const upcomingSessions = sessions.filter((s) => s.status === 'SCHEDULED').slice(0, 4);
  const profileScore = getProfileScore(profile, subjects, qualifications, availabilities);
  const isVerified = (tutorProfile?.verification_status || profile?.verification_status) === 'VERIFIED';
  const ratingCount = profile?.rating_count || 0;
  const ratingText = ratingCount > 0
    ? `${Number(profile?.average_rating || 0).toFixed(1)} (${ratingCount} đánh giá)`
    : 'Chưa có đánh giá';
  const subjectNameById = new Map(subjectCatalog.map((subject) => [subject.id, subject.name]));

  const metrics: { label: string; value: string | number; icon: IconType }[] = [
    { label: 'Hoàn thiện hồ sơ', value: `${profileScore}%`, icon: UserCheckIcon },
    { label: 'Môn đang dạy', value: subjects.length, icon: BookOpenIcon },
    { label: 'Yêu cầu mới', value: pendingRequests.length, icon: UsersIcon },
    { label: 'Buổi sắp tới', value: upcomingSessions.length, icon: CalendarIcon },
  ];

  return (
    <div className="mx-auto max-w-none w-full animate-slide-up space-y-8">
      {profile && profile.verification_status === 'PENDING_REVIEW' && (
        <div className="rounded-lg bg-primary-50 p-4 border border-primary-200">
          <div className="flex">
            <div className="flex-shrink-0">
              <ShieldCheckIcon className="h-5 w-5 text-primary-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-primary-800">Hồ sơ đang chờ duyệt</h3>
              <div className="mt-2 text-sm text-primary-700">
                <p>Hồ sơ của bạn đã được gửi và đang chờ nhân viên xem xét. Bạn sẽ được thông báo khi có kết quả.</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {profile && (profile.verification_status === 'DRAFT' || profile.verification_status === 'REJECTED') && (
        <div className="rounded-lg bg-warning-50 p-4 border border-warning-200">
          <div className="flex">
            <div className="flex-shrink-0">
              <ShieldCheckIcon className="h-5 w-5 text-warning-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-warning-800">
                {profile.verification_status === 'REJECTED' ? 'Hồ sơ bị từ chối' : 'Hồ sơ chưa gửi duyệt'}
              </h3>
              <div className="mt-2 text-sm text-warning-700">
                <p>
                  {profile.verification_status === 'REJECTED'
                    ? 'Hồ sơ của bạn đã bị từ chối. Vui lòng cập nhật và gửi duyệt lại.'
                    : 'Bạn cần hoàn thiện hồ sơ và gửi duyệt trước khi có thể nhận lớp hoặc yêu cầu học 1-1.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isVerified ? (
        <section className="rounded-lg border border-border-light bg-white p-4 shadow-xs">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              <MetricTile compact icon={CheckCircleIcon} label="Trạng thái hồ sơ" value="Đã xác minh" tone="success" />
              <MetricTile compact icon={BookOpenIcon} label="Môn đang dạy" value={subjects.length} />
              <MetricTile compact icon={UserCheckIcon} label="Đánh giá" value={ratingText} tone={ratingCount > 0 ? 'warning' : 'neutral'} />
              <MetricTile compact icon={UsersIcon} label="Cần phản hồi" value={`${pendingRequests.length} yêu cầu mới`} tone={pendingRequests.length > 0 ? 'warning' : 'neutral'} />
              <MetricTile compact icon={CalendarIcon} label="Sắp tới" value={`${upcomingSessions.length} buổi`} tone="primary" />
            </div>
            <Link to="/tutor/profile" className="shrink-0">
              <Button variant="outline" size="sm">
                Xem hồ sơ <ArrowRightIcon className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-lg bg-text-primary p-6 text-white shadow-xl md:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-medium text-primary-200">Tổng quan gia sư</p>
                <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-balance">
                  Xây hồ sơ gia sư đủ tin cậy để được chọn nhanh hơn.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
                  Xem nhanh hồ sơ, lịch dạy, lớp đang tuyển và các việc cần phản hồi mà không phải mở từng module rời rạc.
                </p>
              </div>
              <div className="shrink-0 rounded-lg border border-white/12 bg-white/8 p-4">
                <p className="text-xs text-white/55">Trạng thái hồ sơ</p>
                <div className="mt-2">{getStatusBadge(tutorProfile?.verification_status || profile?.verification_status || 'DRAFT')}</div>
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-lg bg-white p-4 text-text-primary">
                  <metric.icon className="h-5 w-5 text-primary-800" />
                  <p className="mt-3 text-2xl font-semibold">{metric.value}</p>
                  <p className="text-xs text-text-tertiary">{metric.label}</p>
                </div>
              ))}
            </div>
          </div>

          <Card padding="lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Xem trước hồ sơ</h2>
                <p className="text-sm text-text-secondary">Cách học viên nhìn thấy hồ sơ của bạn.</p>
              </div>
              <Link to="/tutor/profile">
                <Button variant="ghost" size="sm">
                  Sửa hồ sơ <ArrowRightIcon className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="mt-6 rounded-lg border border-border-light bg-[#fbfaf6] p-5">
              <div className="flex items-start gap-4">
                <Avatar name={user?.full_name || 'Gia sư Lumin'} src={user?.avatar_url || undefined} size="xl" shape="square" />
                <div>
                  <h3 className="text-lg font-semibold">{profile?.qualification_level || 'Gia sư Lumin'}</h3>
                  <p className="text-sm text-text-secondary">
                    {profile?.years_experience || 0} năm kinh nghiệm · {teachingModeLabel(profile?.teaching_mode)}
                  </p>
                  <p className="mt-1 text-sm text-text-tertiary">
                    {profile?.teaching_area || 'Chưa khai báo khu vực'}
                  </p>
                </div>
              </div>
              <p className="mt-5 line-clamp-3 text-sm leading-6 text-text-secondary">
                {profile?.bio || 'Thêm phần giới thiệu ngắn về phong cách giảng dạy, kết quả từng hỗ trợ và thế mạnh môn học để hồ sơ chuyên nghiệp hơn.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {subjects.slice(0, 4).map((subject) => (
                  <span key={subject.id} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-text-secondary">
                    {subject.subject_name || `Môn #${subject.subject_id}`} · {formatMoney(subject.fee_per_session)}
                  </span>
                ))}
                {subjects.length === 0 && (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-text-tertiary">Chưa thêm môn dạy</span>
                )}
              </div>
            </div>
          </Card>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card padding="lg">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Yêu cầu 1-1 mới</h2>
              <p className="text-sm text-text-secondary">Ưu tiên phản hồi sớm để giữ trải nghiệm học viên.</p>
            </div>
            <Link to="/tutor/opportunities">
              <Button variant="ghost" size="sm">Xử lý</Button>
            </Link>
          </div>

          <div className="space-y-3">
            {pendingRequests.slice(0, 4).map((req) => (
              <article key={req.id} className="rounded-lg border border-border-light p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-text-primary">{req.student_name || `Học viên #${req.student_account_id}`}</h3>
                      {req.subject_name && (
                        <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
                          {req.subject_name}
                        </span>
                      )}
                      {getStatusBadge(req.status)}
                    </div>
                    <p className="mt-1 text-sm text-text-secondary">
                      {req.grade_level} · {req.requested_sessions} buổi · {requestModeLabel(req.mode)}
                    </p>
                    {req.goal && (
                      <div className="mt-3">
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-tertiary">Mục tiêu</p>
                        <p className="line-clamp-2 text-sm leading-6 text-text-secondary">{req.goal}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<MessageCircleIcon className="h-4 w-4" />}
                      onClick={() => handleOpenRequestThread(req)}
                    >
                      Trao đổi
                    </Button>
                    <Button
                      size="sm"
                      icon={<ClipboardCheckIcon className="h-4 w-4" />}
                      onClick={() => setConfirmRequest(req)}
                    >
                      Xác nhận
                    </Button>
                  </div>
                </div>
              </article>
            ))}
            {pendingRequests.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-6">
                <UsersIcon className="h-8 w-8 text-primary-800" />
                <h3 className="mt-4 font-semibold">Không có yêu cầu mới</h3>
                <p className="mt-1 text-sm text-text-secondary">Khi học viên gửi yêu cầu 1-1, bạn sẽ thấy tại đây.</p>
              </div>
            )}
          </div>
        </Card>

        <Card padding="lg">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Cơ hội lớp nhóm</h2>
              <p className="text-sm text-text-secondary">Các lớp đang tuyển gia sư phù hợp với năng lực đã duyệt.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {recruitingClasses.map((course) => (
              <article key={course.id} className="rounded-lg border border-border-light bg-[#fbfaf6] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-text-primary">{course.title}</h3>
                  <span className="rounded-full border border-primary-200 bg-white px-2.5 py-1 text-xs font-bold text-primary-700">
                    {subjectNameById.get(course.subject_id) || `Môn #${course.subject_id}`}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  {course.grade_level} · {course.total_sessions} buổi · {formatMoney(course.fee_per_session_per_student)}/học viên
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-text-tertiary">{course.mode === 'ONLINE' ? 'Trực tuyến' : course.location || 'Trực tiếp'}</span>
                  {getStatusBadge(course.status)}
                </div>
                {(course.start_date || course.end_date) && (
                  <p className="mt-2 text-xs text-text-tertiary">
                    📅 {course.start_date ? new Date(course.start_date).toLocaleDateString('vi-VN') : '?'}
                    {' — '}
                    {course.end_date ? new Date(course.end_date).toLocaleDateString('vi-VN') : '?'}
                  </p>
                )}
                <Button
                  className="mt-4 w-full"
                  size="sm"
                  loading={applyingClassId === course.id}
                  onClick={() => handleApply(course)}
                >
                  Ứng tuyển lớp này
                </Button>
              </article>
            ))}
            {recruitingClasses.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-6 md:col-span-2">
                <ClipboardCheckIcon className="h-8 w-8 text-primary-800" />
                <h3 className="mt-4 font-semibold">Chưa có lớp phù hợp</h3>
                <p className="mt-1 text-sm text-text-secondary">Hoàn thiện môn dạy và lịch rảnh để tăng khả năng được gợi ý cho lớp mới.</p>
              </div>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {[
          { title: 'Bổ sung chứng chỉ', desc: `${qualifications.length} chứng chỉ trong hồ sơ`, icon: ShieldCheckIcon, href: '/tutor/qualifications' },
          { title: 'Cập nhật lịch rảnh', desc: `${availabilities.length} khung giờ đã khai báo`, icon: CalendarIcon, href: '/tutor/availability' },
          { title: 'Theo dõi lớp và môn dạy', desc: `${subjects.length} môn đang trong hồ sơ dạy`, icon: WalletIcon, href: '/tutor/teaching' },
        ].map((item) => (
          <Link key={item.title} to={item.href}>
            <Card hover padding="lg" className="h-full hover:-translate-y-0.5 hover:shadow-md">
              <item.icon className="h-6 w-6 text-primary-800" />
              <h3 className="mt-5 font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{item.desc}</p>
            </Card>
          </Link>
        ))}
      </section>

      <ConfirmRequestModal
        request={confirmRequest}
        onClose={() => setConfirmRequest(null)}
        onConfirmed={(updatedRequest) => {
          setConfirmRequest(null);
          setRequests((current) => current.map((item) => item.id === updatedRequest.id ? updatedRequest : item));
          load();
        }}
      />
    </div>
  );
}
