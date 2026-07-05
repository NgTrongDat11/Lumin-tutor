import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { tutorApi } from '../../services/api';
import type { TutorAvailabilityResponse } from '../../types';
import { FULL_DAY_NAMES, WEEKDAY_VALUES } from '../../utils/days';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { EmptyPanel, SectionPanel, WeekPlanner, type WeekEvent } from '../portal/PortalPage';

function timeRange(start?: string, end?: string) {
  return `${start?.slice(0, 5) || '--:--'} - ${end?.slice(0, 5) || '--:--'}`;
}

function teachingModeLabel(mode: string | null | undefined) {
  if (mode === 'ONLINE') return 'Trực tuyến';
  if (mode === 'OFFLINE') return 'Trực tiếp';
  if (mode === 'BOTH') return 'Linh hoạt';
  return 'Chưa rõ';
}

function availabilityTitle(slot: TutorAvailabilityResponse) {
  if (slot.mode === 'ONLINE') return 'Dạy trực tuyến';
  if (slot.mode === 'OFFLINE') return 'Dạy trực tiếp';
  return 'Trực tuyến hoặc trực tiếp';
}

interface AvailabilityManagerProps {
  availabilities: TutorAvailabilityResponse[];
  onChanged: () => void;
}

export default function AvailabilityManager({ availabilities, onChanged }: AvailabilityManagerProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState<TutorAvailabilityResponse | null>(null);
  const { toast } = useToast();
  const { confirm: confirmAction, ConfirmDialogElement } = useConfirmDialog();

  const availabilityEvents: WeekEvent[] = useMemo(() => {
    return availabilities.map((slot) => ({
      id: `availability-${slot.id}`,
      dayOfWeek: slot.day_of_week,
      title: availabilityTitle(slot),
      time: timeRange(slot.start_time, slot.end_time),
      tone: 'success',
    }));
  }, [availabilities]);

  const openAvailabilityModal = (slot?: TutorAvailabilityResponse) => {
    setEditingAvailability(slot || null);
    setShowModal(true);
  };

  const closeAvailabilityModal = () => {
    setShowModal(false);
    setEditingAvailability(null);
  };

  const handleDeleteAvailability = async (id: number) => {
    const shouldDelete = await confirmAction({
      title: 'Xóa lịch rảnh này?',
      description: 'Khung giờ này sẽ không còn được dùng để gợi ý hoặc ghép lịch mới.',
      confirmLabel: 'Xóa',
      variant: 'danger',
    });
    if (!shouldDelete) return;

    try {
      await tutorApi.deleteAvailability(id);
      toast('success', 'Đã xóa lịch rảnh');
      onChanged();
    } catch {
      toast('error', 'Xóa lịch rảnh thất bại');
    }
  };

  return (
    <div className="space-y-6">
      <SectionPanel
        title="Lịch rảnh theo tuần"
        description="Dùng để ghép lớp, gợi ý gia sư và nhận yêu cầu 1-1."
        action={<Button onClick={() => openAvailabilityModal()}>Thêm lịch rảnh</Button>}
      >
        <WeekPlanner events={availabilityEvents} emptyText="Chưa khai báo" />
      </SectionPanel>

      <SectionPanel title="Quản lý khung giờ rảnh" description="Sửa hoặc xóa các khung giờ không còn phù hợp.">
        {availabilities.length === 0 ? (
          <EmptyPanel
            title="Chưa khai báo lịch rảnh"
            description="Thêm ít nhất một khung giờ để tăng khả năng được xếp lớp."
            action={<Button onClick={() => openAvailabilityModal()}>Thêm lịch rảnh</Button>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {availabilities.map((slot) => (
              <article key={slot.id} className="rounded-lg border border-border-light bg-surface-secondary p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-text-primary">{FULL_DAY_NAMES[slot.day_of_week]}</p>
                    <p className="mt-1 text-sm text-text-secondary">{timeRange(slot.start_time, slot.end_time)}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-text-secondary">
                    {teachingModeLabel(slot.mode)}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => openAvailabilityModal(slot)}>
                    Sửa
                  </Button>
                  <Button size="sm" variant="ghost" className="text-danger-600 hover:bg-danger-50" onClick={() => handleDeleteAvailability(slot.id)}>
                    Xóa
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionPanel>

      <AvailabilityModal
        open={showModal}
        availability={editingAvailability}
        onClose={closeAvailabilityModal}
        onSaved={() => {
          closeAvailabilityModal();
          onChanged();
        }}
        toast={toast}
      />
      {ConfirmDialogElement}
    </div>
  );
}

function AvailabilityModal({
  open,
  availability,
  onClose,
  onSaved,
  toast,
}: {
  open: boolean;
  availability: TutorAvailabilityResponse | null;
  onClose: () => void;
  onSaved: () => void;
  toast: (t: 'success' | 'error', m: string) => void;
}) {
  const [form, setForm] = useState({ day_of_week: 1, start_time: '08:00', end_time: '10:00', mode: 'BOTH' });
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(availability);

  useEffect(() => {
    if (!open) return;
    setForm({
      day_of_week: availability?.day_of_week ?? 1,
      start_time: availability?.start_time.slice(0, 5) || '08:00',
      end_time: availability?.end_time.slice(0, 5) || '10:00',
      mode: availability?.mode || 'BOTH',
    });
  }, [availability, open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.start_time >= form.end_time) {
      toast('error', 'Giờ kết thúc phải sau giờ bắt đầu');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        day_of_week: form.day_of_week,
        start_time: form.start_time,
        end_time: form.end_time,
        mode: form.mode as 'ONLINE' | 'OFFLINE' | 'BOTH',
      };
      if (availability) {
        await tutorApi.updateAvailability(availability.id, payload);
      } else {
        await tutorApi.addAvailability(payload);
      }
      toast('success', isEditing ? 'Đã cập nhật lịch rảnh' : 'Đã thêm lịch rảnh');
      onSaved();
    } catch {
      toast('error', isEditing ? 'Cập nhật lịch thất bại' : 'Thêm lịch thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Sửa lịch rảnh' : 'Thêm lịch rảnh'}
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" form="availability-form" loading={saving}>
            {isEditing ? 'Lưu thay đổi' : 'Thêm lịch'}
          </Button>
        </>
      )}
    >
      <form id="availability-form" onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Ngày trong tuần"
          options={WEEKDAY_VALUES.map((day) => ({ value: String(day), label: FULL_DAY_NAMES[day] }))}
          value={String(form.day_of_week)}
          onChange={(event) => setForm((current) => ({ ...current, day_of_week: Number(event.target.value) }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Bắt đầu" type="time" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} />
          <Input label="Kết thúc" type="time" value={form.end_time} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} />
        </div>
        <Select
          label="Hình thức"
          options={[
            { value: 'BOTH', label: 'Linh hoạt' },
            { value: 'ONLINE', label: 'Trực tuyến' },
            { value: 'OFFLINE', label: 'Trực tiếp' },
          ]}
          value={form.mode}
          onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value }))}
        />
      </form>
    </Modal>
  );
}
