import { useEffect, useState } from 'react';
import { extractErrorMessage, privateRequestApi } from '../../services/api';
import type { PrivateRequestResponse } from '../../types';
import { currency } from '../../utils/format';
import Button from '../ui/Button';
import { CalendarIcon, XIcon } from '../ui/Icons';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { useToast } from '../ui/Toast';
import Select from '../ui/Select';
import { WEEKDAY_VALUES, FULL_DAY_NAMES } from '../../utils/days';

interface ConfirmRequestModalProps {
  request: PrivateRequestResponse | null;
  onClose: () => void;
  onConfirmed: (request: PrivateRequestResponse) => void;
}

interface ScheduleRow {
  day_of_week: number;
  start_date: string;
  start_time: string;
  end_time: string;
  total_sessions: string;
}
type ScheduleMode = 'NORMAL' | 'CUSTOM';

function toDateInputValueFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(dateStr: string, amount: number) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return toDateInputValueFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function getDefaultCustomSchedule(reference?: ScheduleRow): ScheduleRow {
  const startDate = reference?.start_date ? addDays(reference.start_date, 7) : getDefaultStartDate();
  return {
    day_of_week: getDayOfWeek(startDate),
    start_date: startDate,
    start_time: reference?.start_time || '18:00',
    end_time: reference?.end_time || '20:00',
    total_sessions: '1',
  };
}

function generateCustomSchedulesFromNormal(totalSessions: number, normalSchedules: ScheduleRow[]): ScheduleRow[] {
  if (totalSessions <= 0) return [];
  const sourceSchedules = normalSchedules.length > 0 ? normalSchedules : [getDefaultSchedule(totalSessions)];

  const startDate = sourceSchedules.reduce(
    (earliest, schedule) => (schedule.start_date < earliest ? schedule.start_date : earliest),
    sourceSchedules[0].start_date
  );

  const schedulesByDay: Record<number, ScheduleRow[]> = {};
  sourceSchedules.forEach((s) => {
    const day = s.day_of_week;
    if (!schedulesByDay[day]) {
      schedulesByDay[day] = [];
    }
    schedulesByDay[day].push(s);
  });

  Object.keys(schedulesByDay).forEach((d) => {
    schedulesByDay[Number(d)].sort((a, b) => a.start_time.localeCompare(b.start_time));
  });

  const customSchedules: ScheduleRow[] = [];
  let currentDate = new Date(`${startDate}T00:00:00`);
  let sessionCount = 0;
  let safetyCounter = 0;

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
          start_date: dateStr,
          start_time: daySessions[i].start_time,
          end_time: daySessions[i].end_time,
          total_sessions: '1',
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

function normalSchedulesFromCustom(customSchedules: ScheduleRow[]): ScheduleRow[] {
  const uniqueSchedules = new Map<string, ScheduleRow>();
  for (const schedule of customSchedules) {
    const key = `${schedule.day_of_week}-${schedule.start_time}-${schedule.end_time}`;
    const current = uniqueSchedules.get(key);
    if (!current || schedule.start_date < current.start_date) {
      uniqueSchedules.set(key, { ...schedule, total_sessions: '1' });
    }
  }
  return Array.from(uniqueSchedules.values()).sort(
    (left, right) => left.start_date.localeCompare(right.start_date) || left.start_time.localeCompare(right.start_time)
  );
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultStartDate() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return toDateInputValue(next);
}

function getDayOfWeek(dateStr: string) {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
}

function getDefaultSchedule(totalSessions: number): ScheduleRow {
  const startDate = getDefaultStartDate();
  return {
    day_of_week: getDayOfWeek(startDate),
    start_date: startDate,
    start_time: '18:00',
    end_time: '20:00',
    total_sessions: String(Math.max(totalSessions || 1, 1)),
  };
}

export default function ConfirmRequestModal({
  request,
  onClose,
  onConfirmed,
}: ConfirmRequestModalProps) {
  const { toast } = useToast();
  const [classTitle, setClassTitle] = useState('');
  const [sessions, setSessions] = useState('10');
  const [fee, setFee] = useState('');
  const [note, setNote] = useState('');
  const [location, setLocation] = useState('');
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([getDefaultSchedule(10)]);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('NORMAL');
  const [saving, setSaving] = useState(false);
  const sessionCount = scheduleMode === 'CUSTOM' ? scheduleRows.length : Math.max(Number(sessions || 0), 0);
  const feeNumber = Math.max(Number(fee || 0), 0);
  const totalAmount = sessionCount * feeNumber;

  useEffect(() => {
    if (!request) return;
    setClassTitle(`1-1 ${request.subject_name || 'Môn học'} - ${request.grade_level}`);
    setSessions(String(request.requested_sessions || 1));
    setFee(request.agreed_fee_per_session || '');
    setNote(request.tutor_response_note || '');
    setLocation(request.class_location || '');
    const existingSchedules = request.schedules || [];
    const isCustom = existingSchedules.length > 0 && existingSchedules.length === request.requested_sessions && existingSchedules.every((schedule) => schedule.total_sessions === 1);
    setScheduleMode(isCustom ? 'CUSTOM' : 'NORMAL');
    setScheduleRows(
      existingSchedules.length > 0
        ? existingSchedules.map((schedule) => ({
            day_of_week: schedule.day_of_week || getDayOfWeek(schedule.start_date),
            start_date: schedule.start_date,
            start_time: schedule.start_time.slice(0, 5),
            end_time: schedule.end_time.slice(0, 5),
            total_sessions: String(isCustom ? 1 : schedule.total_sessions || request.requested_sessions || 1),
          }))
        : [getDefaultSchedule(request.requested_sessions || 1)],
    );
  }, [request]);

  const updateScheduleRow = (index: number, patch: Partial<ScheduleRow>) => {
    setScheduleRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const addScheduleRow = () => {
    setScheduleRows((current) => scheduleMode === 'CUSTOM'
      ? [...current, getDefaultCustomSchedule(current[current.length - 1])]
      : [...current, getDefaultSchedule(sessionCount || 1)]);
  };

  const removeScheduleRow = (index: number) => {
    setScheduleRows((current) => current.length <= 1 ? current : current.filter((_, rowIndex) => rowIndex !== index));
  };

  const changeScheduleMode = (mode: ScheduleMode) => {
    if (mode === scheduleMode) return;
    if (mode === 'CUSTOM') {
      setScheduleRows((current) => generateCustomSchedulesFromNormal(Math.max(Number(sessions || 0), 1), current));
    } else {
      setScheduleRows((current) => {
        const normalSchedules = normalSchedulesFromCustom(current);
        return normalSchedules.length > 0 ? normalSchedules : [getDefaultSchedule(current.length || 1)];
      });
      setSessions(String(Math.max(scheduleRows.length, 1)));
    }
    setScheduleMode(mode);
  };

  const handleConfirm = async () => {
    if (!request || !feeNumber || !sessionCount || !classTitle.trim()) {
      toast('error', 'Vui lòng chốt tên, số buổi và học phí hợp lệ');
      return;
    }
    if (scheduleRows.length === 0) {
      toast('error', 'Vui lòng đề xuất ít nhất một lịch học');
      return;
    }
    const invalidSchedule = scheduleRows.find((row) => !row.start_date || !row.start_time || !row.end_time || row.end_time <= row.start_time);
    if (invalidSchedule) {
      toast('error', 'Vui lòng kiểm tra ngày học và giờ kết thúc phải sau giờ bắt đầu');
      return;
    }
    setSaving(true);
    try {
      const updatedRequest = await privateRequestApi.confirm(request.id, {
        agreed_fee_per_session: fee,
        agreed_sessions: sessionCount,
        class_title: classTitle.trim(),
        response_note: note || undefined,
        location: location.trim() || undefined,
        schedules: scheduleRows.map((row) => ({
          private_request_id: request.id,
          day_of_week: row.day_of_week,
          start_date: row.start_date,
          start_time: row.start_time,
          end_time: row.end_time,
          total_sessions: scheduleMode === 'CUSTOM' ? 1 : sessionCount,
        })),
      });
      toast('success', 'Đã gửi lịch đề xuất cho học viên');
      onConfirmed(updatedRequest);
    } catch (err) {
      toast('error', 'Xác nhận thất bại: ' + extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!request}
      onClose={onClose}
      title="Xác nhận yêu cầu 1-1"
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button loading={saving} onClick={handleConfirm}>Gửi đề xuất</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-primary-100 bg-primary-50 p-3 text-sm leading-6 text-primary-800">
          Sau khi gửi, học viên sẽ thấy lịch đề xuất và cần bấm đồng ý trước khi hệ thống mở bước thanh toán.
        </div>
        <Input label="Tên lớp/buổi 1-1" placeholder="VD: 1-1 IELTS - Band 6.5" value={classTitle} onChange={(event) => setClassTitle(event.target.value)} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Số buổi đã chốt"
            type="number"
            min="1"
            value={scheduleMode === 'CUSTOM' ? String(scheduleRows.length) : sessions}
            onChange={(event) => setSessions(event.target.value)}
            hint={scheduleMode === 'CUSTOM' ? 'Bằng số buổi đã khai báo bên dưới.' : 'Tổng số buổi của gói học 1-1.'}
            readOnly={scheduleMode === 'CUSTOM'}
            required
          />
          <Input label="Học phí thỏa thuận (VNĐ/buổi)" type="number" placeholder="200000" value={fee} onChange={(event) => setFee(event.target.value)} required />
        </div>
        <Input label="Phòng học / link học / địa điểm" placeholder="VD: Google Meet, phòng A203, hoặc địa chỉ học" value={location} onChange={(event) => setLocation(event.target.value)} />
        <div className="space-y-3 rounded-lg border border-border-light bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-text-primary">Lịch đề xuất</p>
              <p className="mt-0.5 text-xs text-text-tertiary">
                {scheduleMode === 'CUSTOM'
                  ? 'Khai báo chính xác ngày và giờ của từng buổi học.'
                  : `Các khung dưới đây lặp hằng tuần cho đến khi đủ ${sessionCount || 0} buổi.`}
              </p>
            </div>
            <Button size="sm" variant="outline" icon={<CalendarIcon className="h-4 w-4" />} onClick={addScheduleRow}>
              {scheduleMode === 'CUSTOM' ? 'Thêm buổi' : 'Thêm khung'}
            </Button>
          </div>
          <div className="flex rounded-lg bg-surface-tertiary p-1 text-xs font-semibold">
            <button type="button" onClick={() => changeScheduleMode('NORMAL')} className={`flex-1 rounded-md px-3 py-2 transition-colors ${scheduleMode === 'NORMAL' ? 'bg-white text-primary-700 shadow-xs' : 'text-text-tertiary hover:text-text-primary'}`}>
              Lặp hằng tuần
            </button>
            <button type="button" onClick={() => changeScheduleMode('CUSTOM')} className={`flex-1 rounded-md px-3 py-2 transition-colors ${scheduleMode === 'CUSTOM' ? 'bg-white text-primary-700 shadow-xs' : 'text-text-tertiary hover:text-text-primary'}`}>
              Tùy chỉnh từng buổi ({scheduleMode === 'CUSTOM' ? scheduleRows.length : sessionCount || 0})
            </button>
          </div>
          <div className="space-y-3">
            {scheduleRows.map((row, index) => (
              <div key={`${row.start_date}-${index}`} className="rounded-lg border border-border-light bg-surface-secondary p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
                      {scheduleMode === 'CUSTOM'
                        ? `Buổi ${index + 1} (${FULL_DAY_NAMES[row.day_of_week] || ''})`
                        : `Khung ${index + 1}`}
                    </p>
                    {scheduleMode === 'NORMAL' && (
                      <p className="mt-1 text-xs text-text-tertiary">Lặp lại hằng tuần đến khi đủ tổng số buổi đã chốt.</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<XIcon className="h-4 w-4" />}
                    disabled={scheduleRows.length <= 1}
                    onClick={() => removeScheduleRow(index)}
                  >
                    Xóa
                  </Button>
                </div>
                {scheduleMode === 'NORMAL' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      label="Thứ"
                      options={WEEKDAY_VALUES.map((d) => ({ value: String(d), label: FULL_DAY_NAMES[d] }))}
                      value={String(row.day_of_week)}
                      onChange={(e) => updateScheduleRow(index, { day_of_week: Number(e.target.value) })}
                      required
                    />
                    <Input
                      label="Ngày bắt đầu"
                      type="date"
                      value={row.start_date}
                      onChange={(event) => {
                        const newDate = event.target.value;
                        const patch: Partial<ScheduleRow> = { start_date: newDate };
                        if (newDate) {
                          const jsDay = new Date(newDate).getDay();
                          patch.day_of_week = jsDay === 0 ? 7 : jsDay;
                        }
                        updateScheduleRow(index, patch);
                      }}
                      required
                    />
                    <Input label="Giờ bắt đầu" type="time" value={row.start_time} onChange={(event) => updateScheduleRow(index, { start_time: event.target.value })} required />
                    <Input label="Giờ kết thúc" type="time" value={row.end_time} onChange={(event) => updateScheduleRow(index, { end_time: event.target.value })} required />
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Ngày học"
                      type="date"
                      value={row.start_date}
                      onChange={(event) => {
                        const newDate = event.target.value;
                        if (newDate) {
                          const jsDay = new Date(newDate).getDay();
                          updateScheduleRow(index, {
                            start_date: newDate,
                            day_of_week: jsDay === 0 ? 7 : jsDay
                          });
                        }
                      }}
                      required
                    />
                    <div className="hidden sm:block">
                      <div className="h-full flex items-end pb-3 text-sm font-semibold text-primary-700">
                        📅 {FULL_DAY_NAMES[row.day_of_week] || ''}
                      </div>
                    </div>
                    <Input label="Giờ bắt đầu" type="time" value={row.start_time} onChange={(event) => updateScheduleRow(index, { start_time: event.target.value })} required />
                    <Input label="Giờ kết thúc" type="time" value={row.end_time} onChange={(event) => updateScheduleRow(index, { end_time: event.target.value })} required />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <Input label="Ghi chú cho học viên" placeholder="VD: Có thể bắt đầu từ tuần sau" value={note} onChange={(event) => setNote(event.target.value)} />
        <div className="rounded-lg border border-warning-100 bg-warning-50 p-3 text-sm leading-6 text-warning-800">
          Tổng thanh toán sẽ là <strong>{currency(totalAmount)}</strong> = {sessionCount || 0} buổi x {currency(feeNumber)}/buổi.
        </div>
      </div>
    </Modal>
  );
}
