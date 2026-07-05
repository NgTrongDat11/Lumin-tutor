import { useEffect, useState } from 'react';
import { scheduleApi } from '../../services/api';
import type { LearningSessionResponse } from '../../types';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { getStatusBadge } from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

export default function TutorSessions() {
  const [sessions, setSessions] = useState<LearningSessionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = () => { scheduleApi.listSessions().then(setSessions).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(load, []);

  const handleAttendance = async (id: number, status: string) => {
    try {
      await scheduleApi.updateAttendance(id, { status });
      toast('success', 'Cập nhật thành công!');
      load();
    } catch { toast('error', 'Cập nhật thất bại'); }
  };

  if (loading) return <CardGridSkeleton />;

  const upcoming = sessions.filter((s) => s.status === 'SCHEDULED');
  const past = sessions.filter((s) => s.status !== 'SCHEDULED');

  return (
    <div className="animate-slide-up">
      <PageHeader title="Lịch dạy" description="Xem lịch dạy và điểm danh các buổi học." />

      {sessions.length === 0 ? (
        <EmptyState title="Chưa có buổi học nào" />
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">📅 Sắp tới ({upcoming.length})</h2>
              <div className="space-y-3">
                {upcoming.map((s) => (
                  <Card key={s.id}>
                    <div className="flex flex-col sm:flex-row justify-between gap-3">
                      <div>
                        <p className="font-semibold">Buổi {s.session_number} — {new Date(s.session_date).toLocaleDateString('vi-VN')}</p>
                        <p className="text-sm text-text-secondary">{s.start_time?.slice(0, 5)} — {s.end_time?.slice(0, 5)}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" onClick={() => handleAttendance(s.id, 'COMPLETED')}>✓ Hoàn thành</Button>
                        <Button size="sm" variant="outline" onClick={() => handleAttendance(s.id, 'NO_SHOW')}>Vắng</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleAttendance(s.id, 'CANCELLED')}>Huỷ</Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">Đã diễn ra</h2>
              <div className="space-y-2">
                {past.map((s) => (
                  <Card key={s.id} padding="sm">
                    <div className="flex items-center justify-between">
                      <p className="text-sm">Buổi {s.session_number} — {new Date(s.session_date).toLocaleDateString('vi-VN')}</p>
                      {getStatusBadge(s.status)}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
