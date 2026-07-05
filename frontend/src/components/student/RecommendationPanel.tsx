import React from 'react';
import type { LearningNeedResponse, SubjectResponse, RecommendationResponse } from '../../types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { CheckCircleIcon, LocationMarkerIcon } from '../ui/Icons';
import { currency } from '../../utils/format';
import { SHORT_DAY_NAMES } from '../../utils/days';

function getModeLabel(mode: string | null | undefined) {
  if (mode === 'ONLINE') return 'Chỉ trực tuyến';
  if (mode === 'OFFLINE') return 'Chỉ trực tiếp';
  return 'Gặp mặt linh hoạt';
}

function getLearningTypeLabel(type: string | null | undefined) {
  if (type === 'PRIVATE') return 'Chỉ học 1-1';
  if (type === 'GROUP') return 'Chỉ học nhóm';
  return 'Nhóm hoặc 1-1';
}

function getTimeSlotLabel(slot: string | null | undefined) {
  if (slot === 'MORNING') return 'Sáng';
  if (slot === 'AFTERNOON') return 'Chiều';
  if (slot === 'EVENING') return 'Tối';
  return 'Linh hoạt';
}

function getSubjectName(subjects: SubjectResponse[], subjectId: number | null | undefined) {
  return subjects.find((subject) => subject.id === subjectId)?.name || 'Chưa chọn môn';
}

interface CriteriaChipItem {
  key: string;
  label: string;
  tone?: 'default' | 'area' | 'muted';
}

function CriteriaChip({ item }: { item: CriteriaChipItem }) {
  const classes = item.tone === 'area'
    ? 'border-primary-200 bg-primary-50 text-primary-800'
    : item.tone === 'muted'
      ? 'border-border-light bg-surface-secondary text-text-tertiary'
      : 'border-border-light bg-white text-text-secondary';

  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>
      {item.key === 'area' && <LocationMarkerIcon className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{item.label}</span>
    </span>
  );
}

export function NeedCriteria({
  need,
  subjects,
  fallbackArea,
}: {
  need: LearningNeedResponse;
  subjects: SubjectResponse[];
  fallbackArea?: string | null;
}) {
  const scheduleText =
    need.schedules.length > 0
      ? need.schedules.map((schedule) => `${SHORT_DAY_NAMES[schedule.day_of_week]} ${getTimeSlotLabel(schedule.time_slot)}`).join(', ')
      : 'Chưa giới hạn lịch';

  let budgetText = 'Chưa giới hạn ngân sách';
  if (need.budget_per_session_min && need.budget_per_session_max) {
    budgetText = `${currency(need.budget_per_session_min)} - ${currency(need.budget_per_session_max)} / buổi`;
  } else if (need.budget_per_session_max) {
    budgetText = `Tối đa ${currency(need.budget_per_session_max)} / buổi`;
  } else if (need.budget_per_session_min) {
    budgetText = `Tối thiểu ${currency(need.budget_per_session_min)} / buổi`;
  }
  const areaLabel = need.preferred_area
    || (fallbackArea ? `Theo địa chỉ hồ sơ: ${fallbackArea}` : 'Theo địa chỉ hồ sơ');

  const criteria: CriteriaChipItem[] = [
    { key: 'subject', label: getSubjectName(subjects, need.subject_id) },
    { key: 'grade', label: need.grade_level || 'Chưa nêu cấp lớp' },
    { key: 'mode', label: getModeLabel(need.preferred_mode) },
    { key: 'type', label: getLearningTypeLabel(need.preferred_learning_type) },
    {
      key: 'area',
      label: areaLabel,
      tone: need.preferred_area || fallbackArea ? 'area' : 'muted',
    },
    { key: 'budget', label: budgetText },
    { key: 'schedule', label: scheduleText },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {criteria.map((item) => <CriteriaChip key={item.key} item={item} />)}
    </div>
  );
}

interface RecommendationWorkspaceProps {
  needs: LearningNeedResponse[];
  activeNeed: LearningNeedResponse | null;
  subjects: SubjectResponse[];
  onCreate: () => void;
  onRun: (need: LearningNeedResponse) => void;
  onEdit: (need: LearningNeedResponse) => void;
  onDelete: (need: LearningNeedResponse) => void;
  onClose?: () => void;
  fallbackArea?: string | null;
}

export function RecommendationWorkspace({
  needs,
  activeNeed,
  subjects,
  onCreate,
  onRun,
  onEdit,
  onDelete,
  onClose,
  fallbackArea,
}: RecommendationWorkspaceProps) {
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
      <Card padding="lg" className="bg-white">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-text-primary">Chọn cấu hình để nhận gợi ý</h3>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              Mỗi cấu hình là một bộ tiêu chí riêng. Chọn đúng cấu hình trước khi chạy lại thuật toán.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onClose && (
              <Button 
                variant="outline" 
                className="border-primary-200 text-primary-700 hover:bg-primary-50"
                onClick={onClose}
              >
                Quay lại kết quả
              </Button>
            )}
            <Button onClick={onCreate}>Tạo cấu hình mới</Button>
          </div>
        </div>

        {needs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface-secondary p-8 text-center">
            <h4 className="font-bold text-text-primary">Bạn chưa có cấu hình học tập</h4>
            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-text-secondary">
              Tạo cấu hình để hệ thống có dữ liệu so khớp thay vì chỉ duyệt danh sách thủ công.
            </p>
            <div className="mt-4">
              <Button onClick={onCreate}>Tạo cấu hình</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {needs.map((need) => {
              const active = activeNeed?.id === need.id;
              return (
                <article
                  key={need.id}
                  className={`rounded-lg border p-4 transition-all ${
                    active ? 'border-primary-300 bg-primary-50/60 shadow-sm' : 'border-border-light bg-white hover:border-primary-200'
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-text-primary text-sm">
                          {getSubjectName(subjects, need.subject_id)} {need.grade_level ? `· ${need.grade_level}` : ''}
                        </h4>
                        {active && (
                          <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-[10px] font-bold text-primary-750">
                            Đang chọn
                          </span>
                        )}
                      </div>
                      {need.goal && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-text-secondary">{need.goal}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 self-end md:self-start">
                      <Button size="sm" variant="outline" onClick={() => onEdit(need)}>
                        Sửa
                      </Button>
                      <Button size="sm" variant="ghost" className="text-danger-600 hover:text-danger-700 hover:bg-danger-50" onClick={() => onDelete(need)}>
                        Xóa
                      </Button>
                      <Button size="sm" onClick={() => onRun(need)}>
                        Nhận gợi ý
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <NeedCriteria need={need} subjects={subjects} fallbackArea={fallbackArea} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      <Card padding="lg" className="bg-white">
        <div className="mb-5">
          <h3 className="text-xl font-bold tracking-tight text-text-primary">Gợi ý thông minh chấm điểm thế nào?</h3>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            Hệ thống lọc ứng viên không phù hợp trước, sau đó chuẩn hóa từng tín hiệu về thang 0-1 và xếp hạng trên thang 100.
          </p>
        </div>
        <div className="space-y-3">
          {[
            ['Môn học', '25%', 'Lọc ứng viên theo môn học trước khi xếp hạng.'],
            ['Cấp lớp', '12%', 'Ưu tiên gia sư/lớp có cấp học khớp hoặc gần nhu cầu.'],
            ['Lịch rảnh', '10-14%', 'So lịch mong muốn với lịch rảnh của gia sư hoặc lịch lớp.'],
            ['Hình thức', '10%', 'Trực tuyến, trực tiếp hoặc linh hoạt theo cấu hình.'],
            ['Khu vực', '13%', 'Ưu tiên địa điểm dạy/học gần khu vực mong muốn.'],
            ['Ngân sách', '8-10%', 'So học phí với khoảng ngân sách đã khai báo.'],
            ['Nội dung mô tả', '6-8%', 'So khớp ghi chú học tập với bio gia sư hoặc mục tiêu lớp.'],
            ['Uy tín & sức chứa', '5-13%', 'Gia sư dùng đánh giá/kinh nghiệm; lớp dùng số chỗ còn trống.'],
          ].map(([label, value, desc]) => (
            <div key={label} className="flex gap-3 rounded-lg border border-border-light bg-surface-secondary p-3">
              <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-text-primary text-sm">{label}</p>
                  <span className="shrink-0 text-xs font-extrabold text-primary-700">{value}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

interface RecommendationResultsShellProps {
  activeNeed: LearningNeedResponse | null;
  subjects: SubjectResponse[];
  recommendation: RecommendationResponse;
  children: React.ReactNode;
  onManageNeeds?: () => void;
  fallbackArea?: string | null;
}

export function RecommendationResultsShell({
  activeNeed,
  subjects,
  recommendation,
  children,
  onManageNeeds,
  fallbackArea,
}: RecommendationResultsShellProps) {
  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-primary-100 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">Kết quả gợi ý thông minh</p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-text-primary">
              {activeNeed
                ? `${getSubjectName(subjects, activeNeed.subject_id)} ${activeNeed.grade_level ? `· ${activeNeed.grade_level}` : ''}`
                : 'Gợi ý khởi đầu từ hồ sơ'}
            </h3>
            {!activeNeed && (
              <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                Chưa có cấu hình Smart Match nên hệ thống dùng dữ liệu hồ sơ hiện có
                {fallbackArea ? ` và khu vực ${fallbackArea}` : ''} để chấm điểm trước. Tạo cấu hình riêng để bổ sung môn học, ngân sách và lịch rảnh.
              </p>
            )}
            {activeNeed?.goal && (
              <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-800">
                <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-primary-600">Mục tiêu</span>
                <span className="min-w-0 truncate">{activeNeed.goal}</span>
              </div>
            )}
            {activeNeed && (
              <div className="mt-4">
                <NeedCriteria need={activeNeed} subjects={subjects} fallbackArea={fallbackArea} />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 min-w-[220px]">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border-light bg-surface-secondary p-3 text-center">
                <p className="text-2xl font-extrabold text-text-primary">{recommendation.recommended_classes.length}</p>
                <p className="text-xs font-semibold text-text-tertiary">Lớp nhóm trực tiếp</p>
              </div>
              <div className="rounded-lg border border-border-light bg-surface-secondary p-3 text-center">
                <p className="text-2xl font-extrabold text-text-primary">{recommendation.recommended_tutors.length}</p>
                <p className="text-xs font-semibold text-text-tertiary">Gia sư 1-1</p>
              </div>
            </div>
            {onManageNeeds && (
              <Button
                variant="outline"
                className="w-full font-bold"
                onClick={onManageNeeds}
              >
                Quản lý cấu hình
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border-light bg-surface-secondary p-3 text-xs leading-5 text-text-secondary">
          <strong className="text-text-primary">Cách đọc điểm:</strong> phần trăm là mức khớp tổng hợp từ môn/lớp, hình thức học, khu vực, ngân sách, lịch rảnh, nội dung mô tả và dữ liệu lớp hoặc gia sư. Mỗi thẻ có phần “Vì sao ra điểm này?” với breakdown do backend tính để thấy tiêu chí nào kéo điểm lên và tín hiệu nào còn yếu.
        </div>
      </div>
      {children}
    </section>
  );
}
