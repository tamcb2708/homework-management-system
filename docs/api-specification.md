# API Specification – Homework Management System

> **Sinh tự động** từ OpenAPI của API đang chạy (`GET /api/docs-json`) bằng `scripts/gen-api-spec.py`, nên khớp với code. Swagger UI tương tác: `/api/docs`.

## 1. Quy ước chung

| Hạng mục | Quy ước |
|---|---|
| Base path | `/api` (cùng origin với web; Nginx hoặc proxy runtime của web chuyển tiếp) |
| Định dạng | JSON (UTF-8); upload dùng `multipart/form-data` |
| Xác thực | Cookie httpOnly: realm trường `hms_at`/`hms_rt`, realm nền tảng `hmsp_at`/`hmsp_rt` (tiền tố `__Host-` khi `COOKIE_SECURE=true`) |
| CSRF | Mọi `POST/PUT/PATCH/DELETE` sau đăng nhập phải có header `X-CSRF-Token` = giá trị cookie `hms_csrf` (hoặc `hmsp_csrf`); header `Origin` (nếu có) phải thuộc `APP_ORIGINS` |
| Tenant | Xác định từ token đã ký (claim `tid`) – client không gửi `tenant_id` |
| Idempotency | `POST /api/student/submissions/{id}/submit` bắt buộc header `Idempotency-Key` (8–100 ký tự) |
| Lỗi | `{ "error": { "code", "message", "details"?, "requestId" } }` – 400 dữ liệu sai, 401 chưa đăng nhập/phiên hết hạn, 403 thiếu quyền hoặc CSRF, 404 không tồn tại **hoặc ngoài phạm vi** (không lộ sự tồn tại), 409 xung đột trạng thái, 410 bài đã thu hồi, 422 vi phạm nghiệp vụ, 429 giới hạn tần suất |
| Phân trang | `?page=&pageSize=` (tối đa 100); response `{ total, page, pageSize, items }` |
| Thời gian | ISO 8601 UTC; giao diện hiển thị theo `Asia/Ho_Chi_Minh` |

## 2. Danh sách endpoint (92)

### auth

| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/auth/change-password` |  |
| `POST` | `/api/auth/login` |  |
| `POST` | `/api/auth/logout` |  |
| `GET` | `/api/auth/me` |  |
| `POST` | `/api/auth/refresh` |  |
| `GET` | `/api/auth/schools/{code}` |  |

### files

| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/files` |  |
| `GET` | `/api/files/{id}/download` |  |

### health

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/health/live` |  |
| `GET` | `/api/health/ready` |  |

### notifications

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/notifications` |  |
| `POST` | `/api/notifications/read-all` |  |
| `GET` | `/api/notifications/unread-count` |  |
| `POST` | `/api/notifications/{id}/read` |  |

### platform

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/platform/audit-logs` |  |
| `GET` | `/api/platform/settings/ai` |  |
| `PUT` | `/api/platform/settings/ai` |  |
| `GET` | `/api/platform/stats` |  |
| `POST` | `/api/platform/tenants` |  |
| `PATCH` | `/api/platform/tenants/{id}` |  |
| `POST` | `/api/platform/tenants/{id}/activate` |  |
| `POST` | `/api/platform/tenants/{id}/suspend` |  |

### platform-auth

| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/platform/auth/login` |  |
| `POST` | `/api/platform/auth/logout` |  |
| `GET` | `/api/platform/auth/me` |  |
| `POST` | `/api/platform/auth/refresh` |  |

### school-admin

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/admin/assignments` |  |
| `GET` | `/api/admin/assignments/{id}/submissions` |  |
| `GET` | `/api/admin/audit-logs` |  |
| `GET` | `/api/admin/dashboard` |  |
| `GET` | `/api/admin/settings` |  |
| `PATCH` | `/api/admin/settings` |  |
| `GET` | `/api/admin/submissions/{id}` |  |

### school-admin: academics

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/admin/classes` |  |
| `POST` | `/api/admin/classes` |  |
| `GET` | `/api/admin/classes/{id}` |  |
| `PATCH` | `/api/admin/classes/{id}` |  |
| `POST` | `/api/admin/classes/{id}/students` |  |
| `DELETE` | `/api/admin/classes/{id}/students/{studentId}` |  |
| `POST` | `/api/admin/classes/{id}/teachers` |  |
| `DELETE` | `/api/admin/classes/{id}/teachers/{teachingId}` |  |
| `GET` | `/api/admin/school-years` |  |
| `POST` | `/api/admin/school-years` |  |
| `PUT` | `/api/admin/school-years/{id}` |  |
| `POST` | `/api/admin/school-years/{id}/semesters` |  |
| `DELETE` | `/api/admin/semesters/{id}` |  |
| `GET` | `/api/admin/subjects` |  |
| `POST` | `/api/admin/subjects` |  |
| `PATCH` | `/api/admin/subjects/{id}` |  |

### school-admin: users

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/admin/users` |  |
| `POST` | `/api/admin/users/students` |  |
| `POST` | `/api/admin/users/teachers` |  |
| `PATCH` | `/api/admin/users/{id}` |  |
| `POST` | `/api/admin/users/{id}/lock` |  |
| `POST` | `/api/admin/users/{id}/reset-password` |  |
| `POST` | `/api/admin/users/{id}/unlock` |  |

### student

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/student/assignments` |  |
| `GET` | `/api/student/assignments/{id}` |  |
| `POST` | `/api/student/assignments/{id}/start` |  |
| `GET` | `/api/student/dashboard` |  |
| `PUT` | `/api/student/submissions/{id}/draft` |  |
| `GET` | `/api/student/submissions/{id}/result` |  |
| `POST` | `/api/student/submissions/{id}/submit` |  |

### teacher: ai-grading (disabled – D11)

| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/ai/assignments/{id}/requests` |  |
| `GET` | `/api/ai/status` |  |

### teacher: assignments

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/teacher/assignments` |  |
| `POST` | `/api/teacher/assignments` |  |
| `DELETE` | `/api/teacher/assignments/{id}` |  |
| `GET` | `/api/teacher/assignments/{id}` |  |
| `PATCH` | `/api/teacher/assignments/{id}` |  |
| `POST` | `/api/teacher/assignments/{id}/archive` |  |
| `POST` | `/api/teacher/assignments/{id}/duplicate` |  |
| `POST` | `/api/teacher/assignments/{id}/publish` |  |
| `POST` | `/api/teacher/assignments/{id}/questions` |  |
| `PUT` | `/api/teacher/assignments/{id}/questions/order` |  |
| `POST` | `/api/teacher/assignments/{id}/restore` |  |
| `POST` | `/api/teacher/assignments/{id}/revoke` |  |
| `GET` | `/api/teacher/assignments/{id}/roster` |  |
| `DELETE` | `/api/teacher/questions/{qid}` |  |
| `PUT` | `/api/teacher/questions/{qid}` |  |
| `GET` | `/api/teacher/teaching` |  |

### teacher: classes & dashboard

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/teacher/classes` |  |
| `GET` | `/api/teacher/classes/{id}` |  |
| `GET` | `/api/teacher/classes/{id}/students/{studentId}/history` |  |
| `GET` | `/api/teacher/dashboard` |  |

### teacher: grading

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/teacher/assignments/{id}/export.xlsx` |  |
| `POST` | `/api/teacher/assignments/{id}/publish-grades` |  |
| `POST` | `/api/teacher/assignments/{id}/return` |  |
| `PUT` | `/api/teacher/grade-details/{id}` |  |
| `POST` | `/api/teacher/grades/publish` |  |
| `PUT` | `/api/teacher/grades/{id}/feedback` |  |
| `GET` | `/api/teacher/submissions/{id}` |  |

## 3. Schema request (DTO)

Trường bắt buộc được **in đậm**. Mọi trường không khai báo đều bị từ chối (`whitelist` + `forbidNonWhitelisted`).

- **ChangePasswordDto** – **currentPassword**: `string`, **newPassword**: `string`
- **ClassDto** – **code**: `string`, **name**: `string`, **schoolYearId**: `string`, gradeLevel: `number`, homeroomTeacherId: `string`
- **CreateAssignmentDto** – **title**: `string`, **subjectId**: `string`, description: `string`, instructions: `string`, topic: `string`, passScore: `number`, timeLimitMinutes: `number`, allowResubmit: `boolean`, maxAttempts: `number`, answerVisibility: `string ∈ {NEVER, AFTER_SUBMIT, AFTER_DUE, AFTER_PUBLISH}`, aiGradingAllowed: `boolean`, aiFeedbackVisible: `boolean`, attachmentFileIds: `string[]`
- **CreateStudentDto** – **fullName**: `string`, **studentCode**: `string`, email: `string`, dateOfBirth: `string`, classId: `string`
- **CreateTeacherDto** – **fullName**: `string`, **email**: `string`, teacherCode: `string`, phone: `string`, specialization: `string`
- **CreateTenantDto** – **name**: `string`, **slug**: `string`, timezone: `string`, maxUsers: `number`, maxStorageMb: `number`, **adminFullName**: `string`, **adminEmail**: `string`
- **CriterionDto** – **name**: `string`, description: `string`, **maxPoints**: `number`
- **CriterionScoreDto** – **criterionId**: `string`, **score**: `number`, feedback: `string`
- **DraftDto** – **answers**: `object`, **revision**: `number`
- **EnrollDto** – **studentIds**: `string[]`
- **FeedbackDto** – teacherFeedback: `string`, aiFeedbackApproved: `string`
- **KillSwitchDto** – **enabled**: `boolean`
- **LoginDto** – **schoolCode**: `string`, **identifier**: `string`, **password**: `string`
- **LogoutDto** – all: `boolean`
- **OptionDto** – id: `string`, **content**: `string`, **isCorrect**: `boolean`
- **PlatformLoginDto** – **email**: `string`, **password**: `string`
- **PublishDto** – **classIds**: `string[]`, **studentIds**: `string[]`, openAt: `string`, **dueAt**: `string`, allowLate: `boolean`, lateUntil: `string`
- **PublishGradesDto** – **gradeIds**: `string[]`
- **QuestionDto** – **type**: `string ∈ {SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE, SHORT_ANSWER, ESSAY, FILE_UPLOAD}`, **content**: `string`, **points**: `number`, isRequired: `boolean`, options: `OptionDto[]`, config: `object`, referenceAnswer: `string`, explanation: `string`, rubric: `object`, attachmentFileIds: `string[]`
- **ReorderDto** – **questionIds**: `string[]`
- **ReturnDto** – **studentId**: `string`, **reason**: `string`, dueAt: `string`
- **RubricDto** – **criteria**: `CriterionDto[]`
- **SchoolYearDto** – **name**: `string`, **startDate**: `string`, **endDate**: `string`, isCurrent: `boolean`
- **ScoreDto** – score: `number`, criteria: `CriterionScoreDto[]`, feedback: `string`, isMarkedWrong: `boolean`, reason: `string`
- **SemesterDto** – **name**: `string`, **ordinal**: `number`, **startDate**: `string`, **endDate**: `string`
- **SettingsDto** – fileAllowedTypes: `string[]`, fileMaxMb: `number`, submitGraceSeconds: `number`, scoreStep: `number ∈ {0.1, 0.25, 0.5, 1}`, aiEnabled: `boolean`, aiApprovalRef: `string`, aiApprovedByName: `string`, aiMonthlyLimitUsd: `number`
- **SubjectDto** – **code**: `string`, **name**: `string`
- **TeachingDto** – **teacherId**: `string`, **subjectId**: `string`, semesterId: `string`
- **UpdateAssignmentDto** – title: `string`, subjectId: `string`, dueAt: `string`, allowLate: `boolean`, lateUntil: `string`, description: `string`, instructions: `string`, topic: `string`, passScore: `number`, timeLimitMinutes: `number`, allowResubmit: `boolean`, maxAttempts: `number`, answerVisibility: `string ∈ {NEVER, AFTER_SUBMIT, AFTER_DUE, AFTER_PUBLISH}`, aiGradingAllowed: `boolean`, aiFeedbackVisible: `boolean`, attachmentFileIds: `string[]`
- **UpdateClassDto** – name: `string`, gradeLevel: `number`, homeroomTeacherId: `string`, archived: `boolean`
- **UpdateSubjectDto** – name: `string`, archived: `boolean`
- **UpdateTenantDto** – name: `string`, maxUsers: `number`, maxStorageMb: `number`
- **UpdateUserDto** – fullName: `string`, email: `string`, phone: `string`, specialization: `string`, dateOfBirth: `string`
