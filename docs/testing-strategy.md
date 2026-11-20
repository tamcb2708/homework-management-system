# Testing Strategy & Results – Homework Management System

## 1. Các tầng kiểm thử

| Tầng | Công cụ | Phạm vi | Vị trí |
|---|---|---|---|
| Typecheck | `tsc --noEmit` | API (src + test), web | `pnpm typecheck` |
| Lint | ESLint 9 (typescript-eslint, next/core-web-vitals) | API, web | `pnpm lint` |
| Unit | Jest | Rule engine chấm tự động, sanitizer câu trả lời/rich text, bộ ẩn danh AI, validator output AI, provider AI, ước tính chi phí | `apps/api/src/**/*.spec.ts` |
| Integration | Jest + Supertest + **PostgreSQL thật** (DB `hms_test` tạo lại từ migration mỗi lần chạy, đúng role `hms_app`/`hms_system`, RLS thật) | Xác thực, phân quyền, cô lập tenant, schema/migration, luồng nghiệp vụ đầy đủ, file, cổng AI | `apps/api/test/*.int-spec.ts` |
| E2E | Playwright (Chromium) trên stack thật (API + web build production + DB `hms_e2e` seed demo) | Workflow A/B/C qua giao diện, phân quyền, realm Platform | `e2e/tests/*.spec.ts` |

Nguyên tắc: không chỉ kiểm tra HTTP status, mà **khẳng định trạng thái database** (số phiên bản nộp, chi tiết điểm, lịch sử điểm, audit log, thông báo, liên kết chéo tenant…). Kiểm thử không gọi API AI thật (D11.9).

## 2. Cách chạy

```bash
pnpm install
pnpm --filter @hms/api exec prisma generate
pnpm typecheck && pnpm lint
cd apps/api && npx jest                 # unit + integration (cần apps/api/.env.test, DB_NAME kết thúc bằng _test)
cd ../.. && pnpm -r build
npx playwright test -c e2e/playwright.config.ts   # cần apps/api/.env.e2e
```

`apps/api/.env.test` và `.env.e2e` được tạo từ `.env.example` (đổi `DB_NAME` thành `hms_test`/`hms_e2e`; E2E dùng `PORT=4010`, `APP_ORIGINS=http://localhost:3010`). Cần quyền admin PostgreSQL (`ADMIN_DATABASE_URL` hoặc user `postgres`) để tạo lại DB test.

## 3. Kết quả (2026-11-21, nhánh `feat/mvp-implementation`)

| Bộ kiểm thử | Kết quả |
|---|---|
| Typecheck API (src + test) | ✅ 0 lỗi |
| Typecheck web | ✅ 0 lỗi |
| Lint API | ✅ 0 lỗi |
| Lint web | ✅ 0 lỗi |
| Unit (4 suite) | ✅ 26/26 |
| Integration (5 suite) | ✅ 38/38 |
| E2E Playwright (3 file) | ✅ 12/12 |
| Build production (API, web 33 route) | ✅ |

### 3.1 Ánh xạ 20 luồng bắt buộc (master prompt §12)

| # | Luồng | Integration | E2E |
|---|---|---|---|
| 1 | Admin đăng nhập | auth | A, security (Platform) |
| 2 | Admin tạo tài khoản giáo viên | workflow | A |
| 3 | Admin tạo lớp học | workflow | A |
| 4 | Admin thêm học sinh vào lớp | workflow, tenant-isolation | A |
| 5 | Giáo viên đăng nhập | auth | B1 |
| 6 | Giáo viên tạo bài tập | workflow | B4–B8 |
| 7 | Giáo viên giao bài cho lớp | workflow | B4–B8 |
| 8 | Học sinh đăng nhập (mã HS / email) | auth | C1 |
| 9 | Học sinh xem bài tập | workflow | C1–C3 |
| 10 | Học sinh làm bài | workflow | C4 |
| 11 | Học sinh lưu bản nháp | workflow (revision, stale tab) | C4 (tải lại trang vẫn còn) |
| 12 | Học sinh nộp bài | workflow (idempotent) | C5–C7 |
| 13 | Chấm trắc nghiệm tự động | workflow + unit engine | B10 |
| 14 | AI chấm tự luận | files-ai: **cổng đóng, 409, không có job** (đúng D11: AI DISABLED) + unit anonymizer/validator | – |
| 15 | Giáo viên duyệt điểm (rubric) | workflow | B10–B13 |
| 16 | Giáo viên chỉnh sửa điểm | workflow (ghi đè có lý do, sửa sau công bố) | B10–B13 |
| 17 | Giáo viên công bố điểm | workflow | B13 |
| 18 | Học sinh xem kết quả | workflow | C8–C9 |
| 19 | Hệ thống gửi thông báo | workflow (DB) | C1, C9 (chuông thông báo) |
| 20 | Truy cập trái phép | auth, tenant-isolation, workflow | security |

### 3.2 Kiểm thử bổ sung

| Tình huống | Bộ test |
|---|---|
| Nộp bài trùng request (song song, cùng Idempotency-Key) | workflow – DB chỉ có 1 phiên bản |
| Nộp sau hạn | workflow – `DEADLINE_PASSED`, không tạo phiên bản |
| Nộp lại (GV bật / GV yêu cầu), giữ lịch sử, điểm hiệu lực | workflow |
| AI API lỗi / JSON không hợp lệ / injection | unit (validator, anonymizer, provider giả lập); pipeline gọi API thật chưa bật (D11) |
| File không hợp lệ (đổi đuôi, sai định dạng, quá dung lượng, sai mục đích) | files-ai |
| Người dùng không có quyền | workflow, security E2E |
| Giáo viên bị gỡ khỏi lớp | workflow – mất quyền ngay (404) |
| Nhiều học sinh nộp cùng lúc | workflow – mỗi HS đúng 1 phiên bản |
| Cô lập tenant: ID chéo, liên kết chéo, RLS khi thiếu context, ghi chéo, FK kép, request song song 2 tenant, tenant tạm ngưng | tenant-isolation |
| Migration: mọi bảng có `tenant_id` đều bật + FORCE RLS và có policy; role không BYPASSRLS; trigger append-only; check constraint | schema |
| Khóa tạm sau 5 lần sai, CSRF, Origin lạ, refresh reuse, đổi mật khẩu bắt buộc, khóa tài khoản thu hồi phiên | auth |

## 4. Lỗi phát hiện nhờ kiểm thử (đã sửa tận gốc)

| Lỗi | Phát hiện bởi | Nguyên nhân gốc | Sửa |
|---|---|---|---|
| Bộ đếm đăng nhập sai / khóa tạm không có tác dụng | auth integration | Ghi bộ đếm + audit trong cùng transaction rồi `throw` → rollback | Ghi nhận thất bại trong transaction riêng |
| Phát hiện refresh token bị dùng lại không thu hồi phiên | auth integration | Như trên | Thu hồi family trong transaction riêng |
| Thêm câu hỏi trắc nghiệm lỗi runtime | seed | Nested create qua quan hệ khóa ngoại kép không nhận `tenantId` | Bỏ `tenantId` ở nested create |
| Không tạo được bài nháp có điểm đạt | seed | CHECK `pass_score <= max_score` áp cả cho bài nháp (max = 0) | Migration mới: chỉ áp khi rời DRAFT |
| Web gọi nhầm API | E2E | `rewrites()` của Next.js cố định URL lúc build | Proxy runtime đọc `API_INTERNAL_URL` |
| Nhãn form không gắn với ô nhập (a11y) | E2E | `Field` không gán `id/htmlFor` | Tự sinh id, `aria-required`, `aria-describedby` |
| Không tạo được lớp khi bỏ trống "Khối" | E2E | Zod `coerce` biến `''` thành 0 | Tiền xử lý rỗng → undefined, thông báo tiếng Việt |
| Năm học chưa được chọn sẵn khi tải chậm | E2E | Reset form trước khi dữ liệu về | Chọn năm hiện hành khi dữ liệu về |
| Rate limit đăng nhập 10/phút/IP chặn cả phòng máy chung NAT | auth integration | Ngưỡng quá thấp | Cấu hình `LOGIN_RATE_LIMIT` (mặc định 30), giữ khóa theo tài khoản |
