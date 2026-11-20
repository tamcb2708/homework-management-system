# ERD – Homework Management System

> **DRAFT – soạn sớm theo yêu cầu, chờ duyệt ở Phase 2.** Định nghĩa cột và ràng buộc đầy đủ: [database-design.md](./database-design.md).
> Để dễ đọc, ERD được tách theo miền. Mọi thực thể trong tenant đều có `tenant_id` và **khóa ngoại kép** `(tenant_id, …)`; sơ đồ chỉ ghi các cột chính.

---

## 1. Nền tảng & tenant

```mermaid
erDiagram
  TENANTS ||--|| TENANT_SETTINGS : "cấu hình"
  TENANTS ||--o{ USERS : "sở hữu"
  TENANTS ||--o{ ROLES : "có"
  PLATFORM_USERS ||--o{ PLATFORM_SESSIONS : "đăng nhập"
  PLATFORM_USERS ||--o{ PLATFORM_AUDIT_LOGS : "thực hiện"
  TENANTS ||--o{ PLATFORM_AUDIT_LOGS : "là đối tượng"
  PERMISSIONS ||--o{ ROLE_PERMISSIONS : "được gán"
  ROLES ||--o{ ROLE_PERMISSIONS : "gồm"

  TENANTS {
    uuid id PK
    citext slug UK
    text name
    enum status
    text timezone
  }
  TENANT_SETTINGS {
    uuid tenant_id PK
    bool ai_enabled
    bigint ai_monthly_limit_micros
    text ai_approval_ref
    bigint file_max_bytes
  }
  PLATFORM_USERS {
    uuid id PK
    citext email UK
    bool mfa_enabled
    enum status
  }
  PLATFORM_SESSIONS {
    uuid id PK
    uuid platform_user_id FK
  }
  PLATFORM_AUDIT_LOGS {
    uuid id PK
    uuid actor_platform_user_id FK
    uuid target_tenant_id FK
    text action
  }
  PERMISSIONS {
    text code PK
    bool is_platform
  }
  ROLES {
    uuid id PK
    uuid tenant_id FK
    text code
    bool is_system
  }
  ROLE_PERMISSIONS {
    uuid role_id PK
    text permission_code PK
  }
  USERS {
    uuid id PK
    uuid tenant_id FK
  }
```

`AI_MODEL_PRICING` và `PLATFORM_SETTINGS` là bảng độc lập của nền tảng (không có quan hệ khóa ngoại).

## 2. Danh tính trong tenant

```mermaid
erDiagram
  USERS ||--o{ USER_ROLES : "có"
  ROLES ||--o{ USER_ROLES : "gán cho"
  USERS ||--o{ AUTH_SESSIONS : "phiên"
  USERS ||--o| STUDENTS : "hồ sơ HS"
  USERS ||--o| TEACHERS : "hồ sơ GV"
  USERS ||--o{ IMPORT_JOBS : "tạo"

  USERS {
    uuid id PK
    uuid tenant_id FK
    citext username "UK theo tenant"
    citext email "UK theo tenant, NULL được"
    text password_hash
    enum status
    bool must_change_password
    int authz_version
  }
  USER_ROLES {
    uuid user_id PK
    uuid role_id PK
    uuid tenant_id FK
  }
  ROLES {
    uuid id PK
    uuid tenant_id FK
    text code
  }
  AUTH_SESSIONS {
    uuid id PK
    uuid tenant_id FK
    uuid user_id FK
    uuid family_id
    bytea refresh_token_hash UK
    enum client_type
  }
  STUDENTS {
    uuid user_id PK
    uuid tenant_id FK
    citext student_code "UK theo tenant"
  }
  TEACHERS {
    uuid user_id PK
    uuid tenant_id FK
    citext teacher_code "UK theo tenant"
  }
  IMPORT_JOBS {
    uuid id PK
    uuid tenant_id FK
    uuid result_file_id FK
    timestamptz result_downloaded_at
  }
```

## 3. Học vụ

```mermaid
erDiagram
  SCHOOL_YEARS ||--o{ SEMESTERS : "chia"
  SCHOOL_YEARS ||--o{ CLASSES : "gồm"
  CLASSES ||--o{ CLASS_STUDENTS : "ghi danh"
  STUDENTS ||--o{ CLASS_STUDENTS : "thuộc"
  CLASSES ||--o{ CLASS_TEACHERS : "phân công"
  TEACHERS ||--o{ CLASS_TEACHERS : "dạy"
  SUBJECTS ||--o{ CLASS_TEACHERS : "môn"
  SEMESTERS |o--o{ CLASS_TEACHERS : "học kỳ (NULL = cả năm)"
  TEACHERS |o--o{ CLASSES : "chủ nhiệm"

  SCHOOL_YEARS {
    uuid id PK
    uuid tenant_id FK
    text name
    bool is_current
  }
  SEMESTERS {
    uuid id PK
    uuid school_year_id FK
    int ordinal
  }
  SUBJECTS {
    uuid id PK
    uuid tenant_id FK
    citext code "UK theo tenant"
  }
  CLASSES {
    uuid id PK
    uuid school_year_id FK
    citext code "UK theo tenant + năm học"
    smallint grade_level
  }
  CLASS_STUDENTS {
    uuid id PK
    uuid class_id FK
    uuid student_id FK
    timestamptz joined_at
    timestamptz left_at
  }
  CLASS_TEACHERS {
    uuid id PK
    uuid class_id FK
    uuid teacher_id FK
    uuid subject_id FK
    uuid semester_id FK
    timestamptz unassigned_at
  }
  STUDENTS {
    uuid user_id PK
  }
  TEACHERS {
    uuid user_id PK
  }
```

## 4. Bài tập, câu hỏi, rubric, file

```mermaid
erDiagram
  SUBJECTS ||--o{ ASSIGNMENTS : "thuộc môn"
  TEACHERS ||--o{ ASSIGNMENTS : "sở hữu"
  ASSIGNMENTS ||--o{ ASSIGNMENT_TARGETS : "giao cho"
  CLASSES |o--o{ ASSIGNMENT_TARGETS : "CLASS"
  STUDENTS |o--o{ ASSIGNMENT_TARGETS : "STUDENT"
  ASSIGNMENTS ||--o{ ASSIGNMENT_ATTACHMENTS : "đính kèm"
  ASSIGNMENTS ||--o{ QUESTIONS : "gồm"
  QUESTIONS ||--o{ QUESTION_OPTIONS : "lựa chọn"
  QUESTIONS ||--o{ QUESTION_ATTACHMENTS : "media"
  QUESTIONS |o--o{ QUESTIONS : "source_question_id"
  GRADING_RUBRICS |o--o{ QUESTIONS : "chấm theo"
  GRADING_RUBRICS ||--o{ RUBRIC_CRITERIA : "tiêu chí"
  GRADING_RUBRICS |o--o| GRADING_RUBRICS : "previous_version"
  FILES ||--o{ ASSIGNMENT_ATTACHMENTS : ""
  FILES ||--o{ QUESTION_ATTACHMENTS : ""

  ASSIGNMENTS {
    uuid id PK
    uuid tenant_id FK
    uuid subject_id FK
    uuid owner_teacher_id FK
    enum status
    timestamptz open_at
    timestamptz due_at
    timestamptz late_until
    bool allow_resubmit "default false"
    smallint max_attempts
    enum grading_policy "LATEST | HIGHEST"
    numeric max_score
    numeric pass_score
    enum answer_visibility
    bool ai_grading_allowed
    bool ai_feedback_visible "default false"
  }
  ASSIGNMENT_TARGETS {
    uuid id PK
    uuid assignment_id FK
    enum target_type "CLASS | STUDENT | GROUP"
    uuid class_id FK
    uuid student_id FK
    uuid group_id "dành cho tương lai"
  }
  ASSIGNMENT_ATTACHMENTS {
    uuid id PK
    uuid assignment_id FK
    uuid file_id FK
  }
  QUESTIONS {
    uuid id PK
    uuid assignment_id FK
    int ordinal
    enum type
    numeric points
    jsonb config "bí mật với HS"
    jsonb reference_answer "bí mật với HS"
    uuid rubric_id FK
    uuid source_question_id FK
  }
  QUESTION_OPTIONS {
    uuid id PK
    uuid question_id FK
    bool is_correct "bí mật với HS"
  }
  QUESTION_ATTACHMENTS {
    uuid id PK
    uuid question_id FK
    uuid file_id FK
  }
  GRADING_RUBRICS {
    uuid id PK
    int version
    uuid previous_version_id FK
    timestamptz locked_at
  }
  RUBRIC_CRITERIA {
    uuid id PK
    uuid rubric_id FK
    numeric max_points
  }
  FILES {
    uuid id PK
    uuid tenant_id FK
    text storage_key UK
    enum purpose
    enum status
  }
```

## 5. Bài nộp & chấm điểm

```mermaid
erDiagram
  ASSIGNMENTS ||--o{ SUBMISSIONS : "nhận"
  STUDENTS ||--o{ SUBMISSIONS : "làm"
  SUBMISSIONS ||--o{ SUBMISSION_VERSIONS : "các lần nộp"
  SUBMISSIONS ||--o{ SUBMISSION_ANSWERS : "nháp + đã nộp"
  SUBMISSION_VERSIONS |o--o{ SUBMISSION_ANSWERS : "version_id (NULL = nháp)"
  SUBMISSIONS ||--o{ SUBMISSION_ATTACHMENTS : "file"
  SUBMISSION_VERSIONS |o--o{ SUBMISSION_ATTACHMENTS : ""
  QUESTIONS ||--o{ SUBMISSION_ANSWERS : "trả lời"
  SUBMISSION_VERSIONS ||--|| GRADES : "điểm của phiên bản"
  SUBMISSIONS |o--o| GRADES : "effective_grade_id"
  GRADES ||--o{ GRADE_DETAILS : "từng câu"
  QUESTIONS ||--o{ GRADE_DETAILS : ""
  GRADE_DETAILS ||--o{ GRADE_DETAIL_CRITERIA : "theo tiêu chí"
  RUBRIC_CRITERIA ||--o{ GRADE_DETAIL_CRITERIA : ""
  GRADES ||--o{ GRADE_HISTORY : "lịch sử"
  GRADE_DETAILS |o--o{ GRADE_HISTORY : ""

  SUBMISSIONS {
    uuid id PK
    uuid assignment_id FK "UK cùng student_id"
    uuid student_id FK
    enum status
    int draft_revision
    smallint attempt_count
    uuid latest_version_id FK
    uuid effective_grade_id FK
  }
  SUBMISSION_VERSIONS {
    uuid id PK "bất biến"
    uuid submission_id FK
    smallint version_no "UK theo submission"
    timestamptz submitted_at
    bool is_late
    enum source
    text idempotency_key "UK theo submission"
  }
  SUBMISSION_ANSWERS {
    uuid id PK
    uuid submission_id FK
    uuid version_id FK "NULL = nháp"
    uuid question_id FK
    jsonb answer
    text answer_text
  }
  SUBMISSION_ATTACHMENTS {
    uuid id PK
    uuid version_id FK
    uuid file_id FK
  }
  GRADES {
    uuid id PK
    uuid submission_version_id FK "UK"
    enum status
    numeric max_score "snapshot"
    numeric earned_score
    text ai_feedback_approved
    timestamptz published_at
  }
  GRADE_DETAILS {
    uuid id PK
    uuid grade_id FK
    uuid question_id FK
    enum status
    enum source "AUTO | TEACHER"
    numeric max_score
    numeric earned_score "chỉ điểm chính thức"
    uuid accepted_ai_result_id FK
  }
  GRADE_DETAIL_CRITERIA {
    uuid id PK
    uuid grade_detail_id FK
    uuid rubric_criterion_id FK
    numeric earned_score
  }
  GRADE_HISTORY {
    uuid id PK "bất biến"
    uuid grade_id FK
    enum change_type
    numeric old_score
    numeric new_score
    text reason
    uuid changed_by FK
  }
```

## 6. AI grading & ngân sách

```mermaid
erDiagram
  ASSIGNMENTS ||--o{ AI_GRADING_REQUESTS : "kích hoạt cho"
  USERS ||--o{ AI_GRADING_REQUESTS : "GV kích hoạt"
  AI_GRADING_REQUESTS ||--o{ AI_GRADING_JOBS : "gồm"
  SUBMISSION_VERSIONS ||--o{ AI_GRADING_JOBS : ""
  GRADE_DETAILS ||--o{ AI_GRADING_JOBS : ""
  AI_GRADING_JOBS ||--o{ AI_GRADING_RESULTS : "mỗi lần gọi"
  GRADE_DETAILS |o--o| AI_GRADING_RESULTS : "accepted_ai_result_id"
  AI_BUDGET_PERIODS ||--o{ AI_USAGE_LEDGER : "bút toán"
  AI_GRADING_REQUESTS |o--o{ AI_USAGE_LEDGER : ""
  AI_GRADING_JOBS |o--o{ AI_USAGE_LEDGER : ""

  AI_GRADING_REQUESTS {
    uuid id PK
    uuid tenant_id FK
    uuid requested_by FK
    bigint estimated_cost_micros
    bigint reserved_micros
    enum status
  }
  AI_GRADING_JOBS {
    uuid id PK
    uuid request_id FK
    uuid submission_version_id FK
    uuid grade_detail_id FK
    enum status
    text idempotency_key UK
    text model
    text prompt_version
    bigint actual_cost_micros
  }
  AI_GRADING_RESULTS {
    uuid id PK
    uuid job_id FK
    bool is_valid
    numeric suggested_score "đề xuất, không chính thức"
    numeric confidence
    jsonb criteria
    int input_tokens
    int output_tokens
    bigint cost_micros
    jsonb redaction_summary
    jsonb raw_response "xóa theo retention"
  }
  AI_BUDGET_PERIODS {
    uuid id PK
    uuid tenant_id FK
    date period_start "UK theo tenant"
    bigint limit_micros
    bigint reserved_micros
    bigint spent_micros
  }
  AI_USAGE_LEDGER {
    uuid id PK "bất biến"
    uuid period_id FK
    enum entry_type "RESERVE | COMMIT | RELEASE | ADJUST"
    bigint amount_micros
  }
```

## 7. Thông báo, audit, outbox

```mermaid
erDiagram
  USERS ||--o{ NOTIFICATIONS : "nhận"
  USERS |o--o{ AUDIT_LOGS : "thực hiện"
  TENANTS ||--o{ OUTBOX_EVENTS : "phát sinh"

  NOTIFICATIONS {
    uuid id PK
    uuid tenant_id FK
    uuid user_id FK
    enum type
    text dedupe_key "UK theo tenant"
    timestamptz read_at
  }
  AUDIT_LOGS {
    uuid id PK "bất biến"
    uuid tenant_id FK
    enum actor_type
    uuid actor_user_id FK
    text action
    text resource_type
    uuid resource_id
    bool is_sensitive
    text reason
  }
  OUTBOX_EVENTS {
    uuid id PK
    uuid tenant_id FK
    text event_type
    timestamptz processed_at
  }
```

---

## 8. Giải thích các quan hệ quan trọng

1. **Tenant → mọi thứ.** Mọi thực thể nghiệp vụ thuộc một tenant. Khóa ngoại kép `(tenant_id, x_id) → x(tenant_id, id)` khiến DB từ chối mọi liên kết chéo tenant, kể cả khi lớp ứng dụng có lỗi. RLS chặn đọc/ghi ngoài tenant context.
2. **User – Student/Teacher (1–0..1).** `users` giữ danh tính đăng nhập; `students`/`teachers` giữ hồ sơ nghiệp vụ. Một user có thể vừa là GV vừa là School Admin (qua `user_roles`). Mã HS là username, duy nhất trong tenant (D4).
3. **Phân công là bộ ba (lớp, GV, môn) [+ học kỳ].** Quyền của GV với bài tập/bài nộp suy ra từ `class_teachers` đang hiệu lực, **không** từ việc GV đã tạo bài. Vì vậy gỡ phân công thì mất quyền ngay (BR-03).
4. **Đối tượng nhận bài là đa hình có kiểm soát.** `assignment_targets` dùng `target_type` + cột khóa ngoại tương ứng (không dùng "polymorphic id" không có FK), nên vẫn có toàn vẹn tham chiếu. `GROUP` được dành sẵn cho D12.
5. **Submission (1 HS × 1 bài) → nhiều phiên bản bất biến.** Bản nháp là các dòng `submission_answers` có `version_id = NULL`. Khi nộp, nháp được sao chép thành dòng gắn phiên bản mới, không ghi đè (D6.2).
6. **Mỗi phiên bản có một bản ghi điểm (`grades`).** Điểm hiệu lực của submission là `effective_grade_id`, được tính theo `grading_policy` (`LATEST` – D6.1; `HIGHEST` – D6.4) mỗi khi công bố. `max_score`/`earned_score` được lưu ở cả mức bài và mức câu, với `max_score` là snapshot (D5.2).
7. **Điểm AI tách khỏi điểm chính thức.** `ai_grading_results.suggested_score` không bao giờ được ghi vào `grade_details.earned_score`. Chỉ khi GV chấp nhận/sửa mới tạo điểm nguồn `TEACHER` và lưu liên kết `accepted_ai_result_id` để truy vết (D9.2).
8. **Lịch sử điểm append-only.** Mọi thay đổi điểm/nhận xét tạo một dòng `grade_history` (D7.3).
9. **Rubric có version.** Câu hỏi trỏ tới một version rubric cụ thể. Rubric đã dùng để chấm thì bị khóa, sửa sẽ tạo version mới, nên điểm theo tiêu chí cũ vẫn diễn giải được.
10. **Ngân sách AI theo kỳ + sổ cái.** `ai_budget_periods` giữ số dư (đặt trước atomic), `ai_usage_ledger` giữ mọi bút toán để đối soát (D11.6, D11.8).
11. **Files là bảng trung tâm.** Mọi đính kèm tham chiếu `files`. Quyền tải file được suy ra từ bản ghi chủ (bài tập/câu hỏi/bài nộp), không từ bản thân file.
