import { useEffect, useState } from 'react';
import { classApi, staffApi } from '../../services/api';
import type { ClassRegistrationResponse, TutorApplicationResponse, CourseClassResponse } from '../../types';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { getStatusBadge } from '../ui/Badge';
import { useToast } from '../ui/Toast';
import ConfirmActionModal from '../shared/ConfirmActionModal';
import { currency } from '../../utils/format';
import { FULL_DAY_NAMES } from '../../utils/days';

interface ClassDetailModalProps {
  classId: number;
  classTitle?: string;
  onClose: () => void;
  onRefresh?: () => void;
}

type ConfirmActionType =
  | { type: 'accept_tutor'; appId: number; tutorName: string }
  | { type: 'approve_student'; regId: number; studentName: string }
  | { type: 'reject_student'; regId: number; studentName: string }
  | null;

export function ClassDetailModal({
  classId,
  classTitle = '',
  onClose,
  onRefresh,
}: ClassDetailModalProps) {
  const { toast } = useToast();
  const [courseClass, setCourseClass] = useState<CourseClassResponse | null>(null);
  const [applications, setApplications] = useState<TutorApplicationResponse[]>([]);
  const [registrations, setRegistrations] = useState<ClassRegistrationResponse[]>([]);
  const [tutorNames, setTutorNames] = useState<Record<number, string>>({});
  const [studentNames, setStudentNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionType>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const isPrivateClass = Boolean(courseClass?.private_request_id);
  const privateStudent = isPrivateClass
    ? registrations.find((registration) => registration.status === 'APPROVED' || registration.status === 'PAID')
      ?? registrations[0]
    : undefined;

  useEffect(() => {
    const loadDetails = async () => {
      setLoading(true);
      try {
        const [classDetail, appList, regList, tutorList, studentList] = await Promise.all([
          classApi.get(classId).catch(() => null),
          classApi.getApplications(classId).catch(() => []),
          classApi.getRegistrations(classId).catch(() => []),
          staffApi.getAllTutors().catch(() => []),
          staffApi.getStudents().catch(() => []),
        ]);

        setCourseClass(classDetail);

        // Build name maps
        const tutorsMap: Record<number, string> = {};
        tutorList.forEach((t) => {
          tutorsMap[t.id] = t.full_name;
        });

        const studentsMap: Record<number, string> = {};
        studentList.forEach((s) => {
          studentsMap[s.id] = s.full_name;
        });

        setTutorNames(tutorsMap);
        setStudentNames(studentsMap);
        setApplications(appList);
        setRegistrations(regList);
      } catch {
        toast('error', 'Không thể tải chi tiết lớp học');
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [classId, toast]);

  const handleAcceptApplication = async (appId: number) => {
    setActionLoading(true);
    try {
      await classApi.acceptApplication(classId, appId);
      toast('success', 'Đã chọn gia sư cho lớp học');
      onRefresh?.();
      onClose();
    } catch {
      toast('error', 'Thao tác chọn gia sư thất bại');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleReviewRegistration = async (regId: number, action: 'APPROVED' | 'REJECTED') => {
    setActionLoading(true);
    try {
      await classApi.reviewRegistration(classId, regId, { action });
      toast('success', action === 'APPROVED' ? 'Đã duyệt học viên vào lớp' : 'Đã từ chối đăng ký của học viên');
      onRefresh?.();
      onClose();
    } catch {
      toast('error', 'Thao tác cập nhật đăng ký thất bại');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleCancelClass = async () => {
    if (!courseClass) return;
    setActionLoading(true);
    try {
      await classApi.updateStatus(courseClass.id, { status: 'CANCELLED' });
      toast('success', `Đã hủy lớp "${courseClass.title}" thành công.`);
      onRefresh?.();
      onClose();
    } catch {
      toast('error', 'Không thể hủy lớp học');
    } finally {
      setActionLoading(false);
      setConfirmCancel(false);
    }
  };

  return (
    <>
      <Modal
        open={true}
        onClose={onClose}
        title={
          isPrivateClass
            ? 'Chi tiết học 1-1'
            : classTitle ? `Chi tiết: ${classTitle}` : `Chi tiết lớp #${classId}`
        }
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between">
            <div>
              {courseClass && courseClass.status !== 'CANCELLED' && courseClass.status !== 'COMPLETED' && (
                <Button
                  variant="outline"
                  className="text-danger-600 hover:bg-danger-50 border-danger-200"
                  onClick={() => setConfirmCancel(true)}
                  disabled={actionLoading}
                >
                  Hủy lớp học
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={onClose}>
              Đóng
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="py-12 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
            <p className="mt-2 text-sm text-text-tertiary">Đang tải chi tiết lớp học...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {courseClass && (
              <div className="rounded-xl border border-border-light bg-surface-secondary/40 p-4 space-y-3.5">
                <div className="flex items-center justify-between border-b border-border-light pb-2.5">
                  <div>
                    <h4 className="text-base font-bold text-text-primary">{courseClass.title}</h4>
                    <p className="text-xs text-text-tertiary mt-0.5">Mã lớp: #{courseClass.id}</p>
                  </div>
                  {getStatusBadge(courseClass.status)}
                </div>
                
                <div className="grid gap-3.5 text-xs sm:grid-cols-2">
                  <div>
                    <p className="text-text-tertiary">Hình thức học</p>
                    <p className="font-semibold mt-0.5 text-text-primary">
                      {courseClass.mode === 'ONLINE' ? 'Trực tuyến' : `Trực tiếp (${courseClass.location || 'Chưa có địa điểm'})`}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-tertiary">Thời gian dự kiến</p>
                    <p className="font-semibold mt-0.5 text-text-primary">
                      {courseClass.start_date ? new Date(courseClass.start_date).toLocaleDateString('vi-VN') : '—'} 
                      {courseClass.end_date ? ` đến ${new Date(courseClass.end_date).toLocaleDateString('vi-VN')}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-tertiary">
                      {isPrivateClass ? 'Học phí 1-1 & Số buổi' : 'Học phí & Số buổi'}
                    </p>
                    <p className="font-semibold mt-0.5 text-text-primary">
                      {currency(courseClass.fee_per_session_per_student)} / học viên / buổi · {courseClass.total_sessions} buổi
                    </p>
                  </div>
                  <div>
                    {isPrivateClass ? (
                      <>
                        <p className="text-text-tertiary">Học viên tham gia</p>
                        <p className="font-semibold mt-0.5 text-text-primary">
                          {privateStudent
                            ? studentNames[privateStudent.student_account_id] || `Học viên #${privateStudent.student_account_id}`
                            : 'Chưa xác định'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-text-tertiary">Sĩ số (Hiện tại / Min / Max)</p>
                        <p className="font-semibold mt-0.5 text-text-primary">
                          {registrations.filter(r => r.status === 'APPROVED' || r.status === 'PAID').length} học viên đã duyệt / Min: {courseClass.min_students} / Max: {courseClass.max_students}
                        </p>
                      </>
                    )}
                  </div>
                  {courseClass.schedules && courseClass.schedules.length > 0 && (
                    <div className="sm:col-span-2">
                      <p className="text-text-tertiary">Lịch học dự kiến</p>
                      <p className="font-semibold mt-0.5 text-text-primary">
                        {courseClass.schedules
                          .map((s) => {
                            const dayName = FULL_DAY_NAMES[s.day_of_week] || `Thứ ${s.day_of_week}`;
                            const start = s.start_time.slice(0, 5);
                            const end = s.end_time.slice(0, 5);
                            return `${dayName} (${start} - ${end})`;
                          })
                          .join(', ')}
                      </p>
                    </div>
                  )}
                  {courseClass.primary_tutor_id && (
                    <div className="sm:col-span-2">
                      <p className="text-text-tertiary">Gia sư phụ trách</p>
                      <p className="font-semibold mt-0.5 text-primary-700">
                        {tutorNames[courseClass.primary_tutor_id] || `Gia sư #${courseClass.primary_tutor_id}`}
                      </p>
                    </div>
                  )}
                </div>

                {courseClass.goal && (
                  <div className="border-t border-border-light pt-2.5 text-xs">
                    <p className="text-text-tertiary">Mục tiêu học tập</p>
                    <p className="mt-1 text-text-secondary whitespace-pre-line">{courseClass.goal}</p>
                  </div>
                )}
              </div>
            )}

            {isPrivateClass ? (
              <div>
                <h4 className="mb-3 text-sm font-semibold text-text-secondary">Thành viên học 1-1</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary-600">Gia sư</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {courseClass?.primary_tutor_id
                          ? tutorNames[courseClass.primary_tutor_id] || `Gia sư #${courseClass.primary_tutor_id}`
                          : 'Chưa xác định'}
                      </span>
                      {courseClass?.primary_tutor_id && (
                        <span className="rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-700">
                          ✓ Đã xác nhận
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border-light bg-surface-secondary/40 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-text-tertiary">Học viên</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {privateStudent
                          ? studentNames[privateStudent.student_account_id] || `Học viên #${privateStudent.student_account_id}`
                          : 'Chưa xác định'}
                      </span>
                      {privateStudent && getStatusBadge(privateStudent.status)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-text-secondary">
                    Ứng tuyển gia sư ({applications.length})
                  </h4>
                  {applications.length === 0 ? (
                    <p className="text-sm text-text-tertiary italic">Chưa có gia sư nào ứng tuyển.</p>
                  ) : (
                    <div className="divide-y divide-border-light rounded-xl border border-border-light bg-surface-secondary/30 px-4">
                      {applications.map((app) => (
                        <div key={app.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-primary">
                              {tutorNames[app.tutor_id] || `Gia sư #${app.tutor_id}`}
                            </span>
                            {getStatusBadge(app.status)}
                          </div>
                          {app.status === 'APPLIED' && (
                            <Button
                              size="sm"
                              onClick={() =>
                                setConfirmAction({
                                  type: 'accept_tutor',
                                  appId: app.id,
                                  tutorName: tutorNames[app.tutor_id] || `Gia sư #${app.tutor_id}`,
                                })
                              }
                            >
                              Chọn gia sư
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="mb-3 text-sm font-semibold text-text-secondary">
                    Đăng ký học viên ({registrations.length})
                  </h4>
                  {registrations.length === 0 ? (
                    <p className="text-sm text-text-tertiary italic">Chưa có học viên nào đăng ký.</p>
                  ) : (
                    <div className="divide-y divide-border-light rounded-xl border border-border-light bg-surface-secondary/30 px-4">
                      {registrations.map((reg) => (
                        <div key={reg.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-primary">
                              {studentNames[reg.student_account_id] || `Học viên #${reg.student_account_id}`}
                            </span>
                            {getStatusBadge(reg.status)}
                          </div>
                          {reg.status === 'PENDING' && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() =>
                                  setConfirmAction({
                                    type: 'approve_student',
                                    regId: reg.id,
                                    studentName: studentNames[reg.student_account_id] || `Học viên #${reg.student_account_id}`,
                                  })
                                }
                              >
                                Duyệt
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-danger-600 hover:bg-danger-50 border-danger-200"
                                onClick={() =>
                                  setConfirmAction({
                                    type: 'reject_student',
                                    regId: reg.id,
                                    studentName: studentNames[reg.student_account_id] || `Học viên #${reg.student_account_id}`,
                                  })
                                }
                              >
                                Từ chối
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Confirmation Modals */}
      {confirmAction?.type === 'accept_tutor' && (
        <ConfirmActionModal
          open={true}
          title="Xác nhận chọn gia sư"
          description={`Bạn có chắc chắn muốn chọn gia sư ${confirmAction.tutorName} giảng dạy lớp học này không? Hành động này sẽ đóng đơn ứng tuyển của các gia sư khác.`}
          confirmLabel="Chọn gia sư"
          loading={actionLoading}
          onConfirm={() => handleAcceptApplication(confirmAction.appId)}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction?.type === 'approve_student' && (
        <ConfirmActionModal
          open={true}
          title="Duyệt học viên"
          description={`Bạn có chắc chắn muốn duyệt học viên ${confirmAction.studentName} vào lớp học này không?`}
          confirmLabel="Duyệt vào lớp"
          loading={actionLoading}
          onConfirm={() => handleReviewRegistration(confirmAction.regId, 'APPROVED')}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction?.type === 'reject_student' && (
        <ConfirmActionModal
          open={true}
          title="Từ chối học viên"
          variant="danger"
          description={`Bạn có chắc chắn muốn từ chối đăng ký của học viên ${confirmAction.studentName} vào lớp học này không?`}
          confirmLabel="Từ chối"
          loading={actionLoading}
          onConfirm={() => handleReviewRegistration(confirmAction.regId, 'REJECTED')}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmCancel && courseClass && (
        <ConfirmActionModal
          open={true}
          title="Xác nhận hủy lớp"
          variant="danger"
          description={`Bạn có chắc chắn muốn hủy lớp học "${courseClass.title}" không? Trạng thái lớp sẽ chuyển sang CANCELLED và không thể thay đổi tiếp.`}
          confirmLabel="Hủy lớp"
          loading={actionLoading}
          onConfirm={handleCancelClass}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </>
  );
}

export default ClassDetailModal;
