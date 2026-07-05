/* ── API Response Wrapper ──────────────────────────── */
export interface ApiResponse<T = unknown> {
  data: T;
  message: string;
}

export interface ApiError {
  detail: string;
}

/* ── Chat ─────────────────────────────────────────── */
export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  created_at: string;
}

export interface ChatSendResponse {
  reply: string;
  created_at: string;
}

export interface MessageParticipantResponse {
  account_id: number;
  full_name: string;
  role: UserRole;
}

export interface MessageResponse {
  id: number;
  thread_id: number;
  sender_id: number;
  sender_name: string | null;
  content: string;
  created_at: string;
  is_mine: boolean;
}

export interface MessageThreadResponse {
  id: number;
  private_request_id: number | null;
  class_id: number | null;
  class_registration_id: number | null;
  title: string | null;
  status: string;
  participants: MessageParticipantResponse[];
  last_message: MessageResponse | null;
  messages: MessageResponse[];
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface MessageThreadEnsureRequest {
  private_request_id?: number;
  class_id?: number;
  class_registration_id?: number;
  support?: boolean;
  target_account_id?: number;
  title?: string;
}

/* ── Auth ──────────────────────────────────────────── */
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterStudentRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  address?: string;
  birth_year?: number;
  school?: string;
  academic_level?: string;
}

export interface RegisterTutorRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  address?: string;
  birth_year?: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export type UserRole = 'SUPER_ADMIN' | 'STAFF' | 'TUTOR' | 'STUDENT';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export interface UserResponse {
  id: number;
  email: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  address: string | null;
  birth_year: number | null;
  avatar_url: string | null;
  status: UserStatus;
  school: string | null;
  academic_level: string | null;
  learning_style: string | null;
  parent_notes: string | null;
}

export interface UpdateProfileRequest {
  full_name?: string;
  phone?: string;
  address?: string;
  birth_year?: number;
  school?: string;
  academic_level?: string;
  learning_style?: string;
  parent_notes?: string;
}

export interface TutorProfileBrief {
  id: number;
  verification_status: TutorVerificationStatus;
  teaching_mode: TeachingMode;
  teaching_area: string | null;
}

export interface MeResponse {
  user: UserResponse;
  tutor_profile: TutorProfileBrief | null;
}

export interface AdminStaffResponse {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  status: UserStatus;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminStaffCreate {
  email: string;
  full_name: string;
  password?: string;
  phone?: string;
}

export interface AdminStaffCreateResponse {
  staff: AdminStaffResponse;
  temp_password: string;
}

export interface AdminStatsResponse {
  users_by_role: Partial<Record<UserRole, number>>;
  total_users: number;
  active_staff: number;
  suspended_staff: number;
  classes_by_status: Record<string, number>;
  paid_revenue: number;
  pending_tutors: number;
  payment_queue: number;
  pending_contracts: number;
  audit_log_count: number;
}

export interface AuditLogResponse {
  id: number;
  actor_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: number | null;
  detail: Record<string, unknown>;
  created_at: string | null;
}

/* ── Tutor ─────────────────────────────────────────── */
export type TutorVerificationStatus = 'DRAFT' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
export type TeachingMode = 'ONLINE' | 'OFFLINE' | 'BOTH';
export type QualificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type TutorSubjectStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface TutorProfileUpdate {
  bio?: string;
  qualification_level?: string;
  years_experience?: number;
  teaching_mode?: TeachingMode;
  teaching_area?: string;
}

export interface TutorProfileResponse {
  id: number;
  account_id: number;
  bio: string | null;
  qualification_level: string | null;
  years_experience: number;
  teaching_mode: TeachingMode;
  teaching_area: string | null;
  verification_status: TutorVerificationStatus;
  average_rating: string;
  rating_count: number;
}

export interface TutorPublicResponse {
  id: number;
  full_name: string;
  avatar_url?: string | null;
  bio: string | null;
  qualification_level: string | null;
  years_experience: number;
  teaching_mode: TeachingMode;
  teaching_area: string | null;
  verification_status: TutorVerificationStatus;
  average_rating: string;
  rating_count: number;
  subjects: TutorSubjectResponse[];
  availabilities: TutorAvailabilityResponse[];
  qualifications: QualificationResponse[];
}

export type StaffTutorProfileResponse = TutorProfileResponse & {
  full_name?: string | null;
  email?: string | null;
  account_status: UserStatus;
};

export interface TutorDetailResponse {
  profile: StaffTutorProfileResponse;
  qualifications: QualificationResponse[];
  subjects: TutorSubjectResponse[];
  availabilities: TutorAvailabilityResponse[];
}

export interface QualificationCreate {
  type: string;
  title: string;
  issuer?: string;
  file_url: string;
}

export interface QualificationResponse {
  id: number;
  type: string;
  title: string;
  issuer: string | null;
  file_url: string;
  status: QualificationStatus;
  review_note: string | null;
}

export interface TutorSubjectCreate {
  subject_id: number;
  grade_level: string;
  fee_per_session: string;
}

export interface TutorSubjectResponse {
  id: number;
  subject_id: number;
  subject_name: string | null;
  grade_level: string;
  fee_per_session: string;
  status: TutorSubjectStatus;
  review_note?: string | null;
}

export interface AvailabilityCreate {
  day_of_week: number;
  start_time: string;
  end_time: string;
  mode?: TeachingMode;
}

export interface TutorAvailabilityResponse {
  id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  mode: string;
}

/* ── Subjects ──────────────────────────────────────── */
export interface SubjectResponse {
  id: number;
  name: string;
  description: string | null;
  status: string;
}

export interface SubjectCreate {
  name: string;
  description?: string;
  status?: string;
}

export interface SubjectDeleteResponse {
  mode: 'HARD_DELETED' | 'SOFT_DELETED';
  reference_counts: Record<string, number>;
}

/* ── Learning Needs ───────────────────────────────── */
export type LearningNeedStatus = 'ACTIVE' | 'FULFILLED' | 'EXPIRED' | 'ARCHIVED';

export interface LearningNeedScheduleCreate {
  day_of_week: number;
  start_time?: string;
  end_time?: string;
  time_slot?: string;
}

export interface LearningNeedCreate {
  subject_id?: number;
  grade_level?: string;
  goal?: string;
  budget_per_session_min?: string;
  budget_per_session_max?: string;
  preferred_mode?: TeachingMode;
  preferred_learning_type?: string;
  preferred_area?: string;
  raw_text?: string;
  schedules?: LearningNeedScheduleCreate[];
}

export interface LearningNeedScheduleResponse {
  id: number;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  time_slot: string | null;
}

export interface LearningNeedResponse {
  id: number;
  student_account_id: number;
  subject_id: number | null;
  grade_level: string | null;
  goal: string | null;
  budget_per_session_min: string | null;
  budget_per_session_max: string | null;
  preferred_mode: string;
  preferred_learning_type: string;
  preferred_area: string | null;
  raw_text: string | null;
  parsed_data: string | null;
  parser_source: string;
  parsed_confidence: string | null;
  status: LearningNeedStatus;
  schedules: LearningNeedScheduleResponse[];
}

/* ── Recommendations ──────────────────────────────── */
export interface PillarScore {
  key: 'ai' | 'practical' | 'reputation';
  label: string;
  score: number;
  weight: number;
  points: number;
  status: 'strong' | 'partial' | 'weak' | 'neutral' | string;
  note: string;
  source?: string;
  is_default?: boolean;
}

export interface PracticalBreakdownItem {
  key: string;
  label: string;
  score: number;
  weight: number;
  note: string;
}

export interface ScoreBreakdownItem {
  key: string;
  label: string;
  score: number;
  weight: number;
  points: number;
  status: 'strong' | 'partial' | 'weak' | 'neutral' | string;
  note: string;
}

export interface ScoreAdjustment {
  key: string;
  label: string;
  points: number;
  note: string;
}

export interface SemanticInfo {
  method: string;
  similarity: number;
  normalized_score?: number;
  rank?: number;
  candidate_count?: number;
  normalization_applied?: boolean;
}

export interface SemanticNeighbor {
  id: number;
  name: string;
  similarity: number;
}

export interface ReputationBreakdownItem {
  key: string;
  label: string;
  score: number;
  weight?: number;
  note: string;
  source: string;
}

export interface RecommendationContext {
  scoring_version: string;
  generated_at?: string;
  tutor_candidate_count?: number;
  class_candidate_count?: number;
  tutor_neighbors: SemanticNeighbor[];
  class_neighbors: SemanticNeighbor[];
}

export interface RecommendedTutor {
  tutor: TutorPublicResponse;
  score: string | number;
  reasons: string[];
  pillars?: PillarScore[];
  practical_breakdown?: PracticalBreakdownItem[];
  score_breakdown?: ScoreBreakdownItem[];
  score_adjustments?: ScoreAdjustment[];
  semantic?: SemanticInfo;
  reputation_breakdown?: ReputationBreakdownItem[];
}

export interface RecommendedClass {
  course_class: CourseClassResponse;
  score: string | number;
  reasons: string[];
  pillars?: PillarScore[];
  practical_breakdown?: PracticalBreakdownItem[];
  score_breakdown?: ScoreBreakdownItem[];
  score_adjustments?: ScoreAdjustment[];
  semantic?: SemanticInfo;
  reputation_breakdown?: ReputationBreakdownItem[];
}

export interface RecommendationResponse {
  recommended_tutors: RecommendedTutor[];
  recommended_classes: RecommendedClass[];
  context?: RecommendationContext;
}

export type RecommendationTargetType = 'TUTOR' | 'COURSE_CLASS';
export type RecommendationEventType = 'VIEW' | 'CLICK' | 'FAVORITE' | 'REQUEST_PRIVATE' | 'REGISTER_CLASS' | 'PAYMENT_SUCCESS' | 'REVIEW';

export interface RecommendationEventCreate {
  event_type: RecommendationEventType;
  learning_need_id?: number;
  target_type: RecommendationTargetType;
  target_id: number;
  score_snapshot?: string | number;
  reason_snapshot?: string | string[];
}

/* ── Private Tutoring Request ────────────────────── */
export type PrivateRequestStatus =
  | 'SENT'
  | 'SCHEDULE_PROPOSED'
  | 'TUTOR_CONFIRMED'
  | 'TUTOR_REJECTED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'ONGOING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface PrivateRequestCreate {
  tutor_id: number;
  learning_need_id?: number;
  subject_id: number;
  grade_level: string;
  goal?: string;
  requested_sessions: number;
  mode?: TeachingMode;
}

export interface PrivateRequestResponse {
  id: number;
  student_account_id: number;
  tutor_id: number;
  learning_need_id: number | null;
  subject_id: number;
  grade_level: string;
  goal: string | null;
  requested_sessions: number;
  mode: string;
  agreed_fee_per_session: string | null;
  status: PrivateRequestStatus;
  tutor_response_note: string | null;
  confirmed_at: string | null;
  thread_id: number | null;
  tutor_name: string | null;
  tutor_avatar_url: string | null;
  tutor_phone: string | null;
  tutor_address: string | null;
  student_name: string | null;
  student_avatar_url: string | null;
  student_phone: string | null;
  student_address: string | null;
  subject_name: string | null;
  class_location: string | null;
  schedules: SchedulePatternResponse[];
}

export interface PrivateRequestConfirm {
  agreed_fee_per_session: string;
  agreed_sessions?: number;
  class_title?: string;
  response_note?: string;
  location?: string;
  schedules?: SchedulePatternCreate[];
}

export interface PrivateRequestReject {
  response_note?: string;
}

export interface PrivateRequestLocationUpdate {
  location: string;
}

/* ── Course Classes ──────────────────────────────── */
export type ClassStatus =
  | 'DRAFT'
  | 'TUTOR_RECRUITING'
  | 'ENROLLING'
  | 'READY'
  | 'ONGOING'
  | 'COMPLETED'
  | 'CANCELLED';

export interface CourseClassCreate {
  subject_id: number;
  title: string;
  grade_level: string;
  goal?: string;
  fee_per_session_per_student: string;
  total_sessions: number;
  min_students: number;
  max_students: number;
  mode?: string;
  location?: string | null;
  start_date?: string;
  end_date?: string;
}

export interface ClassSchedulePatternResponse {
  id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  start_date?: string;
  end_date?: string;
  total_sessions?: number;
}

export interface CourseClassResponse {
  id: number;
  private_request_id: number | null;
  subject_id: number;
  subject_name?: string | null;
  primary_tutor_id: number | null;
  title: string;
  grade_level: string;
  goal: string | null;
  fee_per_session_per_student: string;
  total_sessions: number;
  min_students: number;
  max_students: number;
  mode: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  status: ClassStatus;
  created_by_account_id: number | null;
  tutor_name: string | null;
  tutor_avatar_url: string | null;
  schedules?: ClassSchedulePatternResponse[];
}

export interface TutorApplicationCreate {
  message?: string;
}

export interface TutorApplicationResponse {
  id: number;
  class_id: number;
  tutor_id: number;
  status: string;
  message: string | null;
  class_title?: string | null;
  class_status?: string | null;
  grade_level?: string | null;
  total_sessions?: number | null;
  fee_per_session_per_student?: string | null;
  mode?: string | null;
  location?: string | null;
  subject_name?: string | null;
}

export interface ClassRegistrationCreate {
  learning_need_id?: number;
}

export interface ClassRegistrationResponse {
  id: number;
  class_id: number;
  private_request_id: number | null;
  student_account_id: number;
  learning_need_id: number | null;
  status: string;
  review_note: string | null;
  class_title?: string;
  tutor_name?: string;
  tutor_avatar_url?: string | null;
  subject_name?: string;
  total_sessions?: number;
  fee_per_session_per_student?: string;
}

/* ── Payments ─────────────────────────────────────── */
export type PaymentStatus = 'CREATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDED';

export interface PaymentResponse {
  id: number;
  student_account_id: number;
  target_type: string;
  target_id: number;
  contract_id: number | null;
  amount: string;
  currency: string;
  status: PaymentStatus;
  provider: string;
  billing_cycle_label?: string | null;
  center_amount_snapshot?: string | null;
  tutor_amount_snapshot?: string | null;
  paid_at: string | null;
  created_at: string;
  refund_amount: string | null;
  refund_reason: string | null;
  transfer_content?: string | null;
  qr_data_url?: string | null;
  expires_at?: string | null;
  qr_amount?: number | null;
  display_amount?: number | null;
  bank_info?: {
    bank_name: string;
    bank_code: string;
    account_number: string;
    account_name: string;
    amount: number;
    transfer_content: string | null;
  } | null;
  is_test_mode?: boolean;
  amount_divisor?: number;
  target_name?: string | null;
  tutor_name?: string | null;
  subject_name?: string | null;
  sepay_transaction_id?: string | null;
}

export interface FinanceQueryParams {
  date_from?: string;
  date_to?: string;
  month?: number;
  year?: number;
  tutor_id?: number;
  target_type?: string;
  class_id?: number;
  contract_id?: number;
  payment_status?: string;
}

export interface FinanceSummaryResponse {
  gross_amount: string;
  refund_amount: string;
  net_amount: string;
  center_net: string;
  tutor_net: string;
  unallocated_net: string;
  transaction_count: number;
  recognized_count: number;
  missing_snapshot_count: number;
}

export interface FinanceReportRow {
  payment_id: number;
  created_at: string;
  paid_at: string | null;
  payment_status: string;
  provider: string;
  sepay_transaction_id: string | null;
  transfer_content: string | null;
  student_account_id: number;
  student_name: string;
  tutor_id: number | null;
  tutor_name: string | null;
  contract_id: number | null;
  target_type: string;
  target_id: number;
  target_name: string | null;
  class_id: number | null;
  subject_id: number | null;
  subject_name: string | null;
  billing_cycle_label: string | null;
  gross_amount: string;
  refund_amount: string;
  refund_at: string | null;
  refund_reason: string | null;
  net_amount: string;
  center_rate: string | null;
  tutor_rate: string | null;
  center_gross: string;
  tutor_gross: string;
  center_refund_adjustment: string;
  tutor_refund_adjustment: string;
  center_net: string;
  tutor_net: string;
  allocation_status: string;
}

export interface TutorIncomeSummaryResponse {
  this_month: string;
  this_year: string;
  total: string;
  refund_adjustment: string;
  transaction_count: number;
}

export interface TutorIncomeTransaction {
  payment_id: number;
  paid_at: string | null;
  refund_at: string | null;
  target_type: string;
  target_name: string | null;
  subject_name: string | null;
  billing_cycle_label: string | null;
  payment_status: string;
  gross_amount: string;
  refund_amount: string;
  tutor_rate: string | null;
  tutor_gross: string;
  tutor_refund_adjustment: string;
  tutor_net: string;
}

export interface PaymentStatusResponse {
  payment_id: number;
  status: PaymentStatus;
  paid_at?: string | null;
}

/* ── Schedule & Sessions ──────────────────────────── */
export interface SchedulePatternCreate {
  private_request_id?: number;
  class_id?: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  start_date: string;
  end_date?: string;
  total_sessions?: number;
}

export interface SchedulePatternResponse {
  id: number;
  private_request_id: number | null;
  class_id: number | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string | null;
  total_sessions: number | null;
}

export type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface LearningSessionResponse {
  id: number;
  private_request_id: number | null;
  class_id: number | null;
  tutor_id: number;
  session_number: number | null;
  session_date: string;
  start_time: string;
  end_time: string;
  status: SessionStatus;
  attendance_note: string | null;
  tutor_name: string | null;
  class_title: string | null;
  private_request_title: string | null;
  mode: string | null;
  location: string | null;
  student_names: string[];
  student_count: number | null;
  target_total_sessions: number | null;
  target_goal: string | null;
}

export interface ScheduleBlockResponse {
  id: number;
  tutor_id: number;
  private_request_id: number | null;
  class_id: number | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  status: string;
}

/* ── Contracts ────────────────────────────────────── */
export type ContractStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface ContractCreate {
  tutor_id: number;
  private_request_id?: number;
  class_id?: number;
  commission_name_snapshot?: string;
  center_rate_snapshot?: string;
  tutor_rate_snapshot?: string;
}

export interface ContractResponse {
  id: number;
  tutor_id: number;
  private_request_id: number | null;
  class_id: number | null;
  commission_name_snapshot: string;
  center_rate_snapshot: string;
  tutor_rate_snapshot: string;
  status: ContractStatus;
  tutor_name?: string | null;
  target_name?: string | null;
}

export interface ContractCommissionUpdate {
  center_rate: string;
  tutor_rate: string;
  reason: string;
}

/* ── Reviews ──────────────────────────────────────── */
export interface ReviewCreate {
  tutor_id: number;
  target_type: 'PRIVATE_TUTORING_REQUEST' | 'CLASS_REGISTRATION';
  target_id: number;
  rating: number;
  comment?: string;
}

export interface ReviewResponse {
  id: number;
  student_account_id: number;
  tutor_id: number;
  target_type: string;
  target_id: number;
  rating: number;
  comment: string | null;
  created_at: string | null;
  tutor_name: string | null;
  tutor_avatar_url: string | null;
  subject_name: string | null;
}

/* ── Staff ────────────────────────────────────────── */
export interface ReviewAction {
  action: 'APPROVED' | 'REJECTED';
  review_note?: string;
}

export interface TutorReviewAction {
  action: 'VERIFIED' | 'REJECTED';
  review_note?: string;
}

export interface ClassStatusUpdate {
  status: ClassStatus;
}

export type NotificationType =
  | 'SESSION_REMINDER'
  | 'SESSION_CANCELLED'
  | 'SESSION_RESCHEDULED'
  | 'NEW_PRIVATE_REQUEST'
  | 'NEW_MESSAGE';

export interface NotificationResponse {
  id: number;
  user_id: number;
  notification_type: NotificationType;
  title: string;
  body: string | null;
  reference_type: string | null;
  reference_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export type SearchMode = 'EXACT' | 'SMART';
export type ResultType = 'ALL' | 'CLASS' | 'TUTOR';
