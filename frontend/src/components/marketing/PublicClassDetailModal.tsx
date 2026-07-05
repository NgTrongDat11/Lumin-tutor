import type { CourseClassResponse } from '../../types';
import { currency, formatDate } from '../../utils/format';
import { getStatusBadge } from '../ui/Badge';
import Button from '../ui/Button';
import { BookOpenIcon, CalendarIcon, UsersIcon } from '../ui/Icons';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';

interface PublicClassDetailModalProps {
  course: CourseClassResponse | null;
  onClose: () => void;
  onOpenTutor: (tutorId: number) => void;
  onContinue: (course: CourseClassResponse) => void;
  continueLabel: string;
}

function modeLabel(mode: string) {
  if (mode === 'ONLINE') return 'Trực tuyến';
  if (mode === 'OFFLINE') return 'Trực tiếp';
  return 'Linh hoạt';
}

export default function PublicClassDetailModal({
  course,
  onClose,
  onOpenTutor,
  onContinue,
  continueLabel,
}: PublicClassDetailModalProps) {
  if (!course) return null;

  const totalFee = Number(course.fee_per_session_per_student) * course.total_sessions;

  return (
    <Modal
      open
      onClose={onClose}
      title="Chi tiết lớp học"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
          <Button onClick={() => onContinue(course)}>{continueLabel}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {getStatusBadge(course.status)}
            <span className="rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-xs font-bold text-primary-750">
              {course.grade_level}
            </span>
            <span className="rounded-full border border-border-light bg-surface-secondary px-3 py-1 text-xs font-bold text-text-secondary">
              {modeLabel(course.mode)}
            </span>
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-text-primary">{course.title}</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {course.goal || 'Thông tin mục tiêu khóa học đang được cập nhật.'}
          </p>
        </div>

        {course.tutor_name && course.primary_tutor_id ? (
          <div className="flex flex-col gap-3 rounded-xl border border-primary-100 bg-primary-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                id={course.primary_tutor_id || undefined}
                name={course.tutor_name}
                src={course.tutor_avatar_url || undefined}
                size="md"
                shape="square"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-primary-600">Gia sư phụ trách</p>
                <p className="truncate font-bold text-text-primary">{course.tutor_name}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenTutor(course.primary_tutor_id!)}>
              Xem hồ sơ gia sư
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
            Lớp đang trong quá trình phân công gia sư.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border-light bg-white p-4">
            <CalendarIcon className="h-5 w-5 text-primary-700" />
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-text-tertiary">Thời gian</p>
            <p className="mt-1 text-sm font-bold text-text-primary">{course.total_sessions} buổi</p>
            <p className="mt-1 text-xs text-text-secondary">
              {formatDate(course.start_date, 'Chưa chốt')} — {formatDate(course.end_date, 'Chưa chốt')}
            </p>
          </div>
          <div className="rounded-xl border border-border-light bg-white p-4">
            <UsersIcon className="h-5 w-5 text-primary-700" />
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-text-tertiary">Sĩ số</p>
            <p className="mt-1 text-sm font-bold text-text-primary">
              {course.min_students}-{course.max_students} học viên
            </p>
            <p className="mt-1 text-xs text-text-secondary">{modeLabel(course.mode)}</p>
          </div>
          <div className="rounded-xl border border-border-light bg-white p-4">
            <BookOpenIcon className="h-5 w-5 text-primary-700" />
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-text-tertiary">Học phí</p>
            <p className="mt-1 text-sm font-bold text-primary-800">
              {currency(course.fee_per_session_per_student)} / buổi
            </p>
            <p className="mt-1 text-xs text-text-secondary">Dự kiến {currency(totalFee)} toàn khóa</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
