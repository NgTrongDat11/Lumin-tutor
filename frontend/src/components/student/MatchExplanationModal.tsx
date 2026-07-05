import { useState } from 'react';
import type { RecommendedTutor, RecommendedClass, RecommendationContext } from '../../types';

interface MatchExplanationDetailProps {
  rec: RecommendedTutor | RecommendedClass;
  context?: RecommendationContext;
  basisLabel?: string;
}

function getStatusMeta(status: string) {
  switch (status) {
    case 'strong':
      return {
        label: 'Tương thích tốt',
        badgeClass: 'bg-success-50 text-success-700 border border-success-100',
      };
    case 'partial':
      return {
        label: 'Tương thích một phần',
        badgeClass: 'bg-primary-50 text-primary-700 border border-primary-100',
      };
    case 'weak':
      return {
        label: 'Tương thích yếu',
        badgeClass: 'bg-danger-50 text-danger-700 border border-danger-100',
      };
    case 'neutral':
    default:
      return {
        label: 'Thông tin',
        badgeClass: 'bg-surface-secondary text-text-secondary border border-border-light',
      };
  }
}

export function MatchExplanationDetail({ rec, context, basisLabel }: MatchExplanationDetailProps) {
  const [aiExpanded, setAiExpanded] = useState(false);
  const [practicalExpanded, setPracticalExpanded] = useState(false);
  const [reputationExpanded, setReputationExpanded] = useState(false);

  const score = Number(rec.score);
  const semantic = rec.semantic;
  const breakdown = rec.score_breakdown || [];
  const adjustments = rec.score_adjustments || [];

  const similarity = semantic?.similarity ?? 0.0;
  const normalizedScore = semantic?.normalized_score ?? (rec.pillars?.find(p => p.key === 'ai')?.score ?? 0.0);


  // Time formatting from UTC to local
  const formattedTime = (() => {
    if (!context?.generated_at) return '';
    try {
      const date = new Date(context.generated_at);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  })();

  // Constants & Formulas
  const aiPillar = rec.pillars?.find(p => p.key === 'ai');
  const practicalPillar = rec.pillars?.find(p => p.key === 'practical');
  const reputationPillar = rec.pillars?.find(p => p.key === 'reputation');

  const aiPoints = aiPillar ? aiPillar.points : 0.0;
  const practicalPoints = practicalPillar ? practicalPillar.points : 0.0;
  const reputationPoints = reputationPillar ? reputationPillar.points : 0.0;
  const adjustmentsSum = adjustments.reduce((sum, adj) => sum + adj.points, 0.0);
  const calculatedTotal = aiPoints + practicalPoints + reputationPoints + adjustmentsSum;

  const isGemini = semantic?.method === 'gemini_embedding';
  const methodLabel = isGemini ? 'Đo bằng: Độ tương đồng embedding' : 'Đo bằng: Độ tương đồng văn bản dự phòng';

  const expandedStates: Record<string, boolean> = {
    ai: aiExpanded,
    practical: practicalExpanded,
    reputation: reputationExpanded,
  };

  const toggleExpanded = (key: string) => {
    if (key === 'ai') setAiExpanded(!aiExpanded);
    else if (key === 'practical') setPracticalExpanded(!practicalExpanded);
    else if (key === 'reputation') setReputationExpanded(!reputationExpanded);
  };

  return (
    <div className="rounded-2xl border border-primary-100 bg-gradient-to-b from-white to-primary-50/10 p-5 shadow-xs hover:shadow-md transition-all duration-300">

      {/* Title & Metadata Header */}
      <div className="mb-5 pb-4 border-b border-border-light flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h4 className="text-base font-extrabold text-text-primary flex items-center gap-1.5">
            <span className="text-lg">📊</span> Vì sao hệ thống gợi ý kết quả này?
          </h4>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-text-secondary mt-1.5 font-medium">
            <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded-md font-bold border border-primary-100">
              Smart Match {context?.scoring_version || 'V2.5'}
            </span>
            {formattedTime && (
              <span className="text-text-tertiary">
                • Tính lúc: <strong className="text-text-secondary">{formattedTime}</strong>
              </span>
            )}
            {basisLabel && (
              <span className="text-text-tertiary">
                • Cấu hình: <strong className="text-text-secondary">{basisLabel}</strong>
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="text-xl font-black text-primary-700 bg-primary-50 border border-primary-100 px-4 py-1.5 rounded-2xl shadow-xs inline-block">
            {score.toFixed(1)}/100 điểm
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-6 min-[1100px]:flex-row min-[1100px]:items-start">

        {/* Similarity Summary Column (Order 1 on mobile, 1 on desktop min-1100px) */}
        <div className="flex flex-col items-stretch min-[1100px]:w-[260px] min-[1100px]:self-start shrink-0 border-b min-[1100px]:border-b-0 min-[1100px]:border-r border-border-light pb-6 min-[1100px]:pb-0 min-[1100px]:pr-5 order-1">
          <h5 className="text-xs font-extrabold text-text-primary mb-3 flex items-center gap-1">
            🎯 Độ tương đồng nội dung
          </h5>

          {/* Similarity progress horizontal display */}
          <div className="bg-surface-secondary/40 border border-border-light p-3.5 rounded-xl space-y-3">
            <div>
              <span className="text-[10px] font-bold text-text-tertiary block">
                {methodLabel}
              </span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-black text-text-primary">
                  Ứng viên hiện tại
                </span>
                <span className="text-sm font-black text-primary-600">
                  {Math.round(similarity * 100)}%
                </span>
              </div>
              <div className="h-2 w-full bg-white rounded-full overflow-hidden mt-1.5 border border-border-light/60">
                <div
                  className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full"
                  style={{ width: `${Math.round(similarity * 100)}%` }}
                />
              </div>
            </div>

            {/* Rank display */}
            {semantic?.rank && (
              <div className="border-t border-border-light/50 pt-2 flex items-center justify-between text-xs">
                <span className="text-text-secondary font-medium">Hạng ngữ nghĩa:</span>
                <span className="font-extrabold text-text-primary bg-white border border-border-light/70 px-2 py-0.5 rounded-md">
                  #{semantic.rank} {semantic.candidate_count ? `trên ${semantic.candidate_count}` : ''}
                </span>
              </div>
            )}
          </div>

        </div>

        {/* Detailed Breakdown Column (Order 2 on mobile, 2 on desktop min-1100px) */}
        <div className="flex-1 min-w-0 order-2">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-border-light/60">
            <span className="text-xs font-bold text-text-secondary">
              Trụ cột phân tích
            </span>
          </div>

          {/* Pillars List */}
          {rec.pillars && rec.pillars.length > 0 ? (
            <div className="space-y-3">
              {rec.pillars.map((pillar) => {
                const icons: Record<string, string> = { ai: '🧠', practical: '📍', reputation: '⭐' };
                const colors: Record<string, string> = {
                  ai: 'from-purple-500 to-pink-500',
                  practical: 'from-primary-500 to-emerald-500',
                  reputation: 'from-amber-400 to-orange-500',
                };
                const bgColors: Record<string, string> = {
                  ai: 'border-purple-100 bg-purple-50/20',
                  practical: 'border-primary-100 bg-primary-50/20',
                  reputation: 'border-amber-100 bg-amber-50/20',
                };

                const isOpen = expandedStates[pillar.key];
                const percent = Math.round(pillar.score * 100);

                return (
                  <div key={pillar.key}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggleExpanded(pillar.key)}
                      className={`w-full text-left rounded-xl border p-4 hover:shadow-sm transition-all duration-150 cursor-pointer ${
                        bgColors[pillar.key] || 'border-border-light bg-surface-primary/40'
                      }`}
                    >
                      <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
                        {/* Left column: Title, Badge, Note & Progress bar */}
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{icons[pillar.key] || '📊'}</span>
                            <span className="text-xs font-extrabold text-text-primary whitespace-nowrap">
                              {pillar.label}
                            </span>
                            <span className={`text-[10px] text-primary-600 transition-transform duration-150 inline-block ${
                              isOpen ? 'rotate-90' : ''
                            }`}>
                              ▶
                            </span>
                          </div>

                          {/* Badge in a separate line below the title */}
                          <div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider ${getStatusMeta(pillar.status).badgeClass}`}>
                              {getStatusMeta(pillar.status).label}
                            </span>
                          </div>

                          <p className="text-[11px] text-text-secondary leading-relaxed">
                            {pillar.key === 'reputation' && pillar.is_default
                              ? 'Chưa có đủ dữ liệu uy tín riêng của lớp. Hệ thống đang sử dụng mức trung lập 5/10.'
                              : pillar.note}
                          </p>
                          <div className="h-2 w-full bg-white/80 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${colors[pillar.key] || 'from-gray-400 to-gray-500'}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>

                        {/* Right column: score/weight clean representation */}
                        <div className="text-right shrink-0 flex flex-col items-end pt-0.5">
                          <span className="text-xs font-black text-text-primary">
                            {pillar.points.toFixed(1)}/{pillar.weight.toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* AI Sub-breakdown Details */}
                    {pillar.key === 'ai' && isOpen && (
                      <div className="ml-4 mt-1.5 space-y-1 bg-white/50 border border-purple-100/50 rounded-xl p-3 text-[11px] text-text-secondary space-y-2 leading-relaxed">
                        <div className="flex justify-between border-b border-purple-50 pb-1.5">
                          <span>Phương pháp đối khớp:</span>
                          <span className="font-semibold text-text-primary">{isGemini ? 'Gemini Embedding (AI)' : 'So khớp văn bản (Dự phòng)'}</span>
                        </div>
                        {!isGemini && (
                          <p className="text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-100">
                            ⚠️ Gemini Embedding hiện không khả dụng. Hệ thống sử dụng so khớp văn bản dự phòng.
                          </p>
                        )}
                        <div className="flex justify-between">
                          <span>Cosine tương đồng gốc:</span>
                          <span className="font-bold text-text-primary">{Math.round(similarity * 100)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Điểm sau khi chuẩn hóa tương đối:</span>
                          <span className="font-bold text-text-primary">{Math.round(normalizedScore * 100)}%</span>
                        </div>
                        <div className="flex justify-between border-t border-purple-50 pt-1.5 font-medium">
                          <span>Điểm đóng góp Trụ cột AI:</span>
                          <span className="text-purple-700 font-extrabold">{aiPoints.toFixed(1)} / 35.0 điểm</span>
                        </div>
                      </div>
                    )}

                    {/* Practical Sub-breakdown Details */}
                    {pillar.key === 'practical' && isOpen && (rec.practical_breakdown || []).length > 0 && (
                      <div className="ml-4 mt-1.5 space-y-1">
                        {rec.practical_breakdown!.map((item) => (
                          <div key={item.key} className="flex items-center justify-between text-[11px] rounded-lg border border-border-light/50 bg-white/60 px-3 py-1.5">
                            <span className="text-text-secondary font-medium">{item.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-text-tertiary italic max-w-[120px] truncate">{item.note}</span>
                              <div className="w-16 h-1 bg-surface-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-primary-400 rounded-full" style={{ width: `${Math.round(item.score * 100)}%` }} />
                              </div>
                              <span className="text-text-primary font-bold w-8 text-right">{Math.round(item.score * 100)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reputation Sub-breakdown Details */}
                    {pillar.key === 'reputation' && isOpen && (rec.reputation_breakdown || []).length > 0 && (
                      <div className="ml-4 mt-1.5 space-y-1 bg-white/50 border border-amber-100/50 rounded-xl p-3 text-[11px] text-text-secondary space-y-2">
                        {rec.reputation_breakdown!.map((item) => (
                          <div key={item.key} className="flex items-center justify-between border-b border-amber-50/40 pb-1.5 last:border-b-0 last:pb-0">
                            <div className="flex flex-col">
                              <span className="font-semibold text-text-primary">{item.label}</span>
                              <span className="text-[10px] text-text-tertiary mt-0.5">{item.note}</span>
                            </div>
                            <span className="font-bold text-text-primary">
                              {Math.round(item.score * 100)}% {item.weight ? `(Hệ số ${item.weight})` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Fallback: flat breakdown (V2 compatibility) */
            <div className="space-y-3">
              {breakdown.map((item) => (
                <div key={item.key} className="rounded-xl border border-border-light bg-surface-primary/40 p-3 hover:bg-white transition-colors duration-150">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                        {item.label}
                        <span className="text-[10px] font-normal text-text-tertiary">
                          (Tối đa {item.weight} điểm)
                        </span>
                      </span>
                      <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">{item.note}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider ${getStatusMeta(item.status).badgeClass}`}>
                        {getStatusMeta(item.status).label}
                      </span>
                      <span className="text-xs font-black text-text-primary">
                        +{item.points.toFixed(1)} đ
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Adjustments (Clash schedules penalty) */}
          {adjustments.length > 0 && (
            <div className="mt-3 space-y-2">
              {adjustments.map((adj) => (
                <div key={adj.key} className="rounded-xl border border-danger-100 bg-danger-50/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold text-danger-700 flex items-center gap-1.5">
                        ⚠️ {adj.label}
                      </span>
                      <p className="text-[11px] text-danger-600 mt-0.5 leading-relaxed">{adj.note}</p>
                    </div>
                    <span className="shrink-0 text-xs font-black bg-danger-50 text-danger-700 border border-danger-100 px-2 py-0.5 rounded-md">
                      {adj.points.toFixed(1)} đ
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Formula explanation area */}
          <div className="mt-5 border-t border-border-light pt-3 text-[10px] text-text-tertiary leading-relaxed space-y-1">
            <p className="font-bold text-text-secondary">Công thức tính điểm:</p>
            <p className="bg-surface-secondary/60 p-2 rounded-lg border border-border-light text-[10px] text-text-secondary font-mono leading-relaxed">
              Tổng điểm = Điểm AI ({aiPoints.toFixed(1)} đ) + Điểm thực tế ({practicalPoints.toFixed(1)} đ) + Điểm uy tín ({reputationPoints.toFixed(1)} đ) + Điểm điều chỉnh ({adjustmentsSum.toFixed(1)} đ) = {calculatedTotal.toFixed(1)}/100
            </p>
            <p className="italic">* Các số thành phần được làm tròn khi hiển thị.</p>
          </div>
        </div>

      </div>
    </div>
  );
}
