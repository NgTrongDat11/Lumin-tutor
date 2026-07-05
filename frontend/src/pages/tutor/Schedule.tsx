import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { scheduleApi, tutorApi } from '../../services/api';
import type { LearningSessionResponse, PrivateRequestResponse, TutorAvailabilityResponse } from '../../types';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Textarea from '../../components/ui/Textarea';
import { getStatusBadge } from '../../components/ui/Badge';
import { ScheduleSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { BookOpenIcon, CalendarIcon, ClockIcon, InfoIcon, LinkIcon, LocationMarkerIcon, UserCheckIcon, UsersIcon } from '../../components/ui/Icons';
import { CalendarPlanner, EmptyPanel, MetricTile, PortalPage, SectionPanel, type WeekEvent } from '../../components/portal/PortalPage';
import { LearningLocationValue } from '../../components/learning/LearningLocationValue';
import UpdateLocationModal from '../../components/messages/UpdateLocationModal';
import { appDayFromDate } from '../../utils/days';
import { formatDate } from '../../utils/format';
import { dateFromDateString, startOfDay } from '../../utils/date';

type ScheduleTab = 'teaching';
type AttendanceStatus = 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';

const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  COMPLETED: 'Hoàn thành',
  NO_SHOW: 'Vắng mặt',
  CANCELLED: 'Hủy buổi',
};

const attendanceOptions: { value: AttendanceStatus; label: string; description: string; tone: string }[] = [
  {
    value: 'COMPLETED',
    label: 'Hoàn thành',
    description: 'Buổi học diễn ra bình thường và có thể ghi nhận hoàn tất.',
    tone: 'border-success-200 bg-success-50 text-success-800',
  },
  {
    value: 'NO_SHOW',
    label: 'Vắng mặt',
    description: 'Học viên không tham gia buổi học đã lên lịch.',
    tone: 'border-warning-200 bg-warning-50 text-warning-800',
  },
  {
    value: 'CANCELLED',
    label: 'Hủy buổi',
    description: 'Buổi học bị hủy và không tính như một buổi hoàn thành.',
    tone: 'border-danger-100 bg-danger-50 text-danger-700',
  },
];

function timeRange(start?: string, end?: string) {
  return `${start?.slice(0, 5) || '--:--'} - ${end?.slice(0, 5) || '--:--'}`;
}

function modeLabel(mode?: string | null) {
  const map: Record<string, string> = {
    ONLINE: 'Online',
    OFFLINE: 'Trực tiếp',
    BOTH: 'Linh hoạt',
  };
  return mode ? map[mode] || mode : 'Chưa cập nhật';
}

function sessionTypeLabel(session: LearningSessionResponse) {
  if (session.private_request_id) return 'Yêu cầu 1-1';
  return session.class_id ? 'Lớp nhóm' : 'Buổi học';
}

function sessionReference(session: LearningSessionResponse) {
  if (session.private_request_id) return `Yêu cầu #${session.private_request_id}`;
  if (session.class_id) return `Lớp #${session.class_id}`;
  return `Buổi #${session.id}`;
}

function studentSummary(session: LearningSessionResponse) {
  const count = session.student_count ?? session.student_names?.length ?? 0;
  if (session.student_names?.length) {
    const visibleNames = session.student_names.slice(0, 2).join(', ');
    const moreCount = Math.max(session.student_names.length - 2, 0);
    return moreCount > 0 ? `${visibleNames} +${moreCount}` : visibleNames;
  }
  if (count > 0) return `${count} học viên`;
  return session.class_id ? 'Chưa có học viên đã thanh toán' : 'Chưa cập nhật học viên';
}

function progressLabel(session: LearningSessionResponse) {
  const sessionNumber = session.session_number ? `Buổi ${session.session_number}` : 'Chưa rõ buổi';
  return session.target_total_sessions ? `${sessionNumber}/${session.target_total_sessions}` : sessionNumber;
}

function sessionTitle(session: LearningSessionResponse) {
  return session.private_request_title
    || session.class_title
    || (session.private_request_id ? `Yêu cầu 1-1 #${session.private_request_id}` : `Lớp #${session.class_id || '--'}`);
}

function canMarkAttendance(session: LearningSessionResponse) {
  if (session.status !== 'SCHEDULED') return false;
  return dateFromDateString(session.session_date) <= startOfDay(new Date());
}

function sortSessionsByTime(list: LearningSessionResponse[]) {
  return [...list].sort((a, b) => {
    const dateDiff = dateFromDateString(a.session_date).getTime() - dateFromDateString(b.session_date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.start_time.localeCompare(b.start_time);
  });
}

function formatDateHeading(dateValue: string) {
  return dateFromDateString(dateValue).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function groupSessionsByDate(list: LearningSessionResponse[]) {
  return sortSessionsByTime(list).reduce<Array<{ date: string; label: string; sessions: LearningSessionResponse[] }>>((groups, session) => {
    const date = session.session_date.split('T')[0];
    const current = groups[groups.length - 1];
    if (current?.date === date) {
      current.sessions.push(session);
    } else {
      groups.push({ date, label: formatDateHeading(session.session_date), sessions: [session] });
    }
    return groups;
  }, []);
}

export default function TutorSchedule({ initialTab = 'teaching' }: { initialTab?: ScheduleTab }) {
  void initialTab;
  const [sessions, setSessions] = useState<LearningSessionResponse[]>([]);
  const [availabilities, setAvailabilities] = useState<TutorAvailabilityResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [attendanceSession, setAttendanceSession] = useState<LearningSessionResponse | null>(null);
  const [selectedSession, setSelectedSession] = useState<LearningSessionResponse | null>(null);
  const [locationSession, setLocationSession] = useState<LearningSessionResponse | null>(null);
  const { toast } = useToast();

  const load = () => {
    Promise.all([
      scheduleApi.listSessions().catch(() => []),
      tutorApi.getAvailabilities().catch(() => []),
    ]).then(([sessionList, availabilityList]) => {
      setSessions(sessionList);
      setAvailabilities(availabilityList);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const scheduledSessions = useMemo(() => sessions.filter((session) => session.status === 'SCHEDULED'), [sessions]);
  const dueScheduledSessions = useMemo(() => scheduledSessions.filter(canMarkAttendance), [scheduledSessions]);
  const futureScheduledSessions = useMemo(() => scheduledSessions.filter((session) => !canMarkAttendance(session)), [scheduledSessions]);
  const completedSessions = useMemo(() => sessions.filter((session) => session.status === 'COMPLETED'), [sessions]);
  const attendanceHistorySessions = useMemo(() => sessions.filter((session) => session.status !== 'SCHEDULED'), [sessions]);
  const dueSessionGroups = useMemo(() => groupSessionsByDate(dueScheduledSessions), [dueScheduledSessions]);
  const futureSessionGroups = useMemo(() => groupSessionsByDate(futureScheduledSessions), [futureScheduledSessions]);
  const historySessionGroups = useMemo(() => groupSessionsByDate(attendanceHistorySessions).reverse(), [attendanceHistorySessions]);

  const weekEvents: WeekEvent[] = useMemo(() => {
    return scheduledSessions.map((session) => ({
      id: `session-${session.id}`,
      dayOfWeek: appDayFromDate(session.session_date),
      date: session.session_date,
      title: sessionTitle(session),
      time: timeRange(session.start_time, session.end_time),
      meta: `${sessionTypeLabel(session)} · ${progressLabel(session)}`,
      tone: 'primary',
    }));
  }, [scheduledSessions]);

  const openCalendarSession = (event: WeekEvent) => {
    const sessionId = Number(String(event.id).replace('session-', ''));
    const session = sessions.find((item) => item.id === sessionId);
    if (session) setSelectedSession(session);
  };

  const handleLocationUpdated = (updatedRequest: PrivateRequestResponse) => {
    const nextLocation = updatedRequest.class_location;
    setSessions((current) => current.map((session) => (
      session.private_request_id === updatedRequest.id ? { ...session, location: nextLocation } : session
    )));
    setSelectedSession((current) => (
      current?.private_request_id === updatedRequest.id ? { ...current, location: nextLocation } : current
    ));
    load();
  };

  if (loading) return <ScheduleSkeleton />;

  return (
    <PortalPage
      title="Lịch dạy"
      description="Theo dõi buổi dạy đã lên lịch và xử lý điểm danh đúng thời điểm."
      actions={(
        <Link to="/tutor/availability">
          <Button variant="outline">Cập nhật lịch rảnh</Button>
        </Link>
      )}
    >
      <div className="rounded-lg border border-border-light bg-white p-3 shadow-xs">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile compact icon={UserCheckIcon} label="Cần điểm danh" value={dueScheduledSessions.length} hint="Đã đến ngày học, cần cập nhật kết quả." tone={dueScheduledSessions.length > 0 ? 'warning' : 'success'} />
          <MetricTile compact icon={CalendarIcon} label="Sắp diễn ra" value={futureScheduledSessions.length} hint="Các buổi đã lên lịch trong tương lai." tone="primary" />
          <MetricTile compact icon={ClockIcon} label="Khung giờ rảnh" value={availabilities.length} hint="Dùng để gợi ý và ghép lịch, không tự đổi buổi học đã chốt." tone="success" />
          <MetricTile compact icon={UserCheckIcon} label="Đã hoàn thành" value={completedSessions.length} hint="Tổng buổi đã được điểm danh hoàn thành." tone="neutral" />
        </div>
      </div>

      <div className="space-y-6">
        <SectionPanel title="Lịch dạy" description="Chuyển tuần hoặc tháng để xem các buổi đã lên lịch theo ngày thực tế.">
          <CalendarPlanner events={weekEvents} emptyText="Trống" onEventClick={openCalendarSession} />
        </SectionPanel>

        <SectionPanel title="Cần điểm danh" description="Các buổi đã đến ngày học và đang chờ cập nhật kết quả.">
          {dueSessionGroups.length === 0 ? (
            <EmptyPanel title="Không có buổi cần điểm danh" description="Các buổi đã điểm danh sẽ nằm trong lịch sử bên dưới." />
          ) : (
            <div className="space-y-5">
              {dueSessionGroups.map((group) => (
                <div key={group.date} className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2">
                    <h3 className="text-sm font-semibold capitalize text-text-primary">{group.label}</h3>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-text-secondary">{group.sessions.length} buổi</span>
                  </div>
                  <div className="space-y-3">
                    {group.sessions.map((session) => {
                      const canAttend = canMarkAttendance(session);
                      return (
                        <SessionSummaryCard
                          key={session.id}
                          session={session}
                          tone="warning"
                          onViewDetails={() => setSelectedSession(session)}
                          action={(
                            <span title={canAttend ? 'Cập nhật điểm danh buổi học' : 'Chưa đến lúc điểm danh'}>
                              <Button size="sm" onClick={() => setAttendanceSession(session)} disabled={!canAttend}>
                                Điểm danh
                              </Button>
                            </span>
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionPanel>

        <SectionPanel title="Sắp diễn ra" description="Các buổi đã lên lịch nhưng chưa đến ngày điểm danh.">
          {futureSessionGroups.length === 0 ? (
            <EmptyPanel title="Chưa có buổi sắp diễn ra" description="Khi nhân viên tạo lịch học mới, các buổi tương lai sẽ xuất hiện tại đây." />
          ) : (
            <div className="space-y-5">
              {futureSessionGroups.map((group) => (
                <div key={group.date} className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2">
                    <h3 className="text-sm font-semibold capitalize text-text-primary">{group.label}</h3>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-text-secondary">{group.sessions.length} buổi</span>
                  </div>
                  <div className="space-y-3">
                    {group.sessions.map((session) => (
                      <SessionSummaryCard
                        key={session.id}
                        session={session}
                        onViewDetails={() => setSelectedSession(session)}
                        action={(
                          <span className="rounded-full bg-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-secondary">
                            Chưa đến ngày
                          </span>
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionPanel>

        <SectionPanel title="Lịch sử điểm danh" description="Các buổi đã hoàn thành, vắng mặt hoặc đã hủy.">
          {historySessionGroups.length === 0 ? (
            <EmptyPanel title="Chưa có lịch sử điểm danh" description="Sau khi điểm danh, các buổi sẽ chuyển xuống khu vực này." />
          ) : (
            <div className="space-y-5">
              {historySessionGroups.map((group) => (
                <div key={group.date} className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2">
                    <h3 className="text-sm font-semibold capitalize text-text-primary">{group.label}</h3>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-text-secondary">{group.sessions.length} buổi</span>
                  </div>
                  <div className="space-y-3">
                    {group.sessions.map((session) => (
                      <SessionSummaryCard
                        key={session.id}
                        session={session}
                        tone="muted"
                        onViewDetails={() => setSelectedSession(session)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionPanel>
      </div>

      <TutorSessionDetailModal
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        onMarkAttendance={(session) => {
          setSelectedSession(null);
          setAttendanceSession(session);
        }}
        onUpdateLocation={setLocationSession}
      />

      <UpdateLocationModal
        requestId={locationSession?.private_request_id ?? null}
        currentLocation={locationSession?.location}
        onClose={() => setLocationSession(null)}
        onUpdated={handleLocationUpdated}
      />

      <AttendanceModal
        session={attendanceSession}
        onClose={() => setAttendanceSession(null)}
        onSaved={() => {
          setAttendanceSession(null);
          load();
        }}
        toast={toast}
      />
    </PortalPage>
  );
}

function SessionSummaryCard({
  session,
  action,
  tone = 'default',
  onViewDetails,
}: {
  session: LearningSessionResponse;
  action?: ReactNode;
  tone?: 'default' | 'warning' | 'muted';
  onViewDetails: () => void;
}) {
  const toneClass = tone === 'warning'
    ? 'border-warning-200 bg-warning-50/70'
    : tone === 'muted'
      ? 'border-border-light bg-surface-secondary/70'
      : 'border-border-light bg-white';

  return (
    <article className={`rounded-lg border p-4 shadow-xs ${toneClass}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-primary-700">
              <BookOpenIcon className="h-3.5 w-3.5" />
              {sessionTypeLabel(session)}
            </span>
            {getStatusBadge(session.status)}
          </div>
          <h3 className="mt-2 text-base font-bold text-text-primary">{sessionTitle(session)}</h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="h-4 w-4 text-text-tertiary" />
              {formatDate(session.session_date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="h-4 w-4 text-text-tertiary" />
              {timeRange(session.start_time, session.end_time)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UsersIcon className="h-4 w-4 text-text-tertiary" />
              {studentSummary(session)}
            </span>
          </div>
          <p className="mt-2 text-xs font-semibold text-text-tertiary">{progressLabel(session)} · {sessionReference(session)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onViewDetails}>Chi tiết</Button>
          {action}
        </div>
      </div>
    </article>
  );
}

function TutorSessionDetailModal({
  session,
  onClose,
  onMarkAttendance,
  onUpdateLocation,
}: {
  session: LearningSessionResponse | null;
  onClose: () => void;
  onMarkAttendance: (session: LearningSessionResponse) => void;
  onUpdateLocation: (session: LearningSessionResponse) => void;
}) {
  if (!session) return null;
  const canAttend = canMarkAttendance(session);
  const canUpdateLocation = Boolean(session.private_request_id) && session.status === 'SCHEDULED';
  const missingOnlineLocation = session.mode === 'ONLINE' && canUpdateLocation && !session.location?.trim();

  return (
    <Modal
      open
      onClose={onClose}
      title="Chi tiết buổi dạy"
      size="md"
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          {session.status === 'SCHEDULED' && (
            <Button disabled={!canAttend} onClick={() => onMarkAttendance(session)}>Điểm danh</Button>
          )}
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary-600">{sessionTypeLabel(session)}</p>
            <h3 className="mt-1 text-xl font-bold text-text-primary">{sessionTitle(session)}</h3>
          </div>
          {getStatusBadge(session.status)}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <InfoTile icon={<CalendarIcon className="h-4 w-4" />} label="Ngày học" value={formatDate(session.session_date)} />
          <InfoTile icon={<ClockIcon className="h-4 w-4" />} label="Thời gian" value={timeRange(session.start_time, session.end_time)} />
          <InfoTile icon={<BookOpenIcon className="h-4 w-4" />} label="Tiến độ" value={progressLabel(session)} />
          <InfoTile icon={<UsersIcon className="h-4 w-4" />} label="Học viên" value={studentSummary(session)} />
        </div>

        <div className="overflow-hidden rounded-lg border border-border-light divide-y divide-border-light">
          <DetailRow icon={<InfoIcon className="h-4 w-4" />} label="Mã tham chiếu" value={sessionReference(session)} />
          <DetailRow icon={<LocationMarkerIcon className="h-4 w-4" />} label="Hình thức" value={modeLabel(session.mode)} />
          {(session.location || canUpdateLocation) && (
            <DetailRow
              icon={<LocationMarkerIcon className="h-4 w-4" />}
              label="Phòng/link/địa điểm"
              value={(
                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                  {session.location ? (
                    <LearningLocationValue value={session.location} />
                  ) : (
                    <span className="text-sm font-semibold text-warning-700">Chưa cập nhật</span>
                  )}
                  {canUpdateLocation && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<LinkIcon className="h-4 w-4" />}
                      onClick={() => onUpdateLocation(session)}
                    >
                      Đổi link
                    </Button>
                  )}
                </span>
              )}
            />
          )}
          {session.target_goal && <DetailRow icon={<InfoIcon className="h-4 w-4" />} label="Mục tiêu" value={session.target_goal} />}
        </div>

        {missingOnlineLocation && (
          <div className="rounded-lg border border-warning-100 bg-warning-50 p-3 text-sm font-semibold text-warning-800">
            Buổi học online chưa có link phòng học.
          </div>
        )}

        {session.attendance_note && (
          <div className="rounded-lg border border-warning-100 bg-warning-50 p-3 text-sm text-warning-800">
            {session.attendance_note}
          </div>
        )}
      </div>
    </Modal>
  );
}

function InfoTile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border-light bg-surface-secondary p-3">
      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-primary-700 shadow-xs">{icon}</div>
      <p className="text-xs font-bold uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-1 text-sm font-bold text-text-primary">{value}</p>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-white px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-text-secondary">{icon}{label}</span>
      <span className="text-right text-sm font-bold text-text-primary">{value}</span>
    </div>
  );
}
function AttendanceModal({
  session,
  onClose,
  onSaved,
  toast,
}: {
  session: LearningSessionResponse | null;
  onClose: () => void;
  onSaved: () => void;
  toast: (t: 'success' | 'error', m: string) => void;
}) {
  const [status, setStatus] = useState<AttendanceStatus>('COMPLETED');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session) return;
    setStatus('COMPLETED');
    setNote(session.attendance_note || '');
  }, [session]);

  const handleSubmit = async () => {
    if (!session) return;
    setSaving(true);
    try {
      await scheduleApi.updateAttendance(session.id, {
        status,
        note: note.trim() || undefined,
      });
      toast('success', `Đã cập nhật: ${attendanceStatusLabels[status]}`);
      onSaved();
    } catch {
      toast('error', 'Cập nhật thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(session)}
      onClose={onClose}
      title="Điểm danh buổi học"
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button loading={saving} onClick={handleSubmit}>Lưu điểm danh</Button>
        </>
      )}
    >
      {session && (
        <div className="space-y-5">
          <div className="rounded-lg bg-surface-secondary p-4">
            <p className="font-semibold text-text-primary">{sessionTitle(session)}</p>
            <p className="mt-1 text-sm text-text-secondary">
              {formatDate(session.session_date)} · {timeRange(session.start_time, session.end_time)} · Buổi {session.session_number || '--'}
            </p>
          </div>

          <div className="space-y-2">
            {attendanceOptions.map((option) => {
              const selected = status === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all ${
                    selected ? option.tone : 'border-border-light bg-white hover:bg-surface-secondary'
                  }`}
                >
                  <input
                    type="radio"
                    name="attendance-status"
                    value={option.value}
                    checked={selected}
                    onChange={() => setStatus(option.value)}
                    className="mt-1 h-4 w-4 accent-primary-700"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-1 block text-xs leading-5 opacity-80">{option.description}</span>
                  </span>
                </label>
              );
            })}
          </div>

          <Textarea
            label="Ghi chú (tùy chọn)"
            placeholder="VD: Học viên xin nghỉ, dời sang tuần sau"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}
