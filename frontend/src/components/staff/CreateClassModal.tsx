import { useState, useEffect, type FormEvent } from 'react';
import { classApi, extractErrorMessage } from '../../services/api';
import type { SubjectResponse, CourseClassResponse } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { useToast } from '../ui/Toast';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { SHORT_DAY_NAMES, WEEKDAY_VALUES } from '../../utils/days';

interface CreateClassModalProps {
  open: boolean;
  onClose: () => void;
  subjects: SubjectResponse[];
  onCreated: () => void;
  editingClass?: CourseClassResponse | null;
}

interface FormSchedule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  start_date?: string;
  end_date?: string;
  total_sessions?: number;
}

function parseMoney(value: string) {
  if (typeof value !== 'string') value = String(value);
  const normalized = value.replace(/[^\d]/g, '');
  return normalized ? Number(normalized) : 0;
}

function formatMoney(value: number) {
  return value > 0 ? `${value.toLocaleString('vi-VN')}đ` : '—';
}

function calculateEndDate(startDateStr: string, totalSessions: number, schedules: FormSchedule[]): string {
  if (!startDateStr || totalSessions <= 0 || schedules.length === 0) {
    return '';
  }

  const currentDate = new Date(startDateStr);
  if (isNaN(currentDate.getTime())) return '';

  let sessionCount = 0;
  let safetyCounter = 0;

  const schedulesByDay: Record<number, FormSchedule[]> = {};
  schedules.forEach(s => {
    if (!schedulesByDay[s.day_of_week]) {
      schedulesByDay[s.day_of_week] = [];
    }
    schedulesByDay[s.day_of_week].push(s);
  });

  Object.keys(schedulesByDay).forEach(d => {
    schedulesByDay[Number(d)].sort((a, b) => a.start_time.localeCompare(b.start_time));
  });

  let lastSessionDate = new Date(currentDate);

  while (sessionCount < totalSessions && safetyCounter < 1000) {
    const jsDay = currentDate.getDay();
    const appDay = jsDay === 0 ? 7 : jsDay;

    if (schedulesByDay[appDay]) {
      const daySessions = schedulesByDay[appDay];
      for (let i = 0; i < daySessions.length; i++) {
        if (sessionCount >= totalSessions) break;
        sessionCount++;
        lastSessionDate = new Date(currentDate);
      }
    }

    if (sessionCount < totalSessions) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    safetyCounter++;
  }

  const yyyy = lastSessionDate.getFullYear();
  const mm = String(lastSessionDate.getMonth() + 1).padStart(2, '0');
  const dd = String(lastSessionDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function generateCustomSchedulesFromNormal(
  startDateStr: string,
  totalSessions: number,
  normalSchedules: FormSchedule[]
): FormSchedule[] {
  const customSchedules: FormSchedule[] = [];
  const startStr = startDateStr || new Date().toISOString().split('T')[0];
  if (totalSessions <= 0) {
    return customSchedules;
  }

  const currentDate = new Date(startStr);
  if (isNaN(currentDate.getTime())) return customSchedules;

  let sessionCount = 0;
  let safetyCounter = 0;

  if (normalSchedules.length === 0) {
    while (sessionCount < totalSessions && safetyCounter < 1000) {
      const jsDay = currentDate.getDay();
      const appDay = jsDay === 0 ? 7 : jsDay;
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      customSchedules.push({
        day_of_week: appDay,
        start_time: '18:00',
        end_time: '20:00',
        start_date: dateStr,
        end_date: dateStr,
        total_sessions: 1,
      });

      sessionCount++;
      currentDate.setDate(currentDate.getDate() + 1);
      safetyCounter++;
    }
    return customSchedules;
  }

  const schedulesByDay: Record<number, FormSchedule[]> = {};
  normalSchedules.forEach(s => {
    if (!schedulesByDay[s.day_of_week]) {
      schedulesByDay[s.day_of_week] = [];
    }
    schedulesByDay[s.day_of_week].push(s);
  });

  Object.keys(schedulesByDay).forEach(d => {
    schedulesByDay[Number(d)].sort((a, b) => a.start_time.localeCompare(b.start_time));
  });

  while (sessionCount < totalSessions && safetyCounter < 1000) {
    const jsDay = currentDate.getDay();
    const appDay = jsDay === 0 ? 7 : jsDay;

    if (schedulesByDay[appDay]) {
      const daySessions = schedulesByDay[appDay];
      for (let i = 0; i < daySessions.length; i++) {
        if (sessionCount >= totalSessions) break;
        sessionCount++;

        const yyyy = currentDate.getFullYear();
        const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
        const dd = String(currentDate.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        customSchedules.push({
          day_of_week: appDay,
          start_time: daySessions[i].start_time,
          end_time: daySessions[i].end_time,
          start_date: dateStr,
          end_date: dateStr,
          total_sessions: 1,
        });
      }
    }

    if (sessionCount < totalSessions) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    safetyCounter++;
  }

  return customSchedules;
}

export function CreateClassModal({
  open,
  onClose,
  subjects,
  onCreated,
  editingClass = null,
}: CreateClassModalProps) {
  const { toast } = useToast();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();
  const [scheduleMode, setScheduleMode] = useState<'NORMAL' | 'CUSTOM'>('NORMAL');
  const [form, setForm] = useState<{
    subject_id: number;
    title: string;
    grade_level: string;
    goal: string;
    fee_per_session_per_student: string;
    total_sessions: number;
    min_students: number;
    max_students: number;
    mode: string;
    location: string;
    start_date: string;
    end_date: string;
    schedules: FormSchedule[];
  }>({
    subject_id: 0,
    title: '',
    grade_level: '',
    goal: '',
    fee_per_session_per_student: '',
    total_sessions: 10,
    min_students: 3,
    max_students: 15,
    mode: 'OFFLINE',
    location: '',
    start_date: '',
    end_date: '',
    schedules: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      if (editingClass) {
        const isCustom = editingClass.schedules && editingClass.schedules.length > 0 && editingClass.schedules.every(s => s.total_sessions === 1);
        setScheduleMode(isCustom ? 'CUSTOM' : 'NORMAL');
        setForm({
          subject_id: editingClass.subject_id,
          title: editingClass.title,
          grade_level: editingClass.grade_level,
          goal: editingClass.goal || '',
          fee_per_session_per_student: String(Number(editingClass.fee_per_session_per_student)),
          total_sessions: editingClass.total_sessions,
          min_students: editingClass.min_students,
          max_students: editingClass.max_students,
          mode: editingClass.mode,
          location: editingClass.location || '',
          start_date: editingClass.start_date || '',
          end_date: editingClass.end_date || '',
          schedules: (editingClass.schedules || []).map((s) => ({
            day_of_week: s.day_of_week,
            start_time: s.start_time.slice(0, 5),
            end_time: s.end_time.slice(0, 5),
            start_date: s.start_date || undefined,
            end_date: s.end_date || undefined,
            total_sessions: s.total_sessions || undefined,
          })),
        });
      } else {
        setScheduleMode('NORMAL');
        setForm({
          subject_id: 0,
          title: '',
          grade_level: '',
          goal: '',
          fee_per_session_per_student: '',
          total_sessions: 10,
          min_students: 3,
          max_students: 15,
          mode: 'OFFLINE',
          location: '',
          start_date: '',
          end_date: '',
          schedules: [],
        });
      }
      setError('');
    }
  }, [open, editingClass]);

  useEffect(() => {
    const computedEnd = calculateEndDate(form.start_date, form.total_sessions, form.schedules);
    if (computedEnd && computedEnd !== form.end_date) {
      setForm(prev => ({ ...prev, end_date: computedEnd }));
    }
  }, [form.start_date, form.total_sessions, form.schedules]);

  const selectedSubject = subjects.find((subject) => subject.id === form.subject_id);
  const feeValue = parseMoney(form.fee_per_session_per_student);
  const tuitionPerStudent = feeValue * form.total_sessions;
  const minRevenue = tuitionPerStudent * form.min_students;
  const maxRevenue = tuitionPerStudent * form.max_students;

  const updateForm = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setError('');
    setForm((current) => ({ ...current, [key]: value }));
  };

  const addSchedule = () => {
    setForm((f) => ({
      ...f,
      schedules: [...f.schedules, { day_of_week: 1, start_time: '18:00', end_time: '20:00' }],
    }));
  };

  const updateSchedule = (idx: number, field: keyof FormSchedule, value: string | number) => {
    setForm((f) => {
      const schedules = [...f.schedules];
      schedules[idx] = { ...schedules[idx], [field]: value } as FormSchedule;
      return { ...f, schedules };
    });
  };

  const removeSchedule = (idx: number) => {
    setForm((f) => ({
      ...f,
      schedules: f.schedules.filter((_, i) => i !== idx),
    }));
  };

  const handleSwitchMode = async (mode: 'NORMAL' | 'CUSTOM') => {
    if (mode === 'CUSTOM' && scheduleMode === 'NORMAL') {
      let startDate = form.start_date;
      if (!startDate) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        startDate = `${yyyy}-${mm}-${dd}`;
        updateForm('start_date', startDate);
      }
      const generated = generateCustomSchedulesFromNormal(startDate, form.total_sessions, form.schedules);
      setForm(f => ({ ...f, schedules: generated }));
    } else if (mode === 'NORMAL' && scheduleMode === 'CUSTOM') {
      const isConfirmed = await confirm({
        title: 'Chuyển sang lịch định kỳ',
        description: 'Chuyển sang lịch định kỳ sẽ cài đặt lại lịch học chi tiết của từng buổi. Bạn có đồng ý không?',
        confirmLabel: 'Đồng ý',
        cancelLabel: 'Hủy',
        variant: 'warning',
      });
      if (isConfirmed) {
        const uniqueDaysMap: Record<number, FormSchedule> = {};
        form.schedules.forEach(s => {
          if (!uniqueDaysMap[s.day_of_week]) {
            uniqueDaysMap[s.day_of_week] = {
              day_of_week: s.day_of_week,
              start_time: s.start_time,
              end_time: s.end_time,
            };
          }
        });
        setForm(f => ({ ...f, schedules: Object.values(uniqueDaysMap) }));
      } else {
        return;
      }
    }
    setScheduleMode(mode);
  };

  useEffect(() => {
    if (scheduleMode === 'CUSTOM') {
      const diff = form.total_sessions - form.schedules.length;
      if (diff > 0) {
        const lastSession = form.schedules[form.schedules.length - 1];
        const lastDateStr = lastSession?.start_date || form.start_date;
        const newSchedules = [...form.schedules];
        
        if (lastDateStr) {
          const uniqueDays = Array.from(new Set(form.schedules.map(s => s.day_of_week)));
          const dayPatterns = uniqueDays.length > 0 ? uniqueDays : [1];
          const currentDate = new Date(lastDateStr);
          currentDate.setDate(currentDate.getDate() + 1);
          
          let added = 0;
          let safety = 0;
          
          while (added < diff && safety < 1000) {
            const jsDay = currentDate.getDay();
            const appDay = jsDay === 0 ? 7 : jsDay;
            if (dayPatterns.includes(appDay)) {
              const yyyy = currentDate.getFullYear();
              const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
              const dd = String(currentDate.getDate()).padStart(2, '0');
              const dStr = `${yyyy}-${mm}-${dd}`;
              
              const template = form.schedules.find(s => s.day_of_week === appDay) || lastSession || { start_time: '18:00', end_time: '20:00' };
              
              newSchedules.push({
                day_of_week: appDay,
                start_time: template.start_time,
                end_time: template.end_time,
                start_date: dStr,
                end_date: dStr,
                total_sessions: 1,
              });
              added++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
            safety++;
          }
        } else {
          for (let i = 0; i < diff; i++) {
            newSchedules.push({
              day_of_week: 1,
              start_time: '18:00',
              end_time: '20:00',
              total_sessions: 1,
            });
          }
        }
        setForm(f => ({ ...f, schedules: newSchedules }));
      } else if (diff < 0) {
        setForm(f => ({ ...f, schedules: f.schedules.slice(0, form.total_sessions) }));
      }
    }
  }, [form.total_sessions, scheduleMode]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.subject_id) {
      setError('Vui lòng chọn môn học cho lớp.');
      return;
    }
    if (!form.title.trim()) {
      setError('Vui lòng nhập tên lớp để staff, gia sư và học viên dễ nhận diện.');
      return;
    }
    if (!form.grade_level.trim()) {
      setError('Vui lòng nhập cấp lớp/nhóm trình độ.');
      return;
    }
    if (feeValue <= 0) {
      setError('Vui lòng nhập học phí theo mỗi buổi cho từng học viên.');
      return;
    }
    if (form.total_sessions <= 0) {
      setError('Tổng số buổi phải lớn hơn 0.');
      return;
    }
    if (form.min_students <= 0 || form.max_students < form.min_students) {
      setError('Sĩ số tối đa phải lớn hơn hoặc bằng sĩ số tối thiểu.');
      return;
    }
    if (form.mode === 'OFFLINE' && !form.location.trim()) {
      setError('Lớp trực tiếp cần có địa điểm học dự kiến.');
      return;
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError('Ngày kết thúc phải sau ngày bắt đầu.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        fee_per_session_per_student: String(feeValue),
        goal: form.goal || undefined,
        location: form.location.trim() || null,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        schedules: form.schedules.map((s) => ({
          day_of_week: s.day_of_week,
          start_time: s.start_time.length === 5 ? `${s.start_time}:00` : s.start_time,
          end_time: s.end_time.length === 5 ? `${s.end_time}:00` : s.end_time,
          ...(scheduleMode === 'CUSTOM'
            ? {
                start_date: s.start_date || undefined,
                end_date: s.end_date || s.start_date || undefined,
                total_sessions: s.total_sessions ?? 1,
              }
            : {}),
        })),
      };
      if (editingClass) {
        await classApi.update(editingClass.id, payload);
        toast('success', `Đã cập nhật thông tin lớp "${form.title}" thành công.`);
      } else {
        await classApi.create(payload);
        toast('success', 'Đã tạo bản nháp lớp. Bước tiếp theo là mở tuyển gia sư.');
      }
      onCreated();
    } catch (err: unknown) {
      const fallbackMessage = editingClass ? 'Cập nhật lớp thất bại' : 'Tạo lớp thất bại';
      toast('error', extractErrorMessage(err) || fallbackMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
      open={open}
      onClose={onClose}
      title={editingClass ? "Sửa hồ sơ lớp nhóm" : "Tạo hồ sơ lớp nhóm"}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button loading={saving} onClick={(e) => handleSubmit(e as unknown as FormEvent)}>
            {editingClass ? "Cập nhật lớp" : "Tạo bản nháp lớp"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-lg border border-primary-100 bg-primary-50/70 p-3 text-sm leading-6 text-primary-900">
          {editingClass 
            ? "Chỉnh sửa các thông tin kế hoạch của lớp. Lưu ý không thể sửa học phí và số buổi nếu đã có học viên đăng ký." 
            : "Lớp mới sẽ được lưu ở trạng thái Bản nháp. Sau đó staff mở tuyển gia sư, mở đăng ký học viên và bắt đầu lớp ở danh sách lớp."}
        </div>

        {error && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm font-semibold text-danger-700">
            {error}
          </div>
        )}

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-text-primary">1. Thông tin học vụ</h3>
            <p className="mt-0.5 text-xs text-text-tertiary">Dùng để học viên và gia sư hiểu lớp này dành cho ai, học nội dung gì.</p>
          </div>
          <Input
            label="Tên lớp"
            placeholder="VD: Toán 12 luyện thi THPT quốc gia"
            value={form.title}
            onChange={(e) => updateForm('title', e.target.value)}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Select
                label="Môn học"
                options={subjects.map((s) => ({ value: String(s.id), label: s.name }))}
                placeholder="Chọn môn"
                value={String(form.subject_id || '')}
                onChange={(e) => updateForm('subject_id', Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-text-tertiary">
                {selectedSubject?.description || 'Chọn từ danh mục môn học đang mở trong hệ thống.'}
              </p>
            </div>
            <Input
              label="Cấp lớp / nhóm trình độ"
              placeholder="VD: Lớp 12, mất gốc, ôn thi"
              value={form.grade_level}
              onChange={(e) => updateForm('grade_level', e.target.value)}
              required
            />
          </div>
          <Textarea
            label="Mục tiêu đầu ra"
            placeholder="VD: Hoàn thành chuyên đề hàm số, luyện 8 đề thi thử và đạt mục tiêu 7+."
            value={form.goal}
            onChange={(e) => updateForm('goal', e.target.value)}
          />
        </section>

        <section className="space-y-3 rounded-lg border border-border-light bg-surface-secondary/50 p-3">
          <div>
            <h3 className="text-sm font-bold text-text-primary">2. Gói học phí và sĩ số</h3>
            <p className="mt-0.5 text-xs text-text-tertiary">Học phí tính theo từng học viên cho mỗi buổi. Tổng tiền học viên thanh toán = học phí/buổi x tổng buổi.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Học phí mỗi buổi / học viên"
              inputMode="numeric"
              placeholder="VD: 200000"
              value={form.fee_per_session_per_student}
              onChange={(e) => updateForm('fee_per_session_per_student', e.target.value)}
              hint="Nhập số tiền VNĐ, chưa gồm giảm giá hoặc hoàn tiền."
              required
            />
            <Input
              label="Tổng số buổi"
              type="number"
              min={1}
              value={form.total_sessions}
              onChange={(e) => updateForm('total_sessions', Number(e.target.value))}
              hint="Số buổi dự kiến để tạo gói thanh toán và hợp đồng."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Sĩ số tối thiểu để mở lớp"
              type="number"
              min={1}
              value={form.min_students}
              onChange={(e) => updateForm('min_students', Number(e.target.value))}
              hint="Chưa đủ số này thì chưa nên bắt đầu lớp."
            />
            <Input
              label="Sĩ số tối đa nhận đăng ký"
              type="number"
              min={form.min_students}
              value={form.max_students}
              onChange={(e) => updateForm('max_students', Number(e.target.value))}
              hint="Đạt mức này thì hệ thống chặn đăng ký thêm."
            />
          </div>
          <div className="grid gap-2 rounded-lg border border-border-light bg-white p-3 text-xs sm:grid-cols-3">
            <div>
              <p className="text-text-tertiary">Mỗi học viên trả</p>
              <p className="mt-1 text-sm font-bold text-text-primary">{formatMoney(tuitionPerStudent)}</p>
            </div>
            <div>
              <p className="text-text-tertiary">Doanh thu tối thiểu</p>
              <p className="mt-1 text-sm font-bold text-text-primary">{formatMoney(minRevenue)}</p>
            </div>
            <div>
              <p className="text-text-tertiary">Doanh thu tối đa</p>
              <p className="mt-1 text-sm font-bold text-text-primary">{formatMoney(maxRevenue)}</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-text-primary">3. Hình thức và thời gian dự kiến</h3>
            <p className="mt-0.5 text-xs text-text-tertiary">Đây là thông tin kế hoạch. Lịch học chi tiết sẽ được chốt sau khi có gia sư.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Hình thức học"
              options={[
                { value: 'OFFLINE', label: 'Trực tiếp tại trung tâm/địa điểm' },
                { value: 'ONLINE', label: 'Trực tuyến' },
              ]}
              value={form.mode}
              onChange={(e) =>
                setForm((current) => {
                  const nextMode = e.target.value;
                  return {
                    ...current,
                    mode: nextMode,
                    location: nextMode === current.mode ? current.location : '',
                  };
                })
              }
            />
            <Input
              label={form.mode === 'ONLINE' ? 'Link phòng học trực tuyến' : 'Địa điểm học dự kiến'}
              placeholder={form.mode === 'ONLINE' ? 'VD: https://meet.google.com/abc-defg-hij' : 'VD: Cơ sở Q.1, phòng A203'}
              value={form.location}
              onChange={(e) => updateForm('location', e.target.value)}
              hint={form.mode === 'ONLINE' ? 'Dán link Google Meet, Zoom hoặc Teams nếu đã có.' : 'Có thể chỉnh sau khi chốt lịch với gia sư.'}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Ngày bắt đầu dự kiến"
              type="date"
              value={form.start_date}
              onChange={(e) => updateForm('start_date', e.target.value)}
              hint="Không bắt buộc khi lớp còn ở bản nháp."
            />
            <Input
              label="Ngày kết thúc dự kiến"
              type="date"
              value={form.end_date}
              onChange={(e) => updateForm('end_date', e.target.value)}
              hint="Có thể để trống nếu chưa chốt lịch."
            />
          </div>
        </section>

        <hr className="border-border-light" />

        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-text-primary">4. Lịch học dự kiến trong tuần</h3>
              <p className="mt-0.5 text-xs text-text-tertiary">Chọn chế độ xếp lịch lặp lại hàng tuần hoặc tùy chỉnh từng buổi học.</p>
            </div>
            
            {/* Tab switch */}
            <div className="flex rounded-lg bg-surface-tertiary p-1 text-xs font-semibold shrink-0">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  scheduleMode === 'NORMAL'
                    ? 'bg-white shadow text-primary-700 font-bold'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => handleSwitchMode('NORMAL')}
              >
                Lịch định kỳ
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  scheduleMode === 'CUSTOM'
                    ? 'bg-white shadow text-primary-700 font-bold'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => handleSwitchMode('CUSTOM')}
              >
                Tùy chỉnh từng buổi ({form.schedules.length})
              </button>
            </div>
          </div>

          {scheduleMode === 'NORMAL' ? (
            <>
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={addSchedule}>
                  + Thêm buổi học
                </Button>
              </div>

              {form.schedules.length === 0 ? (
                <p className="text-xs text-text-tertiary italic p-3 text-center border border-dashed border-border rounded-lg bg-surface-secondary/20">
                  Chưa cấu hình lịch học. Nhấn nút "Thêm buổi học" để cài đặt khung giờ học dự kiến.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {form.schedules.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-3 bg-surface-secondary/40 p-2.5 rounded-lg border border-border-light animate-fade-in">
                      <div className="w-full sm:w-44">
                        <Select
                          options={WEEKDAY_VALUES.map((d) => ({ value: String(d), label: SHORT_DAY_NAMES[d] }))}
                          value={String(s.day_of_week)}
                          onChange={(e) => updateSchedule(i, 'day_of_week', Number(e.target.value))}
                        />
                      </div>
                      <div className="flex flex-1 items-center gap-2 min-w-[240px]">
                        <div className="flex items-center gap-1.5 flex-1">
                          <span className="text-text-tertiary text-xs shrink-0">Từ</span>
                          <Input
                            type="time"
                            value={s.start_time}
                            onChange={(e) => updateSchedule(i, 'start_time', e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 flex-1">
                          <span className="text-text-tertiary text-xs shrink-0">Đến</span>
                          <Input
                            type="time"
                            value={s.end_time}
                            onChange={(e) => updateSchedule(i, 'end_time', e.target.value)}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSchedule(i)}
                        className="text-text-tertiary hover:text-danger-500 hover:bg-danger-50 p-2 rounded-lg cursor-pointer font-medium text-xs border border-transparent hover:border-danger-200 transition-colors"
                      >
                        ✕ Xóa
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 border border-border-light rounded-lg bg-surface-secondary/20 p-3">
              {form.schedules.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3 bg-white p-2.5 rounded-lg border border-border-light shadow-sm">
                  <div className="w-20 shrink-0 font-bold text-xs text-primary-800">
                    Buổi {i + 1}
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <Input
                      type="date"
                      value={s.start_date || ''}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        if (newDate) {
                          const dateObj = new Date(newDate);
                          const jsDay = dateObj.getDay();
                          const appDay = jsDay === 0 ? 7 : jsDay;

                          setForm(f => {
                            const schedules = [...f.schedules];
                            schedules[i] = {
                              ...schedules[i],
                              start_date: newDate,
                              end_date: newDate,
                              day_of_week: appDay,
                            };
                            return { ...f, schedules };
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 min-w-[220px]">
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-text-tertiary text-xs shrink-0">Từ</span>
                      <Input
                        type="time"
                        value={s.start_time}
                        onChange={(e) => updateSchedule(i, 'start_time', e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-text-tertiary text-xs shrink-0">Đến</span>
                      <Input
                        type="time"
                        value={s.end_time}
                        onChange={(e) => updateSchedule(i, 'end_time', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </form>
    </Modal>
    {ConfirmDialogElement}
    </>
  );
}

export default CreateClassModal;
