import { useCallback, useEffect, useState } from 'react';
import { extractErrorMessage, privateRequestApi } from '../../services/api';
import type { PrivateRequestResponse, PrivateRequestStatus, UserRole } from '../../types';
import { currency } from '../../utils/format';
import { isPrivateRequestContactVisible } from '../../utils/constants';
import { getStatusBadge } from '../ui/Badge';
import Button from '../ui/Button';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { CalendarIcon, CheckCircleIcon, ClipboardCheckIcon, LinkIcon, UserCheckIcon, XIcon } from '../ui/Icons';
import { useToast } from '../ui/Toast';
import ConfirmRequestModal from './ConfirmRequestModal';
import UpdateLocationModal from './UpdateLocationModal';
import StudentProfileModal from './StudentProfileModal';
import TutorPublicProfileModal from '../shared/TutorPublicProfileModal';
import ContactDetails from '../shared/ContactDetails';
import { LearningLocationValue } from '../learning/LearningLocationValue';

interface RequestActionBarProps {
  privateRequestId: number;
  userRole: UserRole;
  onStatusChange?: (request: PrivateRequestResponse) => void | Promise<void>;
}

function modeLabel(mode: string | null | undefined) {
  if (mode === 'ONLINE') return 'Trực tuyến';
  if (mode === 'OFFLINE') return 'Trực tiếp';
  if (mode === 'BOTH') return 'Linh hoạt';
  return mode || 'Chưa rõ';
}

const DAY_NAMES: Record<number, string> = {
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7',
  7: 'Chủ nhật',
};

const LOCATION_EDITABLE_STATUSES = new Set<PrivateRequestStatus>([
  'SCHEDULE_PROPOSED',
  'TUTOR_CONFIRMED',
  'PAID',
  'ONGOING',
]);

function canRoleUpdateLocation(userRole: UserRole) {
  return userRole === 'TUTOR' || userRole === 'STAFF' || userRole === 'SUPER_ADMIN';
}

function formatScheduleLine(
  dayOfWeek: number,
  startDate: string,
  startTime: string,
  endTime: string,
  isCustomSchedule: boolean,
) {
  const dateLabel = new Date(`${startDate}T00:00:00`).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
  const repeatLabel = isCustomSchedule ? '' : ' · Lặp hằng tuần';
  return `${DAY_NAMES[dayOfWeek] || `Thứ ${dayOfWeek}`} ${dateLabel}, ${startTime.slice(0, 5)}-${endTime.slice(0, 5)}${repeatLabel}`;
}

export default function RequestActionBar({
  privateRequestId,
  userRole,
  onStatusChange,
}: RequestActionBarProps) {
  const { toast } = useToast();
  const [request, setRequest] = useState<PrivateRequestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmRequest, setConfirmRequest] = useState<PrivateRequestResponse | null>(null);
  const [profileRequestId, setProfileRequestId] = useState<number | null>(null);
  const [tutorProfileId, setTutorProfileId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [acceptingSchedule, setAcceptingSchedule] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const { confirm: confirmAction, ConfirmDialogElement } = useConfirmDialog();

  const loadRequest = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await privateRequestApi.get(privateRequestId);
      setRequest(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [privateRequestId]);

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  const handleStatusChange = async (updatedRequest: PrivateRequestResponse) => {
    setRequest(updatedRequest);
    await onStatusChange?.(updatedRequest);
  };

  const handleReject = async () => {
    if (!request || rejecting) return;
    const shouldReject = await confirmAction({
      title: 'Từ chối yêu cầu này?',
      description: 'Học viên sẽ được thông báo rằng bạn không nhận yêu cầu 1-1 này. Thao tác không thể hoàn tác.',
      confirmLabel: 'Từ chối',
      variant: 'danger',
    });
    if (!shouldReject) return;
    setRejecting(true);
    try {
      const updatedRequest = await privateRequestApi.reject(request.id);
      toast('success', 'Đã từ chối yêu cầu');
      await handleStatusChange(updatedRequest);
    } catch (err) {
      toast('error', 'Từ chối thất bại: ' + extractErrorMessage(err));
    } finally {
      setRejecting(false);
    }
  };

  const handleAcceptSchedule = async () => {
    if (!request || acceptingSchedule) return;
    setAcceptingSchedule(true);
    try {
      const updatedRequest = await privateRequestApi.acceptSchedule(request.id);
      toast('success', 'Đã đồng ý lịch học. Bạn có thể thanh toán để lịch chính thức hiển thị.');
      await handleStatusChange(updatedRequest);
    } catch (err) {
      toast('error', 'Đồng ý lịch thất bại: ' + extractErrorMessage(err));
    } finally {
      setAcceptingSchedule(false);
    }
  };

  if (loading) {
    return (
      <div className="border-b border-border-light bg-primary-50/30 px-4 py-3">
        <div className="h-5 w-56 animate-pulse rounded bg-primary-100" />
        <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-primary-100/70" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="border-b border-border-light bg-danger-50 px-4 py-3 text-sm text-danger-600">
        Không thể tải thông tin yêu cầu 1-1{error ? `: ${error}` : '.'}
      </div>
    );
  }

  const isPendingTutorAction = userRole === 'TUTOR' && request.status === 'SENT';
  const canAcceptSchedule = userRole === 'STUDENT' && request.status === 'SCHEDULE_PROPOSED';
  const canViewTutorProfile = userRole === 'STUDENT' && Boolean(request.tutor_id);
  const canViewStudentProfile = userRole === 'TUTOR';
  const contactUnlocked = isPrivateRequestContactVisible(request.status);
  const canUpdateLocation = canRoleUpdateLocation(userRole) && LOCATION_EDITABLE_STATUSES.has(request.status);
  const missingOnlineLocation = request.mode === 'ONLINE' && canUpdateLocation && !request.class_location?.trim();
  const contact = userRole === 'TUTOR'
    ? { title: 'Liên hệ học viên', phone: request.student_phone, address: request.student_address }
    : userRole === 'STUDENT'
      ? { title: 'Liên hệ gia sư', phone: request.tutor_phone, address: request.tutor_address }
      : null;
  const detailBadges = [
    request.subject_name || `Môn #${request.subject_id}`,
    request.grade_level,
    `${request.requested_sessions} buổi`,
    modeLabel(request.mode),
  ];
  const proposedSchedules = request.schedules || [];
  const isCustomSchedule = proposedSchedules.length > 0
    && proposedSchedules.length === request.requested_sessions
    && proposedSchedules.every((schedule) => schedule.total_sessions === 1);

  return (
    <>
      <div className={`border-b border-border-light px-4 py-3 ${request.status === 'SENT' ? 'bg-primary-50/40' : 'bg-surface-secondary'}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              {detailBadges.map((label, index) => (
                <span key={`${label}-${index}`} className="inline-flex items-center rounded-full border border-primary-100 bg-white px-2.5 py-1 text-xs font-bold text-primary-700">
                  {label}
                </span>
              ))}
              {request.status !== 'SENT' && getStatusBadge(request.status)}
            </div>
            {request.goal && (
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                Nội dung: {request.goal}
              </p>
            )}
            {request.status !== 'SENT' && request.agreed_fee_per_session && (
              <p className="mt-2 text-sm font-semibold text-text-secondary">
                {currency(request.agreed_fee_per_session)}/buổi x {request.requested_sessions} buổi
                {request.confirmed_at ? ` · ${new Date(request.confirmed_at).toLocaleDateString('vi-VN')}` : ''}
              </p>
            )}
            {contact && contactUnlocked && (
              <ContactDetails
                title={contact.title}
                phone={contact.phone}
                address={contact.address}
                compact
                className="mt-3"
                emptyMessage={userRole === 'TUTOR'
                  ? 'Học viên chưa cập nhật số điện thoại.'
                  : 'Gia sư chưa cập nhật số điện thoại.'}
              />
            )}
            {request.status === 'SCHEDULE_PROPOSED' && (
              <div className="mt-3 rounded-lg border border-warning-100 bg-warning-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-warning-700">
                  {isCustomSchedule ? 'Lịch tùy chỉnh gia sư đề xuất' : 'Lịch lặp hằng tuần gia sư đề xuất'}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {proposedSchedules.map((schedule) => (
                    <span key={schedule.id} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-text-secondary">
                      <CalendarIcon className="h-3.5 w-3.5 text-warning-700" />
                      {formatScheduleLine(schedule.day_of_week, schedule.start_date, schedule.start_time, schedule.end_time, isCustomSchedule)}
                    </span>
                  ))}
                  {proposedSchedules.length === 0 && (
                    <span className="text-xs text-warning-700">Chưa có lịch chi tiết.</span>
                  )}
                </div>
              </div>
            )}
            {request.status !== 'SENT' && (request.class_location || canUpdateLocation) && (
              <div className={`mt-3 rounded-lg border p-3 ${missingOnlineLocation ? 'border-warning-100 bg-warning-50' : 'border-border-light bg-white'}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-text-tertiary">Phòng/link/địa điểm</p>
                    <div className="mt-1">
                      {request.class_location ? (
                        <LearningLocationValue value={request.class_location} />
                      ) : (
                        <span className="text-sm font-semibold text-warning-700">Chưa cập nhật</span>
                      )}
                    </div>
                  </div>
                  {canUpdateLocation && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<LinkIcon className="h-4 w-4" />}
                      onClick={() => setEditingLocation(true)}
                    >
                      Đổi link
                    </Button>
                  )}
                </div>
                {missingOnlineLocation && (
                  <p className="mt-2 text-xs font-semibold text-warning-800">Buổi học online chưa có link phòng học.</p>
                )}
              </div>
            )}
          </div>

          {isPendingTutorAction ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                icon={<UserCheckIcon className="h-4 w-4" />}
                onClick={() => setProfileRequestId(request.id)}
              >
                Xem hồ sơ HV
              </Button>
              <Button
                size="sm"
                icon={<CheckCircleIcon className="h-4 w-4" />}
                onClick={() => setConfirmRequest(request)}
              >
                Xác nhận yêu cầu
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<XIcon className="h-4 w-4" />}
                loading={rejecting}
                onClick={handleReject}
              >
                Từ chối
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <ClipboardCheckIcon className="h-4 w-4 text-primary-600" />
                {request.status === 'SENT'
                  ? 'Đang chờ gia sư phản hồi'
                  : request.status === 'SCHEDULE_PROPOSED'
                    ? 'Đang chờ học viên đồng ý lịch'
                    : 'Yêu cầu đã được xử lý'}
              </div>
              {canAcceptSchedule && (
                <Button
                  size="sm"
                  icon={<CheckCircleIcon className="h-4 w-4" />}
                  loading={acceptingSchedule}
                  onClick={handleAcceptSchedule}
                >
                  Đồng ý lịch
                </Button>
              )}
              {canViewStudentProfile && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<UserCheckIcon className="h-4 w-4" />}
                  onClick={() => setProfileRequestId(request.id)}
                >
                  Xem hồ sơ HV
                </Button>
              )}
              {canViewTutorProfile && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<UserCheckIcon className="h-4 w-4" />}
                  onClick={() => setTutorProfileId(request.tutor_id)}
                >
                  Xem hồ sơ GS
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmRequestModal
        request={confirmRequest}
        onClose={() => setConfirmRequest(null)}
        onConfirmed={(updatedRequest) => {
          setConfirmRequest(null);
          void handleStatusChange(updatedRequest);
        }}
      />
      <UpdateLocationModal
        requestId={editingLocation ? request.id : null}
        currentLocation={request.class_location}
        onClose={() => setEditingLocation(false)}
        onUpdated={handleStatusChange}
      />
      <StudentProfileModal requestId={profileRequestId} onClose={() => setProfileRequestId(null)} />
      <TutorPublicProfileModal
        tutorId={tutorProfileId}
        onClose={() => setTutorProfileId(null)}
        footer={<Button variant="ghost" onClick={() => setTutorProfileId(null)}>Đóng</Button>}
        contact={contactUnlocked ? { phone: request.tutor_phone, address: request.tutor_address } : undefined}
      />
      {ConfirmDialogElement}
    </>
  );
}
