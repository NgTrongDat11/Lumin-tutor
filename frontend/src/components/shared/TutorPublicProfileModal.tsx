import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { extractErrorMessage, publicBrowseApi, reviewApi } from '../../services/api';
import type { ReviewResponse, TutorPublicResponse } from '../../types';
import { currency } from '../../utils/format';
import { FULL_DAY_NAMES } from '../../utils/days';
import Avatar from '../ui/Avatar';
import { getStatusBadge } from '../ui/Badge';
import Modal from '../ui/Modal';
import { BookOpenIcon, CalendarIcon, ClockIcon, LocationMarkerIcon, ShieldCheckIcon, UsersIcon } from '../ui/Icons';
import ContactDetails from './ContactDetails';

interface TutorPublicProfileModalProps {
  tutorId: number | null;
  initialTutor?: TutorPublicResponse | null;
  onClose: () => void;
  footer?: ReactNode;
  afterContent?: ReactNode;
  contact?: {
    phone?: string | null;
    address?: string | null;
  };
}

function teachingModeLabel(mode: string | null | undefined) {
  if (mode === 'ONLINE') return 'Trực tuyến';
  if (mode === 'OFFLINE') return 'Trực tiếp';
  if (mode === 'BOTH') return 'Linh hoạt';
  return mode || 'Chưa cập nhật';
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border-light bg-surface-secondary p-3.5">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-primary-700 shadow-xs">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-1 text-sm font-bold text-text-primary">{value}</p>
    </div>
  );
}

function ModalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-bold text-text-primary">{title}</h3>
      {children}
    </section>
  );
}

export default function TutorPublicProfileModal({
  tutorId,
  initialTutor,
  onClose,
  footer,
  afterContent,
  contact,
}: TutorPublicProfileModalProps) {
  const [profile, setProfile] = useState<TutorPublicResponse | null>(null);
  const [reviews, setReviews] = useState<ReviewResponse[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tutorId) {
      setProfile(null);
      setReviews([]);
      setError('');
      setLoading(false);
      setReviewsLoading(false);
      return;
    }

    let cancelled = false;
    const fallback = initialTutor?.id === tutorId ? initialTutor : null;
    setProfile(fallback);
    setReviews([]);
    setError('');
    setLoading(true);
    setReviewsLoading(Boolean(localStorage.getItem('access_token')));

    publicBrowseApi
      .tutor(tutorId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled && !fallback) setError(extractErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    if (localStorage.getItem('access_token')) {
      reviewApi
        .listByTutor(tutorId)
        .then((data) => {
          if (!cancelled) setReviews(data);
        })
        .catch(() => {
          if (!cancelled) setReviews([]);
        })
        .finally(() => {
          if (!cancelled) setReviewsLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [initialTutor, tutorId]);

  const qualifications = profile?.qualifications ?? [];
  const subjects = profile?.subjects ?? [];
  const availabilities = profile?.availabilities ?? [];

  return (
    <Modal open={Boolean(tutorId)} onClose={onClose} title="Hồ sơ gia sư" size="lg" footer={footer}>
      {loading && !profile ? (
        <div className="py-14 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-100 border-t-primary-700" />
          <p className="mt-3 text-sm font-semibold text-text-secondary">Đang tải hồ sơ gia sư...</p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-danger-100 bg-danger-50 px-4 py-5 text-sm text-danger-700">
          Không thể tải hồ sơ gia sư{error ? `: ${error}` : '.'}
        </div>
      ) : profile ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 border-b border-border-light pb-5 sm:flex-row sm:items-start">
            <Avatar id={profile.id} name={profile.full_name} src={profile.avatar_url || undefined} size="xl" shape="square" className="rounded-2xl border border-border-light shadow-sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight text-text-primary">{profile.full_name}</h2>
                {getStatusBadge(profile.verification_status)}
              </div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {profile.bio || 'Gia sư chưa cập nhật phần giới thiệu.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                  {Number(profile.average_rating || 0).toFixed(1)} sao · {profile.rating_count} đánh giá
                </span>
                <span className="rounded-full border border-border-light bg-surface-secondary px-3 py-1 text-xs font-bold text-text-secondary">
                  {profile.years_experience} năm kinh nghiệm
                </span>
              </div>
            </div>
          </div>

          <ContactDetails
            title="Liên hệ gia sư"
            phone={contact?.phone}
            address={contact?.address}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <InfoTile icon={BookOpenIcon} label="Hình thức dạy" value={teachingModeLabel(profile.teaching_mode)} />
            <InfoTile icon={UsersIcon} label="Trình độ" value={profile.qualification_level || 'Chưa cập nhật'} />
            <InfoTile icon={LocationMarkerIcon} label="Khu vực" value={profile.teaching_area || 'Chưa cập nhật'} />
          </div>

          <ModalSection title="Môn dạy đã duyệt">
            {subjects.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-surface-secondary p-4 text-sm text-text-tertiary">
                Chưa có môn dạy công khai.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {subjects.map((subject) => (
                  <div key={subject.id} className="rounded-lg border border-border-light bg-white p-4 shadow-xs">
                    <p className="font-bold text-text-primary">{subject.subject_name || `Môn #${subject.subject_id}`}</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-bold uppercase tracking-wide text-text-tertiary">{subject.grade_level}</span>
                      <span className="text-sm font-bold text-primary-700">
                        {currency(subject.fee_per_session)}
                        <span className="text-xs font-normal text-text-tertiary">/buổi</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ModalSection>

          <ModalSection title="Đánh giá ẩn danh">
            {reviewsLoading ? (
              <div className="rounded-lg border border-border-light bg-surface-secondary p-4 text-sm font-semibold text-text-tertiary">
                Đang tải đánh giá...
              </div>
            ) : reviews.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-surface-secondary p-4 text-sm text-text-tertiary">
                Chưa có nội dung đánh giá công khai.
              </p>
            ) : (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <article key={review.id} className="rounded-lg border border-border-light bg-white p-4 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-text-primary">Học viên đã học</p>
                        <p className="mt-0.5 text-xs text-text-tertiary">
                          {review.created_at ? new Date(review.created_at).toLocaleDateString('vi-VN') : 'Chưa rõ thời gian'}
                        </p>
                      </div>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                        {review.rating}/5 sao
                      </span>
                    </div>
                    {review.comment && (
                      <p className="mt-3 text-sm leading-6 text-text-secondary">{review.comment}</p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </ModalSection>

          <ModalSection title="Lịch rảnh trong tuần">
            {availabilities.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-surface-secondary p-4 text-sm text-text-tertiary">
                Gia sư chưa công khai lịch rảnh.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availabilities.map((availability) => (
                  <span key={availability.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-xs font-semibold text-text-secondary">
                    <CalendarIcon className="h-3.5 w-3.5 text-primary-700" />
                    {FULL_DAY_NAMES[availability.day_of_week]} {availability.start_time?.slice(0, 5)}-{availability.end_time?.slice(0, 5)} · {teachingModeLabel(availability.mode)}
                  </span>
                ))}
              </div>
            )}
          </ModalSection>

          <ModalSection title="Chứng chỉ đã duyệt">
            {qualifications.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-surface-secondary p-4 text-sm text-text-tertiary">
                Chưa có chứng chỉ công khai.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {qualifications.map((qualification) => (
                  <a
                    key={qualification.id}
                    href={qualification.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-border-light bg-white p-4 shadow-xs transition-colors hover:border-primary-200 hover:bg-primary-50/40"
                  >
                    <div className="mb-2 flex items-center gap-2 text-primary-700">
                      <ShieldCheckIcon className="h-4 w-4" />
                      <span className="text-xs font-bold uppercase tracking-wide">{qualification.type}</span>
                    </div>
                    <p className="font-bold text-text-primary">{qualification.title}</p>
                    <p className="mt-1 text-xs text-text-tertiary">{qualification.issuer || 'Chưa cập nhật đơn vị cấp'}</p>
                  </a>
                ))}
              </div>
            )}
          </ModalSection>

          {afterContent}

          {loading && (
            <div className="flex items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-xs font-semibold text-text-tertiary">
              <ClockIcon className="h-4 w-4 animate-pulse" />
              Đang đồng bộ dữ liệu chứng chỉ mới nhất...
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
