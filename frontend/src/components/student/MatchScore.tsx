import type { ScoreBreakdownItem, RecommendedTutor, RecommendedClass } from '../../types';
import { CheckCircleIcon } from '../ui/Icons';

export function getMatchScoreNumber(score: string | number | null | undefined) {
  const value = Number(score || 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function getMatchScoreMeta(score: string | number | null | undefined) {
  const percent = getMatchScoreNumber(score);

  if (percent >= 80) {
    return {
      percent,
      label: 'Rất phù hợp',
      description: 'Khớp hầu hết tiêu chí chính trong nhu cầu học.',
      badgeClass: 'border-white/70 bg-gradient-to-r from-primary-700 via-emerald-500 to-warning-500 text-white shadow-lg shadow-primary-900/15',
      softClass: 'border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-primary-50 text-emerald-950',
      barClass: 'bg-gradient-to-r from-emerald-500 via-primary-500 to-warning-500',
    };
  }

  if (percent >= 60) {
    return {
      percent,
      label: 'Phù hợp',
      description: 'Khớp nhiều tiêu chí, chỉ thấp hơn nhóm rất phù hợp ở một vài tín hiệu tổng hợp.',
      badgeClass: 'border-primary-200/70 bg-white/80 text-primary-800 shadow-md shadow-primary-900/10 ring-1 ring-primary-500/15 backdrop-blur-md',
      softClass: 'border-primary-100 bg-primary-50 text-primary-900',
      barClass: 'bg-gradient-to-r from-primary-500 to-emerald-400',
    };
  }

  if (percent >= 40) {
    return {
      percent,
      label: 'Cần cân nhắc',
      description: 'Có tiêu chí khớp, nhưng mức tương thích tổng thể chưa cao.',
      badgeClass: 'border-amber-200/80 bg-white/80 text-amber-800 shadow-sm ring-1 ring-amber-300/25 backdrop-blur-md',
      softClass: 'border-amber-100 bg-amber-50 text-amber-900',
      barClass: 'bg-amber-500',
    };
  }

  return {
    percent,
    label: 'Ít phù hợp',
    description: 'Chỉ khớp một phần nhỏ tiêu chí hiện tại.',
    badgeClass: 'border-border-light bg-white/75 text-text-secondary shadow-xs backdrop-blur-md',
    softClass: 'border-border-light bg-surface-secondary text-text-secondary',
    barClass: 'bg-text-tertiary',
  };
}

const DIRECT_SEMANTIC_REASON_TERMS = [
  'semantic',
  'embedding',
  'ngữ nghĩa',
  'mô tả hồ sơ',
  'ghi chú nhu cầu',
  'nội dung lớp',
];

export function isSemanticMatchReason(reason: string) {
  const value = reason.toLowerCase();
  const hasDirectSemanticTerm = DIRECT_SEMANTIC_REASON_TERMS.some((term) => value.includes(term));

  if (hasDirectSemanticTerm) return true;

  const mentionsProfileOrClassContent =
    value.includes('mô tả') || value.includes('bio') || value.includes('hồ sơ') || value.includes('mục tiêu lớp');
  const mentionsNeedContext =
    value.includes('nội dung') || value.includes('ghi chú') || value.includes('nhu cầu') || value.includes('cần cải thiện');

  return mentionsProfileOrClassContent && mentionsNeedContext;
}

export function splitRecommendationReasons(reasons: string[]) {
  return reasons.reduce(
    (groups, reason) => {
      if (isSemanticMatchReason(reason)) {
        groups.semantic.push(reason);
      } else {
        groups.regular.push(reason);
      }
      return groups;
    },
    { semantic: [] as string[], regular: [] as string[] },
  );
}

export function MatchScoreBadge({ score }: { score: string | number | null | undefined }) {
  const meta = getMatchScoreMeta(score);

  return (
    <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
      <span className={`relative overflow-hidden rounded-full border px-3.5 py-1.5 text-xs font-extrabold backdrop-blur-md ${meta.badgeClass}`}>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/40 via-white/10 to-transparent" />
        <span className="relative inline-flex items-baseline gap-1">
          <span className="text-base leading-none">{meta.percent.toFixed(0)}/100</span>
          <span className="font-bold">điểm phù hợp</span>
        </span>
      </span>
      <span className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">{meta.label}</span>
    </div>
  );
}

export function ScoreExplanationPanel({
  score,
  reasons,
  compact,
  rec,
  onOpenDetails,
}: {
  score: string | number | null | undefined;
  reasons: string[];
  scoreBreakdown?: ScoreBreakdownItem[];
  compact?: boolean;
  rec?: RecommendedTutor | RecommendedClass;
  onOpenDetails?: () => void;
}) {
  const meta = getMatchScoreMeta(score);
  const { semantic, regular } = splitRecommendationReasons(reasons);
  const displayedSemanticReasons = semantic.slice(0, 1);
  const displayedRegularReasons = regular.slice(0, compact ? 2 : 3);
  const hasReasons = reasons.length > 0;

  return (
    <div className={`rounded-xl border p-3 shadow-xs ${meta.softClass}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-text-primary">Vì sao đạt {meta.percent.toFixed(0)}/100 điểm?</p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/80 sm:w-32">
          <div className={`h-full rounded-full ${meta.barClass}`} style={{ width: `${meta.percent}%` }} />
        </div>
      </div>

      {rec?.pillars && rec.pillars.length > 0 && (
        <div className="mt-3 space-y-2">
          {rec.pillars.map((pillar) => {
            const icons: Record<string, string> = { ai: '🧠', practical: '📍', reputation: '⭐' };
            const percent = Math.round(pillar.score * 100);
            return (
              <div key={pillar.key} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-center">{icons[pillar.key] || '📊'}</span>
                <span className="w-28 truncate font-semibold text-text-secondary">{pillar.label}</span>
                <div className="flex-1 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      pillar.key === 'ai' ? 'bg-gradient-to-r from-purple-500 to-pink-500' :
                      pillar.key === 'practical' ? 'bg-gradient-to-r from-primary-500 to-emerald-500' :
                      'bg-gradient-to-r from-amber-400 to-orange-500'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="w-8 text-right font-bold text-text-primary">{percent}%</span>
              </div>
            );
          })}
        </div>
      )}

      {displayedSemanticReasons.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 px-3 py-2">
          <span className="mt-0.5 text-sm">✨</span>
          <div className="min-w-0">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-purple-700">AI Smart Match</span>
            <p className="truncate text-xs font-semibold text-purple-900">{displayedSemanticReasons[0]}</p>
          </div>
        </div>
      )}

      {(displayedRegularReasons.length > 0 || !hasReasons) && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-tertiary">Lý do phù hợp</p>
          <div className="space-y-1">
            {displayedRegularReasons.map((reason, index) => (
              <p key={`${reason}-${index}`} className="flex gap-2 text-xs leading-5 text-text-secondary">
                <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-600" />
                <span className="line-clamp-1">{reason}</span>
              </p>
            ))}
            {!hasReasons && (
              <p className="text-xs leading-5 text-text-secondary">
                Hệ thống chưa có lý do chi tiết cho kết quả này.
              </p>
            )}
          </div>
        </div>
      )}

      {onOpenDetails && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetails();
          }}
          className="mt-3 text-[11px] font-bold text-primary-700 hover:text-primary-900 underline block text-left"
        >
          Xem cách tính điểm →
        </button>
      )}
    </div>
  );
}
