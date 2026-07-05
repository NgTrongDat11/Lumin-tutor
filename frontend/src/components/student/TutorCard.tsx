import type { RecommendedTutor } from '../../types';
import Avatar from '../ui/Avatar';
import { currency } from '../../utils/format';
import { getMatchScoreNumber, MatchScoreBadge, ScoreExplanationPanel } from './MatchScore';
import { LocationMarkerIcon } from '../ui/Icons';

function getTeachingModeLabel(mode: string | null | undefined) {
  if (mode === 'ONLINE') return 'Trực tuyến';
  if (mode === 'OFFLINE') return 'Trực tiếp';
  return 'Linh hoạt';
}

interface TutorCardProps {
  rec: RecommendedTutor;
  isRecommendation?: boolean;
  onOpen: () => void;
}

export function TutorCard({ rec, isRecommendation, onOpen }: TutorCardProps) {
  const lowestFee = rec.tutor.subjects.reduce<number | null>((lowest, subject) => {
    const fee = Number(subject.fee_per_session);
    if (!Number.isFinite(fee)) return lowest;
    return lowest === null ? fee : Math.min(lowest, fee);
  }, null);
  const modeLabel = getTeachingModeLabel(rec.tutor.teaching_mode);
  const isPremiumRecommendation = Boolean(isRecommendation && getMatchScoreNumber(rec.score) >= 80);

  return (
    <article
      className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-6 ${
        isPremiumRecommendation
          ? 'border-primary-200/80 hover:border-transparent hover:ring-2 hover:ring-primary-500/35 hover:shadow-[0_24px_55px_-30px_rgba(17,103,98,0.55)]'
          : 'border-border hover:border-primary-200'
      }`}
      onClick={onOpen}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-50/80 via-white/0 to-warning-50/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative z-10 mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar id={rec.tutor.id} name={rec.tutor.full_name} src={rec.tutor.avatar_url || undefined} size="lg" shape="square" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-600">Gia sư 1-1</p>
              {rec.tutor.verification_status === 'VERIFIED' && (
                <span className="inline-flex items-center rounded-full bg-success-50 px-1.5 py-0.2 text-[9px] font-bold text-success-700 border border-success-100">
                  Đã xác minh
                </span>
              )}
            </div>
            <h4 className="text-lg font-bold text-text-primary line-clamp-1 flex items-center gap-1">
              {rec.tutor.full_name}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-bold text-text-tertiary">
              <span className="text-text-secondary">{modeLabel}</span>
              <span>·</span>
              <span className="text-warning-600">★ {Number(rec.tutor.average_rating).toFixed(1)}</span>
              <span className="font-normal text-text-tertiary">({rec.tutor.rating_count})</span>
              <span>·</span>
              <span className="font-normal text-text-secondary">{rec.tutor.years_experience} năm KN</span>
            </div>
          </div>
        </div>
        {isRecommendation && <MatchScoreBadge score={rec.score} />}
      </div>

      <p className="relative z-10 mb-4 min-h-[2.5rem] line-clamp-2 text-sm text-text-secondary">
        {rec.tutor.bio || 'Gia sư chưa cập nhật giới thiệu chi tiết.'}
      </p>

      <div className="relative z-10 mb-4 flex items-center gap-2 rounded-lg border border-border-light bg-white/70 px-3 py-2 text-xs font-semibold text-text-secondary shadow-xs backdrop-blur-sm transition-all duration-300 group-hover:border-primary-100 group-hover:bg-white">
        <LocationMarkerIcon className="h-4 w-4 shrink-0 text-primary-600" />
        <span className="shrink-0 text-text-tertiary">Khu vực dạy</span>
        <span className="min-w-0 truncate text-text-primary">{rec.tutor.teaching_area || 'Chưa cập nhật'}</span>
      </div>

      <div className="relative z-10 mt-auto space-y-3">
        {rec.tutor.subjects.length > 0 && (
          <div className="rounded-xl border border-border-light bg-white/75 p-3 shadow-xs backdrop-blur-sm">
            <p className="mb-2 text-xs font-bold uppercase text-text-tertiary">Môn dạy</p>
            <div className="flex flex-wrap gap-1.5">
              {rec.tutor.subjects.map((subject) => (
                <span
                  key={subject.id}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary-100 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-300 hover:bg-white hover:shadow-sm"
                >
                  <span className="truncate">{subject.subject_name || 'Môn học'}</span>
                  <span className="shrink-0 font-normal text-primary-400">· {subject.grade_level}</span>
                </span>
              ))}
            </div>
            {lowestFee !== null && (
              <p className="mt-2 text-sm font-bold text-primary-700">
                Từ {currency(lowestFee)}
                <span className="text-xs font-normal text-text-tertiary"> / buổi</span>
              </p>
            )}
          </div>
        )}

        {isRecommendation && (
          <ScoreExplanationPanel
            score={rec.score}
            reasons={rec.reasons}
            compact={true}
            rec={rec}
            onOpenDetails={onOpen}
          />
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className="w-full cursor-pointer rounded-xl border border-primary-100 bg-white/85 px-3 py-2 text-sm font-bold text-primary-700 shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-200 hover:bg-primary-50 hover:shadow-md"
        >
          Xem hồ sơ gia sư
        </button>
      </div>
    </article>
  );
}

export default TutorCard;
