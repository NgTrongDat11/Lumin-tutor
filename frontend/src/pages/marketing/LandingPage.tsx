import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { TutorPublicResponse, CourseClassResponse, UserRole, RecommendedTutor } from '../../types';
import { publicBrowseApi } from '../../services/api';
import Button from '../../components/ui/Button';
import TutorPublicProfileModal from '../../components/shared/TutorPublicProfileModal';
import PublicClassDetailModal from '../../components/marketing/PublicClassDetailModal';
import { savePendingTutorRequest } from '../../utils/pendingTutorRequest';
import {
  ArrowRightIcon,
  SearchIcon,
  UserCheckIcon,
} from '../../components/ui/Icons';
import heroImage from '../../assets/lumin-hero-premium.png';
import TutorCard from '../../components/student/TutorCard';
import { ClassCard } from '../../components/student/ClassCard';

const roleDashboard: Record<UserRole, string> = {
  STUDENT: '/student',
  TUTOR: '/tutor',
  STAFF: '/staff',
  SUPER_ADMIN: '/admin',
};



export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const appTarget = user ? roleDashboard[user.role] : '/register';
  const tutorStartTarget = user ? appTarget : '/register?role=tutor';
  const [tutors, setTutors] = useState<TutorPublicResponse[]>([]);
  const [classes, setClasses] = useState<CourseClassResponse[]>([]);
  const [selectedTutorId, setSelectedTutorId] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<CourseClassResponse | null>(null);

  // Search & Filter State
  const [searchDraft, setSearchDraft] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [subjectFilter, setSubjectFilter] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'CLASS' | 'TUTOR'>('ALL');
  const [classPage, setClassPage] = useState(1);
  const [tutorPage, setTutorPage] = useState(1);

  const [popularSubjects, setPopularSubjects] = useState<{ id: number; name: string }[]>([]);

  // Load popular subjects once on mount from the unfiltered browse response
  useEffect(() => {
    publicBrowseApi.tutors({ limit: 100 }).then((data) => {
      const map = new Map<number, { id: number; name: string }>();
      data.forEach((t) => {
        t.subjects.forEach((s) => {
          if (s.subject_id && s.subject_name) {
            map.set(s.subject_id, { id: s.subject_id, name: s.subject_name });
          }
        });
      });
      setPopularSubjects(Array.from(map.values()).slice(0, 8));
    }).catch(() => {});
  }, []);

  // Trigger search and filter queries server-side
  useEffect(() => {
    const params = {
      q: submittedSearch.trim() || undefined,
      mode: modeFilter !== 'ALL' ? modeFilter : undefined,
      subject_id: subjectFilter || undefined,
      limit: 100,
    };
    publicBrowseApi.tutors(params).then(setTutors).catch(() => {});
    publicBrowseApi.classes(params).then(setClasses).catch(() => {});
  }, [submittedSearch, modeFilter, subjectFilter]);

  const uniqueSubjects = popularSubjects;

  const tutorById = useMemo(() => {
    const data = new Map<number, TutorPublicResponse>();
    tutors.forEach((t) => {
      data.set(t.id, t);
    });
    return data;
  }, [tutors]);

  const classResults = classes;
  const tutorResults = tutors;

  const selectedTutor = selectedTutorId
    ? tutors.find((tutor) => tutor.id === selectedTutorId) ?? null
    : null;
  const closeTutorProfile = () => setSelectedTutorId(null);

  const requestTutor = () => {
    if (!selectedTutorId) return;

    const tutorId = selectedTutorId;
    savePendingTutorRequest(tutorId);
    closeTutorProfile();

    if (user?.role === 'STUDENT') {
      navigate(`/student?tutorId=${tutorId}&request=1`);
      return;
    }

    navigate(user ? appTarget : '/register');
  };

  const openClassTutor = (tutorId: number) => {
    setSelectedClass(null);
    setSelectedTutorId(tutorId);
  };

  const continueWithClass = (course: CourseClassResponse) => {
    setSelectedClass(null);
    if (user?.role === 'STUDENT') {
      navigate(`/student?search=${encodeURIComponent(course.title)}`);
      return;
    }
    navigate(user ? appTarget : '/register');
  };


  return (
    <div className="min-h-screen bg-[#fbfaf6] text-text-primary">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/15 bg-text-primary/58 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-5 lg:px-8">
          <Link to="/" className="flex items-center gap-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/12 text-lg font-semibold text-white">
              L
            </span>
            <span className="text-xl font-semibold tracking-tight text-white">Lumin</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-white/76 md:flex">
            <a href="#discovery" className="hover:text-white">Khám phá</a>
            <a href="#become-tutor" className="hover:text-white">Trở thành gia sư</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            {!user && (
              <Link
                to="/login"
                className="flex h-10 items-center justify-center px-3 text-sm font-medium opacity-80 hover:opacity-100 transition-opacity"
                style={{ color: '#ffffff' }}
              >
                Đăng nhập
              </Link>
            )}
            <Link
              to={appTarget}
              className="flex h-10 items-center justify-center rounded-lg bg-white px-3.5 text-sm font-semibold text-[#17201f] shadow-sm transition-colors hover:bg-primary-50 sm:px-4"
            >
              {user ? 'Vào hệ thống' : 'Bắt đầu'}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative min-h-[92vh] overflow-hidden bg-text-primary">
          <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,43,41,0.93),rgba(6,43,41,0.76),rgba(6,43,41,0.18))]" />
          <div className="relative mx-auto flex min-h-[92vh] max-w-7xl items-center px-5 pb-16 pt-28 lg:px-8">
            <div className="w-full max-w-3xl min-w-0 text-white">
              <h1 className="max-w-[20rem] text-[2.35rem] font-semibold leading-[1.06] tracking-tight text-balance sm:max-w-[34rem] sm:text-5xl md:max-w-3xl md:text-7xl">
                Tìm gia sư phù hợp với nhu cầu học của bạn.
              </h1>
              <p className="mt-6 max-w-[20rem] text-base leading-8 text-white/76 sm:max-w-[34rem] sm:text-lg md:max-w-2xl">
                Xem hồ sơ gia sư đã xác minh, lớp nhóm đang mở và tạo nhu cầu học khi bạn sẵn sàng nhận gợi ý phù hợp.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#discovery">
                  <Button className="h-12 bg-warning-500 px-5 text-text-primary hover:bg-warning-600">
                    Khám phá <SearchIcon className="h-4 w-4" />
                  </Button>
                </a>
                <Link to={appTarget}>
                  <Button variant="outline" className="h-12 border-white/35 bg-white/8 px-5 text-white hover:bg-white/16 hover:text-white">
                    {user ? 'Vào hệ thống' : 'Tạo nhu cầu học'} <ArrowRightIcon className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Unified Discovery Zone ──────────────────────── */}
        <section id="discovery" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="mb-8">
            <h2 className="text-3xl font-semibold tracking-tight">Khám phá lớp học và gia sư</h2>
            <p className="mt-2 text-text-secondary">Tìm kiếm lớp học nhóm hoặc kết nối trực tiếp với gia sư 1-1 phù hợp.</p>
          </div>

          {/* Quick Search and Filter */}
          <div className="overflow-hidden rounded-2xl border border-primary-100/80 bg-white p-4 shadow-[0_18px_45px_-32px_rgba(23,32,31,0.45)] md:p-5 mb-8">
            <form onSubmit={(e) => { e.preventDefault(); setSubmittedSearch(searchDraft); }} className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="group flex flex-1 items-center gap-3 rounded-xl border border-border-light bg-[#fbfaf6] px-4 py-3.5 transition-all focus-within:border-primary-300 focus-within:bg-white focus-within:shadow-[0_0_0_6px_rgba(31,159,147,0.08)]">
                <SearchIcon className="h-5 w-5 shrink-0 text-text-tertiary transition-colors group-focus-within:text-primary-600 md:h-6 md:w-6" />
                <input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Tìm kiếm theo tên môn học, cấp lớp, địa điểm hoặc gia sư..."
                  className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-text-tertiary"
                />
                {(searchDraft || submittedSearch) && (
                  <button
                    type="button"
                    onClick={() => { setSearchDraft(''); setSubmittedSearch(''); }}
                    className="text-xs font-bold text-text-tertiary hover:text-text-primary px-2"
                  >
                    XÓA
                  </button>
                )}
              </div>
              <Button type="submit" size="lg" className="w-full md:min-w-[140px] md:w-auto font-bold shadow-sm">
                Tìm kiếm
              </Button>
            </form>

            <div className="mt-4 grid min-w-0 gap-3 border-t border-border-light/60 pt-4 lg:grid-cols-[minmax(170px,0.65fr)_minmax(0,1.35fr)_auto] lg:items-end">
              <div className="min-w-0 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Hình thức học</p>
                <div className="flex max-w-full overflow-x-auto rounded-xl border border-border bg-[#fbfaf6] p-1">
                  {(['ALL', 'ONLINE', 'OFFLINE'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setModeFilter(mode)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                        modeFilter === mode
                          ? 'bg-white text-text-primary shadow-xs'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {mode === 'ALL' ? 'Mọi hình thức' : mode === 'ONLINE' ? 'Trực tuyến' : 'Trực tiếp'}
                    </button>
                  ))}
                </div>
              </div>

              {uniqueSubjects.length > 0 && (
                <div className="min-w-0 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Môn học phổ biến</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                    {uniqueSubjects.map((subject) => (
                      <button
                        key={subject.id}
                        type="button"
                        onClick={() => setSubjectFilter((current) => current === subject.id ? null : subject.id)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                          subjectFilter === subject.id
                            ? 'border-primary-400 bg-primary-600 text-white shadow-xs'
                            : 'border-border bg-white text-text-secondary hover:border-primary-300 hover:text-text-primary'
                        }`}
                      >
                        {subject.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(modeFilter !== 'ALL' || subjectFilter !== null) && (
                <button
                  type="button"
                  onClick={() => {
                    setModeFilter('ALL');
                    setSubjectFilter(null);
                  }}
                  className="self-end rounded-lg px-3 py-2 text-xs font-bold text-danger-500 hover:bg-danger-50 hover:text-danger-700"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          </div>

          {/* Tabs header */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border-light bg-white/95 p-3 shadow-xs md:flex-row md:items-center md:justify-between md:p-4 mb-8">
            <div>
              <h3 className="text-lg font-extrabold tracking-tight text-text-primary md:text-xl">
                Danh sách tìm kiếm công khai
              </h3>
              <p className="mt-0.5 text-sm text-text-secondary">
                {submittedSearch ? `Đang hiển thị kết quả cho "${submittedSearch}".` : 'Duyệt toàn bộ lớp học nhóm và gia sư.'}
              </p>
            </div>

            <div className="custom-scrollbar flex w-full max-w-full overflow-x-auto rounded-xl border border-border bg-[#fbfaf6] p-1 md:w-auto">
              {([
                ['ALL', 'Tìm tất cả'],
                ['CLASS', 'Lớp nhóm'],
                ['TUTOR', 'Gia sư'],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab);
                    setClassPage(1);
                    setTutorPage(1);
                  }}
                  className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
                    activeTab === tab
                      ? 'bg-text-primary text-white shadow-md'
                      : 'text-text-secondary hover:bg-[#fbfaf6] hover:text-text-primary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Results Grid */}
          {activeTab === 'CLASS' && classResults.length === 0 && (
            <div className="text-center py-12 border-dashed border-2 rounded-xl border-border-light bg-white">
              <p className="text-text-secondary">Không tìm thấy lớp học nhóm nào phù hợp.</p>
            </div>
          )}
          {activeTab === 'TUTOR' && tutorResults.length === 0 && (
            <div className="text-center py-12 border-dashed border-2 rounded-xl border-border-light bg-white">
              <p className="text-text-secondary">Không tìm thấy gia sư nào phù hợp.</p>
            </div>
          )}
          {activeTab === 'ALL' && classResults.length === 0 && tutorResults.length === 0 && (
            <div className="text-center py-12 border-dashed border-2 rounded-xl border-border-light bg-white">
              <p className="text-text-secondary">Không tìm thấy kết quả nào phù hợp.</p>
            </div>
          )}

          <div className="space-y-10">
            {/* Class list */}
            {(activeTab === 'ALL' || activeTab === 'CLASS') && classResults.length > 0 && (
              <div>
                {activeTab === 'ALL' && <h4 className="text-xl font-bold text-text-primary mb-4">Lớp học nhóm ({classResults.length})</h4>}
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {classResults.slice(0, classPage * 6).map((course) => (
                    <ClassCard
                      key={course.id}
                      course={course}
                      subjectName={course.subject_name || undefined}
                      tutorProfile={course.primary_tutor_id ? tutorById.get(course.primary_tutor_id) : undefined}
                      onOpen={() => setSelectedClass(course)}
                      onOpenTutor={() => {
                        if (course.primary_tutor_id) {
                          setSelectedTutorId(course.primary_tutor_id);
                        }
                      }}
                    />
                  ))}
                </div>
                {classResults.length > classPage * 6 && (
                  <div className="mt-6 text-center">
                    <Button variant="outline" className="px-8" onClick={() => setClassPage(p => p + 1)}>
                      Xem thêm lớp học
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Separator */}
            {activeTab === 'ALL' && classResults.length > 0 && tutorResults.length > 0 && (
              <div className="relative flex items-center py-2">
                <div className="flex-1 border-t border-border-light" />
                <span className="bg-[#fbfaf6] px-4 text-xs font-bold uppercase tracking-widest text-text-tertiary">
                  Gia sư 1-1
                </span>
                <div className="flex-1 border-t border-border-light" />
              </div>
            )}

            {/* Tutor list */}
            {(activeTab === 'ALL' || activeTab === 'TUTOR') && tutorResults.length > 0 && (
              <div>
                {activeTab === 'ALL' && <h4 className="text-xl font-bold text-text-primary mb-4">Gia sư ({tutorResults.length})</h4>}
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {tutorResults.slice(0, tutorPage * 6).map((tutor) => (
                    <TutorCard
                      key={tutor.id}
                      rec={{ tutor, score: '0', reasons: [] } as RecommendedTutor}
                      isRecommendation={false}
                      onOpen={() => setSelectedTutorId(tutor.id)}
                    />
                  ))}
                </div>
                {tutorResults.length > tutorPage * 6 && (
                  <div className="mt-6 text-center">
                    <Button variant="outline" className="px-8" onClick={() => setTutorPage(p => p + 1)}>
                      Xem thêm gia sư
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section id="become-tutor" className="border-y border-border-light bg-[#f5f8f7]/60 py-20">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center lg:px-8">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                Bạn muốn trở thành gia sư?
              </h2>
              <p className="mt-4 text-lg leading-8 text-text-secondary">
                Tạo hồ sơ, bổ sung môn dạy và lịch rảnh để học viên có thể tìm thấy bạn sau khi hồ sơ được xác minh.
              </p>
              <Link to={tutorStartTarget} className="mt-8 inline-flex">
                <Button>
                  {user?.role === 'TUTOR' ? 'Vào không gian gia sư' : user ? 'Vào hệ thống' : 'Đăng ký làm gia sư'}
                  <ArrowRightIcon className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <aside className="rounded-2xl border border-border bg-white p-7 shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-800">
                <UserCheckIcon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-text-primary">Bắt đầu bằng hồ sơ của bạn</h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Thông tin chuyên môn, môn dạy và lịch rảnh giúp đội ngũ xét duyệt và kết nối đúng nhu cầu học.
              </p>
            </aside>
          </div>
        </section>
      </main>

      <footer className="mt-12 border-t border-border-light pt-8 pb-12 text-center bg-white">
        <div className="mb-2 flex items-center justify-center gap-1.5 text-sm font-medium text-text-secondary">
          <span className="font-bold text-primary-700">Lumin</span>
          <span className="text-text-tertiary">·</span>
          <span>Hệ thống Đề xuất Gia sư</span>
        </div>
        <p className="text-xs text-text-tertiary">
          &copy; {new Date().getFullYear()} Lumin Education. Đã đăng ký bản quyền.
        </p>
      </footer>

      <PublicClassDetailModal
        course={selectedClass}
        onClose={() => setSelectedClass(null)}
        onOpenTutor={openClassTutor}
        onContinue={continueWithClass}
        continueLabel={user?.role === 'STUDENT' ? 'Xem và đăng ký lớp' : user ? 'Vào hệ thống' : 'Đăng ký để tham gia'}
      />

      {selectedTutorId && (
        <TutorPublicProfileModal
          tutorId={selectedTutorId}
          initialTutor={selectedTutor}
          onClose={closeTutorProfile}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeTutorProfile}>Đóng</Button>
              {(!user || user.role === 'STUDENT') && (
                <Button onClick={requestTutor}>
                  {user ? 'Gửi yêu cầu học 1-1' : 'Đăng ký để gửi yêu cầu'}
                </Button>
              )}
            </div>
          }
        />
      )}
    </div>
  );
}
