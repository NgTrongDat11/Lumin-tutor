-- ============================================================
-- LUMIN - BASIC DATABASE SCHEMA
-- De tai: He thong goi y va ket noi gia su theo huong ket hop
-- ============================================================

-- 1. Luu tai khoan dang nhap va thong tin co ban cua user.
CREATE TABLE user_accounts (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'STAFF', 'TUTOR', 'STUDENT')),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  address TEXT,
  birth_year INT,
  avatar_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Luu ho so rieng cua gia su va trang thai kiem duyet.
CREATE TABLE tutor_profiles (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL UNIQUE REFERENCES user_accounts(id),
  bio TEXT,
  qualification_level VARCHAR(50) CHECK (
    qualification_level IN (
      'UNIVERSITY_STUDENT',
      'GRADUATED',
      'SCHOOL_TEACHER',
      'LANGUAGE_CERTIFIED',
      'SUBJECT_EXPERT',
      'OTHER'
    )
  ),
  years_experience INT NOT NULL DEFAULT 0,

  -- Hinh thuc day va khu vuc day offline de recommendation filter.
  teaching_mode VARCHAR(30) NOT NULL DEFAULT 'BOTH'
    CHECK (teaching_mode IN ('ONLINE', 'OFFLINE', 'BOTH')),
  teaching_area TEXT,

  verification_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (verification_status IN ('DRAFT', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED')),
  average_rating NUMERIC(3, 2) NOT NULL DEFAULT 0
    CHECK (average_rating BETWEEN 0 AND 5),
  rating_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Luu danh muc mon hoc/khoa hoc trong he thong.
CREATE TABLE subjects (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Luu minh chung/chung chi cua gia su de staff kiem duyet.
CREATE TABLE tutor_qualifications (
  id BIGSERIAL PRIMARY KEY,
  tutor_id BIGINT NOT NULL REFERENCES tutor_profiles(id),
  type VARCHAR(50) NOT NULL CHECK (
    type IN ('STUDENT_CARD', 'DEGREE', 'LANGUAGE_CERTIFICATE', 'TEACHING_CERTIFICATE', 'OTHER')
  ),
  title VARCHAR(255) NOT NULL,
  issuer VARCHAR(255),
  file_url TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_note TEXT,
  reviewed_by_account_id BIGINT REFERENCES user_accounts(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Luu mon, cap lop va hoc phi theo buoi ma gia su dang ky day.
CREATE TABLE tutor_subjects (
  id BIGSERIAL PRIMARY KEY,
  tutor_id BIGINT NOT NULL REFERENCES tutor_profiles(id),
  subject_id BIGINT NOT NULL REFERENCES subjects(id),
  grade_level VARCHAR(100) NOT NULL,
  fee_per_session NUMERIC(12, 2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_note TEXT,
  reviewed_by_account_id BIGINT REFERENCES user_accounts(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tutor_id, subject_id, grade_level)
);

-- 6. Luu nhu cau hoc cua hoc vien, gom ca du lieu duoc AI/rule parse.
CREATE TABLE learning_needs (
  id BIGSERIAL PRIMARY KEY,
  student_account_id BIGINT NOT NULL REFERENCES user_accounts(id),
  subject_id BIGINT REFERENCES subjects(id),
  grade_level VARCHAR(100),
  goal TEXT,
  budget_per_session_min NUMERIC(12, 2),
  budget_per_session_max NUMERIC(12, 2),
  preferred_mode VARCHAR(30) DEFAULT 'BOTH'
    CHECK (preferred_mode IN ('ONLINE', 'OFFLINE', 'BOTH')),
  preferred_learning_type VARCHAR(30) DEFAULT 'BOTH'
    CHECK (preferred_learning_type IN ('PRIVATE', 'GROUP', 'BOTH')),
  preferred_area TEXT,
  raw_text TEXT,
  parsed_data TEXT,
  parser_source VARCHAR(30) NOT NULL DEFAULT 'FORM'
    CHECK (parser_source IN ('FORM', 'RULE_BASED', 'LLM')),
  parsed_confidence NUMERIC(4, 3)
    CHECK (parsed_confidence BETWEEN 0 AND 1),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'FULFILLED', 'EXPIRED', 'ARCHIVED')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6b. Luu lich mong muon cua hoc vien de recommendation so khop voi availability gia su.
CREATE TABLE learning_need_schedules (
  id BIGSERIAL PRIMARY KEY,
  learning_need_id BIGINT NOT NULL REFERENCES learning_needs(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TIME,
  end_time TIME,
  time_slot VARCHAR(30) CHECK (time_slot IN ('MORNING', 'AFTERNOON', 'EVENING')),

  -- Hoc vien co the chon buoi chung, hoac nhap gio cu the.
  -- Khong cho phep vua chon time_slot vua nhap start/end time.
  CHECK (
    (time_slot IS NOT NULL AND start_time IS NULL AND end_time IS NULL)
    OR
    (time_slot IS NULL AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
  ),

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Luu yeu cau hoc 1-1 theo goi giua hoc vien va gia su.
CREATE TABLE private_tutoring_requests (
  id BIGSERIAL PRIMARY KEY,
  student_account_id BIGINT NOT NULL REFERENCES user_accounts(id),
  tutor_id BIGINT NOT NULL REFERENCES tutor_profiles(id),
  learning_need_id BIGINT REFERENCES learning_needs(id),
  subject_id BIGINT NOT NULL REFERENCES subjects(id),
  grade_level VARCHAR(100) NOT NULL,
  goal TEXT,
  requested_sessions INT NOT NULL,
  agreed_fee_per_session NUMERIC(12, 2),

  -- Snapshot hinh thuc hoc da chot.
  mode VARCHAR(30) NOT NULL DEFAULT 'ONLINE'
    CHECK (mode IN ('ONLINE', 'OFFLINE')),

  status VARCHAR(40) NOT NULL DEFAULT 'SENT'
    CHECK (
      status IN (
        'SENT',
        'TUTOR_CONFIRMED',
        'TUTOR_REJECTED',
        'PAYMENT_PENDING',
        'PAID',
        'ONGOING',
        'COMPLETED',
        'CANCELLED',
        'REFUNDED'
      )
    ),
  tutor_response_note TEXT,
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Luu lop hoc nhom do staff tao va gia su duoc chot day lop.
CREATE TABLE course_classes (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES subjects(id),
  primary_tutor_id BIGINT REFERENCES tutor_profiles(id),
  title VARCHAR(255) NOT NULL,
  grade_level VARCHAR(100) NOT NULL,
  goal TEXT,
  fee_per_session_per_student NUMERIC(12, 2) NOT NULL,
  total_sessions INT NOT NULL,
  min_students INT NOT NULL DEFAULT 1,
  max_students INT NOT NULL,
  CHECK (min_students > 0 AND max_students >= min_students),

  -- Hinh thuc va dia diem lop hoc.
  mode VARCHAR(30) NOT NULL DEFAULT 'OFFLINE'
    CHECK (mode IN ('ONLINE', 'OFFLINE', 'BOTH')),
  location TEXT,

  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT'
    CHECK (
      status IN (
        'DRAFT',
        'TUTOR_RECRUITING',
        'ENROLLING',
        'READY',
        'ONGOING',
        'COMPLETED',
        'CANCELLED'
      )
    ),
  created_by_account_id BIGINT REFERENCES user_accounts(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Luu thong tin gia su ung tuyen vao lop hoc nhom.
CREATE TABLE tutor_applications (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES course_classes(id),
  tutor_id BIGINT NOT NULL REFERENCES tutor_profiles(id),
  status VARCHAR(30) NOT NULL DEFAULT 'APPLIED'
    CHECK (status IN ('APPLIED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN')),
  message TEXT,
  reviewed_by_account_id BIGINT REFERENCES user_accounts(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (class_id, tutor_id)
);

-- 10. Luu thong tin hoc vien dang ky vao lop hoc nhom.
CREATE TABLE class_registrations (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES course_classes(id),
  student_account_id BIGINT NOT NULL REFERENCES user_accounts(id),
  learning_need_id BIGINT REFERENCES learning_needs(id),
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING'
    CHECK (
      status IN (
        'PENDING',
        'APPROVED',
        'PAYMENT_PENDING',
        'PAID',
        'REJECTED',
        'CANCELLED',
        'REFUNDED'
      )
    ),
  reviewed_by_account_id BIGINT REFERENCES user_accounts(id),
  reviewed_at TIMESTAMP,
  review_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (class_id, student_account_id)
);

-- 11. Luu lich ranh mem ma gia su khai bao theo thu trong tuan.
CREATE TABLE tutor_availabilities (
  id BIGSERIAL PRIMARY KEY,
  tutor_id BIGINT NOT NULL REFERENCES tutor_profiles(id),
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (start_time < end_time),
  mode VARCHAR(30) NOT NULL DEFAULT 'BOTH'
    CHECK (mode IN ('ONLINE', 'OFFLINE', 'BOTH')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. Luu lich hoc lap lai theo tuan cho goi 1-1 hoac lop nhom.
CREATE TABLE schedule_patterns (
  id BIGSERIAL PRIMARY KEY,

  -- Lich nay thuoc ve hoac goi hoc 1-1, hoac lop nhom.
  private_request_id BIGINT REFERENCES private_tutoring_requests(id),
  class_id BIGINT REFERENCES course_classes(id),
  CHECK (
    (private_request_id IS NOT NULL AND class_id IS NULL)
    OR
    (private_request_id IS NULL AND class_id IS NOT NULL)
  ),

  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (start_time < end_time),
  start_date DATE NOT NULL,
  end_date DATE,
  total_sessions INT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. Luu tung buoi hoc cu the duoc sinh ra tu lich lap.
CREATE TABLE learning_sessions (
  id BIGSERIAL PRIMARY KEY,

  -- Buoi hoc nay thuoc ve hoac goi hoc 1-1, hoac lop nhom.
  private_request_id BIGINT REFERENCES private_tutoring_requests(id),
  class_id BIGINT REFERENCES course_classes(id),
  CHECK (
    (private_request_id IS NOT NULL AND class_id IS NULL)
    OR
    (private_request_id IS NULL AND class_id IS NOT NULL)
  ),

  tutor_id BIGINT NOT NULL REFERENCES tutor_profiles(id),
  session_number INT,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (start_time < end_time),
  status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW')),
  attendance_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 14. Luu cac khung gio da bi khoa de tranh trung lich gia su.
CREATE TABLE schedule_blocks (
  id BIGSERIAL PRIMARY KEY,
  tutor_id BIGINT NOT NULL REFERENCES tutor_profiles(id),

  -- Block lich nay phat sinh tu hoac goi hoc 1-1, hoac lop nhom.
  private_request_id BIGINT REFERENCES private_tutoring_requests(id),
  class_id BIGINT REFERENCES course_classes(id),
  CHECK (
    (private_request_id IS NOT NULL AND class_id IS NULL)
    OR
    (private_request_id IS NULL AND class_id IS NOT NULL)
  ),

  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (start_time < end_time),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'RELEASED', 'CANCELLED')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 15. Luu hop dong giang day va snapshot ty le hoa hong tai thoi diem chot.
CREATE TABLE teaching_contracts (
  id BIGSERIAL PRIMARY KEY,
  tutor_id BIGINT NOT NULL REFERENCES tutor_profiles(id),

  -- Hop dong nay thuoc ve hoac goi hoc 1-1, hoac lop nhom.
  private_request_id BIGINT REFERENCES private_tutoring_requests(id),
  class_id BIGINT REFERENCES course_classes(id),
  CHECK (
    (private_request_id IS NOT NULL AND class_id IS NULL)
    OR
    (private_request_id IS NULL AND class_id IS NOT NULL)
  ),

  commission_name_snapshot VARCHAR(255) NOT NULL,
  center_rate_snapshot NUMERIC(5, 2) NOT NULL,
  tutor_rate_snapshot NUMERIC(5, 2) NOT NULL,
  CHECK (center_rate_snapshot + tutor_rate_snapshot = 100),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 16. Luu giao dich thanh toan sandbox/mock cho 1-1 va lop nhom.
CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  student_account_id BIGINT NOT NULL REFERENCES user_accounts(id),
  target_type VARCHAR(40) NOT NULL CHECK (target_type IN ('PRIVATE_TUTORING_REQUEST', 'CLASS_REGISTRATION')),
  target_id BIGINT NOT NULL,
  contract_id BIGINT REFERENCES teaching_contracts(id),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'VND',
  status VARCHAR(30) NOT NULL DEFAULT 'CREATED'
    CHECK (
      status IN (
        'CREATED',
        'PENDING',
        'SUCCEEDED',
        'FAILED',
        'CANCELLED',
        'REFUND_PENDING',
        'REFUNDED',
        'PENDING_SETTLEMENT',
        'SETTLED'
      )
    ),
  provider VARCHAR(30) NOT NULL DEFAULT 'MOCK',
  provider_ref VARCHAR(255),
  billing_cycle_label VARCHAR(100),
  center_amount_snapshot NUMERIC(12, 2),
  tutor_amount_snapshot NUMERIC(12, 2),
  paid_at TIMESTAMP,

  -- Refund inline vi MVP khong tach bang PaymentRefund.
  refund_amount NUMERIC(12, 2),
  refund_reason TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 17. Luu danh gia cua hoc vien danh cho gia su sau qua trinh hoc.
CREATE TABLE reviews (
  id BIGSERIAL PRIMARY KEY,
  student_account_id BIGINT NOT NULL REFERENCES user_accounts(id),
  tutor_id BIGINT NOT NULL REFERENCES tutor_profiles(id),
  target_type VARCHAR(40) NOT NULL CHECK (target_type IN ('PRIVATE_TUTORING_REQUEST', 'CLASS_REGISTRATION')),
  target_id BIGINT NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_account_id, target_type, target_id)
);

-- 18. Luu hanh vi tuong tac de phuc vu thuat toan goi y hybrid.
CREATE TABLE recommendation_events (
  id BIGSERIAL PRIMARY KEY,
  student_account_id BIGINT NOT NULL REFERENCES user_accounts(id),
  learning_need_id BIGINT REFERENCES learning_needs(id),
  target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('TUTOR', 'COURSE_CLASS')),
  target_id BIGINT NOT NULL,
  event_type VARCHAR(30) NOT NULL CHECK (
    event_type IN ('VIEW', 'CLICK', 'FAVORITE', 'REQUEST_PRIVATE', 'REGISTER_CLASS', 'PAYMENT_SUCCESS', 'REVIEW')
  ),
  score_snapshot NUMERIC(8, 4),
  reason_snapshot TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 19-21. MESSAGING (defer code sang phase sau, schema co san)
-- ============================================================

-- 19. Thread trao doi noi bo, gan voi ngu canh nghiep vu.
CREATE TABLE message_threads (
  id BIGSERIAL PRIMARY KEY,

  -- Thread gan voi 1-1, lop nhom, hoac dang ky lop.
  private_request_id BIGINT REFERENCES private_tutoring_requests(id),
  class_id BIGINT REFERENCES course_classes(id),
  class_registration_id BIGINT REFERENCES class_registrations(id),
  CHECK (
    (private_request_id IS NOT NULL AND class_id IS NULL AND class_registration_id IS NULL)
    OR
    (private_request_id IS NULL AND class_id IS NOT NULL AND class_registration_id IS NULL)
    OR
    (private_request_id IS NULL AND class_id IS NULL AND class_registration_id IS NOT NULL)
  ),

  title VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 20. Thanh vien cua thread va trang thai doc.
CREATE TABLE message_thread_participants (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES user_accounts(id),
  last_read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (thread_id, account_id)
);

-- 21. Tin nhan trong thread.
CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES user_accounts(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
