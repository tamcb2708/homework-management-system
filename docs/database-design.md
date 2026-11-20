# Database Design – Homework Management System

> **DRAFT – soạn sớm theo yêu cầu, chờ duyệt ở Phase 2.** Sơ đồ quan hệ: [erd.md](./erd.md). Cơ chế cô lập tenant: [architecture.md §3](./architecture.md#3-multi-tenancy).
> Đây là thiết kế logic. Schema Prisma và migration sẽ được viết ở Phase 3 sau khi bản này được duyệt (quy tắc: không đổi schema mà không có migration).

---

## 1. Quy ước

| Hạng mục | Quy ước |
|---|---|
| DBMS | PostgreSQL 16, extension `citext` (so sánh không phân biệt hoa thường cho username/mã) |
| Tên | `snake_case` số nhiều cho bảng; Prisma model `PascalCase` + `@@map` |
| Khóa chính | `id uuid`, sinh UUID v7 ở ứng dụng (có thứ tự thời gian, index tốt hơn v4) |
| Bảng tenant | Có `tenant_id uuid NOT NULL`, `UNIQUE (tenant_id, id)`, **RLS bật + FORCE** |
| Khóa ngoại giữa bảng tenant | **Khóa ngoại kép** `(tenant_id, x_id) REFERENCES x(tenant_id, id)` |
| Thời gian | `timestamptz` (UTC). `created_at`, `updated_at NOT NULL DEFAULT now()` |
| Soft delete | `deleted_at timestamptz NULL` hoặc `archived_at` với dữ liệu danh mục |
| Điểm | `numeric(8,2)` (bước điểm do ứng dụng kiểm tra, mặc định 0.25) |
| Tiền | `bigint` micro-USD (1 USD = 1 000 000), tránh sai số số thực (O-12) |
| Nội dung soạn thảo | `jsonb` (tài liệu Tiptap đã sanitize) + cột `*_text` văn bản thuần (dùng cho tìm kiếm, AI, xuất file) |
| Enum | PostgreSQL enum (qua Prisma) |
| Optimistic locking | `lock_version int` trên bản ghi chỉnh sửa đồng thời (bài tập, câu hỏi, điểm) |
| Bất biến | Trigger chặn `UPDATE`/`DELETE` trên bảng lịch sử (đánh dấu **[immutable]**) |

Ký hiệu trong bảng cột: **PK** khóa chính · **FK²** khóa ngoại kép theo tenant · **FK** khóa ngoại thường · **UQ** unique · **IDX** index · **CK** check.

---

## 2. Phân loại bảng

| Nhóm | Bảng | `tenant_id` | RLS | Role ghi |
|---|---|---|---|---|
| Nền tảng | `tenants`, `platform_users`, `platform_sessions`, `platform_settings`, `platform_audit_logs`, `ai_model_pricing` | Không | Không (không cấp quyền cho `hms_app`, trừ SELECT `ai_model_pricing`) | `hms_system` |
| Tham chiếu toàn cục | `permissions` | Không | Không (`hms_app` chỉ SELECT) | migration |
| Tenant | Tất cả bảng còn lại | **Có** | **Có** | `hms_app` (trong tenant context) |

---

## 3. Bảng nền tảng

### 3.1 `tenants`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid | PK |
| slug | citext | UQ; CK `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`; không thuộc danh sách dành riêng (kiểm tra ở ứng dụng) |
| name | text | NOT NULL |
| status | `tenant_status` (`ACTIVE`, `SUSPENDED`, `ARCHIVED`) | default `ACTIVE` |
| timezone | text | default `Asia/Ho_Chi_Minh` |
| locale | text | default `vi-VN` |
| max_users | int | NULL = theo mặc định nền tảng |
| max_storage_bytes | bigint | NULL = theo mặc định nền tảng |
| suspended_at, archived_at | timestamptz | |
| created_at, updated_at | timestamptz | |

### 3.2 `platform_users`
`id` PK · `email citext` UQ · `full_name` · `password_hash` (Argon2id) · `mfa_secret_enc` (mã hóa ở ứng dụng) · `mfa_enabled bool` · `status` (`ACTIVE`, `LOCKED`, `DISABLED`) · `failed_login_count` · `locked_until` · `last_login_at` · `created_at`, `updated_at`.

### 3.3 `platform_sessions`
Giống `auth_sessions` (§4.4) nhưng tham chiếu `platform_users`, không có `tenant_id`.

### 3.4 `platform_settings`
`key text` PK · `value jsonb` · `updated_by` FK → platform_users · `updated_at`.
Khóa dự kiến: `ai.kill_switch` (bool, mặc định **false = AI tắt**), `files.ceiling` (định dạng + dung lượng tối đa), `tenant.default_quota`, `ai.max_monthly_limit_micros` (trần ngân sách AI cho mỗi trường, nếu có).

### 3.5 `ai_model_pricing`
`id` PK · `provider text` · `model text` · `input_micros_per_mtok bigint` · `output_micros_per_mtok bigint` · `cache_read_micros_per_mtok bigint` · `cache_write_micros_per_mtok bigint` · `effective_from timestamptz` · `effective_to timestamptz NULL` · UQ `(provider, model, effective_from)`.
Giá **không hardcode** trong code; chi phí của mỗi lần chấm được tính theo bản ghi giá đang hiệu lực và lưu lại kết quả.

### 3.6 `platform_audit_logs` [immutable]
`id` · `actor_platform_user_id` · `action` · `target_tenant_id NULL` · `resource_type` · `resource_id` · `metadata jsonb` · `ip inet` · `user_agent` · `request_id` · `created_at`. IDX `(created_at DESC)`, `(target_tenant_id, created_at DESC)`.

### 3.7 `permissions` (tham chiếu toàn cục)
`code text` PK (ví dụ `assignment.publish`) · `category` · `description` · `is_platform bool`. Được seed bằng migration và đồng bộ với hằng số trong `packages/shared`. Danh mục: [authentication-authorization.md §5](./authentication-authorization.md#5-danh-mục-permission).

---

## 4. Tenant: cấu hình & danh tính

### 4.1 `tenant_settings` (1–1 với tenants)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| tenant_id | uuid | PK, FK → tenants |
| file_allowed_types | text[] | Trong trần nền tảng. Mặc định: pdf, docx, xlsx, pptx, jpg, png (O-14) |
| file_max_bytes | bigint | Mặc định 20 MB |
| files_per_answer | int | Mặc định 10 |
| submission_max_bytes | bigint | Mặc định 100 MB |
| submit_grace_seconds | int | Mặc định 30; CK 0–120 (O-19) |
| score_step | numeric(4,2) | Mặc định 0.25 |
| ai_enabled | bool | **Mặc định false** |
| ai_approval_ref, ai_approved_by_name, ai_approved_at, ai_approval_scope | text / timestamptz | Bắt buộc có khi `ai_enabled = true` (CK) |
| ai_monthly_limit_micros | bigint NULL | NULL = chưa cấu hình → AI không chạy |
| ai_per_teacher_limit_micros | bigint NULL | Tùy chọn |
| ai_alert_thresholds | smallint[] | Mặc định `{50,80,100}` |
| updated_by, updated_at | | |

CK: `ai_enabled = false OR (ai_approval_ref IS NOT NULL AND ai_approved_at IS NOT NULL)`.

### 4.2 `users`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id, tenant_id | uuid | PK; UQ `(tenant_id, id)`; FK tenant_id → tenants |
| username | citext | UQ `(tenant_id, username)`. HS: username = mã HS đã chuẩn hóa (D4.1) |
| email | citext NULL | UQ `(tenant_id, email) WHERE email IS NOT NULL AND deleted_at IS NULL` |
| full_name | text | NOT NULL |
| phone | text NULL | |
| password_hash | text | Argon2id |
| status | `user_status` (`ACTIVE`, `LOCKED`, `DISABLED`) | |
| must_change_password | bool | default true |
| password_changed_at | timestamptz | |
| failed_login_count | int | |
| locked_until | timestamptz NULL | Khóa tạm do đăng nhập sai |
| last_login_at | timestamptz | |
| authz_version | int | Tăng khi đổi role/phân công/khóa → token cũ phải làm mới |
| created_by | uuid NULL | FK² → users |
| deleted_at | timestamptz NULL | |

IDX `(tenant_id, status)`, `(tenant_id, full_name)` (tìm kiếm; có thể bổ sung trigram).

### 4.3 `roles`, `role_permissions`, `user_roles`
- `roles`: `id`, `tenant_id`, `code` (`SCHOOL_ADMIN` / `TEACHER` / `STUDENT` / mã tùy chỉnh – ADV), `name`, `is_system bool`. UQ `(tenant_id, code)`. Role hệ thống không xóa được.
- `role_permissions`: `tenant_id`, `role_id` FK², `permission_code` FK → permissions. PK `(role_id, permission_code)`.
- `user_roles`: `tenant_id`, `user_id` FK², `role_id` FK², `granted_by`, `granted_at`. PK `(user_id, role_id)`.

### 4.4 `auth_sessions`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id, tenant_id | uuid | `sid` trong JWT |
| user_id | uuid | FK² |
| family_id | uuid | Chuỗi xoay vòng; phát hiện dùng lại → thu hồi cả chuỗi |
| refresh_token_hash | bytea | SHA-256 của token ngẫu nhiên 256-bit; UQ |
| client_type | `client_type` (`WEB`, `BEARER`) | `BEARER` dành cho tương lai (D2.3) |
| expires_at, last_used_at | timestamptz | |
| revoked_at, revoke_reason | | |
| replaced_by_id | uuid NULL | |
| ip | inet | |
| user_agent | text | |

IDX `(tenant_id, user_id) WHERE revoked_at IS NULL`.

### 4.5 `students`, `teachers` (hồ sơ 1–1 với users)
- `students`: `user_id` PK + FK² → users, `tenant_id`, `student_code citext` UQ `(tenant_id, student_code)` (D4.2), `date_of_birth date NULL`, `notes`. **Tối thiểu hóa dữ liệu cá nhân**: không lưu số định danh, địa chỉ.
- `teachers`: `user_id` PK + FK², `tenant_id`, `teacher_code citext NULL` UQ `(tenant_id, teacher_code) WHERE NOT NULL`, `specialization text NULL`.

CK ứng dụng: user có role `STUDENT` phải có bản ghi `students` và `username = student_code`.

### 4.6 `import_jobs`
`id`, `tenant_id`, `type` (`STUDENTS`, `TEACHERS`), `source_file_id` FK², `status` (`VALIDATING`, `READY`, `IMPORTING`, `COMPLETED`, `FAILED`), `total_rows`, `success_rows`, `failed_rows`, `errors jsonb`, `result_file_id` FK² NULL (chứa mật khẩu tạm), `result_expires_at`, `result_downloaded_at` (tải **một lần** – O-18; sau khi tải hoặc hết hạn thì xóa object), `created_by`, `created_at`.

---

## 5. Tenant: học vụ

| Bảng | Cột chính | Ràng buộc |
|---|---|---|
| `school_years` | id, tenant_id, name, start_date, end_date, is_current | UQ `(tenant_id, name)`; UQ `(tenant_id) WHERE is_current`; CK `end_date > start_date` |
| `semesters` | id, tenant_id, school_year_id FK², name, ordinal, start_date, end_date | UQ `(school_year_id, ordinal)`; CK ngày nằm trong năm học (ứng dụng) |
| `subjects` | id, tenant_id, code citext, name, archived_at | UQ `(tenant_id, code)` |
| `classes` | id, tenant_id, school_year_id FK², code citext, name, grade_level smallint, homeroom_teacher_id FK² NULL, archived_at | UQ `(tenant_id, school_year_id, code)` |
| `class_students` | id, tenant_id, class_id FK², student_id FK² → students, joined_at, left_at, added_by | UQ `(class_id, student_id) WHERE left_at IS NULL`; CK `left_at IS NULL OR left_at >= joined_at`; IDX `(tenant_id, student_id) WHERE left_at IS NULL` |
| `class_teachers` | id, tenant_id, class_id FK², teacher_id FK² → teachers, subject_id FK², semester_id FK² NULL (NULL = cả năm), assigned_at, unassigned_at, assigned_by | UQ `NULLS NOT DISTINCT (class_id, teacher_id, subject_id, semester_id) WHERE unassigned_at IS NULL`; IDX `(tenant_id, teacher_id) WHERE unassigned_at IS NULL` |

Lịch sử ghi danh và phân công được giữ bằng `left_at` / `unassigned_at`, không xóa (BR-04, BR-05).

---

## 6. Tenant: file

### `files`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id, tenant_id | uuid | |
| storage_key | text | UQ; dạng `t/{tenant_id}/{yyyy}/{mm}/{id}` – không chứa tên gốc |
| original_name | text | Đã chuẩn hóa, chỉ để hiển thị/tải về |
| declared_mime, detected_mime | text | `detected_mime` từ magic bytes |
| size_bytes | bigint | Kích thước thật sau khi xác nhận |
| sha256 | bytea | |
| purpose | `file_purpose` (`ASSIGNMENT_ATTACHMENT`, `QUESTION_MEDIA`, `ANSWER_UPLOAD`, `RICH_TEXT_IMAGE`, `IMPORT_SOURCE`, `IMPORT_RESULT`, `EXPORT`) | |
| status | `file_status` (`PENDING`, `ACTIVE`, `REJECTED`, `DELETED`) | |
| uploaded_by | uuid | FK² → users |
| confirmed_at, deleted_at, created_at | timestamptz | |

IDX `(tenant_id, status, created_at) WHERE status = 'PENDING'` (dọn file mồ côi). Tổng `size_bytes` của file `ACTIVE` dùng để kiểm tra hạn mức dung lượng.

---

## 7. Tenant: bài tập & câu hỏi

### 7.1 `assignments`
| Cột | Kiểu | Ràng buộc / ghi chú |
|---|---|---|
| id, tenant_id | uuid | |
| subject_id | uuid | FK² |
| semester_id | uuid NULL | FK² |
| owner_teacher_id | uuid | FK² → teachers (người chịu trách nhiệm hiện tại; đổi khi chuyển quyền) |
| created_by | uuid | FK² → users |
| title | text | NOT NULL, ≤ 200 ký tự |
| description, instructions | jsonb | + `description_text` |
| topic | text NULL | Chủ đề/chương |
| status | `assignment_status` (`DRAFT`, `SCHEDULED`, `PUBLISHED`, `REVOKED`, `ARCHIVED`) | |
| open_at, due_at | timestamptz NULL | Bắt buộc khi khác `DRAFT` (CK) |
| allow_late | bool | default false |
| late_until | timestamptz NULL | CK `allow_late = false OR late_until >= due_at` |
| time_limit_minutes | int NULL | CK > 0 |
| allow_resubmit | bool | **default false** (D6.3) |
| max_attempts | smallint | default 1; CK ≥ 1 |
| grading_policy | `grading_policy` (`LATEST`, `HIGHEST`) | default `LATEST` (D6.1); `HIGHEST` dành cho tương lai (D6.4) |
| max_score | numeric(8,2) | = tổng điểm câu (ứng dụng tính lại khi lưu câu hỏi); CK > 0 khi giao |
| pass_score | numeric(8,2) NULL | CK `pass_score BETWEEN 0 AND max_score` |
| answer_visibility | `answer_visibility` (`NEVER`, `AFTER_SUBMIT`, `AFTER_DUE`, `AFTER_PUBLISH`) | default `AFTER_PUBLISH` |
| ai_grading_allowed | bool | default false |
| ai_feedback_visible | bool | **default false** (D10.1) |
| published_at, revoked_at, archived_at, deleted_at | timestamptz | |
| lock_version | int | |

CK: `open_at < due_at`. IDX `(tenant_id, owner_teacher_id, status, due_at)`, `(tenant_id, subject_id)`, `(status, open_at) WHERE status = 'SCHEDULED'` (scheduler quét bằng `hms_system`).

### 7.2 `assignment_targets`
| Cột | Ghi chú |
|---|---|
| id, tenant_id, assignment_id FK² | |
| target_type | `target_type` (`CLASS`, `STUDENT`, `GROUP`) – `GROUP` dành cho tương lai (D12) |
| class_id FK² NULL, student_id FK² NULL, group_id uuid NULL | CK: đúng một cột khác NULL và khớp `target_type` |

UQ `NULLS NOT DISTINCT (assignment_id, target_type, class_id, student_id, group_id)`. IDX `(tenant_id, class_id)`, `(tenant_id, student_id)`.
Ứng dụng kiểm tra: lớp được chọn phải nằm trong phân công của GV cho môn của bài; HS được chọn phải thuộc tenant (FK² đảm bảo) và thuộc lớp GV dạy.

### 7.3 `assignment_attachments`
`id`, `tenant_id`, `assignment_id` FK², `file_id` FK², `display_name`, `ordinal`. UQ `(assignment_id, file_id)`.

### 7.4 `grading_rubrics`, `rubric_criteria`
- `grading_rubrics`: `id`, `tenant_id`, `owner_teacher_id` FK², `name`, `description`, `version int`, `previous_version_id` FK² NULL, `locked_at` (khóa khi đã được dùng để chấm; sửa sau đó tạo **version mới**), `total_points numeric(8,2)`.
- `rubric_criteria`: `id`, `tenant_id`, `rubric_id` FK², `ordinal`, `name`, `description`, `max_points numeric(8,2)` CK > 0, `levels jsonb` (`[{label, points, description}]`). UQ `(rubric_id, ordinal)`.
- Ứng dụng kiểm tra: tổng `max_points` của tiêu chí = `points` của câu dùng rubric.

### 7.5 `questions`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id, tenant_id | uuid | |
| assignment_id | uuid | FK² |
| ordinal | int | UQ `(assignment_id, ordinal) DEFERRABLE INITIALLY DEFERRED` (để đổi thứ tự trong 1 transaction; viết bằng SQL migration) |
| type | `question_type` (`SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TRUE_FALSE`, `SHORT_ANSWER`, `ESSAY`, `FILE_UPLOAD`) | |
| content | jsonb | + `content_text` |
| points | numeric(8,2) | CK ≥ 0 |
| is_required | bool | |
| config | jsonb | Theo loại: MC `{scoring: ALL_OR_NOTHING \| PARTIAL}`; SA `{accepted: [...], ignore_case, ignore_whitespace, ignore_diacritics, numeric_tolerance}`; FILE `{allowed_types, max_files}`. **Bí mật với HS** |
| reference_answer | jsonb NULL | Đáp án tham khảo (bí mật với HS cho tới khi được phép) |
| explanation | jsonb NULL | Giải thích hiển thị theo `answer_visibility` |
| rubric_id | uuid NULL | FK² → grading_rubrics (một version cụ thể) |
| source_question_id | uuid NULL | FK² tự tham chiếu; nguồn khi tái sử dụng/nhân bản (mở rộng cho ngân hàng câu hỏi – D12) |
| deleted_at | timestamptz | Chỉ khi bài chưa có bài nộp (BR-13) |
| lock_version | int | |

"Loại bài tập" (trắc nghiệm, tự luận, mixed…) được **suy ra** từ tập loại câu hỏi, không lưu riêng, để tránh dữ liệu mâu thuẫn.

### 7.6 `question_options`
`id`, `tenant_id`, `question_id` FK², `ordinal`, `content jsonb`, `is_correct bool` (**bí mật với HS**). UQ `(question_id, ordinal) DEFERRABLE`.
Ứng dụng kiểm tra: SC/TF có đúng 1 đáp án đúng; MC có ≥ 1; TF có đúng 2 lựa chọn.

### 7.7 `question_attachments`
`id`, `tenant_id`, `question_id` FK², `file_id` FK², `ordinal`.

---

## 8. Tenant: bài nộp

### 8.1 `submissions` (1 dòng cho mỗi cặp bài tập – HS)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id, tenant_id | uuid | |
| assignment_id | uuid | FK² |
| student_id | uuid | FK² → students |
| status | `submission_status` (`IN_PROGRESS`, `SUBMITTED`, `GRADING`, `GRADED`, `PUBLISHED`, `RETURNED`) | `NOT_STARTED`, `MISSING` được tính, không lưu |
| started_at | timestamptz | |
| deadline_at | timestamptz NULL | Deadline cá nhân khi có giới hạn thời gian |
| draft_revision | int | Optimistic concurrency cho autosave |
| draft_updated_at | timestamptz | |
| attempt_count | smallint | Số lần HS chủ động nộp (không tính lần GV yêu cầu – BR-29) |
| latest_version_id | uuid NULL | FK² → submission_versions |
| effective_grade_id | uuid NULL | FK² → grades: điểm hiệu lực theo `grading_policy` |
| returned_at, returned_reason, returned_due_at, returned_by | | Khi GV yêu cầu nộp lại |

UQ `(tenant_id, assignment_id, student_id)`. IDX `(tenant_id, student_id, status)`, `(tenant_id, assignment_id, status)`.

### 8.2 `submission_versions` [immutable]
| Cột | Ghi chú |
|---|---|
| id, tenant_id, submission_id FK² | |
| version_no | smallint; UQ `(submission_id, version_no)` |
| submitted_at | timestamptz (giờ server) |
| source | `submission_source` (`STUDENT`, `AUTO_TIMEOUT`, `TEACHER_REQUESTED`) |
| is_late | bool |
| idempotency_key | text; UQ `(submission_id, idempotency_key)` |
| content_hash | bytea (SHA-256 của snapshot câu trả lời, phục vụ kiểm chứng) |
| submitted_by | uuid NULL (NULL khi hệ thống auto-submit) |

Không có cột trạng thái thay đổi được. "Đã bị thay thế" được suy ra từ `submissions.latest_version_id`.

### 8.3 `submission_answers`
| Cột | Ghi chú |
|---|---|
| id, tenant_id, submission_id FK², question_id FK² | |
| version_id | uuid NULL, FK² → submission_versions. **NULL = bản nháp**; khác NULL = câu trả lời đã nộp |
| answer | jsonb: `{selected_option_ids: [...]}` / `{value: true}` / `{text: "..."}` / `{doc: <tiptap>}` |
| answer_text | text: văn bản thuần trích từ `answer` (dùng cho chấm, AI, xuất file) |
| updated_at | |

UQ `NULLS NOT DISTINCT (submission_id, version_id, question_id)`. Trigger: chặn `UPDATE`/`DELETE` khi `version_id IS NOT NULL` (bất biến – D6.2).
Khi nộp: sao chép các dòng nháp thành dòng mới có `version_id`, trong cùng transaction tạo phiên bản.

### 8.4 `submission_attachments`
`id`, `tenant_id`, `submission_id` FK², `version_id` FK² NULL (NULL = nháp), `question_id` FK², `file_id` FK², `ordinal`. Cùng quy tắc bất biến.

---

## 9. Tenant: chấm điểm

### 9.1 `grades` (1 dòng cho mỗi phiên bản nộp)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id, tenant_id | uuid | |
| submission_id | uuid | FK² |
| submission_version_id | uuid | FK², UQ |
| status | `grade_status` (`IN_PROGRESS`, `GRADED`, `PUBLISHED`) | |
| max_score | numeric(8,2) | **Snapshot** `assignments.max_score` khi tạo (D5.2, BR-39) |
| earned_score | numeric(8,2) NULL | Server tính = tổng `grade_details.earned_score`; CK `0 ≤ earned_score ≤ max_score` |
| pass_score | numeric(8,2) NULL | Snapshot |
| passed | bool NULL | |
| teacher_feedback | text NULL | Nhận xét chung của GV |
| ai_feedback_approved | text NULL | Nhận xét AI **đã được GV duyệt/sửa** để có thể hiển thị cho HS (D10) |
| graded_by, graded_at | | |
| published_by, published_at | | |
| lock_version | int | |

IDX `(tenant_id, submission_id)`, `(tenant_id, status)`.

### 9.2 `grade_details` (điểm từng câu)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id, tenant_id | uuid | |
| grade_id | uuid | FK² |
| question_id | uuid | FK² |
| status | `grade_item_status` (`AUTO_GRADED`, `NEEDS_MANUAL`, `AI_PENDING`, `AI_SUGGESTED`, `FINAL`) | |
| source | `grade_source` (`AUTO`, `TEACHER`) NULL | NULL khi chưa có điểm chính thức |
| max_score | numeric(8,2) | Snapshot `questions.points` |
| earned_score | numeric(8,2) NULL | **Chỉ là điểm chính thức** (AUTO/TEACHER). Điểm AI **không** bao giờ được ghi vào đây (D9.2) |
| feedback | text NULL | Nhận xét GV cho câu |
| is_marked_wrong | bool | |
| accepted_ai_result_id | uuid NULL | FK² → ai_grading_results (gợi ý AI mà GV đã chấp nhận/sửa) |
| finalized_by, finalized_at | | |
| lock_version | int | |

UQ `(grade_id, question_id)`. CK `earned_score IS NULL OR earned_score BETWEEN 0 AND max_score`; CK `(status IN ('AUTO_GRADED','FINAL')) = (earned_score IS NOT NULL AND source IS NOT NULL)`. IDX `(tenant_id, status) WHERE status IN ('NEEDS_MANUAL','AI_SUGGESTED')`.

### 9.3 `grade_detail_criteria` (điểm theo tiêu chí rubric do GV chốt)
`id`, `tenant_id`, `grade_detail_id` FK², `rubric_criterion_id` FK², `max_score` (snapshot), `earned_score`, `feedback`. UQ `(grade_detail_id, rubric_criterion_id)`.

### 9.4 `grade_history` [immutable]
| Cột | Ghi chú |
|---|---|
| id, tenant_id, grade_id FK², grade_detail_id FK² NULL | |
| change_type | `grade_change_type` (`AUTO_GRADED`, `MANUAL_SET`, `AI_ACCEPTED`, `AI_MODIFIED`, `OVERRIDE_AUTO`, `REGRADE_KEY_CHANGE`, `ADMIN_OVERRIDE`, `PUBLISHED`, `FEEDBACK_EDITED`) |
| old_score, new_score | numeric(8,2) NULL |
| old_feedback, new_feedback | text NULL |
| reason | text NULL; CK bắt buộc với `OVERRIDE_AUTO`, `ADMIN_OVERRIDE` và mọi thay đổi khi grade đã `PUBLISHED` (ứng dụng) |
| actor_type | `actor_type` (`USER`, `SYSTEM`) |
| changed_by | uuid NULL (FK² → users) |
| created_at | |

Mọi thay đổi điểm đi qua một hàm duy nhất trong `grading` service, hàm này ghi `grade_history` trong cùng transaction (D7.3).

---

## 10. Tenant: AI grading

### 10.1 `ai_grading_requests` (một lần GV kích hoạt)
`id`, `tenant_id`, `assignment_id` FK², `requested_by` FK² → users, `scope jsonb` (submission ids / câu), `item_count`, `estimated_cost_micros`, `reserved_micros`, `status` (`OPEN`, `COMPLETED`, `CANCELLED`), `created_at`, `completed_at`.

### 10.2 `ai_grading_jobs` (1 câu của 1 phiên bản)
| Cột | Ghi chú |
|---|---|
| id, tenant_id, request_id FK² | |
| submission_version_id FK², question_id FK², grade_detail_id FK² | |
| status | `ai_job_status` (`QUEUED`, `PROCESSING`, `RETRYING`, `SUCCEEDED`, `FAILED`, `CANCELLED`) |
| attempts, max_attempts | |
| idempotency_key | UQ; ví dụ `{version_id}:{question_id}:{request_id}` |
| provider, model, prompt_version | text |
| rubric_id | FK² NULL (version rubric dùng khi chấm) |
| reserved_micros, actual_cost_micros | bigint |
| error_code, error_message | text (đã che thông tin nhạy cảm) |
| queued_at, started_at, finished_at | |

IDX `(tenant_id, request_id)`, `(status, queued_at) WHERE status IN ('QUEUED','RETRYING')`.

### 10.3 `ai_grading_results` (mỗi lần gọi thành công hoặc output không hợp lệ)
| Cột | Ghi chú |
|---|---|
| id, tenant_id, job_id FK², grade_detail_id FK² | |
| is_valid | bool; `validation_errors jsonb` |
| suggested_score, max_score | numeric(8,2) – điểm **đề xuất**, tách biệt với `grade_details.earned_score` |
| confidence | numeric(4,3) CK 0–1 |
| criteria | jsonb `[{criterion_id, name, score, max_score, feedback}]` |
| strengths, weaknesses, missing_points | jsonb |
| overall_feedback | text |
| needs_teacher_review | bool |
| model, prompt_version | text |
| input_tokens, output_tokens, cache_read_tokens, cache_write_tokens | int |
| cost_micros, latency_ms | |
| redaction_summary | jsonb (số mục đã che theo loại, **không** lưu giá trị gốc) |
| raw_response | jsonb NULL – xóa sau thời hạn lưu (O-15) |
| raw_purged_at | timestamptz |
| created_at | |

### 10.4 `ai_budget_periods`
`id`, `tenant_id`, `period_start date`, `period_end date`, `limit_micros bigint`, `reserved_micros bigint`, `spent_micros bigint`, `alerts_sent smallint[]`, `updated_at`. UQ `(tenant_id, period_start)`. CK `reserved_micros ≥ 0`, `spent_micros ≥ 0`.
Đặt trước ngân sách bằng một câu lệnh atomic:
```sql
UPDATE ai_budget_periods
   SET reserved_micros = reserved_micros + $amount
 WHERE tenant_id = $t AND period_start = $p
   AND spent_micros + reserved_micros + $amount <= limit_micros
RETURNING *;
```
Không có dòng trả về nghĩa là không đủ ngân sách.

### 10.5 `ai_usage_ledger` [immutable]
`id`, `tenant_id`, `period_id` FK², `request_id` FK² NULL, `job_id` FK² NULL, `user_id` FK² NULL (GV kích hoạt), `entry_type` (`RESERVE`, `COMMIT`, `RELEASE`, `ADJUST`), `amount_micros`, `created_at`. Dùng cho đối soát, thống kê theo GV/bài và hạn mức theo GV.

---

## 11. Tenant: thông báo, audit, outbox

### 11.1 `notifications`
`id`, `tenant_id`, `user_id` FK², `type` (enum `notification_type`), `title`, `body`, `data jsonb`, `link`, `dedupe_key text NULL`, `read_at`, `created_at`. UQ `(tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL`. IDX `(tenant_id, user_id, created_at DESC)`, `(tenant_id, user_id) WHERE read_at IS NULL`.

### 11.2 `audit_logs` [immutable]
| Cột | Ghi chú |
|---|---|
| id, tenant_id | |
| actor_type | `USER`, `SYSTEM`, `PLATFORM` |
| actor_user_id | FK² NULL |
| actor_platform_user_id | uuid NULL (không FK chéo nhóm bảng; lưu để tra cứu) |
| action | text, ví dụ `submission.content.read`, `grade.override`, `user.lock`, `tenant.ai.update` |
| resource_type, resource_id | |
| is_sensitive | bool (truy cập dữ liệu nhạy cảm – D7.3) |
| reason | text NULL (bắt buộc khi `is_sensitive`) |
| metadata | jsonb (diff giá trị cũ/mới; **không** chứa mật khẩu, token, nội dung bài làm) |
| ip, user_agent, request_id | |
| created_at | |

IDX `(tenant_id, created_at DESC)`, `(tenant_id, actor_user_id, created_at DESC)`, `(tenant_id, resource_type, resource_id)`, `(tenant_id, created_at DESC) WHERE is_sensitive`. Phân vùng (partition) theo tháng khi dữ liệu lớn (Phase 8).

### 11.3 `outbox_events`
`id`, `tenant_id`, `event_type`, `payload jsonb`, `created_at`, `available_at`, `processed_at NULL`, `attempts`, `last_error`. Ghi bằng `hms_app` trong transaction nghiệp vụ; relay đọc bằng `hms_system` với `FOR UPDATE SKIP LOCKED`. IDX `(available_at) WHERE processed_at IS NULL`.

---

## 12. Bảng dành cho mở rộng (chưa tạo trong migration MVP)

| Bảng | Mục đích | Liên kết |
|---|---|---|
| `student_groups`, `student_group_members` | Giao bài theo nhóm (D12) | `assignment_targets.group_id` (đã có cột) |
| `question_bank_items`, `question_bank_options`, `question_bank_tags` | Ngân hàng câu hỏi nâng cao (D12) | Sao chép vào `questions`, lưu nguồn |
| `assignment_student_extensions` | Gia hạn từng HS | assignments, students |
| `support_access_grants` | Platform Admin truy cập hỗ trợ có thời hạn (O-03) | tenants, platform_users |
| `parent_links` | Phụ huynh | users |
| `email_deliveries` | Kênh email | notifications |

---

## 13. Ánh xạ danh sách bảng của master prompt

| Master prompt | Thiết kế | Ghi chú |
|---|---|---|
| users | `users` (+ `platform_users`) | Tách realm Platform |
| roles, user_roles | `roles`, `user_roles`, `role_permissions`, `permissions` | RBAC theo permission |
| students, teachers | `students`, `teachers` | |
| classes, class_students, class_teachers | Như tên | Có lịch sử |
| subjects, school_years, semesters | Như tên | |
| assignments, assignment_targets, assignment_attachments | Như tên | + `files` trung tâm |
| questions, question_options | Như tên | + `question_attachments` |
| submissions, submission_answers, submission_attachments, submission_versions | Như tên | Nháp (`version_id NULL`) và đã nộp (bất biến) |
| grading_rubrics, rubric_criteria | Như tên | Có version |
| grades, grade_details | Như tên | + `grade_detail_criteria`, `grade_history` |
| ai_grading_jobs, ai_grading_results | Như tên | + `ai_grading_requests`, `ai_budget_periods`, `ai_usage_ledger`, `ai_model_pricing` |
| notifications, audit_logs | Như tên | + `platform_audit_logs` |
| *(mới)* | `tenants`, `tenant_settings`, `auth_sessions`, `platform_sessions`, `platform_settings`, `import_jobs`, `outbox_events` | Multi-tenant, auth, độ tin cậy |

---

## 14. Các truy vấn trọng yếu và index hỗ trợ

| Truy vấn | Index |
|---|---|
| Đăng nhập: user theo `(tenant_id, username)` | UQ `users(tenant_id, username)` |
| Bài tập HS được thấy | `assignment_targets(tenant_id, student_id)`, `assignment_targets(tenant_id, class_id)`, `class_students(tenant_id, student_id) WHERE left_at IS NULL`, `assignments(tenant_id, status)` |
| Lớp/bài của GV | `class_teachers(tenant_id, teacher_id) WHERE unassigned_at IS NULL`, `assignments(tenant_id, owner_teacher_id, status, due_at)` |
| Danh sách bài nộp theo trạng thái | `submissions(tenant_id, assignment_id, status)` |
| Hàng chờ chấm | `grade_details(tenant_id, status) WHERE status IN (...)` |
| Thông báo chưa đọc | `notifications(tenant_id, user_id) WHERE read_at IS NULL` |
| Scheduler | `assignments(status, open_at) WHERE status='SCHEDULED'`, `outbox_events(available_at) WHERE processed_at IS NULL` |
| Audit theo đối tượng | `audit_logs(tenant_id, resource_type, resource_id)` |

---

## 15. Migration, seed, retention

- **Migration**: Prisma Migrate cho bảng/cột/index cơ bản; SQL tùy chỉnh trong cùng migration cho: RLS + policy, `FORCE RLS`, khóa ngoại kép (nếu Prisma không sinh đủ), partial/`NULLS NOT DISTINCT` unique index, `DEFERRABLE` constraint, check constraint, trigger bất biến, `GRANT` cho từng role.
- **Test migration** (CI): mọi bảng có `tenant_id` phải có RLS + policy; `hms_app` không có `BYPASSRLS`; các bảng [immutable] từ chối `UPDATE`/`DELETE`.
- **Seed**: chỉ có danh mục `permissions` (bằng migration). Platform Admin đầu tiên tạo bằng lệnh CLI (nhập mật khẩu tương tác, bắt buộc thiết lập MFA). **Không seed dữ liệu nghiệp vụ** ở production. Dữ liệu mẫu chỉ có trong môi trường dev/test và được đánh dấu rõ.
- **Retention** (O-15): xóa `ai_grading_results.raw_response` sau 180 ngày; audit log giữ ≥ 2 năm; file `PENDING` quá 24 giờ bị dọn; file kết quả import bị xóa sau khi tải hoặc hết hạn.
