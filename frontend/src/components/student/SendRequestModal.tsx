import { useState } from 'react';
import type { RecommendedTutor, LearningNeedResponse, PrivateRequestResponse } from '../../types';
import { privateRequestApi, extractErrorMessage } from '../../services/api';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { useToast } from '../ui/Toast';
import { currency } from '../../utils/format';

interface SendRequestModalProps {
  open: boolean;
  onClose: () => void;
  tutor: RecommendedTutor['tutor'];
  activeNeed: LearningNeedResponse | null;
  onCreated: (request: PrivateRequestResponse) => void | Promise<void>;
}

export function SendRequestModal({
  open,
  onClose,
  tutor,
  activeNeed,
  onCreated,
}: SendRequestModalProps) {
  const { toast } = useToast();
  const initialSubjectId =
    tutor.subjects.find((s) => activeNeed?.subject_id && s.subject_id === activeNeed.subject_id)?.subject_id ||
    tutor.subjects[0]?.subject_id ||
    0;
  const shouldPrefillGoal = !activeNeed?.subject_id || activeNeed.subject_id === initialSubjectId;
  const [loading, setLoading] = useState(false);
  const [subjectId, setSubjectId] = useState<number>(initialSubjectId);
  const [requestedSessions, setRequestedSessions] = useState<number>(10);
  const [mode, setMode] = useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const [goal, setGoal] = useState<string>(shouldPrefillGoal ? activeNeed?.goal || '' : '');

  // Find the selected subject details to obtain grade_level
  const selectedSubject = tutor.subjects.find((s) => s.subject_id === subjectId);
  const gradeLevel = selectedSubject?.grade_level || '';
  const feePerSession = Number(selectedSubject?.fee_per_session || 0);
  const estimatedTotal = feePerSession * Math.max(requestedSessions || 0, 0);
  const subjectSummary = selectedSubject
    ? `${selectedSubject.subject_name || 'Môn học'} - ${selectedSubject.grade_level}`
    : 'môn gia sư đã được duyệt';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) {
      toast('error', 'Vui lòng chọn môn học muốn học 1-1');
      return;
    }
    setLoading(true);
    try {
      const request = await privateRequestApi.create({
        tutor_id: tutor.id,
        learning_need_id: activeNeed?.id || undefined,
        subject_id: subjectId,
        grade_level: gradeLevel,
        goal,
        requested_sessions: requestedSessions,
        mode,
      });
      toast('success', 'Đã gửi yêu cầu học 1-1. Hãy mở Tin nhắn để trao đổi thêm với gia sư.');
      await onCreated(request);
    } catch (err) {
      toast('error', 'Không thể gửi yêu cầu: ' + extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Mời gia sư ${tutor.full_name} dạy 1-1`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            Gửi lời mời và mở tin nhắn
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-primary-100 bg-primary-50 p-3">
          <p className="text-sm font-semibold text-primary-900">Đây là lời mời học riêng, chưa phải lớp học</p>
          <p className="mt-1 text-xs leading-5 text-primary-800">
            Học viên chọn một năng lực dạy đã được duyệt của gia sư để gửi yêu cầu 1-1. Lớp 1-1 chỉ được hệ thống tạo sau khi gia sư xác nhận lịch và học phí.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ['1', 'Gửi lời mời'],
            ['2', 'Nhắn tin chốt lịch'],
            ['3', 'Tạo buổi 1-1'],
          ].map(([step, label]) => (
            <div key={step} className="rounded-lg border border-border-light bg-surface-secondary p-3">
              <p className="text-xs font-bold text-primary-750">Bước {step}</p>
              <p className="mt-0.5 text-xs font-semibold text-text-secondary">{label}</p>
            </div>
          ))}
        </div>
        <div>
          <label className="block text-sm font-bold text-text-secondary mb-1">Năng lực dạy muốn mời học</label>
          <Select value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))} required>
            {tutor.subjects.map((s) => (
              <option key={s.id} value={s.subject_id}>
                {s.subject_name} - {s.grade_level} ({currency(s.fee_per_session)}/buổi)
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs leading-relaxed text-text-tertiary">
            Danh sách này lấy từ môn gia sư đã đăng ký và được duyệt. Đây không phải lớp nhóm có sẵn.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-text-secondary mb-1">Số buổi học dự kiến</label>
            <Input
              type="number"
              min={1}
              value={requestedSessions}
              onChange={(e) => setRequestedSessions(Math.max(Number(e.target.value), 1))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-text-secondary mb-1">Hình thức học</label>
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'ONLINE' | 'OFFLINE')}>
              <option value="ONLINE">Trực tuyến</option>
              <option value="OFFLINE">Trực tiếp</option>
            </Select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-text-secondary mb-1">Nội dung muốn trao đổi với gia sư</label>
          <Textarea
            rows={4}
            placeholder={`VD: Mình muốn học 1-1 ${subjectSummary}, cần trao đổi lịch học, mục tiêu và mức học phí phù hợp.`}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </div>

        <div className="rounded-lg border border-border-light bg-surface-secondary p-3 text-xs leading-5 text-text-secondary">
          Đơn giá tham khảo: <strong>{currency(feePerSession)}/buổi</strong>. Tạm tính {requestedSessions || 0} buổi là{' '}
          <strong>{currency(estimatedTotal)}</strong>. Hệ thống chỉ tạo khoản thanh toán sau khi gia sư xác nhận yêu cầu.
        </div>
      </form>
    </Modal>
  );
}

export default SendRequestModal;
