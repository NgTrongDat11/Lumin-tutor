import type { LearningSessionResponse } from '../../types';
import { BookOpenIcon, CalendarIcon, ClockIcon, LocationMarkerIcon, UsersIcon } from '../ui/Icons';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { getStatusBadge } from '../ui/Badge';
import { LearningLocationValue } from './LearningLocationValue';

function isPastSessionDate(sessionDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${sessionDate}T00:00:00`) < today;
}

function modeLabel(mode: string | null | undefined) {
  if (mode === 'ONLINE') return 'Trực tuyến';
  if (mode === 'OFFLINE') return 'Trực tiếp';
  if (mode === 'BOTH') return 'Linh hoạt';
  return mode || 'Chưa cập nhật';
}

export function SessionDetailModal({ session, onClose }: { session: LearningSessionResponse | null; onClose: () => void }) {
  if (!session) return null;

  const isPast = isPastSessionDate(session.session_date);
  const sessionType = session.private_request_id ? 'Buổi 1-1' : (session.class_id ? 'Lớp nhóm' : 'Buổi học');
  const sessionLabel = session.class_title || session.private_request_title || (session.private_request_id ? `Yêu cầu 1-1 #${session.private_request_id}` : 'Buổi học');

  return (
    <Modal
      open
      onClose={onClose}
      title="Chi tiết buổi học"
      size="md"
      footer={<Button variant="ghost" onClick={onClose}>Đóng</Button>}
    >
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-primary-600">{sessionType}</p>
            <h3 className="text-xl font-bold text-text-primary">{sessionLabel}</h3>
          </div>
          {getStatusBadge(session.status)}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col items-center rounded-xl border border-border-light bg-surface-secondary p-4 text-center">
            <CalendarIcon className="mb-2 h-5 w-5 text-text-tertiary" />
            <span className="mb-1 text-xs font-medium text-text-tertiary">Ngày học</span>
            <span className="text-sm font-bold text-text-primary">
              {new Date(`${session.session_date}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <div className="flex flex-col items-center rounded-xl border border-border-light bg-surface-secondary p-4 text-center">
            <ClockIcon className="mb-2 h-5 w-5 text-text-tertiary" />
            <span className="mb-1 text-xs font-medium text-text-tertiary">Thời gian</span>
            <span className="text-sm font-bold text-text-primary">
              {session.start_time.slice(0, 5)} - {session.end_time.slice(0, 5)}
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border-light divide-y divide-border-light">
          <div className="flex items-center justify-between bg-white px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-text-secondary">
              <BookOpenIcon className="h-4 w-4 text-text-tertiary" /> Buổi số
            </span>
            <span className="text-sm font-bold text-text-primary">{session.session_number ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between bg-white px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-text-secondary">
              <UsersIcon className="h-4 w-4 text-text-tertiary" /> Gia sư
            </span>
            <span className="text-sm font-bold text-text-primary">{session.tutor_name || `GS #${session.tutor_id}`}</span>
          </div>
          {session.mode && (
            <div className="flex items-center justify-between bg-white px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-text-secondary">
                <LocationMarkerIcon className="h-4 w-4 text-text-tertiary" /> Hình thức
              </span>
              <span className="text-sm font-bold text-text-primary">{modeLabel(session.mode)}</span>
            </div>
          )}
          {session.location && (
            <div className="flex items-center justify-between bg-white px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-text-secondary">
                <LocationMarkerIcon className="h-4 w-4 text-text-tertiary" /> Phòng/link/địa điểm
              </span>
              <LearningLocationValue value={session.location} className="max-w-[60%] text-right" />
            </div>
          )}
          {session.class_title && (
            <div className="flex items-center justify-between bg-white px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-text-secondary">
                <BookOpenIcon className="h-4 w-4 text-text-tertiary" /> Lớp
              </span>
              <span className="text-sm font-bold text-text-primary">{session.class_title}</span>
            </div>
          )}
          {session.private_request_id && (
            <div className="flex items-center justify-between bg-white px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-text-secondary">
                <BookOpenIcon className="h-4 w-4 text-text-tertiary" /> Yêu cầu 1-1
              </span>
              <span className="text-sm font-bold text-text-primary">{session.private_request_title || `#${session.private_request_id}`}</span>
            </div>
          )}
        </div>

        {session.attendance_note && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-1 text-xs font-bold uppercase text-amber-700">Ghi chú điểm danh</p>
            <p className="text-sm text-amber-900">{session.attendance_note}</p>
          </div>
        )}

        {isPast && session.status === 'SCHEDULED' && (
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-3">
            <p className="text-xs text-warning-800">
              ⚠️ Buổi học này đã qua nhưng chưa được cập nhật điểm danh.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
