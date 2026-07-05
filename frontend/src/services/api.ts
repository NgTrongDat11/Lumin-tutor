import axios from 'axios';
import type {
  ApiResponse,
  TokenResponse,
  LoginRequest,
  RegisterStudentRequest,
  RegisterTutorRequest,
  ChatMessage,
  ChatSendResponse,
  MessageResponse,
  MessageThreadEnsureRequest,
  MessageThreadResponse,
  MeResponse,
  TutorProfileUpdate,
  TutorProfileResponse,
  QualificationCreate,
  QualificationResponse,
  TutorSubjectCreate,
  TutorSubjectResponse,
  AvailabilityCreate,
  TutorAvailabilityResponse,
  TutorPublicResponse,
  SubjectResponse,
  SubjectCreate,
  SubjectDeleteResponse,
  LearningNeedCreate,
  LearningNeedResponse,
  RecommendationResponse,
  RecommendationEventCreate,
  PrivateRequestCreate,
  PrivateRequestResponse,
  PrivateRequestConfirm,
  CourseClassCreate,
  CourseClassResponse,
  TutorApplicationCreate,
  TutorApplicationResponse,
  ClassRegistrationCreate,
  ClassRegistrationResponse,
  PaymentResponse,
  PaymentStatusResponse,
  FinanceQueryParams,
  FinanceSummaryResponse,
  FinanceReportRow,
  TutorIncomeSummaryResponse,
  TutorIncomeTransaction,
  SchedulePatternCreate,
  SchedulePatternResponse,
  LearningSessionResponse,
  ScheduleBlockResponse,
  ContractCreate,
  ContractResponse,
  ContractCommissionUpdate,
  ReviewCreate,
  ReviewResponse,
  ReviewAction,
  TutorReviewAction,
  ClassStatusUpdate,
  TutorDetailResponse,
  PrivateRequestReject,
  PrivateRequestLocationUpdate,
  AdminStaffCreate,
  AdminStaffCreateResponse,
  AdminStaffResponse,
  AdminStatsResponse,
  AuditLogResponse,
  NotificationResponse,
  UserResponse,
  UpdateProfileRequest,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// ── Interceptor: attach JWT token ──────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Interceptor: handle 401 ────────────────────────
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ── Helper to unwrap ApiResponse ───────────────────
function unwrap<T>(res: { data: ApiResponse<T> }): T {
  return res.data.data;
}

/* ═══════════════════════════════════════════════════
   PUBLIC (no auth required)
   ═══════════════════════════════════════════════════ */
const publicApi = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

function publicUnwrap<T>(res: { data: ApiResponse<T> }): T {
  return res.data.data;
}

export interface PublicBrowseParams {
  q?: string;
  mode?: string;
  subject_id?: number;
  limit?: number;
  offset?: number;
}

export const publicBrowseApi = {
  tutors: (params?: PublicBrowseParams) =>
    publicApi.get<ApiResponse<TutorPublicResponse[]>>('/tutor/public/browse', { params }).then(publicUnwrap),

  tutor: (id: number) =>
    publicApi.get<ApiResponse<TutorPublicResponse>>(`/tutor/public/${id}`).then(publicUnwrap),

  classes: (params?: PublicBrowseParams) =>
    publicApi.get<ApiResponse<CourseClassResponse[]>>('/tutor/public/classes', { params }).then(publicUnwrap),
};

/* ═══════════════════════════════════════════════════
   AUTH
   ═══════════════════════════════════════════════════ */
export const authApi = {
  login: (data: LoginRequest) =>
    api.post<TokenResponse>('/auth/login', data).then((res) => res.data),

  registerStudent: (data: RegisterStudentRequest) =>
    api.post<TokenResponse>('/auth/register/student', data).then((res) => res.data),

  registerTutor: (data: RegisterTutorRequest) =>
    api.post<TokenResponse>('/auth/register/tutor', data).then((res) => res.data),

  me: () =>
    api.get<MeResponse>('/auth/me').then((res) => res.data),

  updatePassword: (data: { old_password: string; new_password: string }) =>
    api.post<void>('/auth/me/password', data).then((res) => res.data),

  updateProfile: (data: UpdateProfileRequest) =>
    api.put<UserResponse>('/auth/me', data).then((res) => res.data),
};

/* ═══════════════════════════════════════════════════
   CHAT
   ═══════════════════════════════════════════════════ */
export const chatApi = {
  send: (messages: ChatMessage[], message: string) => {
    const history = messages.slice(-50).map(({ role, content }) => ({ role, content }));
    return api
      .post<ApiResponse<ChatSendResponse>>('/chat/send', { messages: history, message })
      .then(unwrap);
  },
};

export const messageApi = {
  listThreads: (limit = 20, offset = 0) =>
    api.get<ApiResponse<MessageThreadResponse[]>>(`/messages/threads?limit=${limit}&offset=${offset}`).then(unwrap),

  ensureThread: (data: MessageThreadEnsureRequest) =>
    api.post<ApiResponse<MessageThreadResponse>>('/messages/threads', data).then(unwrap),

  getThread: (id: number) =>
    api.get<ApiResponse<MessageThreadResponse>>(`/messages/threads/${id}`).then(unwrap),

  listMessages: (threadId: number, limit = 30, beforeId?: number) => {
    const params = new URLSearchParams();
    params.append('limit', String(limit));
    if (beforeId) params.append('before_id', String(beforeId));
    return api.get<ApiResponse<MessageResponse[]>>(`/messages/threads/${threadId}/messages?${params.toString()}`).then(unwrap);
  },

  sendMessage: (threadId: number, content: string) =>
    api.post<ApiResponse<MessageResponse>>(`/messages/threads/${threadId}/messages`, { content }).then(unwrap),
};

/* ═══════════════════════════════════════════════════
   TUTOR PROFILE
   ═══════════════════════════════════════════════════ */
export const tutorApi = {
  browse: (params?: { q?: string; mode?: string; subject_id?: number; limit?: number; offset?: number }) =>
    api.get<ApiResponse<TutorPublicResponse[]>>('/tutor/browse', { params }).then(unwrap),

  getPublicProfile: (id: number) =>
    api.get<ApiResponse<TutorPublicResponse>>(`/tutor/public/${id}`).then(unwrap),

  getProfile: () =>
    api.get<ApiResponse<TutorProfileResponse>>('/tutor/profile').then(unwrap),

  updateProfile: (data: TutorProfileUpdate) =>
    api.put<ApiResponse<TutorProfileResponse>>('/tutor/profile', data).then(unwrap),

  submitReview: () =>
    api.post<ApiResponse<TutorProfileResponse>>('/tutor/profile/submit-review').then(unwrap),

  // Qualifications
  getQualifications: () =>
    api.get<ApiResponse<QualificationResponse[]>>('/tutor/qualifications').then(unwrap),

  addQualification: (data: QualificationCreate) =>
    api.post<ApiResponse<QualificationResponse>>('/tutor/qualifications', data).then(unwrap),

  deleteQualification: (id: number) =>
    api.delete<ApiResponse<null>>(`/tutor/qualifications/${id}`).then(unwrap),

  // Subjects
  getSubjects: () =>
    api.get<ApiResponse<TutorSubjectResponse[]>>('/tutor/subjects').then(unwrap),

  addSubject: (data: TutorSubjectCreate) =>
    api.post<ApiResponse<TutorSubjectResponse>>('/tutor/subjects', data).then(unwrap),

  deleteSubject: (id: number) =>
    api.delete<ApiResponse<null>>(`/tutor/subjects/${id}`).then(unwrap),

  // Availabilities
  getAvailabilities: () =>
    api.get<ApiResponse<TutorAvailabilityResponse[]>>('/tutor/availabilities').then(unwrap),

  addAvailability: (data: AvailabilityCreate) =>
    api.post<ApiResponse<TutorAvailabilityResponse>>('/tutor/availabilities', data).then(unwrap),

  updateAvailability: (id: number, data: AvailabilityCreate) =>
    api.put<ApiResponse<TutorAvailabilityResponse>>(`/tutor/availabilities/${id}`, data).then(unwrap),

  deleteAvailability: (id: number) =>
    api.delete<ApiResponse<null>>(`/tutor/availabilities/${id}`).then(unwrap),
};

/* ═══════════════════════════════════════════════════
   STORAGE
   ═══════════════════════════════════════════════════ */
export const storageApi = {
  upload: (file: File, folder: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    return api.post<ApiResponse<{ file_url: string }>>('/storage/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(unwrap);
  },
};

/* ═══════════════════════════════════════════════════
   STAFF
   ═══════════════════════════════════════════════════ */
export const staffApi = {
  getPendingTutors: () =>
    api.get<ApiResponse<TutorPublicResponse[]>>('/staff/tutors/pending').then(unwrap),

  getAllTutors: () =>
    api.get<ApiResponse<TutorPublicResponse[]>>('/staff/tutors/all').then(unwrap),

  getPendingPrivateRequests: () =>
    api.get<ApiResponse<PrivateRequestResponse[]>>('/staff/private-requests/pending').then(unwrap),

  getStudents: () =>
    api.get<ApiResponse<{ id: number; full_name: string; email: string; phone: string | null; avatar_url: string | null; status: string; created_at: string | null }[]>>('/staff/students').then(unwrap),

  getTutorDetail: (id: number) =>
    api.get<ApiResponse<TutorDetailResponse>>(`/staff/tutors/${id}`).then(unwrap),

  reviewQualification: (id: number, data: ReviewAction) =>
    api.post<ApiResponse<QualificationResponse>>(`/staff/qualifications/${id}/review`, data).then(unwrap),

  reviewSubject: (id: number, data: ReviewAction) =>
    api.post<ApiResponse<TutorSubjectResponse>>(`/staff/subjects/${id}/review`, data).then(unwrap),

  reviewTutor: (id: number, data: TutorReviewAction) =>
    api.post<ApiResponse<TutorProfileResponse>>(`/staff/tutors/${id}/review`, data).then(unwrap),

  updateAccountStatus: (accountId: number, status: 'ACTIVE' | 'SUSPENDED') =>
    api.patch<ApiResponse<null>>(`/staff/accounts/${accountId}/status`, { status }).then(unwrap),

  resetPassword: (accountId: number) =>
    api.post<ApiResponse<{ temp_password: string }>>(`/staff/accounts/${accountId}/reset-password`).then(unwrap),
};

/* ═══════════════════════════════════════════════════
   ADMIN
   ═══════════════════════════════════════════════════ */
export const adminApi = {
  listStaff: () =>
    api.get<ApiResponse<AdminStaffResponse[]>>('/admin/staff').then(unwrap),

  createStaff: (data: AdminStaffCreate) =>
    api.post<ApiResponse<AdminStaffCreateResponse>>('/admin/staff', data).then(unwrap),

  updateStaffStatus: (id: number, status: 'ACTIVE' | 'SUSPENDED') =>
    api.patch<ApiResponse<AdminStaffResponse>>(`/admin/staff/${id}/status`, { status }).then(unwrap),

  resetStaffPassword: (id: number) =>
    api.post<ApiResponse<{ temp_password: string }>>(`/admin/staff/${id}/reset-password`).then(unwrap),

  getStats: () =>
    api.get<ApiResponse<AdminStatsResponse>>('/admin/stats').then(unwrap),

  getAuditLog: (params?: { limit?: number }) =>
    api.get<ApiResponse<AuditLogResponse[]>>('/admin/audit-log', { params }).then(unwrap),

  getConfig: () =>
    api.get<ApiResponse<unknown>>('/admin/config').then(unwrap),

  updateConfig: (data: { commission_rate_center: number; commission_rate_tutor: number }) =>
    api.put<ApiResponse<unknown>>('/admin/config', data).then(unwrap),
};

/* ═══════════════════════════════════════════════════
   SUBJECTS
   ═══════════════════════════════════════════════════ */
export const subjectApi = {
  list: (params?: { include_inactive?: boolean }) =>
    api.get<ApiResponse<SubjectResponse[]>>('/subjects', { params }).then(unwrap),

  create: (data: SubjectCreate) =>
    api.post<ApiResponse<SubjectResponse>>('/subjects', data).then(unwrap),

  update: (id: number, data: SubjectCreate) =>
    api.put<ApiResponse<SubjectResponse>>(`/subjects/${id}`, data).then(unwrap),

  delete: (id: number) =>
    api.delete<ApiResponse<SubjectDeleteResponse>>(`/subjects/${id}`).then(unwrap),
};

/* ═══════════════════════════════════════════════════
   LEARNING NEEDS
   ═══════════════════════════════════════════════════ */
export const learningNeedApi = {
  create: (data: LearningNeedCreate) =>
    api.post<ApiResponse<LearningNeedResponse>>('/learning-needs', data).then(unwrap),

  list: () =>
    api.get<ApiResponse<LearningNeedResponse[]>>('/learning-needs').then(unwrap),

  get: (id: number) =>
    api.get<ApiResponse<LearningNeedResponse>>(`/learning-needs/${id}`).then(unwrap),

  update: (id: number, data: LearningNeedCreate) =>
    api.put<ApiResponse<LearningNeedResponse>>(`/learning-needs/${id}`, data).then(unwrap),

  delete: (id: number) =>
    api.delete<ApiResponse<void>>(`/learning-needs/${id}`).then(unwrap),
};

/* ═══════════════════════════════════════════════════
   RECOMMENDATIONS
   ═══════════════════════════════════════════════════ */
export const recommendationApi = {
  forNeed: (needId: number) =>
    api.get<ApiResponse<RecommendationResponse>>(`/recommendations/for-need/${needId}`).then(unwrap),

  discovery: (params?: { query?: string }) =>
    api.get<ApiResponse<RecommendationResponse>>('/recommendations/discovery', { params }).then(unwrap),

  logEvent: (data: RecommendationEventCreate) =>
    api.post<ApiResponse<null>>('/recommendations/events', data).then(unwrap),
};

/* ═══════════════════════════════════════════════════
   PRIVATE TUTORING REQUESTS
   ═══════════════════════════════════════════════════ */
export const privateRequestApi = {
  create: (data: PrivateRequestCreate) =>
    api.post<ApiResponse<PrivateRequestResponse>>('/private-requests', data).then(unwrap),

  list: () =>
    api.get<ApiResponse<PrivateRequestResponse[]>>('/private-requests').then(unwrap),

  get: (id: number) =>
    api.get<ApiResponse<PrivateRequestResponse>>(`/private-requests/${id}`).then(unwrap),

  confirm: (id: number, data: PrivateRequestConfirm) =>
    api.post<ApiResponse<PrivateRequestResponse>>(`/private-requests/${id}/confirm`, data).then(unwrap),

  acceptSchedule: (id: number) =>
    api.post<ApiResponse<PrivateRequestResponse>>(`/private-requests/${id}/accept-schedule`).then(unwrap),

  updateLocation: (id: number, location: string) =>
    api.patch<ApiResponse<PrivateRequestResponse>>(`/private-requests/${id}/location`, { location } satisfies PrivateRequestLocationUpdate).then(unwrap),

  reject: (id: number, data: PrivateRequestReject = {}) =>
    api.post<ApiResponse<PrivateRequestResponse>>(`/private-requests/${id}/reject`, data).then(unwrap),

  studentProfile: (id: number) =>
    api.get<ApiResponse<unknown>>(`/private-requests/${id}/student-profile`).then(unwrap),
};

/* ═══════════════════════════════════════════════════
   COURSE CLASSES
   ═══════════════════════════════════════════════════ */
export const classApi = {
  create: (data: CourseClassCreate) =>
    api.post<ApiResponse<CourseClassResponse>>('/classes', data).then(unwrap),

  list: (params?: {
    for_tutor?: boolean;
    status_filter?: string;
    q?: string;
    mode?: string;
    subject_id?: number;
    limit?: number;
    offset?: number;
  }) =>
    api.get<ApiResponse<CourseClassResponse[]>>('/classes', { params }).then(unwrap),

  get: (id: number) =>
    api.get<ApiResponse<CourseClassResponse>>(`/classes/${id}`).then(unwrap),

  updateStatus: (id: number, data: ClassStatusUpdate) =>
    api.put<ApiResponse<CourseClassResponse>>(`/classes/${id}/status`, null, { params: { new_status: data.status } }).then(unwrap),

  update: (id: number, data: Partial<CourseClassCreate> & { primary_tutor_id?: number | null }) =>
    api.put<ApiResponse<CourseClassResponse>>(`/classes/${id}`, data).then(unwrap),

  delete: (id: number) =>
    api.delete<ApiResponse<void>>(`/classes/${id}`).then(unwrap),

  // Tutor Applications
  apply: (classId: number, data: TutorApplicationCreate) =>
    api.post<ApiResponse<TutorApplicationResponse>>(`/classes/${classId}/apply`, data).then(unwrap),

  getApplications: (classId: number) =>
    api.get<ApiResponse<TutorApplicationResponse[]>>(`/classes/${classId}/applications`).then(unwrap),

  myApplications: () =>
    api.get<ApiResponse<TutorApplicationResponse[]>>('/classes/my-applications').then(unwrap),

  acceptApplication: (classId: number, appId: number) =>
    api.post<ApiResponse<TutorApplicationResponse>>(`/classes/${classId}/applications/${appId}/accept`).then(unwrap),

  // Student Registration
  register: (classId: number, data: ClassRegistrationCreate) =>
    api.post<ApiResponse<ClassRegistrationResponse>>(`/classes/${classId}/register`, data).then(unwrap),

  myRegistrations: () =>
    api.get<ApiResponse<ClassRegistrationResponse[]>>('/classes/my-registrations').then(unwrap),

  getRegistrations: (classId: number) =>
    api.get<ApiResponse<ClassRegistrationResponse[]>>(`/classes/${classId}/registrations`).then(unwrap),

  reviewRegistration: (classId: number, regId: number, data: ReviewAction) =>
    api.post<ApiResponse<ClassRegistrationResponse>>(`/classes/${classId}/registrations/${regId}/review`, data).then(unwrap),
};

/* ═══════════════════════════════════════════════════
   PAYMENTS
   ═══════════════════════════════════════════════════ */
export const paymentApi = {
  pay: (id: number) =>
    api.post<ApiResponse<PaymentResponse>>(`/payments/${id}/pay`).then(unwrap),

  checkStatus: (id: number) =>
    api.get<ApiResponse<PaymentStatusResponse>>(`/payments/${id}/status`).then(unwrap),

  regenerateQr: (id: number) =>
    api.post<ApiResponse<PaymentResponse>>(`/payments/${id}/regenerate-qr`).then(unwrap),

  cancel: (id: number) =>
    api.post<ApiResponse<PaymentResponse>>(`/payments/${id}/cancel`).then(unwrap),

  approveManual: (id: number) =>
    api.post<ApiResponse<PaymentResponse>>(`/payments/${id}/approve-manual`).then(unwrap),

  cancelManual: (id: number) =>
    api.post<ApiResponse<PaymentResponse>>(`/payments/${id}/cancel-manual`).then(unwrap),

  refund: (id: number, data: { refund_amount: number; refund_reason?: string }) =>
    api.post<ApiResponse<PaymentResponse>>(`/payments/${id}/refund`, data).then(unwrap),

  list: () =>
    api.get<ApiResponse<PaymentResponse[]>>('/payments').then(unwrap),
};

/* ═══════════════════════════════════════════════════
   FINANCE REPORTING
   ═══════════════════════════════════════════════════ */
export const financeApi = {
  summary: (params?: FinanceQueryParams) =>
    api.get<ApiResponse<FinanceSummaryResponse>>('/finance/summary', { params }).then(unwrap),

  report: (params?: FinanceQueryParams) =>
    api.get<ApiResponse<FinanceReportRow[]>>('/finance/report', { params }).then(unwrap),

  exportExcel: (params?: FinanceQueryParams) =>
    api.get<Blob>('/finance/export.xlsx', { params, responseType: 'blob' }).then((res) => res.data),
};

export const tutorIncomeApi = {
  summary: () =>
    api.get<ApiResponse<TutorIncomeSummaryResponse>>('/tutor/income/summary').then(unwrap),

  transactions: (params?: Pick<FinanceQueryParams, 'date_from' | 'date_to' | 'month' | 'year' | 'target_type'>) =>
    api.get<ApiResponse<TutorIncomeTransaction[]>>('/tutor/income/transactions', { params }).then(unwrap),
};

/* ═══════════════════════════════════════════════════
   SCHEDULES & SESSIONS & CONTRACTS
   ═══════════════════════════════════════════════════ */
export const scheduleApi = {
  createPattern: (data: SchedulePatternCreate) =>
    api.post<ApiResponse<SchedulePatternResponse>>('/schedules', data).then(unwrap),

  listPatterns: (params?: Record<string, string | number>) =>
    api.get<ApiResponse<SchedulePatternResponse[]>>('/schedules', { params }).then(unwrap),

  listSessions: (params?: Record<string, string | number>) =>
    api.get<ApiResponse<LearningSessionResponse[]>>('/sessions', { params }).then(unwrap),

  updateAttendance: (id: number, data: { status: string; note?: string }) =>
    api.put<ApiResponse<LearningSessionResponse>>(
      `/sessions/${id}/attendance`,
      { status: data.status, attendance_note: data.note },
    ).then(unwrap),

  listBlocks: (params?: Record<string, string | number>) =>
    api.get<ApiResponse<ScheduleBlockResponse[]>>('/schedule-blocks', { params }).then(unwrap),

  createContract: (data: ContractCreate) =>
    api.post<ApiResponse<ContractResponse>>('/contracts', data).then(unwrap),

  listContracts: (params?: Record<string, string | number>) =>
    api.get<ApiResponse<ContractResponse[]>>('/contracts', { params }).then(unwrap),

  updateContractStatus: (id: number, data: { status: string }) =>
    api.put<ApiResponse<ContractResponse>>(`/contracts/${id}/status`, null, { params: { new_status: data.status } }).then(unwrap),

  updateContractCommission: (id: number, data: ContractCommissionUpdate) =>
    api.put<ApiResponse<ContractResponse>>(`/contracts/${id}/commission`, data).then(unwrap),
};

/* ═══════════════════════════════════════════════════
   REVIEWS
   ═══════════════════════════════════════════════════ */
export const reviewApi = {
  create: (data: ReviewCreate) =>
    api.post<ApiResponse<ReviewResponse>>('/reviews', data).then(unwrap),

  listByTutor: (tutorId: number) =>
    api.get<ApiResponse<ReviewResponse[]>>(`/reviews/tutor/${tutorId}`).then(unwrap),

  listMy: () =>
    api.get<ApiResponse<ReviewResponse[]>>('/reviews/my').then(unwrap),
};

/* ═══════════════════════════════════════════════════
   NOTIFICATIONS
   ═══════════════════════════════════════════════════ */
export const notificationApi = {
  list: (limit = 5) =>
    api.get<ApiResponse<NotificationResponse[]>>('/notifications', { params: { limit } }).then(unwrap),

  unreadCount: () =>
    api.get<ApiResponse<{ count: number }>>('/notifications/unread-count').then(unwrap),

  markRead: (id: number) =>
    api.put<ApiResponse<null>>(`/notifications/${id}/read`).then(unwrap),

  markAllRead: () =>
    api.put<ApiResponse<null>>('/notifications/read-all').then(unwrap),
};

export interface ValidationErrorDetail {
  loc: (string | number)[];
  msg: string;
  type: string;
  input?: unknown;
  ctx?: unknown;
}

export function extractErrorMessage(err: unknown): string {
  if (!err) return 'Đã xảy ra lỗi không xác định';

  const axiosError = err as {
    response?: {
      status?: number;
      data?: {
        detail?: string | ValidationErrorDetail[] | unknown;
      };
    };
    message?: string;
  };

  const detail = axiosError.response?.data?.detail;

  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item: unknown) => {
        if (item && typeof item === 'object') {
          const validationItem = item as Partial<ValidationErrorDetail>;
          const loc = Array.isArray(validationItem.loc)
            ? validationItem.loc.filter((l) => l !== 'body' && l !== 'query').join('.')
            : '';
          const fieldPrefix = loc ? `Trường '${loc}': ` : '';
          return `${fieldPrefix}${validationItem.msg || 'Không hợp lệ'}`;
        }
        return String(item);
      })
      .join(', ');
  }

  if (detail && typeof detail === 'object') {
    return JSON.stringify(detail);
  }

  return axiosError.message || 'Đã xảy ra lỗi kết nối';
}

export default api;
