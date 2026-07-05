import { useEffect, useState, type FormEvent } from 'react';
import { tutorApi } from '../../services/api';
import type { TutorAvailabilityResponse } from '../../types';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { useConfirmDialog } from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { FULL_DAY_NAMES, WEEKDAY_VALUES } from '../../utils/days';

export default function TutorAvailability() {
  const [avails, setAvails] = useState<TutorAvailabilityResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const { toast } = useToast();
  const { confirm: confirmAction, ConfirmDialogElement } = useConfirmDialog();

  const load = () => { tutorApi.getAvailabilities().then(setAvails).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(load, []);

  const handleDelete = async (id: number) => {
    const shouldDelete = await confirmAction({
      title: 'Xoá lịch rảnh này?',
      description: 'Khung giờ này sẽ không còn được dùng để gợi ý hoặc ghép lịch mới.',
      confirmLabel: 'Xoá',
      variant: 'danger',
    });
    if (!shouldDelete) return;
    try { await tutorApi.deleteAvailability(id); toast('success', 'Đã xoá'); load(); }
    catch { toast('error', 'Xoá thất bại'); }
  };

  if (loading) return <CardGridSkeleton />;

  // Group by day
  const grouped = avails.reduce((acc, a) => {
    const day = a.day_of_week;
    if (!acc[day]) acc[day] = [];
    acc[day].push(a);
    return acc;
  }, {} as Record<number, TutorAvailabilityResponse[]>);

  return (
    <div className="animate-slide-up">
      <PageHeader title="Lịch rảnh" description="Khai báo các khung giờ bạn có thể dạy." action={<Button onClick={() => setShowAdd(true)}>+ Thêm lịch</Button>} />

      {avails.length === 0 ? (
        <EmptyState title="Chưa khai báo lịch rảnh" description="Thêm lịch để học viên dễ tìm bạn hơn." action={<Button onClick={() => setShowAdd(true)}>+ Thêm</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {WEEKDAY_VALUES.map((day) => {
            const slots = grouped[day];
            if (!slots) return null;
            return (
              <Card key={day}>
                <h3 className="font-semibold text-text-primary mb-3">{FULL_DAY_NAMES[day]}</h3>
                <div className="space-y-2">
                  {slots.map((s) => (
                    <div key={s.id} className="flex items-center justify-between bg-surface-tertiary rounded-lg px-3 py-2">
                      <span className="text-sm">{s.start_time?.slice(0, 5)} — {s.end_time?.slice(0, 5)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-tertiary">{s.mode === 'ONLINE' ? '🌐' : s.mode === 'OFFLINE' ? '📍' : '🔄'}</span>
                        <button onClick={() => handleDelete(s.id)} className="text-danger-500 hover:text-danger-600 text-xs cursor-pointer">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AddAvailModal open={showAdd} onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load(); }} toast={toast} />
      {ConfirmDialogElement}
    </div>
  );
}

function AddAvailModal({ open, onClose, onAdded, toast }: { open: boolean; onClose: () => void; onAdded: () => void; toast: (t: 'success' | 'error', m: string) => void }) {
  const [form, setForm] = useState({ day_of_week: 1, start_time: '08:00', end_time: '10:00', mode: 'BOTH' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await tutorApi.addAvailability({ day_of_week: form.day_of_week, start_time: form.start_time, end_time: form.end_time, mode: form.mode as 'ONLINE' | 'OFFLINE' | 'BOTH' });
      toast('success', 'Thêm lịch thành công!');
      onAdded();
    } catch { toast('error', 'Thêm thất bại'); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Thêm lịch rảnh" footer={<><Button variant="outline" onClick={onClose}>Huỷ</Button><Button loading={loading} onClick={(e) => handleSubmit(e as unknown as FormEvent)}>Thêm</Button></>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select label="Thứ" options={WEEKDAY_VALUES.map((d) => ({ value: String(d), label: FULL_DAY_NAMES[d] }))} value={String(form.day_of_week)} onChange={(e) => setForm((f) => ({ ...f, day_of_week: Number(e.target.value) }))} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Bắt đầu" type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
          <Input label="Kết thúc" type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
        </div>
        <Select label="Hình thức" options={[{ value: 'BOTH', label: 'Cả hai' }, { value: 'ONLINE', label: 'Trực tuyến' }, { value: 'OFFLINE', label: 'Trực tiếp' }]} value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))} />
      </form>
    </Modal>
  );
}
