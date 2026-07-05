import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { scheduleApi } from '../../services/api';
import type { LearningSessionResponse } from '../../types';
import { ScheduleSkeleton } from '../../components/ui/Skeleton';
import { ClockIcon, ArrowRightIcon, CalendarIcon } from '../../components/ui/Icons';
import Button from '../../components/ui/Button';
import { getStatusBadge } from '../../components/ui/Badge';
import { SessionDetailModal } from '../../components/learning/SessionDetailModal';

type ViewMode = 'WEEK' | 'MONTH';

function getStartOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfMonth(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfMonth(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getPeriod(timeStr: string) {
  const [hours] = timeStr.split(':').map(Number);
  if (hours < 12) return 0;
  if (hours < 17 || (hours === 17 && timeStr < '17:30')) return 1;
  return 2;
}

function getSessionDate(sessionDate: string) {
  return new Date(`${sessionDate}T00:00:00`);
}

function getSessionDateTime(session: LearningSessionResponse) {
  return new Date(`${session.session_date}T${session.start_time}`);
}

function isPastSessionDate(sessionDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return getSessionDate(sessionDate) < today;
}

function isAttendanceNeededSession(session: LearningSessionResponse) {
  return session.status === 'SCHEDULED' && isPastSessionDate(session.session_date);
}

function isSameDate(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function getSessionTitle(session: LearningSessionResponse) {
  return session.class_title || session.private_request_title || (session.private_request_id ? 'Yêu cầu 1-1' : `Buổi học #${session.session_number}`);
}

function getSessionTypeLabel(session: LearningSessionResponse) {
  if (session.private_request_id) return 'Buổi 1-1';
  return session.class_id ? 'Lớp nhóm' : 'Buổi học';
}

function formatSessionTime(session: LearningSessionResponse) {
  return `${session.start_time.slice(0, 5)} - ${session.end_time.slice(0, 5)}`;
}

function formatSessionDate(session: LearningSessionResponse) {
  return getSessionDate(session.session_date).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

function formatMonthTitle(date: Date) {
  return date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
}

const PERIODS = ['Sáng', 'Chiều', 'Tối'];
const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

export default function StudentSchedule() {
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState<LearningSessionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('WEEK');
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getStartOfWeek(new Date()));
  const [currentMonthStart, setCurrentMonthStart] = useState<Date>(getStartOfMonth(new Date()));
  const [selectedSession, setSelectedSession] = useState<LearningSessionResponse | null>(null);
  const highlightedSessionId = Number(searchParams.get('sessionId'));

  useEffect(() => {
    scheduleApi.listSessions()
      .then((data) => setSessions(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!Number.isFinite(highlightedSessionId) || highlightedSessionId <= 0 || sessions.length === 0) return;
    const targetSession = sessions.find((session) => session.id === highlightedSessionId);
    if (!targetSession) return;

    const targetDate = getSessionDate(targetSession.session_date);
    setViewMode('WEEK');
    setCurrentWeekStart(getStartOfWeek(targetDate));
    setCurrentMonthStart(getStartOfMonth(targetDate));
  }, [highlightedSessionId, sessions]);

  useEffect(() => {
    if (!Number.isFinite(highlightedSessionId) || highlightedSessionId <= 0 || loading) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`session-${highlightedSessionId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [currentWeekStart, highlightedSessionId, loading, viewMode]);

  const weekEnd = useMemo(() => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [currentWeekStart]);

  const weekSessions = useMemo(() => {
    return sessions
      .filter((session) => {
        const date = getSessionDate(session.session_date);
        return date >= currentWeekStart && date <= weekEnd;
      })
      .sort((a, b) => getSessionDateTime(a).getTime() - getSessionDateTime(b).getTime());
  }, [currentWeekStart, sessions, weekEnd]);

  const monthEnd = useMemo(() => getEndOfMonth(currentMonthStart), [currentMonthStart]);
  const monthSessions = useMemo(() => {
    return sessions
      .filter((session) => {
        const date = getSessionDate(session.session_date);
        return date >= currentMonthStart && date <= monthEnd;
      })
      .sort((a, b) => getSessionDateTime(a).getTime() - getSessionDateTime(b).getTime());
  }, [currentMonthStart, monthEnd, sessions]);

  const grid = useMemo(() => {
    const nextGrid: LearningSessionResponse[][][] = [
      [[], [], [], [], [], [], []],
      [[], [], [], [], [], [], []],
      [[], [], [], [], [], [], []],
    ];

    weekSessions.forEach((session) => {
      const date = getSessionDate(session.session_date);
      const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
      const period = getPeriod(session.start_time);
      nextGrid[period][dayIndex].push(session);
    });

    return nextGrid;
  }, [weekSessions]);

  const scheduleStats = useMemo(() => {
    const today = new Date();
    const todaySessions = sessions.filter((session) => isSameDate(getSessionDate(session.session_date), today));
    const upcomingWeek = weekSessions.filter((session) => getSessionDateTime(session) >= new Date() && session.status === 'SCHEDULED');
    const attendanceNeeded = weekSessions.filter(isAttendanceNeededSession);

    return {
      today: todaySessions.length,
      week: weekSessions.length,
      month: monthSessions.length,
      upcoming: upcomingWeek.length,
      attendanceNeeded: attendanceNeeded.length,
      nextSession: upcomingWeek[0] ?? null,
    };
  }, [monthSessions.length, sessions, weekSessions]);

  if (loading) return <ScheduleSkeleton />;

  const prevRange = () => {
    if (viewMode === 'WEEK') {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() - 7);
      setCurrentWeekStart(d);
      return;
    }
    const d = new Date(currentMonthStart);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonthStart(getStartOfMonth(d));
  };

  const nextRange = () => {
    if (viewMode === 'WEEK') {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + 7);
      setCurrentWeekStart(d);
      return;
    }
    const d = new Date(currentMonthStart);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonthStart(getStartOfMonth(d));
  };

  const goToday = () => {
    const today = new Date();
    setCurrentWeekStart(getStartOfWeek(today));
    setCurrentMonthStart(getStartOfMonth(today));
  };

  const handleNextSessionClick = () => {
    if (!scheduleStats.nextSession) return;
    if (window.matchMedia('(max-width: 1023px)').matches) {
      scrollToScheduleTarget(`session-${scheduleStats.nextSession.id}`);
      return;
    }
    setSelectedSession(scheduleStats.nextSession);
  };

  return (
    <div className="mx-auto max-w-none w-full animate-slide-up space-y-3">
      <div className="rounded-lg border border-border-light bg-white p-3 shadow-xs">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">Thời khóa biểu</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
              <span>Hôm nay: <strong className="text-text-primary">{scheduleStats.today}</strong></span>
              <span>Tuần: <strong className="text-text-primary">{scheduleStats.week}</strong></span>
              <span>Tháng: <strong className="text-text-primary">{scheduleStats.month}</strong></span>
              <span className={scheduleStats.attendanceNeeded > 0 ? 'font-semibold text-warning-700' : ''}>
                Chờ cập nhật: <strong>{scheduleStats.attendanceNeeded}</strong>
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex items-center gap-1 sm:gap-2">
              <Button variant="outline" size="sm" className="shrink-0 whitespace-nowrap" onClick={goToday}>Hôm nay</Button>
              <button onClick={prevRange} className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-secondary">
                <ArrowRightIcon className="h-5 w-5 rotate-180" />
              </button>
              <span className="min-w-0 flex-1 text-center text-sm font-bold text-text-primary sm:min-w-[190px]">
                {viewMode === 'WEEK'
                  ? `${currentWeekStart.getDate()}/${currentWeekStart.getMonth() + 1} - ${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`
                  : formatMonthTitle(currentMonthStart)}
              </span>
              <button onClick={nextRange} className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-secondary">
                <ArrowRightIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex rounded-xl border border-border-light bg-surface-secondary p-1">
              {(['WEEK', 'MONTH'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                    viewMode === mode ? 'bg-white text-primary-700 shadow-sm' : 'text-text-secondary hover:bg-white/70'
                  }`}
                >
                  {mode === 'WEEK' ? 'Tuần' : 'Tháng'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {scheduleStats.nextSession && (
          <button
            type="button"
            onClick={handleNextSessionClick}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg bg-primary-50 px-3 py-2 text-left text-sm transition-colors hover:bg-primary-100"
          >
            <span className="truncate text-text-secondary">
              <strong className="text-primary-700">Buổi tiếp theo:</strong> {getSessionTitle(scheduleStats.nextSession)} · {formatSessionDate(scheduleStats.nextSession)} · {formatSessionTime(scheduleStats.nextSession)}
            </span>
            <span className="shrink-0 text-xs font-bold text-primary-700">
              <span className="lg:hidden">Tới buổi</span>
              <span className="hidden lg:inline">Chi tiết</span>
            </span>
          </button>
        )}
      </div>

      {viewMode === 'WEEK' ? (
        <>
          <MobileWeekAgenda
            currentWeekStart={currentWeekStart}
            sessions={weekSessions}
            highlightedSessionId={highlightedSessionId}
            onSelectSession={setSelectedSession}
          />
          <div className="hidden lg:block">
            <WeekScheduleGrid
              currentWeekStart={currentWeekStart}
              grid={grid}
              highlightedSessionId={highlightedSessionId}
              onSelectSession={setSelectedSession}
            />
          </div>
        </>
      ) : (
        <>
          <MobileMonthAgenda
            currentMonthStart={currentMonthStart}
            sessions={monthSessions}
            highlightedSessionId={highlightedSessionId}
            onSelectSession={setSelectedSession}
          />
          <div className="hidden lg:block">
            <MonthScheduleCalendar
              currentMonthStart={currentMonthStart}
              sessions={monthSessions}
              highlightedSessionId={highlightedSessionId}
              onSelectSession={setSelectedSession}
            />
          </div>
        </>
      )}

      <SessionDetailModal session={selectedSession} onClose={() => setSelectedSession(null)} />
    </div>
  );
}

function MobileWeekAgenda({
  currentWeekStart,
  sessions,
  highlightedSessionId,
  onSelectSession,
}: {
  currentWeekStart: Date;
  sessions: LearningSessionResponse[];
  highlightedSessionId: number;
  onSelectSession: (session: LearningSessionResponse) => void;
}) {
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(currentWeekStart);
      date.setDate(date.getDate() + index);
      return date;
    });
  }, [currentWeekStart]);

  const sessionsByDate = useMemo(() => groupSessionsByDate(sessions), [sessions]);
  const hasSessions = sessions.length > 0;

  return (
    <div className="space-y-3 lg:hidden">
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2">
          {weekDays.map((day, index) => {
            const dateKey = getDateKey(day);
            const daySessions = sessionsByDate.get(dateKey) ?? [];
            const today = isSameDate(day, new Date());
            const dayLabel = index === 6 ? 'CN' : `T${index + 2}`;
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => scrollToScheduleTarget(`mobile-day-${dateKey}`)}
                aria-label={`Xem lịch ${formatMobileDayTitle(day)}`}
                className={`flex w-16 shrink-0 flex-col items-center rounded-xl border px-2 py-2 text-center transition-colors ${
                  today
                    ? 'border-primary-200 bg-primary-50 text-primary-800'
                    : daySessions.length > 0
                      ? 'border-border-light bg-white text-text-primary'
                      : 'border-border-light bg-surface-secondary text-text-tertiary'
                }`}
              >
                <span className="text-[11px] font-bold uppercase">{dayLabel}</span>
                <span className="mt-0.5 text-lg font-semibold leading-none">{day.getDate()}</span>
                <span className="mt-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-primary-700">
                  {daySessions.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!hasSessions ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-6 text-center shadow-sm">
          <CalendarIcon className="mx-auto mb-3 h-7 w-7 text-text-tertiary" />
          <h3 className="font-bold text-text-primary">Tuần này chưa có buổi học</h3>
          <p className="mt-1 text-sm leading-6 text-text-tertiary">Bạn có thể chuyển tuần hoặc quay lại hôm nay để kiểm tra lịch khác.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {weekDays.map((day) => {
            const dateKey = getDateKey(day);
            const daySessions = sessionsByDate.get(dateKey) ?? [];
            return (
              <section key={dateKey} id={`mobile-day-${dateKey}`} className="rounded-2xl border border-border-light bg-white p-4 shadow-sm scroll-mt-24">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-text-primary">{formatMobileDayTitle(day)}</h2>
                    <p className="text-xs font-medium text-text-tertiary">{daySessions.length} buổi</p>
                  </div>
                  {isSameDate(day, new Date()) && (
                    <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">Hôm nay</span>
                  )}
                </div>

                {daySessions.length === 0 ? (
                  <p className="mt-4 rounded-xl bg-surface-secondary px-3 py-3 text-sm text-text-tertiary">Không có lịch học.</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {daySessions.map((session) => (
                      <MobileSessionCard
                        key={session.id}
                        session={session}
                        highlighted={session.id === highlightedSessionId}
                        onClick={() => onSelectSession(session)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MobileMonthAgenda({
  currentMonthStart,
  sessions,
  highlightedSessionId,
  onSelectSession,
}: {
  currentMonthStart: Date;
  sessions: LearningSessionResponse[];
  highlightedSessionId: number;
  onSelectSession: (session: LearningSessionResponse) => void;
}) {
  const sessionsByDate = useMemo(() => groupSessionsByDate(sessions), [sessions]);
  const calendarDays = useMemo(() => getMonthCalendarDays(currentMonthStart), [currentMonthStart]);
  const activeDates = calendarDays.filter((day) => {
    const dateKey = getDateKey(day);
    return day.getMonth() === currentMonthStart.getMonth() && (sessionsByDate.get(dateKey)?.length ?? 0) > 0;
  });

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white p-6 text-center shadow-sm lg:hidden">
        <CalendarIcon className="mx-auto mb-3 h-7 w-7 text-text-tertiary" />
        <h3 className="font-bold text-text-primary">Tháng này chưa có buổi học</h3>
        <p className="mt-1 text-sm leading-6 text-text-tertiary">Bạn có thể chuyển tháng hoặc quay lại hôm nay để xem lịch khác.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 lg:hidden">
      <div className="grid grid-cols-7 gap-1 rounded-2xl border border-border-light bg-white p-2 shadow-sm">
        {calendarDays.map((day) => {
          const dateKey = getDateKey(day);
          const count = sessionsByDate.get(dateKey)?.length ?? 0;
          const current = day.getMonth() === currentMonthStart.getMonth();
          const today = isSameDate(day, new Date());
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => count > 0 && scrollToScheduleTarget(`mobile-month-${dateKey}`)}
              disabled={count === 0}
              aria-label={`Xem lịch ${formatMobileDayTitle(day)}`}
              className={`flex aspect-square min-w-0 flex-col items-center justify-center rounded-lg text-xs transition-colors ${
                today
                  ? 'bg-primary-600 text-white'
                  : count > 0
                    ? 'bg-primary-50 text-primary-800'
                    : current
                      ? 'text-text-secondary'
                      : 'text-text-tertiary opacity-50'
              }`}
            >
              <span className="font-bold">{day.getDate()}</span>
              {count > 0 && <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${today ? 'bg-white' : 'bg-primary-600'}`} />}
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {activeDates.map((day) => {
          const dateKey = getDateKey(day);
          const daySessions = sessionsByDate.get(dateKey) ?? [];
          return (
            <section key={dateKey} id={`mobile-month-${dateKey}`} className="rounded-2xl border border-border-light bg-white p-4 shadow-sm scroll-mt-24">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-text-primary">{formatMobileDayTitle(day)}</h2>
                <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-bold text-text-secondary">{daySessions.length} buổi</span>
              </div>
              <div className="space-y-2">
                {daySessions.map((session) => (
                  <MobileSessionCard
                    key={session.id}
                    session={session}
                    highlighted={session.id === highlightedSessionId}
                    onClick={() => onSelectSession(session)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MobileSessionCard({
  session,
  highlighted,
  onClick,
}: {
  session: LearningSessionResponse;
  highlighted: boolean;
  onClick: () => void;
}) {
  const isCancelled = session.status === 'CANCELLED' || session.status === 'NO_SHOW';
  const isAttendanceNeeded = isAttendanceNeededSession(session);

  return (
    <button
      type="button"
      onClick={onClick}
      id={`session-${session.id}`}
      className={`w-full scroll-mt-28 rounded-xl border p-3 text-left transition-all ${
        isAttendanceNeeded
          ? 'border-warning-200 bg-warning-50 text-warning-900'
          : isCancelled
            ? 'border-danger-100 bg-danger-50 text-danger-900'
            : session.status === 'COMPLETED'
              ? 'border-success-100 bg-success-50 text-success-800'
              : 'border-primary-100 bg-primary-50 text-primary-900'
      } ${highlighted ? 'ring-2 ring-primary-500 ring-offset-2' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-bold text-text-secondary">
              {PERIODS[getPeriod(session.start_time)]}
            </span>
            <span className="text-xs font-bold text-text-secondary">{getSessionTypeLabel(session)}</span>
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-snug">{getSessionTitle(session)}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-text-secondary">
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="h-3.5 w-3.5" />
              {formatSessionTime(session)}
            </span>
            <span className="truncate">{session.tutor_name || `GS #${session.tutor_id}`}</span>
          </div>
        </div>
        <div className="shrink-0">
          {isAttendanceNeeded ? (
            <span className="inline-flex rounded-full bg-warning-100 px-2 py-0.5 text-[11px] font-bold text-warning-700">
              Chờ cập nhật
            </span>
          ) : (
            getStatusBadge(session.status)
          )}
        </div>
      </div>
    </button>
  );
}

function WeekScheduleGrid({
  currentWeekStart,
  grid,
  highlightedSessionId,
  onSelectSession,
}: {
  currentWeekStart: Date;
  grid: LearningSessionResponse[][][];
  highlightedSessionId: number;
  onSelectSession: (session: LearningSessionResponse) => void;
}) {
  const getDayHeader = (index: number) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + index);
    return d;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border-light bg-white shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-[1040px]">
          <div className="grid grid-cols-[104px_repeat(7,1fr)] border-b border-border-light bg-surface-secondary">
            <div className="flex items-center justify-center border-r border-border-light p-4 font-medium text-text-secondary">
              Ca học
            </div>
            {DAYS.map((day, index) => {
              const date = getDayHeader(index);
              const isToday = isSameDate(date, new Date());
              return (
                <div key={day} className={`border-r border-border-light p-3 text-center last:border-r-0 ${isToday ? 'bg-primary-50' : ''}`}>
                  <div className={`font-bold ${isToday ? 'text-primary-700' : 'text-text-primary'}`}>{day}</div>
                  <div className={`mt-1 text-sm ${isToday ? 'font-medium text-primary-600' : 'text-text-tertiary'}`}>
                    {date.getDate()}/{date.getMonth() + 1}
                  </div>
                </div>
              );
            })}
          </div>

          {PERIODS.map((period, periodIndex) => (
            <div key={period} className="grid grid-cols-[104px_repeat(7,1fr)] border-b border-border-light last:border-b-0">
              <div className="flex items-center justify-center border-r border-border-light bg-surface-secondary/50 p-4 font-bold text-text-secondary">
                {period}
              </div>
              {DAYS.map((day, dayIndex) => {
                const date = getDayHeader(dayIndex);
                const isToday = isSameDate(date, new Date());
                return (
                  <div key={`${period}-${day}`} className={`min-h-[170px] border-r border-border-light p-2 last:border-r-0 ${isToday ? 'bg-primary-50/30' : ''}`}>
                    <div className="space-y-2">
                      {grid[periodIndex][dayIndex].map((session) => (
                        <SessionBlock
                          key={session.id}
                          session={session}
                          highlighted={session.id === highlightedSessionId}
                          onClick={() => onSelectSession(session)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function groupSessionsByDate(sessions: LearningSessionResponse[]) {
  const groups = new Map<string, LearningSessionResponse[]>();
  sessions.forEach((session) => {
    const existing = groups.get(session.session_date) ?? [];
    existing.push(session);
    groups.set(session.session_date, existing);
  });
  groups.forEach((items) => {
    items.sort((a, b) => getSessionDateTime(a).getTime() - getSessionDateTime(b).getTime());
  });
  return groups;
}

function formatMobileDayTitle(date: Date) {
  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  });
}

function scrollToScheduleTarget(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`);
}

function getMonthCalendarDays(monthStart: Date) {
  const first = getStartOfWeek(monthStart);
  const last = getEndOfMonth(monthStart);
  const lastCalendarDay = getStartOfWeek(last);
  lastCalendarDay.setDate(lastCalendarDay.getDate() + 6);

  const days: Date[] = [];
  const cursor = new Date(first);
  while (cursor <= lastCalendarDay) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function MonthScheduleCalendar({
  currentMonthStart,
  sessions,
  highlightedSessionId,
  onSelectSession,
}: {
  currentMonthStart: Date;
  sessions: LearningSessionResponse[];
  highlightedSessionId: number;
  onSelectSession: (session: LearningSessionResponse) => void;
}) {
  const sessionsByDate = useMemo(() => {
    const groups = new Map<string, LearningSessionResponse[]>();
    sessions.forEach((session) => {
      const existing = groups.get(session.session_date) ?? [];
      existing.push(session);
      groups.set(session.session_date, existing);
    });
    return groups;
  }, [sessions]);

  const calendarDays = useMemo(() => getMonthCalendarDays(currentMonthStart), [currentMonthStart]);

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-border-light bg-white p-8 text-center shadow-sm">
        <CalendarIcon className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
        <h3 className="font-bold text-text-primary">Tháng này chưa có buổi học</h3>
        <p className="mt-1 text-sm text-text-tertiary">Bạn có thể chuyển tháng hoặc quay lại hôm nay để xem lịch khác.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border-light bg-white shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-7 border-b border-border-light bg-surface-secondary">
            {DAYS.map((day) => (
              <div key={day} className="border-r border-border-light p-3 text-center text-sm font-bold text-text-secondary last:border-r-0">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((day) => {
              const dateKey = getDateKey(day);
              const daySessions = sessionsByDate.get(dateKey) ?? [];
              const isCurrentMonth = day.getMonth() === currentMonthStart.getMonth();
              const isToday = isSameDate(day, new Date());
              const visibleSessions = daySessions.slice(0, 3);
              const hiddenCount = daySessions.length - visibleSessions.length;

              return (
                <div
                  key={dateKey}
                  className={`min-h-[150px] border-r border-b border-border-light p-2 last:border-r-0 ${
                    isCurrentMonth ? 'bg-white' : 'bg-surface-secondary/40 text-text-tertiary'
                  } ${isToday ? 'bg-primary-50/50' : ''}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                      isToday ? 'bg-primary-600 text-white' : isCurrentMonth ? 'text-text-primary' : 'text-text-tertiary'
                    }`}>
                      {day.getDate()}
                    </span>
                    {daySessions.length > 0 && (
                      <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-bold text-primary-700">
                        {daySessions.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {visibleSessions.map((session) => (
                      <MonthSessionPill
                        key={session.id}
                        session={session}
                        highlighted={session.id === highlightedSessionId}
                        onClick={() => onSelectSession(session)}
                      />
                    ))}
                    {hiddenCount > 0 && (
                      <p className="rounded-lg bg-surface-secondary px-2 py-1 text-xs font-semibold text-text-tertiary">
                        +{hiddenCount} buổi khác
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthSessionPill({
  session,
  highlighted,
  onClick,
}: {
  session: LearningSessionResponse;
  highlighted: boolean;
  onClick: () => void;
}) {
  const isAttendanceNeeded = isAttendanceNeededSession(session);
  const title = `${getSessionTitle(session)} · ${formatSessionTime(session)} · ${session.tutor_name || `GS #${session.tutor_id}`}`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      id={`session-${session.id}`}
      className={`block w-full rounded-lg border px-2 py-1.5 text-left text-xs transition-all hover:shadow-sm ${
        isAttendanceNeeded
          ? 'border-warning-200 bg-warning-50 text-warning-900'
          : session.status === 'COMPLETED'
            ? 'border-success-100 bg-success-50 text-success-800'
            : 'border-primary-100 bg-primary-50 text-primary-800'
      } ${highlighted ? 'ring-2 ring-primary-500 ring-offset-2 shadow-md' : ''}`}
    >
      <span className="block truncate font-bold">{formatSessionTime(session)}</span>
      <span className="mt-0.5 block truncate">{getSessionTitle(session)}</span>
    </button>
  );
}

function SessionBlock({
  session,
  highlighted,
  onClick,
}: {
  session: LearningSessionResponse;
  highlighted: boolean;
  onClick: () => void;
}) {
  const isPast = isPastSessionDate(session.session_date);
  const isCancelled = session.status === 'CANCELLED' || session.status === 'NO_SHOW';
  const isAttendanceNeeded = isAttendanceNeededSession(session);
  const detailText = `${getSessionTitle(session)} · ${formatSessionDate(session)} · ${formatSessionTime(session)} · ${session.tutor_name || `GS #${session.tutor_id}`}`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={detailText}
      aria-label={detailText}
      id={`session-${session.id}`}
      className={`
        group relative flex w-full cursor-pointer flex-col gap-2 rounded-xl border p-3 text-left transition-all hover:z-20 hover:shadow-lg focus:z-20 focus:outline-none focus:ring-2 focus:ring-primary-500/30
        ${isAttendanceNeeded
          ? 'border-warning-200 bg-warning-50 text-warning-900'
          : isCancelled
            ? 'border-danger-100 bg-danger-50 text-danger-900'
            : isPast
              ? 'border-border-light bg-white text-text-secondary'
              : 'border-primary-200 bg-primary-50 text-primary-900 hover:border-primary-400'}
        ${highlighted ? 'z-10 border-primary-500 bg-primary-100 shadow-lg ring-2 ring-primary-500 ring-offset-2' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-bold text-text-secondary">
          Buổi {session.session_number ?? '-'}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
          {getSessionTypeLabel(session)}
        </span>
      </div>

      <h4 className="line-clamp-2 text-sm font-bold leading-snug">{getSessionTitle(session)}</h4>

      <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        <ClockIcon className="h-3.5 w-3.5" />
        <span>{formatSessionTime(session)}</span>
      </div>

      <p className="truncate text-xs text-text-tertiary">{session.tutor_name || `GS #${session.tutor_id}`}</p>

      <div className="mt-1">
        {isAttendanceNeeded ? (
          <span className="inline-flex rounded-full bg-warning-100 px-2 py-0.5 text-[11px] font-bold text-warning-700">
            Chờ cập nhật
          </span>
        ) : (
          getStatusBadge(session.status)
        )}
      </div>

      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-72 -translate-x-1/2 rounded-xl border border-border-light bg-white p-4 text-left shadow-xl group-hover:block group-focus:block">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-600">{getSessionTypeLabel(session)}</p>
        <h5 className="mt-1 font-bold text-text-primary">{getSessionTitle(session)}</h5>
        <div className="mt-3 space-y-2 text-sm text-text-secondary">
          <p>{formatSessionDate(session)}</p>
          <p>{formatSessionTime(session)}</p>
          <p>{session.tutor_name || `GS #${session.tutor_id}`}</p>
          {session.attendance_note && <p className="rounded-lg bg-warning-50 p-2 text-warning-800">{session.attendance_note}</p>}
        </div>
      </div>
    </button>
  );
}
