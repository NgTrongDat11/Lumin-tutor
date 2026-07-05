import { useEffect, useState, type FormEvent } from 'react';
import { tutorApi, subjectApi } from '../../services/api';
import type { TutorSubjectResponse, SubjectResponse } from '../../types';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import { useConfirmDialog } from '../../components/ui/ConfirmDialog';
import { getStatusBadge } from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

export default function TutorSubjects() {
  const [subjects, setSubjects] = useState<TutorSubjectResponse[]>([]);
  const [allSubjects, setAllSubjects] = useState<SubjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const { toast } = useToast();
  const { confirm: confirmAction, ConfirmDialogElement } = useConfirmDialog();

  const load = () => {
    Promise.all([tutorApi.getSubjects(), subjectApi.list()]).then(([s, all]) => {
      setSubjects(s);
      setAllSubjects(all);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const handleDelete = async (id: number) => {
    const shouldDelete = await confirmAction({
      title: 'Xoá môn dạy này?',
      description: 'Môn dạy đã xoá sẽ không còn được dùng để nhận yêu cầu hoặc ứng tuyển lớp phù hợp.',
      confirmLabel: 'Xoá',
      variant: 'danger',
    });
    if (!shouldDelete) return;
    try { await tutorApi.deleteSubject(id); toast('success', 'Đã xoá'); load(); }
    catch { toast('error', 'Xoá thất bại'); }
  };

  if (loading) return <CardGridSkeleton />;

  return (
    <div className="animate-slide-up">
      <PageHeader title="Môn dạy" description="Đăng ký các môn bạn có thể dạy kèm học phí." action={<Button onClick={() => setShowAdd(true)}>+ Thêm môn</Button>} />

      {subjects.length === 0 ? (
        <EmptyState title="Chưa đăng ký môn dạy" action={<Button onClick={() => setShowAdd(true)}>+ Thêm môn</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subjects.map((s) => (
            <Card key={s.id}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{s.subject_name || `Môn #${s.subject_id}`}</h3>
                    {getStatusBadge(s.status)}
                  </div>
                  <p className="text-sm text-text-secondary">Cấp: {s.grade_level}</p>
                  <p className="text-sm text-primary-600 font-medium">{parseFloat(s.fee_per_session).toLocaleString('vi-VN')}đ/buổi</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}>🗑️</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddSubjectModal open={showAdd} onClose={() => setShowAdd(false)} allSubjects={allSubjects} onAdded={() => { setShowAdd(false); load(); }} toast={toast} />
      {ConfirmDialogElement}
    </div>
  );
}

function AddSubjectModal({ open, onClose, allSubjects, onAdded, toast }: { open: boolean; onClose: () => void; allSubjects: SubjectResponse[]; onAdded: () => void; toast: (t: 'success' | 'error', m: string) => void }) {
  const [form, setForm] = useState({ subject_id: 0, grade_level: '', fee_per_session: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await tutorApi.addSubject({ subject_id: form.subject_id, grade_level: form.grade_level, fee_per_session: form.fee_per_session });
      toast('success', 'Thêm môn dạy thành công!');
      onAdded();
    } catch { toast('error', 'Thêm thất bại'); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Thêm môn dạy" footer={<><Button variant="outline" onClick={onClose}>Huỷ</Button><Button loading={loading} onClick={(e) => handleSubmit(e as unknown as FormEvent)}>Thêm</Button></>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select label="Môn học" options={allSubjects.map((s) => ({ value: String(s.id), label: s.name }))} placeholder="Chọn môn" value={String(form.subject_id || '')} onChange={(e) => setForm((f) => ({ ...f, subject_id: Number(e.target.value) }))} />
        <Input label="Cấp lớp" placeholder="VD: Lớp 10-12" value={form.grade_level} onChange={(e) => setForm((f) => ({ ...f, grade_level: e.target.value }))} required />
        <Input label="Học phí (VNĐ/buổi)" type="number" placeholder="200000" value={form.fee_per_session} onChange={(e) => setForm((f) => ({ ...f, fee_per_session: e.target.value }))} required />
      </form>
    </Modal>
  );
}
