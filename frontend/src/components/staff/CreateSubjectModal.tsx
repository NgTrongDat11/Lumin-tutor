import { useEffect, useState, type FormEvent } from 'react';
import { subjectApi } from '../../services/api';
import type { SubjectResponse } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface CreateSubjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  subject?: SubjectResponse | null;
}

export function CreateSubjectModal({
  open,
  onClose,
  onCreated,
  subject,
}: CreateSubjectModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = Boolean(subject);

  useEffect(() => {
    if (!open) return;
    setName(subject?.name || '');
    setDescription(subject?.description || '');
  }, [open, subject]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast('error', 'Tên môn học không được bỏ trống');
      return;
    }
    setSaving(true);
    try {
      if (subject) {
        await subjectApi.update(subject.id, { name: name.trim(), description: description || undefined });
        toast('success', 'Đã cập nhật môn học');
      } else {
        await subjectApi.create({ name: name.trim(), description: description || undefined });
        toast('success', 'Đã thêm môn học thành công');
      }
      onCreated();
      setName('');
      setDescription('');
    } catch {
      toast('error', editing ? 'Cập nhật môn thất bại' : 'Thêm môn thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Sửa môn học' : 'Thêm môn học mới'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button loading={saving} onClick={(e) => handleSubmit(e as unknown as FormEvent)}>
            {editing ? 'Lưu thay đổi' : 'Thêm môn'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-primary-100 bg-primary-50/70 p-3 text-sm leading-6 text-primary-900">
          {editing
            ? 'Sửa tên hoặc mô tả khi môn học nhập sai. Các lớp và hồ sơ đang tham chiếu môn này sẽ dùng tên mới.'
            : 'Môn học mới sẽ xuất hiện trong form tạo lớp, nhu cầu học viên và đăng ký môn dạy của gia sư.'}
        </div>
        <Input
          label="Tên môn"
          placeholder="VD: Toán, Ngữ Văn, IELTS"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Mô tả"
          placeholder="Mô tả ngắn..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </form>
    </Modal>
  );
}

export default CreateSubjectModal;
