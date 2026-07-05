import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  classApi,
  learningNeedApi,
  recommendationApi,
  subjectApi,
  tutorApi,
  messageApi,
  extractErrorMessage,
} from '../../services/api';
import type {
  CourseClassResponse,
  RecommendedTutor,
  RecommendedClass,
  RecommendationEventType,
  RecommendationResponse,
  SubjectResponse,
  TutorPublicResponse,
  LearningNeedResponse,
  SearchMode,
  ResultType,
} from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { StudentDashboardSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ArrowRightIcon, MessageCircleIcon, SearchIcon, UserCheckIcon } from '../../components/ui/Icons';
import { useAuth } from '../../hooks/useAuth';

// Extracted Student Components & Helpers
import { ClassCard, RecommendedClassCard } from '../../components/student/ClassCard';
import TutorCard from '../../components/student/TutorCard';
import DetailModal, { type DetailTarget } from '../../components/student/DetailModal';
import CreateNeedModal from '../../components/student/CreateNeedModal';
import SendRequestModal from '../../components/student/SendRequestModal';
import { RecommendationWorkspace, RecommendationResultsShell } from '../../components/student/RecommendationPanel';
import TutorPublicProfileModal from '../../components/shared/TutorPublicProfileModal';
import { MatchExplanationDetail } from '../../components/student/MatchExplanationModal';
import {
  clearPendingTutorRequest,
  readPendingTutorRequest,
} from '../../utils/pendingTutorRequest';

const PAGE_SIZE = 9;

type ModeFilter = 'ALL' | 'ONLINE' | 'OFFLINE';







export default function StudentDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { confirm: confirmAction, ConfirmDialogElement } = useConfirmDialog();
  const autoRecFired = useRef(false);
  const pendingTutorHandled = useRef(false);
  const requestSeq = useRef(0);

  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [browseTutors, setBrowseTutors] = useState<TutorPublicResponse[]>([]);
  const [learningNeeds, setLearningNeeds] = useState<LearningNeedResponse[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
  const [activeNeed, setActiveNeed] = useState<LearningNeedResponse | null>(null);
  const [editNeed, setEditNeed] = useState<LearningNeedResponse | null>(null);

  // URL synced state
  const initialQuery = searchParams.get('q') || '';
  const initialMode = (searchParams.get('searchMode') as SearchMode) || 'SMART';
  const initialType = (searchParams.get('resultType') as ResultType) || 'ALL';

  const [searchDraft, setSearchDraft] = useState(initialQuery);
  const [submittedSearch, setSubmittedSearch] = useState(initialQuery);
  const [searchMode, setSearchMode] = useState<SearchMode>(initialMode);
  const [resultType, setResultType] = useState<ResultType>(initialType);

  const [exactTutors, setExactTutors] = useState<TutorPublicResponse[]>([]);
  const [exactClasses, setExactClasses] = useState<CourseClassResponse[]>([]);
  const [exactLoading, setExactLoading] = useState(false);

  const [modeFilter, setModeFilter] = useState<ModeFilter>('ALL');
  const [subjectFilter, setSubjectFilter] = useState<number | null>(null);
  const [classPage, setClassPage] = useState(1);
  const [tutorPage, setTutorPage] = useState(1);
  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null);
  const [loading, setLoading] = useState(true);
  const [recLoading, setRecLoading] = useState(false);
  const [showNeedWorkspace, setShowNeedWorkspace] = useState(false);
  const [showSmartMatch, setShowSmartMatch] = useState(false);
  const [tutorForRequest, setTutorForRequest] = useState<RecommendedTutor | null>(null);
  const [profileTutorId, setProfileTutorId] = useState<number | null>(null);
  const [profileTutorRec, setProfileTutorRec] = useState<RecommendedTutor | null>(null);

  const logTutorRecommendationEvent = (
    eventType: RecommendationEventType,
    rec: RecommendedTutor,
    learningNeedId: number | null | undefined = activeNeed?.id,
  ) => {
    if (!learningNeedId) return;
    void recommendationApi.logEvent({
      event_type: eventType,
      learning_need_id: learningNeedId,
      target_type: 'TUTOR',
      target_id: rec.tutor.id,
      score_snapshot: rec.score,
      reason_snapshot: rec.reasons,
    }).catch(() => undefined);
  };

  const logClassRecommendationEvent = (
    eventType: RecommendationEventType,
    rec: RecommendedClass,
    learningNeedId: number | null | undefined = activeNeed?.id,
  ) => {
    if (!learningNeedId) return;
    void recommendationApi.logEvent({
      event_type: eventType,
      learning_need_id: learningNeedId,
      target_type: 'COURSE_CLASS',
      target_id: rec.course_class.id,
      score_snapshot: rec.score,
      reason_snapshot: rec.reasons,
    }).catch(() => undefined);
  };

  const trackRecommendationViews = (rec: RecommendationResponse, learningNeedId: number) => {
    rec.recommended_tutors.forEach((item) => logTutorRecommendationEvent('VIEW', item, learningNeedId));
    rec.recommended_classes.forEach((item) => logClassRecommendationEvent('VIEW', item, learningNeedId));
  };

  const updateSearchParams = (qVal: string, modeVal: SearchMode, typeVal: ResultType) => {
    const nextParams = new URLSearchParams(searchParams);
    if (qVal.trim()) {
      nextParams.set('q', qVal.trim());
    } else {
      nextParams.delete('q');
    }
    nextParams.set('searchMode', modeVal);
    nextParams.set('resultType', typeVal);
    nextParams.delete('search');
    setSearchParams(nextParams, { replace: true });
  };

  const fetchRecommendation = async (need: LearningNeedResponse) => {
    const seq = ++requestSeq.current;
    setActiveNeed(need);
    setRecommendation(null);
    setRecLoading(true);
    setShowNeedWorkspace(false);
    try {
      const rec = await recommendationApi.forNeed(need.id);
      if (seq !== requestSeq.current) return;
      setRecommendation(rec);
      trackRecommendationViews(rec, need.id);
    } catch {
      if (seq === requestSeq.current) {
        toast('error', 'Không thể tải kết quả gợi ý.');
      }
    } finally {
      if (seq === requestSeq.current) {
        setRecLoading(false);
      }
    }
  };

  const fetchDiscoveryRecommendation = async (query?: string) => {
    const seq = ++requestSeq.current;
    const cleanQuery = query?.trim();
    setActiveNeed(null);
    setRecommendation(null);
    setRecLoading(true);
    setShowNeedWorkspace(false);
    try {
      const rec = await recommendationApi.discovery(cleanQuery ? { query: cleanQuery } : undefined);
      if (seq !== requestSeq.current) return;
      setRecommendation(rec);
    } catch {
      if (seq === requestSeq.current) {
        toast('error', 'Không thể tải gợi ý khởi đầu.');
      }
    } finally {
      if (seq === requestSeq.current) {
        setRecLoading(false);
      }
    }
  };

  const fetchExactSearch = async (q: string, mode: ModeFilter, subjectId: number | null) => {
    const seq = ++requestSeq.current;
    setExactLoading(true);
    try {
      const [tutors, classList] = await Promise.all([
        tutorApi.browse({
          q,
          mode: mode === 'ALL' ? undefined : mode,
          subject_id: subjectId ?? undefined,
          limit: 100,
        }),
        classApi.list({
          q,
          mode: mode === 'ALL' ? undefined : mode,
          subject_id: subjectId ?? undefined,
          limit: 100,
        }),
      ]);
      if (seq !== requestSeq.current) return;
      setExactTutors(tutors);
      setExactClasses(classList.filter((course) => !course.private_request_id));
    } catch {
      toast('error', 'Không thể tải kết quả tìm kiếm chính xác.');
    } finally {
      if (seq === requestSeq.current) {
        setExactLoading(false);
      }
    }
  };

  const handleDeleteNeed = async (need: LearningNeedResponse) => {
    const ok = await confirmAction({
      title: 'Xóa cấu hình gợi ý',
      description: 'Bạn có chắc chắn muốn xóa cấu hình gợi ý này không? Thao tác này không thể hoàn tác.',
      confirmLabel: 'Xóa',
      cancelLabel: 'Hủy bỏ',
      variant: 'danger',
    });
    if (!ok) {
      return;
    }

    try {
      await learningNeedApi.delete(need.id);
      toast('success', 'Xóa cấu hình gợi ý thành công.');

      // Update local needs list
      const remainingNeeds = learningNeeds.filter((item) => item.id !== need.id);
      setLearningNeeds(remainingNeeds);

      // If the deleted need was the active one
      if (activeNeed?.id === need.id) {
        requestSeq.current += 1;
        setRecLoading(false);
        setRecommendation(null);
        setActiveNeed(remainingNeeds[0] ?? null);
      }
    } catch (err) {
      toast('error', 'Không thể xóa cấu hình: ' + extractErrorMessage(err));
    }
  };

  const loadData = async () => {
    try {
      const [n, s, t] = await Promise.all([
        learningNeedApi.list().catch(() => []),
        subjectApi.list().catch(() => []),
        tutorApi.browse().catch(() => []),
      ]);
      setSubjects(s);
      setBrowseTutors(t);
      setLearningNeeds(n);

      const firstActiveNeed = n.find((need) => need.status === 'ACTIVE') ?? n[0] ?? null;
      setActiveNeed((current) => current ? n.find((need) => need.id === current.id) ?? firstActiveNeed : firstActiveNeed);

      if (!autoRecFired.current) {
        autoRecFired.current = true;
        if (initialMode === 'EXACT') {
          // Let the useEffect handle exact search fetching
        } else {
          if (initialQuery.trim()) {
            await fetchDiscoveryRecommendation(initialQuery);
          } else if (firstActiveNeed) {
            await fetchRecommendation(firstActiveNeed);
          } else {
            await fetchDiscoveryRecommendation('');
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const queryFromUrl = searchParams.get('q') || '';
    const modeFromUrl = (searchParams.get('searchMode') as SearchMode) || 'SMART';
    const typeFromUrl = (searchParams.get('resultType') as ResultType) || 'ALL';

    setSearchDraft(queryFromUrl);
    setSubmittedSearch(queryFromUrl);
    setSearchMode(modeFromUrl);
    setResultType(typeFromUrl);
  }, [searchParams]);


  const recommendedTutors = useMemo(() => recommendation?.recommended_tutors ?? [], [recommendation]);
  const recommendedClasses = useMemo(() => recommendation?.recommended_classes ?? [], [recommendation]);
  const visibleSubjectFilters = useMemo(() => subjects.slice(0, 6), [subjects]);
  const subjectNameById = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject.name])),
    [subjects],
  );

  const basisLabel = useMemo(() => {
    if (searchMode === 'SMART' && activeNeed) {
      const subjectName = activeNeed.subject_id ? subjectNameById.get(activeNeed.subject_id) : '';
      const grade = activeNeed.grade_level || '';
      return [subjectName, grade].filter(Boolean).join(' · ') || 'Cấu hình học viên';
    }
    return 'Dựa trên hồ sơ và từ khóa tìm kiếm';
  }, [searchMode, activeNeed, subjectNameById]);
  const tutorProfileById = useMemo(() => {
    const data = new Map<number, TutorPublicResponse>();
    browseTutors.forEach((t) => data.set(t.id, t));
    exactTutors.forEach((t) => data.set(t.id, t));
    recommendedTutors.forEach((rec) => data.set(rec.tutor.id, rec.tutor));
    return data;
  }, [browseTutors, exactTutors, recommendedTutors]);

  const recommendedTutorById = useMemo(() => {
    const data = new Map<number, RecommendedTutor>();
    recommendedTutors.forEach((rec) => data.set(rec.tutor.id, rec));
    return data;
  }, [recommendedTutors]);

  useEffect(() => {
    if (loading || pendingTutorHandled.current) return;

    const queryTutorId = Number(searchParams.get('tutorId'));
    const storedTutorId = readPendingTutorRequest();
    const tutorId = Number.isInteger(queryTutorId) && queryTutorId > 0 ? queryTutorId : storedTutorId;

    if (!tutorId) {
      pendingTutorHandled.current = true;
      return;
    }

    pendingTutorHandled.current = true;
    clearPendingTutorRequest();

    const rec = recommendedTutorById.get(tutorId) ?? (
      tutorProfileById.has(tutorId)
        ? { tutor: tutorProfileById.get(tutorId)!, score: '0', reasons: [] }
        : null
    );
    if (rec) {
      setTutorForRequest(rec);
    } else {
      toast('error', 'Gia sư đã chọn hiện không còn trong danh sách công khai.');
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('tutorId');
    nextParams.delete('request');
    setSearchParams(nextParams, { replace: true });
  }, [loading, searchParams, setSearchParams, toast, recommendedTutorById, tutorProfileById]);

  const openTutorProfile = (tutorId: number | null | undefined) => {
    if (tutorId == null) {
      toast('error', 'Lớp này chưa phân công giảng viên.');
      return;
    }
    const rec = recommendedTutorById.get(tutorId);
    if (searchMode === 'SMART' && rec) {
      logTutorRecommendationEvent('CLICK', rec);
    }
    setDetailTarget(null);
    setProfileTutorRec(rec ?? null);
    setProfileTutorId(tutorId);
  };

  const closeTutorProfile = () => {
    setProfileTutorId(null);
    setProfileTutorRec(null);
  };

  const requestProfileTutor = () => {
    const tutorObj = profileTutorRec?.tutor ?? (profileTutorId ? tutorProfileById.get(profileTutorId) : null);
    if (!tutorObj) return;

    const recToUse: RecommendedTutor = profileTutorRec ?? {
      score: 0,
      score_breakdown: [],
      score_adjustments: [],
      pillars: [],
      reasons: [],
      semantic: {
        method: 'text_similarity',
        similarity: 0,
        normalized_score: 0,
        rank: 1,
        candidate_count: 1,
        normalization_applied: false
      },
      tutor: tutorObj
    };

    if (searchMode === 'SMART' && profileTutorRec) {
      logTutorRecommendationEvent('REQUEST_PRIVATE', profileTutorRec);
    }
    closeTutorProfile();
    window.setTimeout(() => {
      setTutorForRequest(recToUse);
    }, 150);
  };



  const tutorResults = recommendedTutors;
  const recommendationClassResults = recommendedClasses;

  const visibleClasses = useMemo(() => {
    if (resultType === 'TUTOR') return [];
    if (searchMode === 'EXACT') {
      return exactClasses;
    } else {
      return recommendationClassResults.map(r => r.course_class);
    }
  }, [searchMode, resultType, exactClasses, recommendationClassResults]);

  const visibleRecommendedClasses = useMemo(() => {
    if (resultType === 'TUTOR') return [];
    if (searchMode === 'SMART') {
      return recommendationClassResults;
    }
    return [];
  }, [searchMode, resultType, recommendationClassResults]);

  const visibleTutors = useMemo(() => {
    if (resultType === 'CLASS') return [];
    if (searchMode === 'EXACT') {
      return exactTutors.map(tutor => ({ tutor, score: '0', reasons: [] } as RecommendedTutor));
    } else {
      return tutorResults;
    }
  }, [searchMode, resultType, exactTutors, tutorResults]);

  const pagedClasses = visibleClasses.slice(0, classPage * PAGE_SIZE);
  const pagedRecommendedClasses = visibleRecommendedClasses.slice(0, classPage * PAGE_SIZE);
  const pagedTutors = visibleTutors.slice(0, tutorPage * PAGE_SIZE);
  const hasMoreClasses = visibleClasses.length > pagedClasses.length;
  const hasMoreRecommendedClasses = visibleRecommendedClasses.length > pagedRecommendedClasses.length;
  const hasMoreTutors = visibleTutors.length > pagedTutors.length;

  const hasResults = useMemo(() => {
    if (searchMode === 'EXACT') {
      return exactLoading || exactClasses.length > 0 || exactTutors.length > 0;
    } else {
      return recLoading || recommendedClasses.length > 0 || recommendedTutors.length > 0;
    }
  }, [searchMode, exactLoading, exactClasses, exactTutors, recLoading, recommendedClasses, recommendedTutors]);

  const isSearching = submittedSearch.trim().length > 0;
  const locationSuggestionArea = user?.address?.trim();

  const smartSource = useMemo<'QUERY' | 'NEED' | 'COLD_START'>(() => {
    if (submittedSearch.trim()) return 'QUERY';
    if (activeNeed) return 'NEED';
    return 'COLD_START';
  }, [submittedSearch, activeNeed]);



  const resultCount = useMemo(() => {
    if (searchMode === 'EXACT') {
      if (resultType === 'CLASS') return exactClasses.length;
      if (resultType === 'TUTOR') return exactTutors.length;
      return exactClasses.length + exactTutors.length;
    } else {
      if (resultType === 'CLASS') return visibleRecommendedClasses.length;
      if (resultType === 'TUTOR') return visibleTutors.length;
      return visibleRecommendedClasses.length + visibleTutors.length;
    }
  }, [searchMode, resultType, exactClasses, exactTutors, visibleRecommendedClasses, visibleTutors]);

  const resultSummary = useMemo(() => {
    if (searchMode === 'SMART' && recLoading) return 'Đang so khớp kết quả';
    if (searchMode === 'EXACT' && exactLoading) return 'Đang tìm kiếm';
    return `${resultCount} kết quả`;
  }, [searchMode, recLoading, exactLoading, resultCount]);

  const openSmartMatch = () => {
    setSearchMode('SMART');
    updateSearchParams(submittedSearch, 'SMART', resultType);

    // Hủy ảnh hưởng của request recommendation đang chạy, nếu có.
    requestSeq.current += 1;
    setRecLoading(false);

    // Luôn mở workspace quản lý.
    setShowNeedWorkspace(true);

    // Nếu chưa có cấu hình thì mở luôn modal tạo mới.
    if (learningNeeds.length === 0) {
      setEditNeed(null);
      setShowSmartMatch(true);
    }
  };

  const runRecommendationForNeed = async (need: LearningNeedResponse) => {
    // Kết quả này thuộc cấu hình, không thuộc từ khóa tìm kiếm.
    setSearchDraft('');
    setSubmittedSearch('');

    setSearchMode('SMART');
    updateSearchParams('', 'SMART', resultType);

    // Rời workspace và chuyển sang loading/result.
    setShowNeedWorkspace(false);

    await fetchRecommendation(need);
  };

  const openLuminAi = () => {
    window.dispatchEvent(new CustomEvent('open-lumin-ai'));
  };

  const triggerSearch = async (
    qVal: string,
    modeVal: SearchMode,
    typeVal: ResultType,
  ) => {
    updateSearchParams(qVal, modeVal, typeVal);
    if (modeVal === 'EXACT') {
      setSubmittedSearch(qVal);
    } else {
      if (qVal.trim()) {
        await fetchDiscoveryRecommendation(qVal);
      } else {
        const need = activeNeed
          ?? learningNeeds.find(item => item.status === 'ACTIVE')
          ?? learningNeeds[0]
          ?? null;
        if (need) {
          setActiveNeed(need);
          await fetchRecommendation(need);
        } else {
          await fetchDiscoveryRecommendation('');
        }
      }
    }
  };

  const submitSearch = (event?: React.FormEvent) => {
    event?.preventDefault();
    const nextQuery = searchDraft.trim();
    setSubmittedSearch(nextQuery);
    void triggerSearch(nextQuery, searchMode, resultType);
  };

  const clearSearch = () => {
    setSearchDraft('');
    setSubmittedSearch('');
    void triggerSearch('', searchMode, resultType);
  };

  useEffect(() => {
    if (searchMode === 'EXACT') {
      void fetchExactSearch(submittedSearch, modeFilter, subjectFilter);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedSearch, searchMode, modeFilter, subjectFilter]);

  useEffect(() => {
    setClassPage(1);
    setTutorPage(1);
  }, [submittedSearch, modeFilter, subjectFilter, searchMode, resultType]);


  if (loading) return <StudentDashboardSkeleton />;

  return (
    <div className="mx-auto w-full animate-slide-up space-y-4 md:space-y-5">
      {/* One primary search surface for student discovery */}
      <section className="overflow-hidden rounded-2xl border border-primary-100/80 bg-white p-4 shadow-[0_18px_45px_-32px_rgba(23,32,31,0.45)] md:p-5">
        <form onSubmit={submitSearch} className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="group flex flex-1 items-center gap-3 rounded-xl border border-border-light bg-surface-secondary px-4 py-3.5 transition-all focus-within:border-primary-300 focus-within:bg-white focus-within:shadow-[0_0_0_6px_rgba(31,159,147,0.08)]">
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
                onClick={clearSearch}
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

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-text-tertiary">
          {searchMode === 'SMART' ? (
            smartSource === 'QUERY' ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-3 py-1 text-white font-bold shadow-xs animate-scale-in">
                  <SearchIcon className="h-3.5 w-3.5" />
                  {resultSummary}
                </span>
                <span className="rounded-full bg-primary-50 px-3 py-1 text-primary-700 font-semibold">
                  Gợi ý từ khóa: "{submittedSearch}"
                </span>
              </>
            ) : smartSource === 'NEED' ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-3 py-1 text-white font-bold shadow-xs animate-scale-in">
                  {resultSummary}
                </span>
                <span className="rounded-full bg-primary-50 px-3 py-1 text-primary-700 font-semibold">
                  Cấu hình: Nhu cầu {activeNeed?.subject_id ? subjectNameById.get(activeNeed.subject_id) : ''} ({activeNeed?.grade_level})
                </span>
              </>
            ) : (
              <span>
                {locationSuggestionArea
                  ? `Đang dùng gợi ý khởi đầu từ hồ sơ và khu vực ${locationSuggestionArea}. Tạo Smart Match để cấu hình sâu hơn.`
                  : 'Đang dùng gợi ý khởi đầu từ hồ sơ. Tạo Smart Match để cấu hình sâu hơn.'}
              </span>
            )
          ) : (
            isSearching ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-3 py-1 text-white font-bold shadow-xs animate-scale-in">
                  <SearchIcon className="h-3.5 w-3.5" />
                  {resultSummary}
                </span>
                <span className="rounded-full bg-primary-50 px-3 py-1 text-primary-700 font-semibold">
                  Khớp chính xác từ khóa: "{submittedSearch}"
                </span>
              </>
            ) : (
              <span>Nhập môn học hoặc từ khóa, sau đó bấm nút Tìm kiếm chính xác.</span>
            )
          )}
          {searchDraft.trim() !== submittedSearch && searchDraft.trim() && (
            <span className="rounded-full bg-warning-50 px-3 py-1 text-warning-700 font-semibold animate-pulse">Từ khóa mới chưa áp dụng</span>
          )}
        </div>

        {searchMode === 'EXACT' && (
          <div className="mt-4 grid min-w-0 gap-3 border-t border-border-light/60 pt-4 lg:grid-cols-[minmax(170px,0.65fr)_minmax(0,1.35fr)_auto] lg:items-end">
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Hình thức học</p>
              <div className="flex max-w-full overflow-x-auto rounded-xl border border-border bg-surface-secondary p-1">
                {(['ALL', 'ONLINE', 'OFFLINE'] as ModeFilter[]).map((mode) => (
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

            <div className="min-w-0 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Môn học phổ biến</p>
              <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                {visibleSubjectFilters.map((subject) => (
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
        )}
      </section>

      {!isSearching && (
        <section className="overflow-hidden rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-warning-50/70 p-4 shadow-xs animate-slide-up md:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-xl font-extrabold tracking-tight text-text-primary md:text-2xl">
                Hôm nay bạn muốn bắt đầu theo cách nào?
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-text-secondary">
                Chọn một lối đi nhanh để duyệt lớp, chạy Smart Match hoặc hỏi Lumin AI trước khi quyết định.
              </p>
            </div>

            <div className="grid min-w-0 gap-2 sm:grid-cols-3 xl:min-w-[650px]">
              <button
                type="button"
                onClick={() => {
                  setSearchMode('EXACT');
                  setResultType('ALL');
                  void triggerSearch(submittedSearch, 'EXACT', 'ALL');
                }}
                className={`group flex min-h-20 items-center gap-3 rounded-xl border bg-white/90 p-3 text-left shadow-xs backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:bg-white hover:shadow-md ${
                  searchMode === 'EXACT' ? 'border-primary-300 ring-1 ring-primary-500/10' : 'border-border-light'
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-800 transition-transform group-hover:scale-105">
                  <SearchIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-text-primary">Tìm tất cả</span>
                  <span className="mt-0.5 block text-xs font-medium leading-4 text-text-secondary">Duyệt toàn bộ lớp và gia sư</span>
                </span>
                <ArrowRightIcon className="h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-primary-700" />
              </button>

              <button
                type="button"
                onClick={openSmartMatch}
                className={`group flex min-h-20 items-center gap-3 rounded-xl border bg-white/90 p-3 text-left shadow-xs backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:bg-white hover:shadow-md ${
                  searchMode === 'SMART' ? 'border-primary-300 ring-1 ring-primary-500/10' : 'border-border-light'
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-750 text-white transition-transform group-hover:scale-105">
                  <UserCheckIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-text-primary">Smart Match</span>
                  <span className="mt-0.5 block text-xs font-medium leading-4 text-text-secondary">Tạo cấu hình chính xác hơn</span>
                </span>
                <ArrowRightIcon className="h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-primary-700" />
              </button>

              <button
                type="button"
                onClick={openLuminAi}
                className="group flex min-h-20 items-center gap-3 rounded-xl border border-border-light bg-white/90 p-3 text-left shadow-xs backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:bg-white hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-100 text-warning-600 transition-transform group-hover:scale-105">
                  <MessageCircleIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-text-primary">Chat AI</span>
                  <span className="mt-0.5 block text-xs font-medium leading-4 text-text-secondary">Hỏi trợ lý Lumin</span>
                </span>
                <ArrowRightIcon className="h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-primary-700" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Tabs / Mode Controls */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border-light bg-white/95 p-3 shadow-xs md:flex-row md:items-center md:justify-between md:p-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold tracking-tight text-text-primary md:text-xl">
            {searchMode === 'SMART'
              ? smartSource === 'QUERY'
                ? '✨ Gợi ý theo từ khóa'
                : smartSource === 'NEED'
                  ? '✨ Gợi ý thông minh'
                  : '✨ Gợi ý khởi đầu'
              : '🔍 Tìm kiếm chính xác'}
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            {searchMode === 'SMART'
              ? smartSource === 'QUERY'
                ? `Hệ thống phân tích ngữ nghĩa của từ khóa "${submittedSearch}" để tìm kiếm gia sư và lớp học phù hợp.`
                : smartSource === 'NEED'
                  ? `Đang hiển thị kết quả so khớp thông minh theo cấu hình nhu cầu học môn ${activeNeed?.subject_id ? subjectNameById.get(activeNeed.subject_id) || '' : ''}.`
                  : 'Kết quả đi qua hệ thống gợi ý từ hồ sơ và khu vực của bạn. Tạo Smart Match để cấu hình sâu hơn.'
              : submittedSearch
                ? `Đang tìm chính xác các kết quả chứa từ khóa "${submittedSearch}".`
                : 'Nhập từ khóa tìm kiếm để tìm chính xác gia sư hoặc lớp học.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          {/* Segmented Control: Search Mode */}
          <div className="inline-flex rounded-xl bg-surface-secondary p-1 border border-border-light shadow-inner">
            {(['EXACT', 'SMART'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setSearchMode(mode);
                  void triggerSearch(submittedSearch, mode, resultType);
                }}
                className={`relative rounded-lg px-4 py-2 text-xs font-bold transition-all duration-300 ${
                  searchMode === mode
                    ? mode === 'SMART'
                      ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-md'
                      : 'bg-text-primary text-white shadow-md'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/50'
                }`}
              >
                {mode === 'EXACT' ? '🔍 Tìm chính xác' : '✨ Gợi ý thông minh'}
              </button>
            ))}
          </div>

          {/* Tab Selector: Result Type */}
          <div className="inline-flex rounded-xl bg-surface-secondary p-1 border border-border-light shadow-inner">
            {([
              ['ALL', 'Tất cả'],
              ['CLASS', 'Lớp học'],
              ['TUTOR', 'Gia sư'],
            ] as [ResultType, string][]).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setResultType(type);
                  updateSearchParams(submittedSearch, searchMode, type);
                }}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200 ${
                  resultType === type
                    ? 'bg-white text-text-primary shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Results */}
      {searchMode === 'SMART' && (showNeedWorkspace || (!recLoading && !recommendation)) ? (
        <RecommendationWorkspace
          needs={learningNeeds}
          activeNeed={activeNeed}
          subjects={subjects}
          onCreate={() => {
            setEditNeed(null);
            setShowSmartMatch(true);
          }}
          onRun={(need) => {
            void runRecommendationForNeed(need);
          }}
          onEdit={(need) => {
            setEditNeed(need);
            setShowSmartMatch(true);
          }}
          onDelete={(need) => {
            void handleDeleteNeed(need);
          }}
          onClose={recommendation ? () => setShowNeedWorkspace(false) : undefined}
          fallbackArea={user?.address ?? null}
        />
      ) : searchMode === 'SMART' && recLoading ? (
        <Card padding="lg" className="text-center bg-white py-16">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
          <p className="text-sm font-semibold text-text-secondary">Đang so khớp cấu hình với gia sư và lớp đang mở...</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-text-tertiary">Hệ thống đang lọc theo môn học, hình thức học, ngân sách, lịch rảnh, đánh giá và kinh nghiệm rồi sắp xếp theo điểm phù hợp.</p>
        </Card>
      ) : searchMode === 'EXACT' && exactLoading ? (
        <Card padding="lg" className="text-center bg-white py-16">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
          <p className="text-sm font-semibold text-text-secondary">Đang tải kết quả tìm kiếm chính xác...</p>
        </Card>
      ) : !hasResults ? (
        <Card padding="lg" className="border-dashed border-2 text-center bg-transparent py-16">
          <div className="mx-auto w-16 h-16 rounded-full bg-surface-secondary flex items-center justify-center mb-4">
            <SearchIcon className="h-8 w-8 text-text-tertiary" />
          </div>
          <h3 className="text-xl font-bold text-text-primary">Chưa tìm thấy kết quả</h3>
          <p className="mt-2 text-sm text-text-secondary max-w-sm mx-auto">
            {searchMode === 'SMART'
              ? 'Hãy thử nới lỏng cấu hình gợi ý của bạn để nhận thêm kết quả.'
              : 'Hãy thử tìm kiếm với từ khóa khác hoặc chuyển sang chế độ Gợi ý thông minh.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-10">
          {searchMode === 'SMART' && recommendation && (
            <RecommendationResultsShell
              activeNeed={activeNeed}
              subjects={subjects}
              recommendation={recommendation}
              fallbackArea={user?.address ?? null}
              onManageNeeds={openSmartMatch}
            >
              <div className="space-y-8">
                {resultType !== 'TUTOR' && (
                  <section>
                    <div className="mb-2">
                      <h3 className="text-xl font-bold text-text-primary">Lớp nhóm trực tiếp gợi ý</h3>
                      <p className="text-xs text-text-secondary mt-0.5">Lớp nhóm trực tiếp phù hợp với cấp lớp và khu vực</p>
                    </div>
                    {visibleRecommendedClasses.length > 0 ? (
                      <>
                        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 mt-4">
                          {pagedRecommendedClasses.map((rec) => (
                            <RecommendedClassCard
                              key={rec.course_class.id}
                              rec={rec}
                              subjectName={subjectNameById.get(rec.course_class.subject_id)}
                              tutorProfile={rec.course_class.primary_tutor_id ? tutorProfileById.get(rec.course_class.primary_tutor_id) : undefined}
                              onOpen={() => {
                                logClassRecommendationEvent('CLICK', rec);
                                setDetailTarget({ type: 'RECOMMENDED_CLASS', data: rec });
                              }}
                              onOpenTutor={() => openTutorProfile(rec.course_class.primary_tutor_id)}
                            />
                          ))}
                        </div>
                        {hasMoreRecommendedClasses && (
                          <div className="mt-6 text-center">
                            <Button variant="outline" className="px-8" onClick={() => setClassPage((page) => page + 1)}>
                              Xem thêm {visibleRecommendedClasses.length - pagedRecommendedClasses.length} lớp học
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-surface-secondary p-6 text-center mt-4">
                        <p className="text-sm font-medium text-text-secondary">
                          Chưa có lớp nhóm trực tiếp phù hợp gần khu vực của bạn.
                        </p>
                      </div>
                    )}
                  </section>
                )}

                {resultType === 'ALL' && visibleRecommendedClasses.length > 0 && visibleTutors.length > 0 && (
                  <div className="relative flex items-center py-2">
                    <div className="flex-1 border-t border-border-light" />
                    <span className="bg-surface-primary px-4 text-xs font-bold uppercase tracking-widest text-text-tertiary">
                      Gia sư gợi ý
                    </span>
                    <div className="flex-1 border-t border-border-light" />
                  </div>
                )}

                {resultType !== 'CLASS' && visibleTutors.length > 0 && (
                  <section>
                    <div className="mb-2">
                      <h3 className="text-xl font-bold text-text-primary">Gia sư phù hợp nhất</h3>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 stagger-grid">
                      {pagedTutors.map((rec) => (
                        <TutorCard key={rec.tutor.id} rec={rec} isRecommendation onOpen={() => openTutorProfile(rec.tutor.id)} />
                      ))}
                    </div>
                    {hasMoreTutors && (
                      <div className="mt-6 text-center">
                        <Button variant="outline" className="px-8" onClick={() => setTutorPage((page) => page + 1)}>
                          Xem thêm {visibleTutors.length - pagedTutors.length} gia sư
                        </Button>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </RecommendationResultsShell>
          )}

          {searchMode === 'EXACT' && (
            <div className="space-y-8">
              {resultType !== 'TUTOR' && (
                <section>
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-text-primary">Lớp học nhóm ({visibleClasses.length})</h3>
                  </div>
                  {visibleClasses.length > 0 ? (
                    <>
                      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 stagger-grid">
                        {pagedClasses.map((course) => (
                          <ClassCard
                            key={course.id}
                            course={course}
                            subjectName={subjectNameById.get(course.subject_id)}
                            tutorProfile={course.primary_tutor_id ? tutorProfileById.get(course.primary_tutor_id) : undefined}
                            onOpen={() => setDetailTarget({ type: 'CLASS', data: course })}
                            onOpenTutor={() => openTutorProfile(course.primary_tutor_id)}
                          />
                        ))}
                      </div>
                      {hasMoreClasses && (
                        <div className="mt-6 text-center">
                          <Button variant="outline" className="px-8" onClick={() => setClassPage((page) => page + 1)}>
                            Xem thêm {visibleClasses.length - pagedClasses.length} lớp học
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-surface-secondary p-6 text-center mt-2">
                      <p className="text-sm font-medium text-text-secondary">Chưa tìm thấy lớp học nhóm phù hợp.</p>
                    </div>
                  )}
                </section>
              )}

              {resultType === 'ALL' && visibleClasses.length > 0 && visibleTutors.length > 0 && (
                <div className="relative flex items-center py-2">
                  <div className="flex-1 border-t border-border-light" />
                  <span className="bg-surface-primary px-4 text-xs font-bold uppercase tracking-widest text-text-tertiary">
                    Gia sư
                  </span>
                  <div className="flex-1 border-t border-border-light" />
                </div>
              )}

              {resultType !== 'CLASS' && (
                <section>
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-text-primary">Gia sư ({visibleTutors.length})</h3>
                  </div>
                  {visibleTutors.length > 0 ? (
                    <>
                      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 stagger-grid">
                        {pagedTutors.map((rec) => (
                          <TutorCard key={rec.tutor.id} rec={rec} isRecommendation={false} onOpen={() => openTutorProfile(rec.tutor.id)} />
                        ))}
                      </div>
                      {hasMoreTutors && (
                        <div className="mt-6 text-center">
                          <Button variant="outline" className="px-8" onClick={() => setTutorPage((page) => page + 1)}>
                            Xem thêm {visibleTutors.length - pagedTutors.length} gia sư
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-surface-secondary p-6 text-center mt-2">
                      <p className="text-sm font-medium text-text-secondary">Chưa tìm thấy gia sư phù hợp.</p>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recommendation modal */}
      <CreateNeedModal
        open={showSmartMatch}
        onClose={() => {
          setShowSmartMatch(false);
          setEditNeed(null);
        }}
        subjects={subjects}
        editNeed={editNeed}
        onCreated={(need) => {
          setShowSmartMatch(false);
          setEditNeed(null);
          setLearningNeeds((current) => {
            const exists = current.some((item) => item.id === need.id);
            if (exists) {
              return current.map((item) => (item.id === need.id ? need : item));
            }
            return [need, ...current];
          });
          autoRecFired.current = true;
          void (async () => {
            await runRecommendationForNeed(need);
            await loadData();
          })();
        }}
      />

      {/* Send Request Modal */}
      {tutorForRequest && (
        <SendRequestModal
          open={!!tutorForRequest}
          onClose={() => setTutorForRequest(null)}
          tutor={tutorForRequest.tutor}
          activeNeed={activeNeed}
          onCreated={async (request) => {
            let threadId = request.thread_id;
            if (!threadId) {
              const thread = await messageApi.ensureThread({
                private_request_id: request.id,
                title: `Yêu cầu 1-1 với ${tutorForRequest.tutor.full_name}`,
              }).catch(() => undefined);
              threadId = thread?.id ?? null;
            }
            setTutorForRequest(null);
            if (threadId) {
              navigate(`/student/messages?threadId=${threadId}`);
            } else {
              toast('error', 'Đã gửi yêu cầu nhưng chưa mở được hội thoại. Vui lòng vào Tin nhắn để kiểm tra lại.');
            }
          }}
        />
      )}

      <TutorPublicProfileModal
        tutorId={profileTutorId}
        initialTutor={profileTutorRec?.tutor ?? (profileTutorId ? tutorProfileById.get(profileTutorId) : null) ?? null}
        onClose={closeTutorProfile}
        afterContent={
          profileTutorRec && profileTutorRec.pillars?.length && profileTutorRec.semantic ? (
            <div className="border-t border-border-light pt-6 mt-6 pb-2">
              <MatchExplanationDetail
                rec={profileTutorRec}
                context={recommendation?.context}
                basisLabel={basisLabel}
              />
            </div>
          ) : null
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeTutorProfile}>
              Đóng
            </Button>
            {(profileTutorRec?.tutor ?? (profileTutorId ? tutorProfileById.get(profileTutorId) : null)) && (
              <Button onClick={requestProfileTutor}>
                Gửi yêu cầu học 1-1
              </Button>
            )}
          </div>
        }
      />

      {/* Details Modal */}
      <DetailModal
        target={detailTarget}
        isRecommendation={searchMode === 'SMART'}
        subjectNameById={subjectNameById}
        tutorRecById={recommendedTutorById}
        context={recommendation?.context}
        basisLabel={basisLabel}
        onClose={() => setDetailTarget(null)}
        onOpenTutor={openTutorProfile}
        onRequestTutor={(tutor) => {
          logTutorRecommendationEvent('REQUEST_PRIVATE', tutor);
          setDetailTarget(null);
          window.setTimeout(() => {
            setTutorForRequest(tutor);
          }, 150);
        }}
        onRegisterClass={async (classId) => {
          try {
            const registration = await classApi.register(classId, { learning_need_id: activeNeed?.id });
            await messageApi.ensureThread({
              class_registration_id: registration.id,
              title: 'Trao đổi về đăng ký lớp nhóm',
            }).catch(() => undefined);
            toast('success', 'Đã gửi đăng ký lớp nhóm. Trung tâm sẽ xác nhận trước bước thanh toán.');
            if (detailTarget?.type === 'RECOMMENDED_CLASS') {
              logClassRecommendationEvent('REGISTER_CLASS', detailTarget.data);
            }
            setDetailTarget(null);
          } catch (err) {
            toast('error', 'Đăng ký thất bại: ' + extractErrorMessage(err));
          }
        }}
      />
      {ConfirmDialogElement}
    </div>
  );
}
