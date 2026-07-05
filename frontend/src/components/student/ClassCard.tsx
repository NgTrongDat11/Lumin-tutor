import type { CourseClassResponse, TutorPublicResponse, RecommendedClass } from '../../types';
import { getStatusBadge } from '../ui/Badge';
import { UsersIcon, CalendarIcon } from '../ui/Icons';
import { currency, formatDate } from '../../utils/format';
import { getMatchScoreNumber, MatchScoreBadge, ScoreExplanationPanel } from './MatchScore';

export function getClassModeMeta(course: CourseClassResponse) {
  if (course.mode === 'ONLINE') {
    return {
      label: 'Trực tuyến',
      detail: 'Học trực tuyến',
      classes: 'border-sky-200 bg-sky-50 text-sky-700',
    };
  }
  if (course.mode === 'OFFLINE') {
    return {
      label: 'Trực tiếp',
      detail: course.location || 'Học tại lớp',
      classes: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }
  return {
    label: 'Linh hoạt',
    detail: course.location ? `Trực tuyến hoặc ${course.location}` : 'Trực tuyến hoặc trực tiếp',
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
}

export function getCourseTotalFee(course: CourseClassResponse) {
  return Number(course.fee_per_session_per_student || 0) * course.total_sessions;
}

interface ClassCardProps {
  course: CourseClassResponse;
  subjectName?: string;
  tutorProfile?: TutorPublicResponse;
  onOpen: () => void;
  onOpenTutor: () => void;
}

export function ClassCard({
  course,
  subjectName,
  tutorProfile,
  onOpen,
  onOpenTutor,
}: ClassCardProps) {
  const modeMeta = getClassModeMeta(course);
  const totalFee = getCourseTotalFee(course);

  return (
    <article
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary-200 hover:shadow-xl hover:shadow-[0_22px_45px_-32px_rgba(17,103,98,0.45)]"
      onClick={onOpen}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-50/70 via-white/0 to-warning-50/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative z-10 flex h-full flex-col">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-primary-600">
              {subjectName || 'Lớp nhóm'} · {course.grade_level}
            </p>
            <h4 className="line-clamp-2 text-lg font-bold leading-snug text-text-primary transition-colors group-hover:text-primary-800">
              {course.title}
            </h4>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wide transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm ${modeMeta.classes}`}>
              {modeMeta.label}
            </span>
            {getStatusBadge(course.status)}
          </div>
        </div>

        {course.goal && (
          <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-text-secondary">{course.goal}</p>
        )}

        <div className="mt-auto space-y-2 rounded-xl border border-border-light bg-white/75 p-4 shadow-xs backdrop-blur-sm transition-all duration-300 group-hover:border-primary-100 group-hover:bg-white">
          {course.tutor_name && (
            <div className="flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-secondary">
                <UsersIcon className="h-4 w-4 shrink-0 text-primary-500" />
                <span>GV:</span>
                <span className="truncate font-bold text-text-primary">{course.tutor_name}</span>
              </p>
              {tutorProfile && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenTutor();
                  }}
                  className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-xs font-bold text-primary-700 transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-50"
                >
                  Xem hồ sơ
                </button>
              )}
            </div>
          )}
          <p className="flex items-center gap-2 text-sm font-medium text-text-secondary">
            <CalendarIcon className="h-4 w-4 shrink-0 text-primary-500" />
            <span>
              {course.total_sessions} buổi · {modeMeta.detail}
            </span>
          </p>
          {(course.start_date || course.end_date) && (
            <p className="flex items-center gap-2 text-xs font-medium text-text-tertiary">
              📅 {formatDate(course.start_date, '?')}
              {' — '}
              {formatDate(course.end_date, '?')}
            </p>
          )}
          <div className="mt-2 border-t border-border-light/70 pt-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">Tạm tính trọn khóa</p>
                <p className="text-2xl font-extrabold leading-tight text-primary-800">{currency(totalFee)}</p>
              </div>
              <p className="shrink-0 text-right text-xs leading-5 text-text-tertiary">
                {currency(course.fee_per_session_per_student)} / buổi
                <br />
                {course.min_students}-{course.max_students} học viên
              </p>
            </div>
          </div>
        </div>

        <p className="mt-3 text-center text-xs text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100">
          Bấm để xem chi tiết
        </p>
      </div>
    </article>
  );
}

interface RecommendedClassCardProps {
  rec: RecommendedClass;
  subjectName?: string;
  tutorProfile?: TutorPublicResponse;
  onOpen: () => void;
  onOpenTutor: () => void;
}

export function RecommendedClassCard({
  rec,
  subjectName,
  tutorProfile,
  onOpen,
  onOpenTutor,
}: RecommendedClassCardProps) {
  const course = rec.course_class;
  const modeMeta = getClassModeMeta(course);
  const totalFee = getCourseTotalFee(course);
  const isPremiumRecommendation = getMatchScoreNumber(rec.score) >= 80;

  return (
    <article
      className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-5 ${
        isPremiumRecommendation
          ? 'border-primary-200/80 hover:border-transparent hover:ring-2 hover:ring-primary-500/35 hover:shadow-[0_24px_55px_-30px_rgba(17,103,98,0.55)]'
          : 'border-border hover:border-primary-200'
      }`}
      onClick={onOpen}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-50/80 via-white/0 to-warning-50/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative z-10 flex h-full flex-col">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-primary-600">
            {subjectName || 'Lớp nhóm'} · {course.grade_level}
          </p>
          <h4 className="line-clamp-2 text-lg font-bold leading-snug text-text-primary group-hover:text-primary-800">
            {course.title}
          </h4>
        </div>
        <MatchScoreBadge score={rec.score} />
      </div>

      <div className="space-y-2 rounded-lg border border-border-light bg-white/75 p-3 shadow-xs backdrop-blur-sm transition-all duration-300 group-hover:border-primary-100 group-hover:bg-white">
        <p className="flex items-center gap-2 text-sm font-medium text-text-secondary">
          <CalendarIcon className="h-4 w-4 shrink-0 text-primary-600" />
          <span>
            {course.total_sessions} buổi · {modeMeta.detail}
          </span>
        </p>
        {(course.start_date || course.end_date) && (
          <p className="flex items-center gap-2 text-xs font-medium text-text-tertiary">
            📅 {formatDate(course.start_date, '?')}
            {' — '}
            {formatDate(course.end_date, '?')}
          </p>
        )}
        {course.tutor_name && (
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-text-secondary">
              GV: <span className="font-bold text-text-primary">{course.tutor_name}</span>
            </p>
            {tutorProfile && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenTutor();
                }}
                className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-bold text-primary-700 transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-50"
              >
                Hồ sơ
              </button>
            )}
          </div>
        )}
        <div className="flex items-end justify-between gap-3 border-t border-border-light pt-3">
          <p className="text-xl font-extrabold text-primary-800">{currency(totalFee)}</p>
          <span className={`rounded-full border px-3 py-1 text-xs font-extrabold transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm ${modeMeta.classes}`}>
            {modeMeta.label}
          </span>
        </div>
      </div>

      <ScoreExplanationPanel
        score={rec.score}
        reasons={rec.reasons}
        compact={true}
        rec={rec}
        onOpenDetails={onOpen}
      />

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        className="mt-auto w-full cursor-pointer rounded-lg border border-primary-100 bg-white/85 px-3 py-2 text-sm font-bold text-primary-700 shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-200 hover:bg-primary-50 hover:shadow-md"
      >
        Xem chi tiết lớp
      </button>
      </div>
    </article>
  );
}
