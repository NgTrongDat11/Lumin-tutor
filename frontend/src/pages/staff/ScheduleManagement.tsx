import { useEffect, useState, useMemo } from 'react';
import { scheduleApi } from '../../services/api';
import type { SchedulePatternResponse, LearningSessionResponse, SessionStatus } from '../../types';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import { getStatusBadge } from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { ScheduleSkeleton } from '../../components/ui/Skeleton';
import { SHORT_DAY_NAMES } from '../../utils/days';

export default function StaffSchedules() {
  const [patterns, setPatterns] = useState<SchedulePatternResponse[]>([]);
  const [sessions, setSessions] = useState<LearningSessionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionFilter, setSessionFilter] = useState<'ALL' | SessionStatus>('ALL');

  useEffect(() => {
    Promise.all([
      scheduleApi.listPatterns().catch(() => []),
      scheduleApi.listSessions().catch(() => []),
    ]).then(([p, s]) => { setPatterns(p); setSessions(s); setLoading(false); });
  }, []);

  const filteredSessions = useMemo(() => {
    if (sessionFilter === 'ALL') return sessions;
    return sessions.filter((s) => s.status === sessionFilter);
  }, [sessions, sessionFilter]);

  const stats = useMemo(() => {
    return {
      scheduled: sessions.filter(s => s.status === 'SCHEDULED').length,
      completed: sessions.filter(s => s.status === 'COMPLETED').length,
      cancelled: sessions.filter(s => s.status === 'CANCELLED' || s.status === 'NO_SHOW').length,
    };
  }, [sessions]);

  if (loading) return <ScheduleSkeleton />;
  return (
    <div className="animate-slide-up space-y-6">
      <PageHeader title="Quản lý lịch học" description="Theo dõi lịch lặp và các buổi học cụ thể." />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Patterns */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="bg-primary-50 dark:bg-primary-900/20 border-primary-100 dark:border-primary-800/30">
            <h2 className="text-lg font-bold text-primary-900 dark:text-primary-50 mb-1">Lịch lặp ({patterns.length})</h2>
            <p className="text-sm text-primary-600 dark:text-primary-400">Khung giờ định kỳ hàng tuần</p>
          </Card>

          {patterns.length === 0 ? <EmptyState title="Chưa có lịch" /> : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {patterns.map((p) => (
                <Card key={p.id} padding="sm" className="hover:border-primary-300 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-sm">
                      {SHORT_DAY_NAMES[p.day_of_week]}
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">{p.start_time?.slice(0,5)} – {p.end_time?.slice(0,5)}</p>
                      <p className="text-xs text-text-tertiary">Từ {p.start_date}</p>
                    </div>
                  </div>
                  <div className="bg-surface-secondary p-2 rounded-lg text-xs text-text-secondary">
                    {p.private_request_id ? `Yêu cầu 1-1 #${p.private_request_id}` : `Lớp #${p.class_id}`} • {p.total_sessions || 0} buổi
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Sessions */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex gap-4">
              <div>
                <p className="text-sm text-text-secondary">Đã lên lịch</p>
                <p className="text-xl font-bold text-primary-600">{stats.scheduled}</p>
              </div>
              <div>
                <p className="text-sm text-text-secondary">Đã học</p>
                <p className="text-xl font-bold text-success-600">{stats.completed}</p>
              </div>
              <div>
                <p className="text-sm text-text-secondary">Huỷ/Vắng</p>
                <p className="text-xl font-bold text-danger-600">{stats.cancelled}</p>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto scrollbar-hide shrink-0">
              {(['ALL', 'SCHEDULED', 'COMPLETED', 'CANCELLED'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setSessionFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    sessionFilter === f ? 'bg-primary-600 text-white' : 'bg-surface hover:bg-surface-hover text-text-secondary border border-border'
                  }`}
                >
                  {f === 'ALL' ? 'Tất cả' : f === 'SCHEDULED' ? 'Chưa học' : f === 'COMPLETED' ? 'Đã học' : 'Đã huỷ'}
                </button>
              ))}
            </div>
          </div>

          {filteredSessions.length === 0 ? <EmptyState title="Chưa có buổi học" /> : (
            <div className="space-y-3">
              {filteredSessions.map((s) => (
                <Card key={s.id} padding="sm" className="hover:border-primary-300 transition-colors flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="text-center w-12 shrink-0">
                      <p className="text-xs text-text-tertiary uppercase font-medium">{new Date(s.session_date).toLocaleDateString('vi-VN', { weekday: 'short' })}</p>
                      <p className="text-lg font-bold text-text-primary">{new Date(s.session_date).getDate()}</p>
                    </div>
                    <div className="w-px h-10 bg-border"></div>
                    <div>
                      <p className="font-semibold text-text-primary">
                        Buổi {s.session_number} <span className="text-text-tertiary font-normal px-2">|</span> {s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)}
                      </p>
                      <p className="text-sm text-text-secondary mt-0.5">
                        {s.private_request_id ? `Yêu cầu 1-1 #${s.private_request_id}` : `Lớp #${s.class_id}`} • GS #{s.tutor_id}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {getStatusBadge(s.status)}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
