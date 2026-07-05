import { useEffect, useState, useMemo } from 'react';
import { privateRequestApi, reviewApi, scheduleApi } from '../../services/api';
import type { PrivateRequestResponse, ReviewCreate, ReviewResponse } from '../../types';
import { PortalPage, SegmentedTabs, EmptyPanel } from '../../components/portal/PortalPage';
import { getStatusBadge } from '../../components/ui/Badge';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { BookOpenIcon, CalendarIcon, UserCheckIcon } from '../../components/ui/Icons';

type Tab = 'PENDING' | 'DONE';

/** Items that can be reviewed (private requests or class enrollments) */
interface ReviewableItem {
  type: 'PRIVATE_TUTORING_REQUEST' | 'CLASS_REGISTRATION';
  targetId: number;
  tutorId: number;
  tutorName: string;
  subjectName: string;
  gradeLevel: string;
  mode: string;
  sessions: number | null;
  status: string;
  alreadyReviewed: boolean;
  tutorAvatar?: string;
}

export default function StudentReviews() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('PENDING');
  const [loading, setLoading] = useState(true);

  const [reviewableItems, setReviewableItems] = useState<ReviewableItem[]>([]);
  const [myReviews, setMyReviews] = useState<ReviewResponse[]>([]);

  // Review modal state
  const [reviewTarget, setReviewTarget] = useState<ReviewableItem | null>(null);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const [requests, reviews, sessions] = await Promise.all([
        privateRequestApi.list().catch(() => [] as PrivateRequestResponse[]),
        reviewApi.listMy().catch(() => [] as ReviewResponse[]),
        scheduleApi.listSessions().catch(() => []),
      ]);

      setMyReviews(reviews);

      // Build reviewable items from private requests
      const reviewedTargetKeys = new Set(
        reviews.map((r) => `${r.target_type}:${r.target_id}`)
      );

      const items: ReviewableItem[] = [];

      // Private requests that are PAID, ONGOING, or COMPLETED
      requests
        .filter((r) => ['PAID', 'ONGOING', 'COMPLETED'].includes(r.status))
        .forEach((req) => {
          items.push({
            type: 'PRIVATE_TUTORING_REQUEST',
            targetId: req.id,
            tutorId: req.tutor_id,
            tutorName: req.tutor_name || `Gia sư #${req.tutor_id}`,
            subjectName: req.subject_name || 'Chưa xác định',
            gradeLevel: req.grade_level,
            mode: req.mode,
            sessions: req.requested_sessions,
            status: req.status,
            alreadyReviewed: reviewedTargetKeys.has(`PRIVATE_TUTORING_REQUEST:${req.id}`),
            tutorAvatar: req.tutor_avatar_url || undefined,
          });
        });

      // Class enrollments inferred from sessions
      const classMap = new Map<number, { tutorName: string; classTitle: string }>();
      sessions.forEach((s) => {
        if (s.class_id && !classMap.has(s.class_id)) {
          classMap.set(s.class_id, {
            tutorName: s.tutor_name || 'Gia sư',
            classTitle: s.class_title || `Lớp #${s.class_id}`,
          });
        }
      });

      setReviewableItems(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const pendingItems = useMemo(
    () => reviewableItems.filter((item) => !item.alreadyReviewed),
    [reviewableItems]
  );

  const doneItems = useMemo(
    () => reviewableItems.filter((item) => item.alreadyReviewed),
    [reviewableItems]
  );

  const handleOpenReview = (item: ReviewableItem) => {
    setReviewTarget(item);
    setRating(5);
    setHoverRating(0);
    setComment('');
  };

  const handleSubmitReview = async () => {
    if (!reviewTarget) return;

    setSubmitting(true);
    try {
      const payload: ReviewCreate = {
        tutor_id: reviewTarget.tutorId,
        target_type: reviewTarget.type,
        target_id: reviewTarget.targetId,
        rating,
        comment: comment.trim() || undefined,
      };
      await reviewApi.create(payload);
      toast('success', 'Đánh giá thành công! Cảm ơn bạn đã chia sẻ.');
      setReviewTarget(null);
      // Reload data
      setLoading(true);
      await loadData();
    } catch {
      toast('error', 'Đánh giá thất bại. Có thể bạn đã đánh giá rồi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <CardGridSkeleton />;

  return (
    <PortalPage
      title="Đánh giá gia sư"
      description="Chia sẻ trải nghiệm học tập để giúp cộng đồng chọn được gia sư phù hợp."
    >
      <SegmentedTabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: 'PENDING', label: 'Cần đánh giá', count: pendingItems.length },
          { value: 'DONE', label: 'Đã đánh giá', count: doneItems.length + myReviews.length },
        ]}
      />

      <div className="mt-8">
        {activeTab === 'PENDING' && (
          <div className="space-y-6">
            {pendingItems.length === 0 ? (
              <EmptyPanel
                title="Chưa có lượt học nào cần đánh giá"
                description="Khi bạn hoàn thành và thanh toán xong khóa học, các lượt học sẽ xuất hiện ở đây để bạn đánh giá gia sư."
              />
            ) : (
              <>
                <p className="text-sm text-text-secondary">
                  Bạn có <span className="font-bold text-primary-700">{pendingItems.length}</span> lượt học đang chờ đánh giá.
                  Hãy chia sẻ trải nghiệm của bạn để giúp gia sư cải thiện!
                </p>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {pendingItems.map((item) => (
                    <ReviewableCard
                      key={`${item.type}:${item.targetId}`}
                      item={item}
                      onReview={() => handleOpenReview(item)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'DONE' && (
          <div className="space-y-6">
            {myReviews.length === 0 && doneItems.length === 0 ? (
              <EmptyPanel
                title="Chưa có đánh giá nào"
                description="Bạn chưa gửi đánh giá nào. Hãy chuyển sang tab 'Cần đánh giá' để bắt đầu."
              />
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {myReviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review Modal */}
      <ReviewModal
        target={reviewTarget}
        rating={rating}
        hoverRating={hoverRating}
        comment={comment}
        submitting={submitting}
        onRatingChange={setRating}
        onHoverChange={setHoverRating}
        onCommentChange={setComment}
        onSubmit={handleSubmitReview}
        onClose={() => setReviewTarget(null)}
      />
    </PortalPage>
  );
}

/* ── Reviewable Card ────────────────────────────── */
function ReviewableCard({ item, onReview }: { item: ReviewableItem; onReview: () => void }) {
  const modeLabel = item.mode === 'ONLINE' ? 'Trực tuyến' : item.mode === 'OFFLINE' ? 'Trực tiếp' : 'Cả hai';

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border-light bg-white shadow-sm transition-all duration-300 hover:border-primary-200 hover:shadow-lg md:rounded-2xl md:hover:-translate-y-1">
      {/* Decorative gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute top-0 right-0 w-28 h-28 bg-warning-50 rounded-bl-full opacity-40 pointer-events-none" />

      <div className="p-6 relative z-10 flex flex-col h-full">
        {/* Header: tutor info */}
        <div className="mb-5 flex items-start gap-3 sm:gap-4">
          <Avatar id={item.tutorId} name={item.tutorName} src={item.tutorAvatar} size="lg" shape="square" className="border-2 border-white shadow-sm rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-0.5">
              {item.type === 'PRIVATE_TUTORING_REQUEST' ? 'Gia sư 1-1' : 'Lớp nhóm'}
            </p>
            <h3 className="line-clamp-2 text-base font-bold leading-tight text-text-primary sm:text-lg">
              {item.tutorName}
            </h3>
          </div>
          <div className="shrink-0">{getStatusBadge(item.status)}</div>
        </div>

        {/* Details */}
        <div className="bg-surface-secondary/70 rounded-xl p-4 border border-border-light backdrop-blur-sm mb-5 flex-1">
          <h4 className="font-bold text-base text-text-primary mb-3 flex items-center gap-2">
            <BookOpenIcon className="w-4 h-4 text-primary-500" />
            {item.subjectName} — {item.gradeLevel}
          </h4>
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-text-tertiary" />
              {item.sessions ? `${item.sessions} buổi` : 'Đang diễn ra'} · {modeLabel}
            </p>
          </div>
        </div>

        {/* Action */}
        <Button
          className="w-full justify-center shadow-sm"
          onClick={onReview}
        >
          <span className="flex items-center gap-2">
            <UserCheckIcon className="w-4 h-4" />
            Đánh giá gia sư
          </span>
        </Button>
      </div>
    </article>
  );
}

/* ── Review Card (already submitted) ──────────── */
function ReviewCard({ review }: { review: ReviewResponse }) {
  const stars = Array.from({ length: 5 }, (_, i) => i < review.rating);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border-light bg-white shadow-sm md:rounded-2xl">
      {/* Star header strip */}
      <div className="bg-gradient-to-r from-amber-50 to-warning-50 px-6 py-4 border-b border-amber-100/60">
        <div className="flex items-center justify-between">
          <div className="flex gap-0.5">
            {stars.map((filled, i) => (
              <span
                key={i}
                className={`text-xl ${filled ? 'text-amber-400' : 'text-border'}`}
              >
                ★
              </span>
            ))}
          </div>
          <span className="text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-2.5 py-1">
            {review.rating}/5
          </span>
        </div>
      </div>

      <div className="p-6 flex flex-col flex-1">
        {/* Tutor info */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar id={review.tutor_id} name={review.tutor_name || 'Gia sư'} src={review.tutor_avatar_url || undefined} size="md" shape="square" className="border-2 border-white shadow-sm rounded-xl" />
          <div className="min-w-0">
            <p className="line-clamp-2 font-bold text-text-primary">
              {review.tutor_name || `Gia sư #${review.tutor_id}`}
            </p>
            <p className="text-xs text-text-tertiary">
              {review.subject_name || (review.target_type === 'PRIVATE_TUTORING_REQUEST' ? 'Yêu cầu 1-1' : 'Lớp nhóm')}
            </p>
          </div>
        </div>

        {/* Comment */}
        {review.comment ? (
          <div className="bg-surface-secondary rounded-xl p-4 border border-border-light flex-1">
            <p className="text-sm leading-relaxed text-text-secondary italic">
              "{review.comment}"
            </p>
          </div>
        ) : (
          <div className="bg-surface-secondary rounded-xl p-4 border border-border-light border-dashed flex-1 flex items-center justify-center">
            <p className="text-xs text-text-tertiary">Không có nhận xét</p>
          </div>
        )}

        {/* Date */}
        {review.created_at && (
          <p className="text-xs text-text-tertiary mt-3">
            {new Date(review.created_at).toLocaleDateString('vi-VN', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          </p>
        )}
      </div>
    </article>
  );
}

/* ── Review Modal ─────────────────────────────── */
function ReviewModal({
  target,
  rating,
  hoverRating,
  comment,
  submitting,
  onRatingChange,
  onHoverChange,
  onCommentChange,
  onSubmit,
  onClose,
}: {
  target: ReviewableItem | null;
  rating: number;
  hoverRating: number;
  comment: string;
  submitting: boolean;
  onRatingChange: (r: number) => void;
  onHoverChange: (r: number) => void;
  onCommentChange: (c: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  if (!target) return null;

  const displayRating = hoverRating || rating;
  const ratingLabels = ['', 'Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Xuất sắc'];

  return (
    <Modal
      open
      onClose={onClose}
      title="Đánh giá gia sư"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Huỷ bỏ</Button>
          <Button loading={submitting} onClick={onSubmit}>
            ✨ Gửi đánh giá
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Tutor context */}
        <div className="flex items-center gap-4 bg-primary-50 rounded-xl p-4 border border-primary-100">
          <Avatar id={target.tutorId} name={target.tutorName} src={target.tutorAvatar} size="lg" shape="square" className="rounded-xl" />
          <div>
            <p className="text-xs font-bold text-primary-600 uppercase">
              {target.type === 'PRIVATE_TUTORING_REQUEST' ? 'Gia sư 1-1' : 'Giảng viên lớp nhóm'}
            </p>
            <p className="text-lg font-bold text-text-primary">{target.tutorName}</p>
            <p className="text-sm text-text-secondary">
              {target.subjectName} — {target.gradeLevel}
            </p>
          </div>
        </div>

        {/* Star rating */}
        <div className="text-center py-4">
          <p className="text-sm font-bold text-text-primary mb-4">Bạn cảm thấy thế nào?</p>
          <div className="flex justify-center gap-2 mb-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => onRatingChange(star)}
                onMouseEnter={() => onHoverChange(star)}
                onMouseLeave={() => onHoverChange(0)}
                className={`text-4xl cursor-pointer transition-all duration-200 ${
                  star <= displayRating
                    ? 'text-amber-400 scale-110 drop-shadow-sm'
                    : 'text-border hover:text-amber-200'
                }`}
                style={{
                  transform: star <= displayRating ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.15s ease-out',
                }}
              >
                ★
              </button>
            ))}
          </div>
          <p className={`text-sm font-bold transition-colors ${
            displayRating >= 4 ? 'text-success-600' :
            displayRating >= 3 ? 'text-warning-600' :
            'text-danger-500'
          }`}>
            {ratingLabels[displayRating]}
          </p>
        </div>

        {/* Comment */}
        <Textarea
          label="Nhận xét (tuỳ chọn)"
          placeholder="Chia sẻ chi tiết trải nghiệm học tập của bạn... Điều gì bạn thích? Có gì cần cải thiện?"
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          rows={4}
        />

        {/* Tips */}
        <div className="bg-surface-secondary rounded-xl p-4 border border-border-light">
          <p className="text-xs font-bold text-text-tertiary uppercase mb-2">💡 Gợi ý đánh giá</p>
          <ul className="text-xs text-text-secondary space-y-1">
            <li>• Phương pháp giảng dạy có dễ hiểu không?</li>
            <li>• Gia sư có đúng giờ và nhiệt tình không?</li>
            <li>• Bạn có cảm thấy tiến bộ sau khoá học không?</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}
