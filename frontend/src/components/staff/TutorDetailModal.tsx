import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffApi, messageApi, extractErrorMessage } from '../../services/api';
import type { TutorPublicResponse, TutorDetailResponse } from '../../types';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import { getSafeDocumentHref } from '../ui/DocumentLink';
import { getStatusBadge } from '../ui/Badge';
import Spinner from '../ui/Spinner';
import { useToast } from '../ui/Toast';
import ConfirmActionModal from '../shared/ConfirmActionModal';
import PasswordResultModal from '../shared/PasswordResultModal';
import { FULL_DAY_NAMES } from '../../utils/days';

interface TutorDetailModalProps {
  tutor: TutorPublicResponse;
  onClose: () => void;
  onUpdated: () => void;
}

interface EvidencePreviewState {
  qualificationId: number;
  title: string;
  href: string;
  loading: boolean;
  content?: string;
  error?: string;
}

function teachingModeLabel(mode: string | null | undefined) {
  if (mode === 'ONLINE') return 'Trực tuyến';
  if (mode === 'OFFLINE') return 'Trực tiếp';
  if (mode === 'BOTH') return 'Linh hoạt';
  return 'Chưa rõ';
}

function isTextEvidence(href: string) {
  return /\.txt($|\?)/i.test(href);
}

function isImageEvidence(href: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)($|\?)/i.test(href);
}

function reviewNoteLabel(status: string) {
  return status === 'REJECTED' ? 'Lý do từ chối' : 'Ghi chú xét duyệt';
}

export function TutorDetailModal({
  tutor,
  onClose,
  onUpdated,
}: TutorDetailModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [detail, setDetail] = useState<TutorDetailResponse | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<EvidencePreviewState | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'toggle' | 'reset';
    title: string;
    desc: string;
    variant?: 'primary' | 'danger';
  } | null>(null);

  const handleStartChat = async () => {
    if (!detail) return;
    setLoading(true);
    try {
      const thread = await messageApi.ensureThread({ target_account_id: detail.profile.account_id });
      navigate(`/staff/messages?threadId=${thread.id}`);
    } catch (err) {
      toast('error', extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setNote('');
    staffApi
      .getTutorDetail(tutor.id)
      .then(setDetail)
      .catch(() => toast('error', 'Lỗi tải chi tiết hồ sơ gia sư'));
  }, [tutor.id, toast]);

  const rejectedReasons = detail
    ? [
        ...detail.qualifications
          .filter((q) => q.status === 'REJECTED')
          .map((q) => ({
            label: `Chứng chỉ: ${q.title}`,
            note: q.review_note || 'Chưa ghi lý do cụ thể cho chứng chỉ này.',
          })),
        ...detail.subjects
          .filter((s) => s.status === 'REJECTED')
          .map((s) => ({
            label: `Môn dạy: ${s.subject_name || `#${s.subject_id}`}`,
            note: s.review_note || 'Chưa ghi lý do cụ thể cho môn dạy này.',
          })),
      ]
    : [];

  const openEvidencePreview = async (qualificationId: number, title: string, fileUrl: string | null | undefined) => {
    const href = getSafeDocumentHref(fileUrl);
    if (!href) {
      toast('warning', fileUrl ? 'Tài liệu chưa có URL công khai' : 'Chưa có tài liệu minh chứng');
      return;
    }

    setEvidencePreview({ qualificationId, title, href, loading: isTextEvidence(href) });

    if (!isTextEvidence(href)) return;

    try {
      const response = await fetch(href);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const content = await response.text();
      setEvidencePreview((current) =>
        current?.qualificationId === qualificationId && current.href === href
          ? { ...current, loading: false, content }
          : current,
      );
    } catch {
      setEvidencePreview((current) =>
        current?.qualificationId === qualificationId && current.href === href
          ? { ...current, loading: false, error: 'Không thể tải nội dung minh chứng.' }
          : current,
      );
    }
  };

  const handleReview = async (action: 'VERIFIED' | 'REJECTED') => {
    setLoading(true);
    try {
      await staffApi.reviewTutor(tutor.id, { action, review_note: note || undefined });
      setNote('');
      toast('success', action === 'VERIFIED' ? 'Đã duyệt hồ sơ tổng thể!' : 'Đã từ chối hồ sơ tổng thể.');
      onUpdated();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast('error', message || 'Thao tác phê duyệt hồ sơ thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSubject = async (subId: number, action: 'APPROVED' | 'REJECTED') => {
    try {
      await staffApi.reviewSubject(subId, { action, review_note: note || undefined });
      setNote('');
      toast('success', `Đã ${action === 'APPROVED' ? 'duyệt' : 'từ chối'} môn dạy`);
      staffApi.getTutorDetail(tutor.id).then(setDetail);
    } catch {
      toast('error', 'Cập nhật môn dạy thất bại');
    }
  };

  const handleReviewQualification = async (qId: number, action: 'APPROVED' | 'REJECTED') => {
    try {
      await staffApi.reviewQualification(qId, { action, review_note: note || undefined });
      setNote('');
      toast('success', `Đã ${action === 'APPROVED' ? 'duyệt' : 'từ chối'} chứng chỉ`);
      staffApi.getTutorDetail(tutor.id).then(setDetail);
    } catch {
      toast('error', 'Cập nhật chứng chỉ thất bại');
    }
  };

  const isPending = tutor.verification_status === 'PENDING_REVIEW';
  const hasPendingItems = detail
    ? detail.qualifications.some((q) => q.status === 'PENDING') ||
      detail.subjects.some((s) => s.status === 'PENDING')
    : false;

  const executeConfirmAction = async () => {
    if (!confirmAction || !detail) return;
    setLoading(true);
    try {
      if (confirmAction.type === 'toggle') {
        const accountId = detail.profile.account_id;
        const isSuspending = detail.profile.account_status !== 'SUSPENDED';
        await staffApi.updateAccountStatus(accountId, isSuspending ? 'SUSPENDED' : 'ACTIVE');
        setDetail((current) => current ? {
          ...current,
          profile: {
            ...current.profile,
            account_status: isSuspending ? 'SUSPENDED' : 'ACTIVE',
          },
        } : current);
        toast('success', `Đã ${isSuspending ? 'đình chỉ' : 'kích hoạt lại'} gia sư ${tutor.full_name}`);
        onUpdated();
      } else {
        const result = await staffApi.resetPassword(detail.profile.account_id);
        setResetResult({ name: tutor.full_name, password: result.temp_password });
        toast('success', `Đã cấp lại mật khẩu cho ${tutor.full_name}`);
      }
    } catch {
      toast('error', 'Thao tác thất bại');
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  const askToggle = () => {
    if (!detail) return;
    const isSuspending = detail.profile.account_status !== 'SUSPENDED';
    setConfirmAction({
      type: 'toggle',
      title: isSuspending ? 'Đình chỉ gia sư' : 'Kích hoạt lại gia sư',
      desc: isSuspending
        ? `Gia sư "${tutor.full_name}" sẽ không thể đăng nhập hoặc nhận các lớp học mới sau khi bị đình chỉ.`
        : `Mở khóa để gia sư "${tutor.full_name}" có thể đăng nhập và hoạt động bình thường trở lại.`,
      variant: isSuspending ? 'danger' : 'primary',
    });
  };

  const askReset = () => {
    setConfirmAction({
      type: 'reset',
      title: 'Cấp lại mật khẩu',
      desc: `Mật khẩu hiện tại của gia sư "${tutor.full_name}" sẽ bị vô hiệu hóa và được thay thế bằng một mật khẩu tạm thời.`,
      variant: 'primary',
    });
  };

  return (
    <>
      <Modal
        open={true}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <span>Hồ sơ: {tutor.full_name}</span>
            {getStatusBadge(tutor.verification_status)}
          </div>
        }
        size="lg"
        footer={
          isPending || hasPendingItems ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Đóng
              </Button>
              {detail && (
                <Button variant="outline" loading={loading} onClick={handleStartChat}>
                  💬 Nhắn tin
                </Button>
              )}
              <Button variant="danger" loading={loading} onClick={() => handleReview('REJECTED')}>
                Từ chối hồ sơ
              </Button>
              <Button loading={loading} onClick={() => handleReview('VERIFIED')}>
                Duyệt hồ sơ
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Đóng
              </Button>
              {detail && (
                <>
                  <Button variant="outline" loading={loading} onClick={handleStartChat}>
                    💬 Nhắn tin
                  </Button>
                  <Button variant="outline" loading={loading} onClick={askReset}>
                    🔑 Cấp mật khẩu mới
                  </Button>
                  <Button
                    variant={detail.profile.account_status === 'SUSPENDED' ? 'primary' : 'danger'}
                    loading={loading}
                    onClick={askToggle}
                  >
                    {detail.profile.account_status === 'SUSPENDED' ? '✅ Kích hoạt lại' : '🚫 Đình chỉ hoạt động'}
                  </Button>
                </>
              )}
            </div>
          )
        }
      >
        {!detail ? (
          <div className="py-12 flex justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Bio */}
            <div>
              <h4 className="text-sm font-medium text-text-secondary mb-1.5">Giới thiệu bản thân</h4>
              <p className="text-sm bg-surface-tertiary p-3 rounded-lg border border-border-light leading-relaxed">
                {detail.profile.bio || 'Chưa có giới thiệu.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm bg-surface-secondary/40 p-3 rounded-lg border border-border-light/50">
              <div>
                <span className="text-text-tertiary">Trình độ học vấn:</span>{' '}
                <span className="font-semibold text-text-primary">{detail.profile.qualification_level || '—'}</span>
              </div>
              <div>
                <span className="text-text-tertiary">Kinh nghiệm:</span>{' '}
                <span className="font-semibold text-text-primary">{detail.profile.years_experience} năm</span>
              </div>
              <div>
                <span className="text-text-tertiary">Hình thức dạy:</span>{' '}
                <span className="font-semibold text-text-primary">{teachingModeLabel(detail.profile.teaching_mode)}</span>
              </div>
              <div>
                <span className="text-text-tertiary">Khu vực dạy:</span>{' '}
                <span className="font-semibold text-text-primary">{detail.profile.teaching_area || '—'}</span>
              </div>
            </div>

            {(detail.profile.verification_status === 'REJECTED' || rejectedReasons.length > 0) && (
              <div className="rounded-lg border border-danger-200 bg-danger-50/70 p-3">
                <h4 className="text-sm font-semibold text-danger-700">Lý do từ chối</h4>
                {rejectedReasons.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {rejectedReasons.map((reason) => (
                      <div key={reason.label} className="rounded-md bg-white/80 px-3 py-2 text-sm">
                        <p className="font-semibold text-text-primary">{reason.label}</p>
                        <p className="mt-0.5 text-text-secondary">{reason.note}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-danger-700">
                    Hồ sơ đã bị từ chối nhưng chưa có lý do cụ thể trên từng hạng mục. Cần bổ sung ghi chú xét duyệt để gia sư biết cách chỉnh sửa.
                  </p>
                )}
              </div>
            )}

            {/* Qualifications */}
            <div>
              <h4 className="text-sm font-medium text-text-secondary mb-2">
                Chứng chỉ & Bằng cấp ({detail.qualifications.length})
              </h4>
              {detail.qualifications.length === 0 ? (
                <p className="text-sm text-text-tertiary italic">Chưa tải lên chứng chỉ nào.</p>
              ) : (
                <div className="space-y-2">
                  {detail.qualifications.map((q) => {
                    const hasEvidence = Boolean(q.file_url?.trim());
                    const evidenceHref = getSafeDocumentHref(q.file_url);
                    const previewing = evidencePreview?.qualificationId === q.id;
                    return (
                      <div
                        key={q.id}
                        className={`rounded-lg border p-3 ${
                          q.status === 'PENDING' ? 'bg-warning-50/20 border-warning-200' : 'bg-surface-secondary/20 border-border-light'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-text-primary truncate">{q.title}</span>
                              {getStatusBadge(q.status)}
                            </div>
                            <p className="text-xs text-text-secondary mt-0.5">
                              {q.type} {q.issuer && `· Nơi cấp: ${q.issuer}`}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {evidenceHref ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="px-2.5 py-1 text-xs"
                                  onClick={() => openEvidencePreview(q.id, q.title, q.file_url)}
                                >
                                  {previewing ? 'Đang xem minh chứng' : 'Xem minh chứng trong hồ sơ'}
                                </Button>
                              ) : (
                                <span className="text-xs font-semibold text-warning-600">
                                  {q.file_url ? 'Tài liệu chưa có URL công khai' : 'Không có tài liệu'}
                                </span>
                              )}
                              {evidenceHref && (
                                <a
                                  href={evidenceHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-semibold text-text-tertiary hover:text-primary-700"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  Mở riêng
                                </a>
                              )}
                            </div>
                            {q.review_note && q.status !== 'PENDING' && (
                              <p className={`mt-2 rounded-md px-3 py-2 text-xs leading-5 ${
                                q.status === 'REJECTED'
                                  ? 'border border-danger-100 bg-danger-50 text-danger-700'
                                  : 'border border-success-100 bg-success-50 text-success-700'
                              }`}>
                                <span className="font-semibold">{reviewNoteLabel(q.status)}:</span> {q.review_note}
                              </p>
                            )}
                            {q.status === 'REJECTED' && !q.review_note && (
                              <p className="mt-2 rounded-md border border-danger-100 bg-danger-50 px-3 py-2 text-xs font-semibold text-danger-700">
                                Chưa có lý do từ chối cho chứng chỉ này.
                              </p>
                            )}
                            {!hasEvidence && (
                              <p className="mt-1 text-xs font-semibold text-danger-600">
                                Thiếu file tài liệu, chưa thể duyệt chứng chỉ này.
                              </p>
                            )}
                          </div>
                          {q.status === 'PENDING' && (
                            <div className="flex gap-1.5 shrink-0">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs px-2.5 py-1"
                                disabled={!hasEvidence}
                                onClick={() => handleReviewQualification(q.id, 'APPROVED')}
                              >
                                Duyệt
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs px-2.5 py-1 text-danger-600 border-danger-200 hover:bg-danger-50"
                                onClick={() => handleReviewQualification(q.id, 'REJECTED')}
                              >
                                Từ chối
                              </Button>
                            </div>
                          )}
                        </div>

                        {previewing && (
                          <div className="mt-3 overflow-hidden rounded-lg border border-border-light bg-white">
                            <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold uppercase tracking-wide text-text-secondary">
                                  Minh chứng: {evidencePreview.title}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-text-tertiary">{evidencePreview.href}</p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="px-2 py-1 text-xs"
                                onClick={() => setEvidencePreview(null)}
                              >
                                Đóng xem
                              </Button>
                            </div>
                            <div className="max-h-72 overflow-auto bg-white p-3">
                              {evidencePreview.loading ? (
                                <div className="flex items-center justify-center py-8">
                                  <Spinner />
                                </div>
                              ) : evidencePreview.error ? (
                                <p className="rounded-md border border-danger-100 bg-danger-50 p-3 text-sm text-danger-700">
                                  {evidencePreview.error}
                                </p>
                              ) : evidencePreview.content !== undefined ? (
                                <pre className="whitespace-pre-wrap rounded-md bg-surface-secondary p-3 text-xs leading-5 text-text-secondary">
                                  {evidencePreview.content}
                                </pre>
                              ) : isImageEvidence(evidencePreview.href) ? (
                                <img
                                  src={evidencePreview.href}
                                  alt={`Minh chứng ${evidencePreview.title}`}
                                  className="max-h-64 w-full rounded-md object-contain"
                                />
                              ) : (
                                <iframe
                                  title={`Minh chứng ${evidencePreview.title}`}
                                  src={evidencePreview.href}
                                  className="h-64 w-full rounded-md border border-border-light"
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Subjects */}
            <div>
              <h4 className="text-sm font-medium text-text-secondary mb-2">Đăng ký môn dạy ({detail.subjects.length})</h4>
              {detail.subjects.length === 0 ? (
                <p className="text-sm text-text-tertiary italic">Chưa đăng ký môn học nào.</p>
              ) : (
                <div className="space-y-2">
                  {detail.subjects.map((s) => (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                        s.status === 'PENDING' ? 'bg-warning-50/20 border-warning-200' : 'bg-surface-secondary/20 border-border-light'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">
                            {s.subject_name || `Môn học #${s.subject_id}`}
                          </span>
                          {getStatusBadge(s.status)}
                        </div>
                        <span className="text-xs text-text-secondary block mt-0.5">
                          {s.grade_level} · Mức phí đề xuất:{' '}
                          <span className="font-semibold">{parseFloat(s.fee_per_session).toLocaleString('vi-VN')}đ/buổi</span>
                        </span>
                        {s.review_note && s.status !== 'PENDING' && (
                          <p className={`mt-2 rounded-md px-3 py-2 text-xs leading-5 ${
                            s.status === 'REJECTED'
                              ? 'border border-danger-100 bg-danger-50 text-danger-700'
                              : 'border border-success-100 bg-success-50 text-success-700'
                          }`}>
                            <span className="font-semibold">{reviewNoteLabel(s.status)}:</span> {s.review_note}
                          </p>
                        )}
                        {s.status === 'REJECTED' && !s.review_note && (
                          <p className="mt-2 rounded-md border border-danger-100 bg-danger-50 px-3 py-2 text-xs font-semibold text-danger-700">
                            Chưa có lý do từ chối cho môn dạy này.
                          </p>
                        )}
                      </div>
                      {s.status === 'PENDING' && (
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs px-2.5 py-1"
                            onClick={() => handleReviewSubject(s.id, 'APPROVED')}
                          >
                            Duyệt
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs px-2.5 py-1 text-danger-600 border-danger-200 hover:bg-danger-50"
                            onClick={() => handleReviewSubject(s.id, 'REJECTED')}
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

            {/* Availability */}
            <div>
              <h4 className="text-sm font-medium text-text-secondary mb-2">Khung thời gian rảnh ({detail.availabilities.length})</h4>
              {detail.availabilities.length === 0 ? (
                <p className="text-sm text-text-tertiary italic">Chưa cập nhật lịch rảnh.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {detail.availabilities.map((a) => (
                    <span
                      key={a.id}
                      className="text-xs bg-surface-tertiary text-text-secondary border border-border-light px-2.5 py-1 rounded-md"
                    >
                      {FULL_DAY_NAMES[a.day_of_week]} {a.start_time?.slice(0, 5)} – {a.end_time?.slice(0, 5)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Note */}
            {(isPending || hasPendingItems) && (
              <div className="pt-3 border-t border-border-light">
                <Input
                  label="Ghi chú lý do duyệt/từ chối"
                  placeholder="Nhập lý do phản hồi cho gia sư (ví dụ: lý do từ chối nếu có)..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm actions */}
      {confirmAction && (
        <ConfirmActionModal
          open={true}
          title={confirmAction.title}
          variant={confirmAction.variant}
          description={confirmAction.desc}
          confirmLabel={confirmAction.title}
          loading={loading}
          onConfirm={executeConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Reset Result */}
      {resetResult && (
        <PasswordResultModal
          open={true}
          onClose={() => setResetResult(null)}
          name={resetResult.name}
          password={resetResult.password}
          roleLabel="Gia sư"
        />
      )}
    </>
  );
}

export default TutorDetailModal;
