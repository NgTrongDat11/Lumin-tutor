import { useEffect, useState } from 'react';
import type { SubjectResponse, LearningNeedResponse, LearningNeedCreate, LearningNeedScheduleCreate } from '../../types';
import { learningNeedApi, extractErrorMessage } from '../../services/api';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { useToast } from '../ui/Toast';
import AreaSuggestionChips from '../shared/AreaSuggestionChips';
import { useAuth } from '../../hooks/useAuth';
import { SHORT_DAY_NAMES, WEEKDAY_VALUES } from '../../utils/days';

interface CreateNeedModalProps {
  open: boolean;
  onClose: () => void;
  subjects: SubjectResponse[];
  onCreated: (need: LearningNeedResponse) => void;
  editNeed?: LearningNeedResponse | null;
}

const timeSlotOptions = [
  { value: '', label: 'Chọn buổi' },
  { value: 'MORNING', label: 'Sáng' },
  { value: 'AFTERNOON', label: 'Chiều' },
  { value: 'EVENING', label: 'Tối' },
];

function toPreferredMode(value: string | null | undefined): LearningNeedCreate['preferred_mode'] {
  if (value === 'ONLINE' || value === 'OFFLINE' || value === 'BOTH') return value;
  return 'BOTH';
}

function createEmptyLearningNeedForm(editNeed?: LearningNeedResponse | null): LearningNeedCreate {
  if (editNeed) {
    return {
      subject_id: editNeed.subject_id ?? undefined,
      grade_level: editNeed.grade_level ?? undefined,
      goal: editNeed.goal ?? undefined,
      budget_per_session_min: editNeed.budget_per_session_min ?? undefined,
      budget_per_session_max: editNeed.budget_per_session_max ?? undefined,
      preferred_mode: toPreferredMode(editNeed.preferred_mode),
      preferred_learning_type: editNeed.preferred_learning_type,
      preferred_area: editNeed.preferred_area ?? undefined,
      raw_text: editNeed.raw_text ?? undefined,
      schedules: editNeed.schedules.map(s => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time ?? undefined,
        end_time: s.end_time ?? undefined,
        time_slot: s.time_slot ?? undefined,
      })),
    };
  }
  return {
    preferred_mode: 'BOTH',
    preferred_learning_type: 'BOTH',
    schedules: [],
  };
}

export function CreateNeedModal({
  open,
  onClose,
  subjects,
  onCreated,
  editNeed,
}: CreateNeedModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<LearningNeedCreate>(() => createEmptyLearningNeedForm(editNeed));
  const profileAddress = user?.address || '';

  useEffect(() => {
    if (open) {
      setForm(createEmptyLearningNeedForm(editNeed));
    }
  }, [open, editNeed]);

  const updateField = (field: string, value: unknown) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleClose = () => {
    setForm(createEmptyLearningNeedForm(editNeed));
    onClose();
  };

  const addSchedule = () => {
    const s: LearningNeedScheduleCreate = { day_of_week: 1 };
    setForm((f) => ({ ...f, schedules: [...(f.schedules || []), s] }));
  };

  const updateSchedule = (idx: number, field: string, value: unknown) => {
    setForm((f) => {
      const schedules = [...(f.schedules || [])];
      schedules[idx] = { ...schedules[idx], [field]: value };
      return { ...f, schedules };
    });
  };

  const removeSchedule = (idx: number) => {
    setForm((f) => ({ ...f, schedules: (f.schedules || []).filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject_id || !form.goal) {
      toast('error', 'Vui lòng chọn môn học và nhập nội dung cần cải thiện.');
      return;
    }

    // Validate schedules
    if (form.schedules && form.schedules.length > 0) {
      const hasEmptySchedule = form.schedules.some(s => !s.time_slot && !s.start_time && !s.end_time);
      if (hasEmptySchedule) {
        toast('error', 'Vui lòng chọn buổi học hoặc nhập giờ cụ thể cho các khung giờ rảnh đã thêm.');
        return;
      }

      // Check duplicate schedules
      const seen = new Set<string>();
      for (const s of form.schedules) {
        const key = `${s.day_of_week}-${s.time_slot || ''}-${s.start_time || ''}-${s.end_time || ''}`;
        if (seen.has(key)) {
          toast('error', `Khung giờ trùng lặp đã được chọn cho ${SHORT_DAY_NAMES[s.day_of_week]}.`);
          return;
        }
        seen.add(key);
      }
    }

    setLoading(true);
    try {
      let need: LearningNeedResponse;
      if (editNeed) {
        need = await learningNeedApi.update(editNeed.id, form);
        toast('success', 'Đã cập nhật hồ sơ gợi ý thành công!');
      } else {
        need = await learningNeedApi.create(form);
        toast('success', 'Đã khởi tạo hồ sơ gợi ý thành công!');
      }
      onCreated(need);
    } catch (err) {
      toast('error', 'Lưu hồ sơ thất bại: ' + extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={editNeed ? "Chỉnh sửa hồ sơ gợi ý" : "Khởi tạo hồ sơ gợi ý"}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose}>
            Huỷ bỏ
          </Button>
          <Button loading={loading} onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}>
            {editNeed ? "Lưu thay đổi" : "Phân tích & nhận gợi ý"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-primary-50 rounded-xl p-4 text-sm text-primary-800 border border-primary-100 flex gap-3">
          <span className="text-xl">🤖</span>
          <p>Hệ thống sẽ so khớp môn học, cấp lớp, lịch rảnh, khu vực, ngân sách và ghi chú học tập để xếp hạng lựa chọn phù hợp.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Select
            label="Môn học mong muốn"
            options={subjects.map((s) => ({ value: String(s.id), label: s.name }))}
            placeholder="Chọn môn học..."
            value={String(form.subject_id || '')}
            onChange={(e) => updateField('subject_id', e.target.value ? Number(e.target.value) : undefined)}
          />
          <Input
            label="Trình độ hiện tại / Cấp lớp"
            placeholder="VD: Lớp 12, Mất gốc..."
            value={form.grade_level || ''}
            onChange={(e) => updateField('grade_level', e.target.value)}
          />
          <div className="md:col-span-2">
            <Textarea
              label="Nội dung cần cải thiện"
              placeholder="VD: Cần ôn phần ngữ pháp, luyện đề, mất gốc phần hàm số..."
              value={form.goal || ''}
              onChange={(e) => updateField('goal', e.target.value)}
              rows={2}
            />
          </div>

          <Input
            label="Ngân sách tối thiểu (VND/buổi)"
            type="number"
            placeholder="VD: 150000"
            value={form.budget_per_session_min || ''}
            onChange={(e) => updateField('budget_per_session_min', e.target.value || undefined)}
          />
          <Input
            label="Ngân sách tối đa (VND/buổi)"
            type="number"
            placeholder="VD: 250000"
            value={form.budget_per_session_max || ''}
            onChange={(e) => updateField('budget_per_session_max', e.target.value || undefined)}
          />

          <Select
            label="Hình thức gặp mặt"
            options={[
              { value: 'BOTH', label: 'Linh hoạt' },
              { value: 'ONLINE', label: 'Chỉ trực tuyến' },
              { value: 'OFFLINE', label: 'Chỉ trực tiếp' },
            ]}
            value={form.preferred_mode || 'BOTH'}
            onChange={(e) => updateField('preferred_mode', e.target.value)}
          />
          <Select
            label="Quy mô lớp"
            options={[
              { value: 'BOTH', label: 'Tất cả hình thức' },
              { value: 'PRIVATE', label: 'Chỉ dạy kèm 1-1' },
              { value: 'GROUP', label: 'Chỉ học nhóm' },
            ]}
            value={form.preferred_learning_type || 'BOTH'}
            onChange={(e) => updateField('preferred_learning_type', e.target.value)}
          />
          <div className="md:col-span-2">
            <div className="space-y-3 rounded-xl border border-border-light bg-surface-secondary/70 p-3">
              <Input
                label="Khu vực học mong muốn"
                placeholder={profileAddress ? `Để trống để dùng: ${profileAddress}` : 'VD: Phường Trà Vinh, Vĩnh Long'}
                value={form.preferred_area || ''}
                onChange={(e) => updateField('preferred_area', e.target.value || undefined)}
                hint={form.preferred_mode === 'ONLINE'
                  ? 'Không bắt buộc khi chỉ học trực tuyến.'
                  : profileAddress
                    ? `Để trống để ưu tiên địa chỉ hồ sơ: ${profileAddress}.`
                    : 'Ưu tiên phường/xã, tỉnh/thành để so khớp gần hơn.'}
              />
              <AreaSuggestionChips
                value={form.preferred_area || ''}
                onChange={(value) => updateField('preferred_area', value || undefined)}
                disabled={form.preferred_mode === 'ONLINE'}
                referenceAddress={profileAddress}
              />
            </div>
          </div>
        </div>

        <hr className="border-border-light" />

        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-text-primary">Khung giờ rảnh (Tùy chọn)</h4>
          <Button type="button" variant="outline" size="sm" onClick={addSchedule}>
            + Thêm khung giờ
          </Button>
        </div>

        {(form.schedules || []).map((s, i) => (
          <div key={i} className="flex items-center gap-3 bg-surface-secondary p-2 rounded-xl">
            <Select
              options={WEEKDAY_VALUES.map((d) => ({ value: String(d), label: SHORT_DAY_NAMES[d] }))}
              value={String(s.day_of_week)}
              onChange={(e) => updateSchedule(i, 'day_of_week', Number(e.target.value))}
              className="flex-1"
            />
            <Select
              options={timeSlotOptions}
              value={s.time_slot || ''}
              onChange={(e) => updateSchedule(i, 'time_slot', e.target.value || undefined)}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removeSchedule(i)}
              className="text-text-tertiary hover:text-danger-500 p-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}
      </form>
    </Modal>
  );
}

export default CreateNeedModal;
