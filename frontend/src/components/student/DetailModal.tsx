import React, { useEffect, useState } from 'react';
import type { CourseClassResponse, RecommendedTutor, RecommendedClass, SchedulePatternResponse } from '../../types';
import { scheduleApi } from '../../services/api';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { getStatusBadge } from '../ui/Badge';
import { CalendarIcon, UsersIcon, BookOpenIcon, SearchIcon } from '../ui/Icons';
import { currency, formatDate } from '../../utils/format';
import { FULL_DAY_NAMES } from '../../utils/days';
import { getClassModeMeta, getCourseTotalFee } from './ClassCard';
import { MatchExplanationDetail } from './MatchExplanationModal';
import type { RecommendationContext } from '../../types';

export type DetailTarget =
  | { type: 'CLASS'; data: CourseClassResponse }
  | { type: 'RECOMMENDED_CLASS'; data: RecommendedClass }
  | { type: 'TUTOR'; data: RecommendedTutor }
  | null;

interface DetailModalProps {
  target: DetailTarget;
  isRecommendation?: boolean;
  subjectNameById: Map<number, string>;
  tutorRecById: Map<number, RecommendedTutor>;
  context?: RecommendationContext;
  basisLabel?: string;
  onClose: () => void;
  onOpenTutor: (tutorId: number | null | undefined) => void;
  onRequestTutor: (tutor: RecommendedTutor) => void;
  onRegisterClass: (classId: number) => void;
}

function InfoTile({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-light bg-surface-secondary p-4 flex flex-col items-center text-center">
      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-xs mb-2">
        <Icon className="h-4 w-4 text-primary-600" />
      </div>
      <p className="text-xs font-bold text-text-tertiary uppercase mb-1">{label}</p>
      <p className="font-bold text-text-primary text-sm">{value}</p>
    </div>
  );
}

/* ── Class Detail Content (needs state for schedule fetching) ── */
function ClassDetailContent({
  course,
  recommendationItem,
  subjectName,
  tutorRec,
  context,
  basisLabel,
  onOpenTutor,
}: {
  course: CourseClassResponse;
  recommendationItem: RecommendedClass | null;
  subjectName: string | undefined;
  tutorRec: RecommendedTutor | undefined;
  context?: RecommendationContext;
  basisLabel?: string;
  onOpenTutor: (tutorId: number | null | undefined) => void;
}) {
  const modeMeta = getClassModeMeta(course);
  const totalFee = getCourseTotalFee(course);

  const [schedules, setSchedules] = useState<SchedulePatternResponse[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setScheduleLoading(true);
    scheduleApi
      .listPatterns({ class_id: course.id })
      .then((data) => {
        if (!cancelled) setSchedules(data);
      })
      .catch(() => {
        if (!cancelled) setSchedules([]);
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false);
      });
    return () => { cancelled = true; };
  }, [course.id]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">{course.title}</h2>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {getStatusBadge(course.status)}
          {subjectName && (
            <span className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-750 border border-primary-100">
              {subjectName}
            </span>
          )}
          <span className="rounded-full bg-surface-secondary px-3 py-1.5 text-xs font-bold text-text-secondary border border-border-light">
            {course.grade_level}
          </span>
          <span className={`rounded-full border px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide ${modeMeta.classes}`}>
            {modeMeta.label}
          </span>
        </div>
      </div>

      {course.tutor_name && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary-100 bg-primary-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar id={course.primary_tutor_id || undefined} name={course.tutor_name} src={course.tutor_avatar_url || undefined} size="md" shape="square" />
            <div>
              <p className="text-xs font-bold text-primary-600 uppercase tracking-wide">Giảng viên phụ trách</p>
              <p className="text-base font-bold text-text-primary">{course.tutor_name}</p>
            </div>
          </div>
          {tutorRec ? (
            <Button variant="outline" size="sm" onClick={() => onOpenTutor(course.primary_tutor_id)}>
              Xem hồ sơ giảng viên
            </Button>
          ) : (
            <span className="text-xs font-semibold text-text-tertiary">Chưa có hồ sơ công khai</span>
          )}
        </div>
      )}

      {recommendationItem && (
        <div className="space-y-3">
          <MatchExplanationDetail
            rec={recommendationItem}
            context={context}
            basisLabel={basisLabel}
          />
        </div>
      )}

      <div className="bg-surface-secondary rounded-xl p-4 border border-border-light">
        <h4 className="text-sm font-bold text-text-primary mb-2">Mục tiêu khóa học</h4>
        <p className="text-sm leading-relaxed text-text-secondary">{course.goal || 'Đang cập nhật chi tiết.'}</p>
      </div>

      {/* Thời gian khóa học */}
      <div className="rounded-xl border border-border-light bg-white p-4">
        <h4 className="text-sm font-bold text-text-primary mb-3">Thời gian khóa học</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-text-tertiary uppercase mb-1">Ngày bắt đầu</span>
            <span className="text-sm font-semibold text-text-primary">{formatDate(course.start_date, 'Chưa xác định')}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-text-tertiary uppercase mb-1">Ngày kết thúc</span>
            <span className="text-sm font-semibold text-text-primary">{formatDate(course.end_date, 'Chưa xác định')}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-text-tertiary uppercase mb-1">Tổng buổi</span>
            <span className="text-sm font-semibold text-text-primary">{course.total_sessions} buổi</span>
          </div>
        </div>
      </div>

      {/* Lịch học dự kiến */}
      <div className="rounded-xl border border-border-light bg-white p-4">
        <h4 className="text-sm font-bold text-text-primary mb-3">Lịch học dự kiến</h4>
        {scheduleLoading ? (
          <div className="flex items-center gap-2 py-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            <span className="text-xs text-text-tertiary">Đang tải lịch học...</span>
          </div>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-text-tertiary italic">Lịch học chưa được sắp xếp.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-border-light bg-surface-secondary px-3 py-2"
              >
                <p className="text-xs font-bold text-text-primary">
                  {FULL_DAY_NAMES[s.day_of_week]} · {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  Từ {formatDate(s.start_date, 'Chưa xác định')}{s.end_date ? ` đến ${formatDate(s.end_date, 'Chưa xác định')}` : ''}
                  {s.total_sessions ? ` · ${s.total_sessions} buổi` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <InfoTile icon={CalendarIcon} label="Thời lượng" value={`${course.total_sessions} buổi`} />
        <InfoTile icon={UsersIcon} label="Hình thức" value={modeMeta.detail} />
        <InfoTile icon={BookOpenIcon} label="Tạm tính" value={currency(totalFee)} />
      </div>

      <div className="rounded-xl border border-border-light bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-text-tertiary">Chi phí dự kiến</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-3xl font-extrabold text-primary-850">{currency(totalFee)}</p>
          <p className="text-xs font-semibold text-text-tertiary">
            {currency(course.fee_per_session_per_student)} / buổi x {course.total_sessions} buổi · Sĩ số {course.min_students}-{course.max_students} học viên
          </p>
        </div>
      </div>
    </div>
  );
}

export function DetailModal({
  target,
  isRecommendation,
  subjectNameById,
  tutorRecById,
  context,
  basisLabel,
  onClose,
  onOpenTutor,
  onRequestTutor,
  onRegisterClass,
}: DetailModalProps) {
  if (!target) return null;

  if (target.type === 'CLASS' || target.type === 'RECOMMENDED_CLASS') {
    const recommendationItem = target.type === 'RECOMMENDED_CLASS' ? target.data : null;
    const course = target.type === 'RECOMMENDED_CLASS' ? target.data.course_class : target.data;
    const subjectName = subjectNameById.get(course.subject_id);
    const tutorRec = course.primary_tutor_id ? tutorRecById.get(course.primary_tutor_id) : undefined;

    const canRegister = course.status === 'ENROLLING' || course.status === 'READY';

    return (
      <Modal
        open
        onClose={onClose}
        title="Chi tiết lớp học nhóm"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Đóng
            </Button>
            {canRegister ? (
              <Button onClick={() => onRegisterClass(course.id)}>Đăng ký lớp này</Button>
            ) : (
              <Button disabled>
                {course.status === 'COMPLETED'
                  ? 'Lớp học đã kết thúc'
                  : course.status === 'ONGOING'
                  ? 'Lớp học đang diễn ra'
                  : course.status === 'CANCELLED'
                  ? 'Lớp học đã huỷ'
                  : 'Lớp đã đóng đăng ký'}
              </Button>
            )}
          </div>
        }
      >
        <ClassDetailContent
          course={course}
          recommendationItem={recommendationItem}
          subjectName={subjectName}
          tutorRec={tutorRec}
          context={context}
          basisLabel={basisLabel}
          onOpenTutor={onOpenTutor}
        />
      </Modal>
    );
  }

  const rec = target.data;
  const modeLabel = rec.tutor.teaching_mode === 'ONLINE' ? 'Trực tuyến' : rec.tutor.teaching_mode === 'OFFLINE' ? 'Trực tiếp' : 'Cả hai';

  return (
    <Modal
      open
      onClose={onClose}
      title="Hồ sơ Gia sư"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button onClick={() => onRequestTutor(rec)}>Gửi yêu cầu học 1-1</Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4 border-b border-border-light pb-6">
          <Avatar id={rec.tutor.id} name={rec.tutor.full_name} src={rec.tutor.avatar_url || undefined} size="xl" shape="square" className="rounded-2xl shadow-sm border border-border-light" />
          <div>
            <h2 className="text-2xl font-bold text-text-primary">{rec.tutor.full_name}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-700">
                {Number(rec.tutor.average_rating || 0).toFixed(1)} ⭐ ({rec.tutor.rating_count} đánh giá)
              </span>
              <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-bold text-text-secondary border border-border-light">
                {rec.tutor.years_experience} năm kinh nghiệm
              </span>
            </div>
          </div>
        </div>

        {/* Teaching info */}
        <div className="grid gap-3 sm:grid-cols-3">
          <InfoTile icon={BookOpenIcon} label="Hình thức dạy" value={modeLabel} />
          <InfoTile icon={UsersIcon} label="Học vị/Trình độ" value={rec.tutor.qualification_level || 'Chưa cập nhật'} />
          <InfoTile icon={SearchIcon} label="Khu vực dạy" value={rec.tutor.teaching_area || 'Chưa rõ'} />
        </div>

        <div>
          <h4 className="text-sm font-bold text-text-primary mb-2">Giới thiệu bản thân</h4>
          <p className="text-sm leading-relaxed text-text-secondary bg-surface-secondary/50 border border-border-light p-4 rounded-xl">
            {rec.tutor.bio || 'Chưa cập nhật thông tin giới thiệu.'}
          </p>
        </div>

        <div>
          <h4 className="text-sm font-bold text-text-primary mb-3">Môn học phụ trách giảng dạy</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {rec.tutor.subjects.map((subject) => (
              <div key={subject.id} className="rounded-xl border border-border-light p-4 bg-white shadow-xs">
                <p className="font-bold text-text-primary text-sm">{subject.subject_name || `Môn #${subject.subject_id}`}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs font-bold text-text-tertiary uppercase">{subject.grade_level}</span>
                  <span className="text-sm font-bold text-primary-700">
                    {currency(subject.fee_per_session)}
                    <span className="font-normal text-xs text-text-tertiary">/buổi</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Availability */}
        {rec.tutor.availabilities.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-text-primary mb-3">Lịch rảnh trong tuần</h4>
            <div className="flex flex-wrap gap-2">
              {rec.tutor.availabilities.map((a) => (
                <span
                  key={a.id}
                  className="text-xs bg-surface-tertiary text-text-secondary border border-border-light px-3 py-1.5 rounded-lg font-semibold"
                >
                  {FULL_DAY_NAMES[a.day_of_week]} {a.start_time?.slice(0, 5)} – {a.end_time?.slice(0, 5)}
                </span>
              ))}
            </div>
          </div>
        )}

        {isRecommendation && (
          <div className="space-y-3">
            <MatchExplanationDetail
              rec={rec}
              context={context}
              basisLabel={basisLabel}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

export default DetailModal;
