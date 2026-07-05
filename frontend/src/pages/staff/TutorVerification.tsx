import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { staffApi, classApi, subjectApi } from '../../services/api';
import type { TutorPublicResponse, CourseClassResponse, SubjectResponse } from '../../types';
import { removeAccents } from '../../utils/format';
import Button from '../../components/ui/Button';
import { getStatusBadge } from '../../components/ui/Badge';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { BookOpenIcon, CalendarIcon, ShieldCheckIcon, UserCheckIcon } from '../../components/ui/Icons';
import { MetricTile, PortalPage, SectionPanel, EmptyPanel } from '../../components/portal/PortalPage';

// Shared Components
import SearchInput from '../../components/shared/SearchInput';
import FilterChips from '../../components/shared/FilterChips';
import TutorDetailModal from '../../components/staff/TutorDetailModal';
import Avatar from '../../components/ui/Avatar';

type TutorFilter = 'ALL' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'NEW' | 'UPDATE';

function teachingModeLabel(mode: string | null | undefined) {
  if (mode === 'ONLINE') return 'Trực tuyến';
  if (mode === 'OFFLINE') return 'Trực tiếp';
  if (mode === 'BOTH') return 'Linh hoạt';
  return 'Chưa rõ';
}

export default function StaffTutorVerification({ mode = 'list' }: { mode?: 'list' | 'verify' }) {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [allTutors, setAllTutors] = useState<TutorPublicResponse[]>([]);
  const [classes, setClasses] = useState<CourseClassResponse[]>([]);
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTutor, setSelectedTutor] = useState<TutorPublicResponse | null>(null);
  
  const initialFilter = searchParams.get('filter');
  const [filter, setFilter] = useState<TutorFilter>(() => {
    if (mode === 'verify') {
      return ['PENDING_REVIEW', 'NEW', 'UPDATE'].includes(initialFilter || '') ? (initialFilter as TutorFilter) : 'PENDING_REVIEW';
    } else {
      return ['ALL', 'VERIFIED', 'REJECTED'].includes(initialFilter || '') ? (initialFilter as TutorFilter) : 'VERIFIED';
    }
  });

  useEffect(() => {
    if (mode === 'verify') {
      setFilter(['PENDING_REVIEW', 'NEW', 'UPDATE'].includes(initialFilter || '') ? (initialFilter as TutorFilter) : 'PENDING_REVIEW');
    } else {
      setFilter(['ALL', 'VERIFIED', 'REJECTED'].includes(initialFilter || '') ? (initialFilter as TutorFilter) : 'VERIFIED');
    }
  }, [mode, initialFilter]);

  const [subjectFilter, setSubjectFilter] = useState<number | 'ALL'>('ALL');
  const [search, setSearch] = useState(searchParams.get('search') || '');

  const load = () => {
    setLoading(true);
    Promise.all([
      staffApi.getAllTutors(),
      classApi.list(),
      subjectApi.list()
    ])
      .then(([tutors, classesList, subjectList]) => {
        setAllTutors(tutors);
        setClasses(classesList);
        setSubjects(subjectList);
      })
      .catch(() => toast('error', 'Không thể tải dữ liệu'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const pendingCount = useMemo(() => allTutors.filter((t) => t.verification_status === 'PENDING_REVIEW').length, [allTutors]);
  const newPendingCount = useMemo(() => allTutors.filter((t) => t.verification_status === 'PENDING_REVIEW' && !t.subjects.some(s => s.status === 'APPROVED')).length, [allTutors]);
  const updatePendingCount = useMemo(() => allTutors.filter((t) => t.verification_status === 'PENDING_REVIEW' && t.subjects.some(s => s.status === 'APPROVED')).length, [allTutors]);
  const verifiedCount = useMemo(() => allTutors.filter((t) => t.verification_status === 'VERIFIED').length, [allTutors]);
  const rejectedCount = useMemo(() => allTutors.filter((t) => t.verification_status === 'REJECTED').length, [allTutors]);

  const filteredTutors = useMemo(() => {
    return allTutors
      .filter((t) => {
        if (mode === 'verify') {
          if (filter === 'NEW') {
            return t.verification_status === 'PENDING_REVIEW' && !t.subjects.some(s => s.status === 'APPROVED');
          }
          if (filter === 'UPDATE') {
            return t.verification_status === 'PENDING_REVIEW' && t.subjects.some(s => s.status === 'APPROVED');
          }
          return t.verification_status === 'PENDING_REVIEW';
        } else {
          if (filter === 'VERIFIED') {
            return t.verification_status === 'VERIFIED';
          }
          if (filter === 'REJECTED') {
            return t.verification_status === 'REJECTED';
          }
          return t.verification_status === 'VERIFIED' || t.verification_status === 'REJECTED';
        }
      })
      .filter((t) => subjectFilter === 'ALL' || t.subjects.some(s => s.subject_id === subjectFilter))
      .filter((t) => {
        if (!search) return true;
        const q = removeAccents(search);
        return (
          removeAccents(t.full_name).includes(q) ||
          t.subjects.some((s) => removeAccents(s.subject_name).includes(q)) ||
          removeAccents(t.teaching_area).includes(q)
        );
      });
  }, [allTutors, filter, subjectFilter, search, mode]);

  if (loading) return <TableSkeleton />;

  const portalTitle = mode === 'verify' ? 'Phê duyệt gia sư' : 'Quản lý gia sư';
  const portalDesc = mode === 'verify' 
    ? `${pendingCount} hồ sơ cần xem xét và phê duyệt.` 
    : `${verifiedCount} gia sư đã xác minh và đang hoạt động.`;

  return (
    <PortalPage title={portalTitle} description={portalDesc}>
      <div className="grid gap-4 md:grid-cols-3">
        {mode === 'verify' ? (
          <>
            <MetricTile 
              icon={ShieldCheckIcon} 
              label="Chờ phê duyệt" 
              value={pendingCount} 
              hint="Tất cả yêu cầu chờ xử lý." 
              tone={pendingCount > 0 ? 'warning' : 'success'} 
              active={filter === 'PENDING_REVIEW'} 
              onClick={() => setFilter('PENDING_REVIEW')} 
            />
            <MetricTile 
              icon={UserCheckIcon} 
              label="Hồ sơ mới" 
              value={newPendingCount} 
              hint="Gia sư mới đăng ký hệ thống." 
              tone="primary" 
              active={filter === 'NEW'} 
              onClick={() => setFilter('NEW')} 
            />
            <MetricTile 
              icon={BookOpenIcon} 
              label="Yêu cầu cập nhật" 
              value={updatePendingCount} 
              hint="Đăng ký thêm môn học/chứng chỉ." 
              tone="success" 
              active={filter === 'UPDATE'} 
              onClick={() => setFilter('UPDATE')} 
            />
          </>
        ) : (
          <>
            <MetricTile 
              icon={UserCheckIcon} 
              label="Đã xác minh" 
              value={verifiedCount} 
              hint="Sẵn sàng tham gia giảng dạy." 
              tone="success" 
              active={filter === 'VERIFIED'} 
              onClick={() => setFilter('VERIFIED')} 
            />
            <MetricTile 
              icon={CalendarIcon} 
              label="Bị từ chối" 
              value={rejectedCount} 
              hint="Hồ sơ không đạt yêu cầu." 
              tone={rejectedCount > 0 ? 'warning' : 'neutral'} 
              active={filter === 'REJECTED'} 
              onClick={() => setFilter('REJECTED')} 
            />
            <MetricTile 
              icon={ShieldCheckIcon} 
              label="Tổng số gia sư" 
              value={verifiedCount + rejectedCount} 
              hint="Đã qua kiểm duyệt (Verified + Rejected)." 
              tone="neutral" 
              active={filter === 'ALL'} 
              onClick={() => setFilter('ALL')} 
            />
          </>
        )}
      </div>

      <SectionPanel
        title={mode === 'verify' ? 'Danh sách hồ sơ chờ duyệt' : 'Danh sách gia sư'}
        description={mode === 'verify' ? 'Xem xét chi tiết từng hồ sơ gia sư và các môn đăng ký giảng dạy.' : 'Danh mục các gia sư đã qua kiểm duyệt trong hệ thống.'}
        action={
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="rounded-lg border border-border bg-white py-2 pl-3 pr-8 text-sm outline-none transition-all focus:border-primary-300 focus:ring-1 focus:ring-primary-200 h-[38px]"
            >
              <option value="ALL">Tất cả chuyên ngành</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <SearchInput
              placeholder="Tìm theo tên, môn, khu vực..."
              value={search}
              onChange={setSearch}
              className="w-full sm:w-64"
            />
          </div>
        }
      >
        {/* Status Filters */}
        <div className="mb-4 border-b border-border-light pb-3">
          <FilterChips
            value={filter}
            onChange={(val) => setFilter(val as TutorFilter)}
            options={
              mode === 'verify'
                ? [
                    { value: 'PENDING_REVIEW', label: 'Tất cả chờ duyệt', count: pendingCount },
                    { value: 'NEW', label: 'Hồ sơ mới', count: newPendingCount },
                    { value: 'UPDATE', label: 'Yêu cầu cập nhật', count: updatePendingCount },
                  ]
                : [
                    { value: 'VERIFIED', label: 'Đã xác minh', count: verifiedCount },
                    { value: 'REJECTED', label: 'Bị từ chối', count: rejectedCount },
                    { value: 'ALL', label: 'Tất cả gia sư', count: verifiedCount + rejectedCount },
                  ]
            }
          />
        </div>

        {filteredTutors.length === 0 ? (
          <EmptyPanel
            title={mode === 'verify' ? 'Không có hồ sơ chờ duyệt' : 'Không tìm thấy gia sư'}
            description={
              search || filter !== (mode === 'verify' ? 'PENDING_REVIEW' : 'VERIFIED')
                ? 'Vui lòng thử lại bằng từ khóa tìm kiếm hoặc bộ lọc khác.'
                : mode === 'verify'
                ? 'Hệ thống hiện tại không có hồ sơ gia sư nào đang chờ duyệt.'
                : 'Hệ thống chưa có gia sư nào đã duyệt.'
            }
          />
        ) : (
          <div className="divide-y divide-border-light">
            {filteredTutors.map((tutor) => {
              const isUpdate = tutor.subjects.some((s) => s.status === 'APPROVED');
              const isPending = tutor.verification_status === 'PENDING_REVIEW';
              return (
                <div
                  key={tutor.id}
                  className="flex w-full flex-col gap-3 rounded-lg px-2 py-3.5 transition-colors -mx-2 hover:bg-surface-secondary/40 sm:flex-row sm:items-center sm:justify-between cursor-pointer"
                  onClick={() => setSelectedTutor(tutor)}
                >
                  <div className="flex w-full min-w-0 items-center gap-3 sm:flex-1">
                    <Avatar name={tutor.full_name} src={tutor.avatar_url || undefined} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-text-primary truncate">{tutor.full_name}</p>
                        {isPending && (
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              isUpdate
                                ? 'border border-primary-100 bg-primary-50 text-primary-700'
                                : 'border border-success-100 bg-success-50 text-success-700'
                            }`}
                          >
                            {isUpdate ? '🔄 Cập nhật' : '✨ Mới'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-tertiary mt-1">
                        {tutor.years_experience} năm kinh nghiệm · {teachingModeLabel(tutor.teaching_mode)}
                        {tutor.subjects.length > 0 &&
                          ` · Môn dạy: ${tutor.subjects
                            .map((s) => s.subject_name || `#${s.subject_id}`)
                            .slice(0, 3)
                            .join(', ')}`}
                        {tutor.subjects.length > 3 && ` +${tutor.subjects.length - 3}`}
                      </p>
                      {(() => {
                        const tutorClasses = classes.filter(c => c.primary_tutor_id === tutor.id && ['READY', 'ONGOING'].includes(c.status));
                        if (tutorClasses.length > 0) {
                          return (
                            <p className="mt-1.5 text-xs font-medium text-primary-600">
                              Đang phụ trách {tutorClasses.length} lớp học
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:shrink-0 sm:justify-end" onClick={(e) => e.stopPropagation()}>
                    {getStatusBadge(tutor.verification_status)}
                    <Button size="sm" variant="ghost" onClick={() => setSelectedTutor(tutor)}>
                      Xem chi tiết
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionPanel>

      {selectedTutor && (
        <TutorDetailModal
          tutor={selectedTutor}
          onClose={() => setSelectedTutor(null)}
          onUpdated={() => {
            setSelectedTutor(null);
            load();
          }}
        />
      )}
    </PortalPage>
  );
}
