-- Lumin extra demo accounts seed.
-- Run in Supabase SQL Editor after the base schema/demo seed exists.
-- Adds/updates 30 tutor accounts and 30 student accounts using app auth tables.
-- Login passwords:
--   Tutors:   tutor123
--   Students: student123

BEGIN;

-- Current app code uses these optional student profile columns. No-op if present.
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS school VARCHAR(255);
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS academic_level VARCHAR(100);
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS learning_style TEXT;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS parent_notes TEXT;

CREATE TEMP TABLE _lumin_seed_subjects (
  name VARCHAR(100) PRIMARY KEY,
  description TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _lumin_seed_subjects (name, description) VALUES
  ('Toán', 'Toán THCS, THPT và luyện thi tốt nghiệp.'),
  ('Vật lý', 'Vật lý phổ thông, ôn tập nền tảng và luyện thi.'),
  ('Hóa học', 'Hóa học THCS, THPT và luyện đề.'),
  ('Tiếng Anh', 'Tiếng Anh phổ thông, giao tiếp và ngữ pháp.'),
  ('IELTS', 'Luyện thi IELTS theo band mục tiêu.'),
  ('Ngữ Văn', 'Ngữ văn THCS, THPT và ôn thi.'),
  ('Sinh học', 'Sinh học phổ thông và luyện thi khối B.'),
  ('Tin học', 'Tin học văn phòng, lập trình cơ bản và Python.'),
  ('Lịch sử', 'Lịch sử phổ thông và ôn thi tốt nghiệp.'),
  ('Địa lý', 'Địa lý phổ thông, Atlat và ôn thi tốt nghiệp.')
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description;

INSERT INTO subjects (name, description, status)
SELECT name, description, 'ACTIVE'
FROM _lumin_seed_subjects
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  status = 'ACTIVE',
  updated_at = now();

CREATE TEMP TABLE _lumin_seed_tutors (
  ordinal INT PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  qualification_level VARCHAR(50) NOT NULL,
  years_experience INT NOT NULL,
  teaching_mode VARCHAR(30) NOT NULL,
  teaching_area TEXT NOT NULL,
  verification_status VARCHAR(30) NOT NULL,
  average_rating NUMERIC(3, 2) NOT NULL,
  rating_count INT NOT NULL,
  subject_name VARCHAR(100) NOT NULL,
  grade_level VARCHAR(100) NOT NULL,
  fee_per_session NUMERIC(12, 2) NOT NULL,
  qual_type VARCHAR(50) NOT NULL,
  qual_title TEXT NOT NULL,
  qual_issuer TEXT NOT NULL,
  file_url TEXT NOT NULL,
  day_one INT NOT NULL,
  day_two INT NOT NULL,
  start_one TIME NOT NULL,
  end_one TIME NOT NULL,
  start_two TIME NOT NULL,
  end_two TIME NOT NULL
) ON COMMIT DROP;

INSERT INTO _lumin_seed_tutors VALUES
  (1, 'seed.tutor01@lumin.local', 'Nguyễn Hữu Khoa', '0913000001', 'Phường Trà Vinh, Vĩnh Long', 'SCHOOL_TEACHER', 9, 'BOTH', 'Phường Trà Vinh, Vĩnh Long', 'VERIFIED', 4.90, 42, 'Toán', 'Lớp 12', 230000, 'TEACHING_CERTIFICATE', 'Chứng nhận giáo viên Toán THPT', 'Sở Giáo dục và Đào tạo Vĩnh Long', '/seed/qualification-evidence/le-thanh-phong-luyen-thi-thpt.txt', 2, 5, '18:00', '20:00', '19:00', '21:00'),
  (2, 'seed.tutor02@lumin.local', 'Trần Minh Quân', '0913000002', 'Phường Long Đức, Vĩnh Long', 'GRADUATED', 5, 'OFFLINE', 'Phường Long Đức, Vĩnh Long', 'VERIFIED', 4.75, 18, 'Vật lý', 'Lớp 11', 190000, 'DEGREE', 'Bằng cử nhân Vật lý ứng dụng', 'Trường Đại học Cần Thơ', '/seed/qualification-evidence/hoang-anh-duc-transcript.txt', 3, 7, '18:30', '20:30', '08:00', '10:00'),
  (3, 'seed.tutor03@lumin.local', 'Lê Phương Mai', '0913000003', 'Phường Nguyệt Hóa, Vĩnh Long', 'LANGUAGE_CERTIFIED', 6, 'BOTH', 'Phường Nguyệt Hóa, Vĩnh Long', 'VERIFIED', 4.88, 36, 'Tiếng Anh', 'Lớp 9', 180000, 'LANGUAGE_CERTIFICATE', 'Chứng chỉ TESOL', 'Global TESOL Academy', '/seed/qualification-evidence/anna-taylor-tesol.txt', 2, 6, '19:00', '21:00', '14:00', '16:00'),
  (4, 'seed.tutor04@lumin.local', 'Phạm Quốc Thái', '0913000004', 'Xã Càng Long, Vĩnh Long', 'SUBJECT_EXPERT', 7, 'BOTH', 'Xã Càng Long, Vĩnh Long', 'VERIFIED', 4.70, 25, 'Hóa học', 'Lớp 12', 220000, 'TEACHING_CERTIFICATE', 'Chứng nhận bồi dưỡng học sinh giỏi Hóa', 'Lumin Education', '/seed/qualification-evidence/dang-van-hung-hsg-hoa.txt', 4, 6, '18:00', '20:00', '09:00', '11:00'),
  (5, 'seed.tutor05@lumin.local', 'Võ Thanh Tâm', '0913000005', 'Xã Châu Thành, Vĩnh Long', 'GRADUATED', 4, 'ONLINE', 'Xã Châu Thành, Vĩnh Long', 'VERIFIED', 4.65, 16, 'Tin học', 'Python cơ bản', 200000, 'DEGREE', 'Bằng cử nhân Công nghệ thông tin', 'Trường Đại học Trà Vinh', '/seed/qualification-evidence/pham-quoc-bao-tin-hoc-ung-dung.txt', 1, 4, '20:00', '22:00', '19:00', '21:00'),
  (6, 'seed.tutor06@lumin.local', 'Đặng Ngọc Hân', '0913000006', 'Phường Ninh Kiều, Thành phố Cần Thơ', 'LANGUAGE_CERTIFIED', 5, 'BOTH', 'Phường Ninh Kiều, Thành phố Cần Thơ', 'VERIFIED', 4.95, 51, 'IELTS', 'Band 5.5-6.5', 300000, 'LANGUAGE_CERTIFICATE', 'IELTS Academic 8.0', 'British Council', '/seed/qualification-evidence/vu-hoang-my-ielts-8-5.txt', 3, 7, '19:00', '21:00', '09:00', '11:00'),
  (7, 'seed.tutor07@lumin.local', 'Bùi Anh Duy', '0913000007', 'Phường Cái Răng, Thành phố Cần Thơ', 'UNIVERSITY_STUDENT', 2, 'OFFLINE', 'Phường Cái Răng, Thành phố Cần Thơ', 'VERIFIED', 4.55, 10, 'Toán', 'Lớp 10', 150000, 'STUDENT_CARD', 'Thẻ sinh viên ngành Sư phạm Toán', 'Trường Đại học Cần Thơ', '/seed/qualification-evidence/hoang-anh-duc-student-card.txt', 2, 6, '17:30', '19:30', '15:00', '17:00'),
  (8, 'seed.tutor08@lumin.local', 'Huỳnh Gia Bảo', '0913000008', 'Phường Bình Thủy, Thành phố Cần Thơ', 'SCHOOL_TEACHER', 12, 'BOTH', 'Phường Bình Thủy, Thành phố Cần Thơ', 'VERIFIED', 4.92, 64, 'Ngữ Văn', 'Lớp 12', 210000, 'TEACHING_CERTIFICATE', 'Chứng nhận giáo viên Ngữ Văn THPT', 'Sở Giáo dục và Đào tạo Cần Thơ', '/seed/qualification-evidence/le-thanh-phong-luyen-thi-thpt.txt', 4, 7, '18:00', '20:00', '08:30', '10:30'),
  (9, 'seed.tutor09@lumin.local', 'Ngô Thảo Vy', '0913000009', 'Phường Ô Môn, Thành phố Cần Thơ', 'GRADUATED', 3, 'BOTH', 'Phường Ô Môn, Thành phố Cần Thơ', 'VERIFIED', 4.60, 14, 'Sinh học', 'Lớp 12', 190000, 'DEGREE', 'Bằng cử nhân Sinh học', 'Trường Đại học Cần Thơ', '/seed/qualification-evidence/nguyen-thao-linh-bang-diem-toan.txt', 1, 5, '18:30', '20:30', '19:00', '21:00'),
  (10, 'seed.tutor10@lumin.local', 'Lý Hoàng Nam', '0913000010', 'Phường Thốt Nốt, Thành phố Cần Thơ', 'SUBJECT_EXPERT', 8, 'ONLINE', 'Phường Thốt Nốt, Thành phố Cần Thơ', 'VERIFIED', 4.78, 29, 'Địa lý', 'Lớp 12', 170000, 'OTHER', 'Chứng nhận ôn thi tốt nghiệp môn Địa lý', 'Lumin Education', '/seed/qualification-evidence/le-thanh-phong-luyen-thi-thpt.txt', 2, 4, '20:00', '22:00', '20:00', '22:00'),
  (11, 'seed.tutor11@lumin.local', 'Cao Minh Triết', '0913000011', 'Phường Cao Lãnh, Đồng Tháp', 'SCHOOL_TEACHER', 10, 'BOTH', 'Phường Cao Lãnh, Đồng Tháp', 'VERIFIED', 4.86, 33, 'Toán', 'Luyện thi THPT', 250000, 'TEACHING_CERTIFICATE', 'Chứng nhận luyện thi Toán THPT', 'Sở Giáo dục và Đào tạo Đồng Tháp', '/seed/qualification-evidence/le-thanh-phong-thac-si-toan.txt', 3, 6, '18:00', '20:00', '08:00', '10:00'),
  (12, 'seed.tutor12@lumin.local', 'Mai Khánh Linh', '0913000012', 'Phường Sa Đéc, Đồng Tháp', 'GRADUATED', 4, 'OFFLINE', 'Phường Sa Đéc, Đồng Tháp', 'VERIFIED', 4.66, 19, 'Hóa học', 'Lớp 10', 160000, 'DEGREE', 'Bằng cử nhân Sư phạm Hóa học', 'Trường Đại học Sư phạm TP.HCM', '/seed/qualification-evidence/dang-van-hung-su-pham-hoa.txt', 2, 5, '18:00', '20:00', '18:30', '20:30'),
  (13, 'seed.tutor13@lumin.local', 'Tạ Đức Phúc', '0913000013', 'Thành phố Hồng Ngự, Đồng Tháp', 'UNIVERSITY_STUDENT', 2, 'ONLINE', 'Thành phố Hồng Ngự, Đồng Tháp', 'VERIFIED', 4.48, 8, 'Tin học', 'Tin học văn phòng', 140000, 'STUDENT_CARD', 'Thẻ sinh viên ngành Công nghệ thông tin', 'Trường Đại học Đồng Tháp', '/seed/qualification-evidence/hoang-anh-duc-student-card.txt', 1, 3, '19:00', '21:00', '20:00', '22:00'),
  (14, 'seed.tutor14@lumin.local', 'Đỗ Nhật Minh', '0913000014', 'Phường Long Xuyên, An Giang', 'GRADUATED', 6, 'BOTH', 'Phường Long Xuyên, An Giang', 'VERIFIED', 4.80, 27, 'Vật lý', 'Lớp 12', 210000, 'DEGREE', 'Bằng kỹ sư Vật lý kỹ thuật', 'Trường Đại học Bách Khoa', '/seed/qualification-evidence/hoang-anh-duc-transcript.txt', 4, 7, '18:30', '20:30', '08:30', '10:30'),
  (15, 'seed.tutor15@lumin.local', 'Châu Mỹ Duyên', '0913000015', 'Phường Châu Đốc, An Giang', 'LANGUAGE_CERTIFIED', 5, 'BOTH', 'Phường Châu Đốc, An Giang', 'VERIFIED', 4.82, 31, 'Tiếng Anh', 'Giao tiếp', 190000, 'LANGUAGE_CERTIFICATE', 'Chứng chỉ TOEIC 900', 'IIG Vietnam', '/seed/qualification-evidence/anna-taylor-reference-letter.txt', 2, 6, '19:00', '21:00', '09:00', '11:00'),
  (16, 'seed.tutor16@lumin.local', 'Hồ Gia Hưng', '0913000016', 'Phường Bến Tre, Bến Tre', 'SCHOOL_TEACHER', 11, 'BOTH', 'Phường Bến Tre, Bến Tre', 'VERIFIED', 4.89, 45, 'Lịch sử', 'Lớp 12', 180000, 'TEACHING_CERTIFICATE', 'Chứng nhận giáo viên Lịch sử THPT', 'Sở Giáo dục và Đào tạo Bến Tre', '/seed/qualification-evidence/le-thanh-phong-luyen-thi-thpt.txt', 3, 5, '18:00', '20:00', '18:30', '20:30'),
  (17, 'seed.tutor17@lumin.local', 'Nguyễn Hà My', '0913000017', 'Xã Châu Thành, Bến Tre', 'GRADUATED', 4, 'OFFLINE', 'Xã Châu Thành, Bến Tre', 'VERIFIED', 4.62, 17, 'Sinh học', 'Lớp 10', 160000, 'DEGREE', 'Bằng cử nhân Công nghệ sinh học', 'Trường Đại học Nông Lâm TP.HCM', '/seed/qualification-evidence/nguyen-thao-linh-bang-diem-toan.txt', 2, 4, '18:00', '20:00', '19:00', '21:00'),
  (18, 'seed.tutor18@lumin.local', 'Trương Quốc Việt', '0913000018', 'Phường Mỹ Tho, Tiền Giang', 'SUBJECT_EXPERT', 7, 'BOTH', 'Phường Mỹ Tho, Tiền Giang', 'VERIFIED', 4.77, 28, 'Toán', 'Lớp 9', 180000, 'OTHER', 'Chứng nhận bồi dưỡng học sinh giỏi Toán THCS', 'Lumin Education', '/seed/qualification-evidence/le-thanh-phong-luyen-thi-thpt.txt', 1, 6, '18:00', '20:00', '09:00', '11:00'),
  (19, 'seed.tutor19@lumin.local', 'Phan Ngọc Trâm', '0913000019', 'Phường Cai Lậy, Tiền Giang', 'LANGUAGE_CERTIFIED', 6, 'ONLINE', 'Phường Cai Lậy, Tiền Giang', 'VERIFIED', 4.84, 37, 'IELTS', 'Band 6.5-7.5', 320000, 'LANGUAGE_CERTIFICATE', 'IELTS Academic 8.5', 'British Council', '/seed/qualification-evidence/vu-hoang-my-ielts-8-5.txt', 3, 7, '20:00', '22:00', '10:00', '12:00'),
  (20, 'seed.tutor20@lumin.local', 'Vương Thành Lộc', '0913000020', 'Phường Sóc Trăng, Sóc Trăng', 'SCHOOL_TEACHER', 13, 'BOTH', 'Phường Sóc Trăng, Sóc Trăng', 'VERIFIED', 4.91, 58, 'Hóa học', 'Luyện thi THPT', 240000, 'TEACHING_CERTIFICATE', 'Chứng nhận giáo viên Hóa THPT', 'Sở Giáo dục và Đào tạo Sóc Trăng', '/seed/qualification-evidence/dang-van-hung-su-pham-hoa.txt', 2, 5, '18:00', '20:00', '19:00', '21:00'),
  (21, 'seed.tutor21@lumin.local', 'Lâm Khánh Ngân', '0913000021', 'Phường Vị Thanh, Hậu Giang', 'GRADUATED', 3, 'BOTH', 'Phường Vị Thanh, Hậu Giang', 'VERIFIED', 4.58, 12, 'Ngữ Văn', 'Lớp 8', 150000, 'DEGREE', 'Bằng cử nhân Ngữ Văn', 'Trường Đại học Cần Thơ', '/seed/qualification-evidence/le-thanh-phong-luyen-thi-thpt.txt', 4, 6, '18:30', '20:30', '15:00', '17:00'),
  (22, 'seed.tutor22@lumin.local', 'Đinh Hải Đăng', '0913000022', 'Phường Ngã Bảy, Hậu Giang', 'UNIVERSITY_STUDENT', 2, 'ONLINE', 'Phường Ngã Bảy, Hậu Giang', 'VERIFIED', 4.50, 9, 'Vật lý', 'Lớp 10', 150000, 'STUDENT_CARD', 'Thẻ sinh viên ngành Kỹ thuật điện', 'Trường Đại học Cần Thơ', '/seed/qualification-evidence/hoang-anh-duc-student-card.txt', 1, 3, '19:00', '21:00', '19:30', '21:30'),
  (23, 'seed.tutor23@lumin.local', 'Tô Bảo Ngọc', '0913000023', 'Phường Trà Vinh, Vĩnh Long', 'LANGUAGE_CERTIFIED', 4, 'BOTH', 'Phường Trà Vinh, Vĩnh Long', 'VERIFIED', 4.72, 21, 'Tiếng Anh', 'Lớp 12', 210000, 'LANGUAGE_CERTIFICATE', 'Chứng chỉ C1 tiếng Anh', 'Cambridge Assessment English', '/seed/qualification-evidence/anna-taylor-tesol.txt', 2, 7, '18:00', '20:00', '08:00', '10:00'),
  (24, 'seed.tutor24@lumin.local', 'Dương Minh Đức', '0913000024', 'Phường Ninh Kiều, Thành phố Cần Thơ', 'GRADUATED', 5, 'BOTH', 'Phường Ninh Kiều, Thành phố Cần Thơ', 'VERIFIED', 4.76, 24, 'Tin học', 'Lập trình Python', 230000, 'DEGREE', 'Bằng kỹ sư Phần mềm', 'Trường Đại học FPT', '/seed/qualification-evidence/pham-quoc-bao-tin-hoc-ung-dung.txt', 3, 5, '18:30', '20:30', '18:00', '20:00'),
  (25, 'seed.tutor25@lumin.local', 'Kiều Anh Thư', '0913000025', 'Phường Cao Lãnh, Đồng Tháp', 'SCHOOL_TEACHER', 8, 'BOTH', 'Phường Cao Lãnh, Đồng Tháp', 'VERIFIED', 4.83, 34, 'Địa lý', 'Lớp 12', 180000, 'TEACHING_CERTIFICATE', 'Chứng nhận giáo viên Địa lý THPT', 'Sở Giáo dục và Đào tạo Đồng Tháp', '/seed/qualification-evidence/le-thanh-phong-luyen-thi-thpt.txt', 2, 6, '18:00', '20:00', '09:00', '11:00'),
  (26, 'seed.tutor26@lumin.local', 'Nguyễn Quang Huy', '0913000026', 'Phường Long Đức, Vĩnh Long', 'GRADUATED', 4, 'OFFLINE', 'Phường Long Đức, Vĩnh Long', 'VERIFIED', 4.57, 15, 'Lịch sử', 'Lớp 9', 150000, 'DEGREE', 'Bằng cử nhân Lịch sử', 'Trường Đại học Sư phạm TP.HCM', '/seed/qualification-evidence/le-thanh-phong-luyen-thi-thpt.txt', 3, 6, '18:30', '20:30', '14:00', '16:00'),
  (27, 'seed.tutor27@lumin.local', 'Hà Thanh Sơn', '0913000027', 'Phường Cái Răng, Thành phố Cần Thơ', 'SUBJECT_EXPERT', 6, 'BOTH', 'Phường Cái Răng, Thành phố Cần Thơ', 'VERIFIED', 4.74, 22, 'Toán', 'Lớp 6', 140000, 'OTHER', 'Chứng nhận dạy Toán tư duy THCS', 'Lumin Education', '/seed/qualification-evidence/le-thanh-phong-luyen-thi-thpt.txt', 1, 5, '18:00', '20:00', '18:30', '20:30'),
  (28, 'seed.tutor28@lumin.local', 'Mạc Phương Uyên', '0913000028', 'Phường Mỹ Tho, Tiền Giang', 'LANGUAGE_CERTIFIED', 3, 'ONLINE', 'Phường Mỹ Tho, Tiền Giang', 'VERIFIED', 4.69, 18, 'IELTS', 'Band 4.5-5.5', 250000, 'LANGUAGE_CERTIFICATE', 'IELTS Academic 7.5', 'IDP Education', '/seed/qualification-evidence/vu-hoang-my-ielts-8-5.txt', 4, 7, '19:00', '21:00', '09:00', '11:00'),
  (29, 'seed.tutor29@lumin.local', 'Vũ Hoài An', '0913000029', 'Phường Sa Đéc, Đồng Tháp', 'UNIVERSITY_STUDENT', 1, 'BOTH', 'Phường Sa Đéc, Đồng Tháp', 'PENDING_REVIEW', 0.00, 0, 'Toán', 'Lớp 7', 130000, 'STUDENT_CARD', 'Thẻ sinh viên Sư phạm Toán', 'Trường Đại học Đồng Tháp', '/seed/qualification-evidence/hoang-anh-duc-student-card.txt', 2, 5, '18:00', '20:00', '18:30', '20:30'),
  (30, 'seed.tutor30@lumin.local', 'Phạm Tuấn Kiệt', '0913000030', 'Phường Sóc Trăng, Sóc Trăng', 'OTHER', 1, 'ONLINE', 'Phường Sóc Trăng, Sóc Trăng', 'REJECTED', 0.00, 0, 'Tin học', 'Tin học cơ bản', 120000, 'OTHER', 'Minh chứng bổ sung chưa đạt', 'Tệp tải lên demo', '/seed/qualification-evidence/pham-quoc-bao-tin-hoc-ung-dung.txt', 3, 6, '19:00', '21:00', '14:00', '16:00');

INSERT INTO user_accounts (email, password_hash, role, full_name, phone, address, status)
SELECT
  email,
  '$2b$12$ZotsgBadmafrsVwkfwjBaODQpojhNXta4ifPvm.esQfP27U4jWaxW',
  'TUTOR',
  full_name,
  phone,
  address,
  'ACTIVE'
FROM _lumin_seed_tutors
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  phone = EXCLUDED.phone,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO tutor_profiles (
  account_id,
  bio,
  qualification_level,
  years_experience,
  teaching_mode,
  teaching_area,
  verification_status,
  average_rating,
  rating_count
)
SELECT
  ua.id,
  concat('Gia sư demo ', st.subject_name, ' ', st.grade_level, ' tại ', st.teaching_area, '.'),
  st.qualification_level,
  st.years_experience,
  st.teaching_mode,
  st.teaching_area,
  st.verification_status,
  st.average_rating,
  st.rating_count
FROM _lumin_seed_tutors st
JOIN user_accounts ua ON ua.email = st.email
ON CONFLICT (account_id) DO UPDATE SET
  bio = EXCLUDED.bio,
  qualification_level = EXCLUDED.qualification_level,
  years_experience = EXCLUDED.years_experience,
  teaching_mode = EXCLUDED.teaching_mode,
  teaching_area = EXCLUDED.teaching_area,
  verification_status = EXCLUDED.verification_status,
  average_rating = EXCLUDED.average_rating,
  rating_count = EXCLUDED.rating_count,
  updated_at = now();

WITH seeded_tutor_profiles AS (
  SELECT tp.id AS tutor_id
  FROM tutor_profiles tp
  JOIN user_accounts ua ON ua.id = tp.account_id
  JOIN _lumin_seed_tutors st ON st.email = ua.email
)
DELETE FROM tutor_availabilities ta
USING seeded_tutor_profiles stp
WHERE ta.tutor_id = stp.tutor_id;

WITH seeded_tutor_profiles AS (
  SELECT tp.id AS tutor_id
  FROM tutor_profiles tp
  JOIN user_accounts ua ON ua.id = tp.account_id
  JOIN _lumin_seed_tutors st ON st.email = ua.email
)
DELETE FROM tutor_qualifications tq
USING seeded_tutor_profiles stp
WHERE tq.tutor_id = stp.tutor_id;

WITH seeded_tutor_profiles AS (
  SELECT tp.id AS tutor_id
  FROM tutor_profiles tp
  JOIN user_accounts ua ON ua.id = tp.account_id
  JOIN _lumin_seed_tutors st ON st.email = ua.email
)
DELETE FROM tutor_subjects ts
USING seeded_tutor_profiles stp
WHERE ts.tutor_id = stp.tutor_id;

WITH staff AS (
  SELECT id
  FROM user_accounts
  WHERE role IN ('STAFF', 'SUPER_ADMIN')
  ORDER BY CASE WHEN role = 'STAFF' THEN 0 ELSE 1 END, id
  LIMIT 1
)
INSERT INTO tutor_subjects (
  tutor_id,
  subject_id,
  grade_level,
  fee_per_session,
  status,
  review_note,
  reviewed_by_account_id,
  reviewed_at
)
SELECT
  tp.id,
  subj.id,
  st.grade_level,
  st.fee_per_session,
  CASE
    WHEN st.verification_status = 'VERIFIED' THEN 'APPROVED'
    WHEN st.verification_status = 'REJECTED' THEN 'REJECTED'
    ELSE 'PENDING'
  END,
  CASE
    WHEN st.verification_status = 'VERIFIED' THEN 'Dữ liệu demo đã duyệt.'
    WHEN st.verification_status = 'REJECTED' THEN 'Dữ liệu demo bị từ chối để kiểm tra UI.'
    ELSE 'Dữ liệu demo đang chờ duyệt.'
  END,
  staff.id,
  CASE WHEN st.verification_status = 'VERIFIED' THEN now() ELSE NULL END
FROM _lumin_seed_tutors st
JOIN user_accounts ua ON ua.email = st.email
JOIN tutor_profiles tp ON tp.account_id = ua.id
JOIN subjects subj ON subj.name = st.subject_name
LEFT JOIN staff ON TRUE
ON CONFLICT (tutor_id, subject_id, grade_level) DO UPDATE SET
  fee_per_session = EXCLUDED.fee_per_session,
  status = EXCLUDED.status,
  review_note = EXCLUDED.review_note,
  reviewed_by_account_id = EXCLUDED.reviewed_by_account_id,
  reviewed_at = EXCLUDED.reviewed_at,
  updated_at = now();

WITH staff AS (
  SELECT id
  FROM user_accounts
  WHERE role IN ('STAFF', 'SUPER_ADMIN')
  ORDER BY CASE WHEN role = 'STAFF' THEN 0 ELSE 1 END, id
  LIMIT 1
)
INSERT INTO tutor_qualifications (
  tutor_id,
  type,
  title,
  issuer,
  file_url,
  status,
  review_note,
  reviewed_by_account_id,
  reviewed_at
)
SELECT
  tp.id,
  st.qual_type,
  st.qual_title,
  st.qual_issuer,
  st.file_url,
  CASE
    WHEN st.verification_status = 'VERIFIED' THEN 'APPROVED'
    WHEN st.verification_status = 'REJECTED' THEN 'REJECTED'
    ELSE 'PENDING'
  END,
  CASE
    WHEN st.verification_status = 'VERIFIED' THEN 'Minh chứng demo hợp lệ.'
    WHEN st.verification_status = 'REJECTED' THEN 'Minh chứng demo chưa phù hợp.'
    ELSE 'Minh chứng demo chờ kiểm duyệt.'
  END,
  staff.id,
  CASE WHEN st.verification_status = 'VERIFIED' THEN now() ELSE NULL END
FROM _lumin_seed_tutors st
JOIN user_accounts ua ON ua.email = st.email
JOIN tutor_profiles tp ON tp.account_id = ua.id
LEFT JOIN staff ON TRUE;

INSERT INTO tutor_availabilities (tutor_id, day_of_week, start_time, end_time, mode)
SELECT
  tp.id,
  slots.day_of_week,
  slots.start_time,
  slots.end_time,
  st.teaching_mode
FROM _lumin_seed_tutors st
JOIN user_accounts ua ON ua.email = st.email
JOIN tutor_profiles tp ON tp.account_id = ua.id
CROSS JOIN LATERAL (
  VALUES
    (st.day_one, st.start_one, st.end_one),
    (st.day_two, st.start_two, st.end_two)
) AS slots(day_of_week, start_time, end_time);

CREATE TEMP TABLE _lumin_seed_students (
  ordinal INT PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  birth_year INT NOT NULL,
  school TEXT NOT NULL,
  academic_level TEXT NOT NULL,
  learning_style TEXT NOT NULL,
  parent_notes TEXT,
  subject_name VARCHAR(100) NOT NULL,
  grade_level VARCHAR(100) NOT NULL,
  goal TEXT NOT NULL,
  budget_min NUMERIC(12, 2) NOT NULL,
  budget_max NUMERIC(12, 2) NOT NULL,
  preferred_mode VARCHAR(30) NOT NULL,
  preferred_learning_type VARCHAR(30) NOT NULL,
  preferred_area TEXT NOT NULL,
  day_one INT NOT NULL,
  day_two INT NOT NULL,
  start_one TIME NOT NULL,
  end_one TIME NOT NULL,
  start_two TIME NOT NULL,
  end_two TIME NOT NULL
) ON COMMIT DROP;

INSERT INTO _lumin_seed_students VALUES
  (1, 'seed.student01@lumin.local', 'Nguyễn Minh Khôi', '0902000001', 'Phường Trà Vinh, Vĩnh Long', 2008, 'THPT Trà Vinh', 'Lớp 12', 'Cần lộ trình rõ ràng, nhiều bài luyện đề.', 'Phụ huynh muốn theo dõi tiến độ hằng tuần.', 'Toán', 'Lớp 12', 'Ôn thi tốt nghiệp, mục tiêu 8+ môn Toán.', 150000, 250000, 'BOTH', 'BOTH', 'Phường Trà Vinh, Vĩnh Long', 2, 5, '19:00', '21:00', '18:30', '20:30'),
  (2, 'seed.student02@lumin.local', 'Trần Bảo Ngân', '0902000002', 'Phường Long Đức, Vĩnh Long', 2009, 'THPT Long Đức', 'Lớp 11', 'Học chậm, cần giải thích từng bước.', NULL, 'Vật lý', 'Lớp 11', 'Củng cố điện học và làm bài tập vận dụng.', 140000, 220000, 'OFFLINE', 'PRIVATE', 'Phường Long Đức, Vĩnh Long', 3, 7, '18:30', '20:30', '08:00', '10:00'),
  (3, 'seed.student03@lumin.local', 'Lê Gia Hân', '0902000003', 'Phường Nguyệt Hóa, Vĩnh Long', 2011, 'THCS Nguyệt Hóa', 'Lớp 9', 'Thích ví dụ ngắn và bài tập theo dạng.', 'Chuẩn bị thi vào lớp 10.', 'Tiếng Anh', 'Lớp 9', 'Tăng ngữ pháp và đọc hiểu để thi tuyển sinh.', 120000, 200000, 'BOTH', 'BOTH', 'Phường Nguyệt Hóa, Vĩnh Long', 2, 6, '19:00', '21:00', '14:00', '16:00'),
  (4, 'seed.student04@lumin.local', 'Phạm Tuấn Anh', '0902000004', 'Xã Càng Long, Vĩnh Long', 2008, 'THPT Càng Long', 'Lớp 12', 'Cần ôn theo chuyên đề, có bài kiểm tra ngắn.', NULL, 'Hóa học', 'Lớp 12', 'Luyện đề Hóa để xét tổ hợp khối B.', 160000, 240000, 'OFFLINE', 'BOTH', 'Xã Càng Long, Vĩnh Long', 4, 6, '18:00', '20:00', '09:00', '11:00'),
  (5, 'seed.student05@lumin.local', 'Võ Khánh Vy', '0902000005', 'Xã Châu Thành, Vĩnh Long', 2010, 'THCS Châu Thành', 'Lớp 10', 'Học tốt khi có ví dụ thực hành.', 'Muốn học online buổi tối.', 'Tin học', 'Python cơ bản', 'Học Python căn bản để làm bài tập trên lớp.', 150000, 230000, 'ONLINE', 'PRIVATE', 'Xã Châu Thành, Vĩnh Long', 1, 4, '20:00', '22:00', '19:00', '21:00'),
  (6, 'seed.student06@lumin.local', 'Đặng Gia Linh', '0902000006', 'Phường Ninh Kiều, Thành phố Cần Thơ', 2007, 'THPT Châu Văn Liêm', 'Lớp 12', 'Cần luyện speaking nhiều, phản hồi chi tiết.', NULL, 'IELTS', 'Band 5.5-6.5', 'Tăng IELTS từ 5.5 lên 6.5 trong 5 tháng.', 220000, 340000, 'BOTH', 'PRIVATE', 'Phường Ninh Kiều, Thành phố Cần Thơ', 3, 7, '19:00', '21:00', '09:00', '11:00'),
  (7, 'seed.student07@lumin.local', 'Bùi Nhật Hạ', '0902000007', 'Phường Cái Răng, Thành phố Cần Thơ', 2010, 'THCS Cái Răng', 'Lớp 10', 'Mất gốc Toán, cần học lại nền tảng.', 'Ưu tiên học trực tiếp gần nhà.', 'Toán', 'Lớp 10', 'Lấp lỗ hổng đại số và hình học lớp 10.', 120000, 180000, 'OFFLINE', 'PRIVATE', 'Phường Cái Răng, Thành phố Cần Thơ', 2, 6, '17:30', '19:30', '15:00', '17:00'),
  (8, 'seed.student08@lumin.local', 'Huỳnh Minh Châu', '0902000008', 'Phường Bình Thủy, Thành phố Cần Thơ', 2008, 'THPT Bình Thủy', 'Lớp 12', 'Cần đọc hiểu tác phẩm và viết dàn ý.', NULL, 'Ngữ Văn', 'Lớp 12', 'Ôn nghị luận văn học và xã hội cho kỳ thi tốt nghiệp.', 140000, 220000, 'BOTH', 'BOTH', 'Phường Bình Thủy, Thành phố Cần Thơ', 4, 7, '18:00', '20:00', '08:30', '10:30'),
  (9, 'seed.student09@lumin.local', 'Ngô Quốc Bảo', '0902000009', 'Phường Ô Môn, Thành phố Cần Thơ', 2008, 'THPT Ô Môn', 'Lớp 12', 'Cần sơ đồ tư duy và bài tập theo chương.', NULL, 'Sinh học', 'Lớp 12', 'Ôn sinh học khối B, tập trung di truyền học.', 130000, 210000, 'BOTH', 'PRIVATE', 'Phường Ô Môn, Thành phố Cần Thơ', 1, 5, '18:30', '20:30', '19:00', '21:00'),
  (10, 'seed.student10@lumin.local', 'Lý Như Ý', '0902000010', 'Phường Thốt Nốt, Thành phố Cần Thơ', 2008, 'THPT Thốt Nốt', 'Lớp 12', 'Học tốt qua bản đồ và câu hỏi ngắn.', 'Cần ôn cấp tốc trong 3 tháng.', 'Địa lý', 'Lớp 12', 'Ôn Atlat và kỹ năng làm câu hỏi vận dụng.', 110000, 180000, 'ONLINE', 'BOTH', 'Phường Thốt Nốt, Thành phố Cần Thơ', 2, 4, '20:00', '22:00', '20:00', '22:00'),
  (11, 'seed.student11@lumin.local', 'Cao Hoàng Phúc', '0902000011', 'Phường Cao Lãnh, Đồng Tháp', 2008, 'THPT Cao Lãnh', 'Lớp 12', 'Cần đề luyện thi và chữa lỗi sai.', NULL, 'Toán', 'Luyện thi THPT', 'Luyện đề Toán nâng điểm từ 6.5 lên 8.', 180000, 280000, 'BOTH', 'PRIVATE', 'Phường Cao Lãnh, Đồng Tháp', 3, 6, '18:00', '20:00', '08:00', '10:00'),
  (12, 'seed.student12@lumin.local', 'Mai Anh Thư', '0902000012', 'Phường Sa Đéc, Đồng Tháp', 2010, 'THPT Sa Đéc', 'Lớp 10', 'Cần kèm sát bài tập về nhà.', 'Phụ huynh ưu tiên gia sư nữ.', 'Hóa học', 'Lớp 10', 'Nắm lại mol, phản ứng và cân bằng phương trình.', 120000, 180000, 'OFFLINE', 'PRIVATE', 'Phường Sa Đéc, Đồng Tháp', 2, 5, '18:00', '20:00', '18:30', '20:30'),
  (13, 'seed.student13@lumin.local', 'Tạ Minh Đức', '0902000013', 'Thành phố Hồng Ngự, Đồng Tháp', 2011, 'THCS Hồng Ngự', 'Lớp 8', 'Thích học qua ví dụ thực hành máy tính.', NULL, 'Tin học', 'Tin học văn phòng', 'Học Word, Excel và tư duy tin học cơ bản.', 100000, 160000, 'ONLINE', 'GROUP', 'Thành phố Hồng Ngự, Đồng Tháp', 1, 3, '19:00', '21:00', '20:00', '22:00'),
  (14, 'seed.student14@lumin.local', 'Đỗ Khánh An', '0902000014', 'Phường Long Xuyên, An Giang', 2008, 'THPT Long Xuyên', 'Lớp 12', 'Cần tóm tắt công thức và bài vận dụng.', NULL, 'Vật lý', 'Lớp 12', 'Ôn dao động, sóng và điện xoay chiều.', 150000, 240000, 'BOTH', 'PRIVATE', 'Phường Long Xuyên, An Giang', 4, 7, '18:30', '20:30', '08:30', '10:30'),
  (15, 'seed.student15@lumin.local', 'Châu Gia Mẫn', '0902000015', 'Phường Châu Đốc, An Giang', 2009, 'THPT Châu Đốc', 'Lớp 11', 'Muốn luyện nghe nói tự nhiên.', 'Ưu tiên học nhóm nhỏ.', 'Tiếng Anh', 'Giao tiếp', 'Tăng phản xạ giao tiếp và phát âm.', 130000, 210000, 'BOTH', 'GROUP', 'Phường Châu Đốc, An Giang', 2, 6, '19:00', '21:00', '09:00', '11:00'),
  (16, 'seed.student16@lumin.local', 'Hồ Thanh Tùng', '0902000016', 'Phường Bến Tre, Bến Tre', 2008, 'THPT Bến Tre', 'Lớp 12', 'Cần timeline sự kiện và cách nhớ nhanh.', NULL, 'Lịch sử', 'Lớp 12', 'Ôn lịch sử Việt Nam giai đoạn hiện đại.', 110000, 180000, 'BOTH', 'BOTH', 'Phường Bến Tre, Bến Tre', 3, 5, '18:00', '20:00', '18:30', '20:30'),
  (17, 'seed.student17@lumin.local', 'Nguyễn Kim Ngân', '0902000017', 'Xã Châu Thành, Bến Tre', 2010, 'THCS Châu Thành', 'Lớp 10', 'Học chắc khi có sơ đồ và hình minh họa.', 'Cần học trực tiếp cuối tuần.', 'Sinh học', 'Lớp 10', 'Củng cố tế bào học và chuyển hóa vật chất.', 110000, 170000, 'OFFLINE', 'PRIVATE', 'Xã Châu Thành, Bến Tre', 2, 4, '18:00', '20:00', '19:00', '21:00'),
  (18, 'seed.student18@lumin.local', 'Trương Minh Khang', '0902000018', 'Phường Mỹ Tho, Tiền Giang', 2011, 'THCS Mỹ Tho', 'Lớp 9', 'Cần học chắc công thức và dạng bài.', NULL, 'Toán', 'Lớp 9', 'Ôn thi tuyển sinh lớp 10 môn Toán.', 130000, 200000, 'BOTH', 'PRIVATE', 'Phường Mỹ Tho, Tiền Giang', 1, 6, '18:00', '20:00', '09:00', '11:00'),
  (19, 'seed.student19@lumin.local', 'Phan Tú Anh', '0902000019', 'Phường Cai Lậy, Tiền Giang', 2007, 'THPT Cai Lậy', 'Lớp 12', 'Cần chữa bài writing chi tiết.', NULL, 'IELTS', 'Band 6.5-7.5', 'Tăng IELTS Writing từ 6.0 lên 7.0.', 240000, 360000, 'ONLINE', 'PRIVATE', 'Phường Cai Lậy, Tiền Giang', 3, 7, '20:00', '22:00', '10:00', '12:00'),
  (20, 'seed.student20@lumin.local', 'Vương Gia Huy', '0902000020', 'Phường Sóc Trăng, Sóc Trăng', 2008, 'THPT Sóc Trăng', 'Lớp 12', 'Cần luyện đề theo chủ đề khó.', 'Mục tiêu xét khối A.', 'Hóa học', 'Luyện thi THPT', 'Luyện đề Hóa học mức 8 điểm trở lên.', 170000, 260000, 'BOTH', 'BOTH', 'Phường Sóc Trăng, Sóc Trăng', 2, 5, '18:00', '20:00', '19:00', '21:00'),
  (21, 'seed.student21@lumin.local', 'Lâm Nhật Vy', '0902000021', 'Phường Vị Thanh, Hậu Giang', 2012, 'THCS Vị Thanh', 'Lớp 8', 'Cần đọc hiểu và viết đoạn ngắn.', NULL, 'Ngữ Văn', 'Lớp 8', 'Cải thiện kỹ năng viết đoạn văn nghị luận.', 100000, 160000, 'BOTH', 'GROUP', 'Phường Vị Thanh, Hậu Giang', 4, 6, '18:30', '20:30', '15:00', '17:00'),
  (22, 'seed.student22@lumin.local', 'Đinh Quốc Hưng', '0902000022', 'Phường Ngã Bảy, Hậu Giang', 2010, 'THPT Ngã Bảy', 'Lớp 10', 'Mất căn bản công thức vật lý.', NULL, 'Vật lý', 'Lớp 10', 'Học lại động học, lực và năng lượng.', 110000, 170000, 'ONLINE', 'PRIVATE', 'Phường Ngã Bảy, Hậu Giang', 1, 3, '19:00', '21:00', '19:30', '21:30'),
  (23, 'seed.student23@lumin.local', 'Tô Minh Trang', '0902000023', 'Phường Trà Vinh, Vĩnh Long', 2008, 'THPT Trà Vinh', 'Lớp 12', 'Cần ôn ngữ pháp và đọc hiểu.', 'Ưu tiên gia sư cùng khu vực.', 'Tiếng Anh', 'Lớp 12', 'Ôn thi tốt nghiệp môn Tiếng Anh.', 150000, 240000, 'BOTH', 'BOTH', 'Phường Trà Vinh, Vĩnh Long', 2, 7, '18:00', '20:00', '08:00', '10:00'),
  (24, 'seed.student24@lumin.local', 'Dương Bảo Long', '0902000024', 'Phường Ninh Kiều, Thành phố Cần Thơ', 2009, 'THPT Châu Văn Liêm', 'Lớp 11', 'Thích học qua dự án nhỏ.', NULL, 'Tin học', 'Lập trình Python', 'Học Python để làm bài tập và mini project.', 170000, 260000, 'BOTH', 'PRIVATE', 'Phường Ninh Kiều, Thành phố Cần Thơ', 3, 5, '18:30', '20:30', '18:00', '20:00'),
  (25, 'seed.student25@lumin.local', 'Kiều Ngọc Mai', '0902000025', 'Phường Cao Lãnh, Đồng Tháp', 2008, 'THPT Cao Lãnh', 'Lớp 12', 'Cần học theo Atlat và bảng so sánh.', NULL, 'Địa lý', 'Lớp 12', 'Ôn kỹ năng Atlat và nhận xét biểu đồ.', 110000, 190000, 'BOTH', 'GROUP', 'Phường Cao Lãnh, Đồng Tháp', 2, 6, '18:00', '20:00', '09:00', '11:00'),
  (26, 'seed.student26@lumin.local', 'Nguyễn Hải Nam', '0902000026', 'Phường Long Đức, Vĩnh Long', 2011, 'THCS Long Đức', 'Lớp 9', 'Cần kể chuyện lịch sử dễ nhớ.', NULL, 'Lịch sử', 'Lớp 9', 'Ôn lịch sử lớp 9 và kỹ năng trả lời tự luận.', 100000, 150000, 'OFFLINE', 'GROUP', 'Phường Long Đức, Vĩnh Long', 3, 6, '18:30', '20:30', '14:00', '16:00'),
  (27, 'seed.student27@lumin.local', 'Hà Gia Bảo', '0902000027', 'Phường Cái Răng, Thành phố Cần Thơ', 2013, 'THCS Cái Răng', 'Lớp 6', 'Cần học Toán tư duy nhẹ nhàng.', 'Phụ huynh muốn lớp học ít áp lực.', 'Toán', 'Lớp 6', 'Củng cố số học và hình học lớp 6.', 90000, 150000, 'BOTH', 'GROUP', 'Phường Cái Răng, Thành phố Cần Thơ', 1, 5, '18:00', '20:00', '18:30', '20:30'),
  (28, 'seed.student28@lumin.local', 'Mạc Thu Hà', '0902000028', 'Phường Mỹ Tho, Tiền Giang', 2008, 'THPT Mỹ Tho', 'Lớp 12', 'Cần học chắc từ vựng và speaking.', NULL, 'IELTS', 'Band 4.5-5.5', 'Xây nền IELTS từ 4.5 lên 5.5.', 180000, 280000, 'ONLINE', 'PRIVATE', 'Phường Mỹ Tho, Tiền Giang', 4, 7, '19:00', '21:00', '09:00', '11:00'),
  (29, 'seed.student29@lumin.local', 'Vũ Khánh Duy', '0902000029', 'Phường Sa Đéc, Đồng Tháp', 2012, 'THCS Sa Đéc', 'Lớp 7', 'Cần học lại phân số và phương trình cơ bản.', NULL, 'Toán', 'Lớp 7', 'Củng cố Toán lớp 7 để theo kịp trên lớp.', 90000, 150000, 'BOTH', 'PRIVATE', 'Phường Sa Đéc, Đồng Tháp', 2, 5, '18:00', '20:00', '18:30', '20:30'),
  (30, 'seed.student30@lumin.local', 'Phạm Minh Nhật', '0902000030', 'Phường Sóc Trăng, Sóc Trăng', 2011, 'THCS Sóc Trăng', 'Lớp 8', 'Học tốt khi có bài thực hành từng bước.', 'Muốn học online cuối tuần.', 'Tin học', 'Tin học cơ bản', 'Làm quen máy tính, Word, Excel và tư duy thuật toán.', 90000, 150000, 'ONLINE', 'GROUP', 'Phường Sóc Trăng, Sóc Trăng', 3, 6, '19:00', '21:00', '14:00', '16:00');

INSERT INTO user_accounts (
  email,
  password_hash,
  role,
  full_name,
  phone,
  address,
  birth_year,
  status,
  school,
  academic_level,
  learning_style,
  parent_notes
)
SELECT
  email,
  '$2b$12$4u4CUjaWMKoqhSODQBuCVOXUC.S5prv.0slhkrLollspXxenLLRLq',
  'STUDENT',
  full_name,
  phone,
  address,
  birth_year,
  'ACTIVE',
  school,
  academic_level,
  learning_style,
  parent_notes
FROM _lumin_seed_students
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  phone = EXCLUDED.phone,
  address = EXCLUDED.address,
  birth_year = EXCLUDED.birth_year,
  status = EXCLUDED.status,
  school = EXCLUDED.school,
  academic_level = EXCLUDED.academic_level,
  learning_style = EXCLUDED.learning_style,
  parent_notes = EXCLUDED.parent_notes,
  updated_at = now();

WITH seeded_students AS (
  SELECT ua.id AS student_account_id
  FROM user_accounts ua
  JOIN _lumin_seed_students st ON st.email = ua.email
)
DELETE FROM learning_need_schedules lns
USING learning_needs ln, seeded_students ss
WHERE lns.learning_need_id = ln.id
  AND ln.student_account_id = ss.student_account_id
  AND ln.raw_text LIKE 'extra-seed-v1:%';

WITH seeded_students AS (
  SELECT ua.id AS student_account_id
  FROM user_accounts ua
  JOIN _lumin_seed_students st ON st.email = ua.email
)
DELETE FROM learning_needs ln
USING seeded_students ss
WHERE ln.student_account_id = ss.student_account_id
  AND ln.raw_text LIKE 'extra-seed-v1:%';

INSERT INTO learning_needs (
  student_account_id,
  subject_id,
  grade_level,
  goal,
  budget_per_session_min,
  budget_per_session_max,
  preferred_mode,
  preferred_learning_type,
  preferred_area,
  raw_text,
  parsed_data,
  parser_source,
  parsed_confidence,
  status
)
SELECT
  ua.id,
  subj.id,
  st.grade_level,
  st.goal,
  st.budget_min,
  st.budget_max,
  st.preferred_mode,
  st.preferred_learning_type,
  st.preferred_area,
  concat('extra-seed-v1:', st.email, ':', st.subject_name),
  json_build_object(
    'source', 'extra_demo_accounts.sql',
    'subject', st.subject_name,
    'grade_level', st.grade_level,
    'preferred_area', st.preferred_area
  )::text,
  'FORM',
  0.920,
  'ACTIVE'
FROM _lumin_seed_students st
JOIN user_accounts ua ON ua.email = st.email
JOIN subjects subj ON subj.name = st.subject_name;

INSERT INTO learning_need_schedules (
  learning_need_id,
  day_of_week,
  start_time,
  end_time,
  time_slot
)
SELECT
  ln.id,
  slots.day_of_week,
  slots.start_time,
  slots.end_time,
  NULL
FROM _lumin_seed_students st
JOIN user_accounts ua ON ua.email = st.email
JOIN learning_needs ln
  ON ln.student_account_id = ua.id
 AND ln.raw_text = concat('extra-seed-v1:', st.email, ':', st.subject_name)
CROSS JOIN LATERAL (
  VALUES
    (st.day_one, st.start_one, st.end_one),
    (st.day_two, st.start_two, st.end_two)
) AS slots(day_of_week, start_time, end_time);

COMMIT;

-- Quick verification.
SELECT role, count(*) AS seeded_accounts
FROM user_accounts
WHERE email LIKE 'seed.%@lumin.local'
GROUP BY role
ORDER BY role;

SELECT
  count(*) FILTER (WHERE tp.verification_status = 'VERIFIED') AS verified_tutors,
  count(*) FILTER (WHERE tp.verification_status = 'PENDING_REVIEW') AS pending_tutors,
  count(*) FILTER (WHERE tp.verification_status = 'REJECTED') AS rejected_tutors
FROM tutor_profiles tp
JOIN user_accounts ua ON ua.id = tp.account_id
WHERE ua.email LIKE 'seed.tutor%@lumin.local';

SELECT count(*) AS active_seed_learning_needs
FROM learning_needs
WHERE raw_text LIKE 'extra-seed-v1:%'
  AND status = 'ACTIVE';
