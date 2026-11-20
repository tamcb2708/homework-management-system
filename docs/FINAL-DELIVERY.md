# Final Delivery – Homework Management System (MVP)

> Ngày bàn giao: 2026-11-21 · Repository: `tamcb2708/homework-management-system` · Nhánh: `feat/mvp-implementation` (pull request nháp tới `main`).

## 1. Project overview

Nền tảng SaaS multi-tenant quản lý bài tập cho nhiều trường học. Giáo viên tạo và giao bài; học sinh làm, lưu nháp và nộp bài trực tuyến; hệ thống chấm tự động phần trắc nghiệm; giáo viên chấm tay/theo rubric, nhận xét và công bố điểm; học sinh xem kết quả. Dữ liệu mỗi trường được cô lập ở cả tầng ứng dụng và tầng cơ sở dữ liệu. AI hỗ trợ chấm đã được thiết kế và có cổng kiểm soát, nhưng **giữ trạng thái DISABLED** cho tới khi có phê duyệt về dữ liệu và chi phí (quyết định D11).

## 2. Architecture

- Modular monolith **NestJS** (REST, Swagger) + **Next.js** (App Router), cùng origin: `/api` → API (qua Nginx hoặc proxy runtime của web), `/` → web.
- **PostgreSQL 16** dùng chung schema, `tenant_id` trên mọi bảng nghiệp vụ, **Row-Level Security FORCE** với policy theo role, **khóa ngoại kép `(tenant_id, id)`**, tenant context đặt bằng `set_config(..., is_local)` trong từng transaction.
- Ba role DB: `hms_owner` (migration), `hms_app` (runtime, chịu RLS – API từ chối khởi động nếu role này có BYPASSRLS), `hms_system` (platform/scheduler, policy riêng).
- Hai realm xác thực tách biệt: trường (`/login`) và nền tảng (`/platform/login`), cookie httpOnly `__Host-`, CSRF gắn phiên.
- Scheduler trong tiến trình API (mở bài theo lịch, nhắc hạn, tự nộp khi hết giờ), idempotent khi chạy nhiều instance.
- Chi tiết: [architecture.md](./architecture.md), điều chỉnh khi triển khai: [IMPLEMENTATION-ROADMAP.md §3](./IMPLEMENTATION-ROADMAP.md).

## 3. Technology stack

| Lớp | Công nghệ |
|---|---|
| Frontend | Next.js 15.5, React 19, TypeScript, Tailwind CSS 3.4, Radix UI (dialog, menu), Lucide, React Hook Form + Zod, TanStack Query 5, Tiptap (rich text), KaTeX, Sonner, Plus Jakarta Sans |
| Backend | NestJS 11, TypeScript, class-validator, Swagger/OpenAPI, Prisma 6.19, jose (JWT), argon2, helmet, @nestjs/throttler, nestjs-pino, exceljs, AWS SDK S3 |
| Database | PostgreSQL 16 (RLS, citext, trigger append-only) |
| Test | Jest + Supertest (DB thật), Playwright 1.63 |
| Deploy | Docker, Docker Compose, Nginx |

## 4. Database structure

40 bảng (5 nền tảng, 35 thuộc tenant), 3 migration (`init`, `security`, `pass_score_draft`). Nhóm chính: danh tính (`users`, `user_roles`, `students`, `teachers`, `auth_sessions`), học vụ (`school_years`, `semesters`, `subjects`, `classes`, `class_students`, `class_teachers`), bài tập (`assignments`, `assignment_targets`, `questions`, `question_options`, `grading_rubrics`, `rubric_criteria`, tệp đính kèm), bài nộp (`submissions` + bản nháp, `submission_versions`/`submission_answers`/`submission_attachments` bất biến), chấm điểm (`grades`, `grade_details`, `grade_detail_criteria`, `grade_history` append-only), AI (`ai_grading_*`, `ai_budget_periods`), `notifications`, `audit_logs`, `files`. Điểm AI đề xuất tách khỏi điểm chính thức; điểm lưu `max_score` (snapshot) và `earned_score`. Chi tiết: [database-design.md](./database-design.md), [erd.md](./erd.md), schema: `apps/api/prisma/schema.prisma`.

## 5. Modules completed

| Module | Backend | Frontend | Test |
|---|---|---|---|
| Platform Admin | ✅ | ✅ | integration + E2E |
| School (tenant) management | ✅ | ✅ | integration + E2E |
| User / Teacher / Student management | ✅ | ✅ | integration + E2E |
| Class / Subject / School year | ✅ | ✅ | integration + E2E |
| Assignment & Question (6 loại + Mixed, rubric) | ✅ | ✅ | integration + E2E |
| Submission (nháp, nộp, nộp lại, phiên bản) | ✅ | ✅ | integration + E2E |
| File (upload an toàn, tải có kiểm tra quyền) | ✅ | ✅ | integration |
| Notification | ✅ | ✅ | integration + E2E |
| Grading (tự động, thủ công, rubric, lịch sử, công bố, trả bài) | ✅ | ✅ | unit + integration + E2E |
| Dashboard & báo cáo (4 vai trò, Excel) | ✅ | ✅ | integration |
| AI grading | Cổng + ẩn danh + validator + provider tắt/giả lập | Hiển thị trạng thái cổng | unit + integration (DISABLED) |

## 6. Features completed

Xem [IMPLEMENTATION-ROADMAP.md §5.1](./IMPLEMENTATION-ROADMAP.md) và hướng dẫn [user-guide.md](./user-guide.md). Ba workflow demo (A – Admin, B – Teacher, C – Student) đều được kiểm chứng tự động bằng Playwright trên database thật.

## 7. Features not completed

| Hạng mục | Lý do / kế hoạch |
|---|---|
| URL staging công khai | Thiếu hosting/VPS; môi trường phát triển chặn dịch vụ tunnel/hosting (§13) |
| AI gọi Anthropic thật | Chờ phê duyệt D11 (dữ liệu học sinh + ngân sách) |
| MFA Platform Admin (O-10), subdomain theo trường (O-01) | Chờ xác nhận quyết định |
| Import tài khoản Excel (ADM-03) | Chưa làm |
| Giao theo nhóm, ngân hàng câu hỏi nâng cao, xuất PDF | Ngoài MVP (D12), schema đã dành sẵn |
| Email, realtime, quét virus, role tùy chỉnh | Nâng cao |

## 8. Test results

| Bộ | Kết quả |
|---|---|
| Typecheck API + web | ✅ 0 lỗi |
| Lint API + web | ✅ 0 lỗi |
| Unit (Jest) | ✅ 26/26 |
| Integration (Jest + PostgreSQL thật, RLS thật) | ✅ 38/38 |
| E2E (Playwright, stack production build) | ✅ 12/12 |
| Build production | ✅ API, web (33 route) |

Chi tiết, ánh xạ 20 luồng bắt buộc và danh sách lỗi đã sửa nhờ kiểm thử: [testing-strategy.md](./testing-strategy.md).

## 9. Security review

| Yêu cầu | Trạng thái |
|---|---|
| Cô lập tenant (RLS FORCE, FK kép, context theo transaction, test cho ID chéo/liên kết chéo/thiếu context/song song) | ✅ |
| Xác thực cookie httpOnly `__Host-`, không lưu token ở localStorage, refresh xoay vòng + phát hiện dùng lại | ✅ |
| CSRF (double-submit gắn phiên) + kiểm tra Origin | ✅ |
| RBAC + phạm vi lớp/môn tính theo phân công hiện hành; 404 cho dữ liệu ngoài phạm vi | ✅ |
| Argon2id, chính sách mật khẩu, mật khẩu tạm không suy ra từ mã HS, khóa tạm | ✅ |
| Validation whitelist (từ chối trường lạ), Prisma tham số hóa, lint cấm raw SQL không tham số | ✅ |
| XSS: rich text allow-list phía server, KaTeX `trust:false`, CSP, file tải về dạng attachment + `sandbox` | ✅ |
| Upload: kiểm tra magic bytes, phần mở rộng, dung lượng, hạn mức, mục đích theo vai trò; tên lưu là UUID; storage private | ✅ |
| Học sinh không thấy đáp án/điểm/nhận xét AI trước khi được phép (serializer riêng, có test) | ✅ |
| Audit append-only; truy cập nhạy cảm bắt buộc lý do; mọi thay đổi điểm có lịch sử | ✅ |
| Rate limit (API + Nginx), header bảo mật, secret chỉ ở biến môi trường, `.env` không commit | ✅ |
| AI: tắt mặc định, 5 cổng, ẩn danh fail-closed, provider giả lập bị cấm ở production | ✅ |
| Còn lại | MFA Platform Admin; quét virus; rate limit theo IP khi chạy không có Nginx (proxy web che IP) – xem §16 |

## 10. Deployment instructions

Xem [deployment.md](./deployment.md). Tóm tắt staging trên VPS có Docker:

```bash
git clone https://github.com/tamcb2708/homework-management-system.git && cd homework-management-system
cp .env.docker.example .env.docker   # điền secret, domain
SEED_DEMO=1 ./scripts/deploy-staging.sh
```

Chạy cục bộ không cần Docker (PostgreSQL 16 có sẵn):

```bash
pnpm install && cp apps/api/.env.example apps/api/.env   # điền giá trị
bash scripts/db-setup.sh && pnpm -r build
(cd apps/api && set -a && . ./.env && set +a && node dist/scripts/seed-demo.js && node dist/main.js) &
(cd apps/web && API_INTERNAL_URL=http://localhost:4000 npx next start -p 3000)
```

## 11. Environment variables

Bảng đầy đủ: [deployment.md §5](./deployment.md). Mẫu: `apps/api/.env.example`, `.env.docker.example`.

## 12. Demo accounts

| Vai trò | Đăng nhập | Tài khoản |
|---|---|---|
| Platform Admin | `/platform/login` | `platform.admin@demo.local` |
| School Admin | `/login`, mã trường `demo` | `admin@demo.local` |
| Teacher | `/login`, mã trường `demo` | `teacher1@demo.local` (Toán), `teacher2@demo.local` (Ngữ văn) |
| Student | `/login`, mã trường `demo` | `student1@demo.local` hoặc mã `HS0001` (… `student20` / `HS0020`) |

**Mật khẩu không ghi trong repository** (repository đang ở chế độ công khai). Mật khẩu được tạo ngẫu nhiên khi seed, lưu trong file không commit `docs/STAGING-CREDENTIALS.local.md` của môi trường đã seed, hoặc đặt qua biến `DEMO_PASSWORD_*` khi triển khai staging. Không dùng cho production.

Dữ liệu demo: Trường THCS Demo, năm học 2026–2027 (2 học kỳ), 2 môn (Toán, Ngữ văn), 2 lớp (8A1, 8A2), 2 giáo viên, 20 học sinh, 5 bài tập (1 trắc nghiệm đã chấm và công bố, 1 bài 15 phút có giờ, 1 tự luận rubric có bài nộp đã chấm/chưa chấm, 1 bài nộp tệp cho phép nộp muộn, 1 bài nháp dạng Mixed), 21 lượt nộp, 16 điểm đã công bố.

## 13. Website URL

**Chưa có URL công khai.** Môi trường phát triển không có Docker daemon và proxy mạng từ chối mọi dịch vụ tunnel/hosting (Cloudflare Tunnel, ngrok, localhost.run, Railway, Render), nên không thể tạo đường dẫn truy cập được từ trình duyệt bên ngoài mà không bịa URL.

Đang chạy **preview cục bộ trong môi trường phát triển** (không truy cập được từ bên ngoài): `http://localhost:3000`.

Thông tin cần để tạo URL staging: xem [deployment.md §8](./deployment.md).

## 14. API URL

- Preview cục bộ: `http://localhost:3000/api` (qua web) – `http://localhost:4000/api` (trực tiếp).
- Staging: `https://<domain>/api` sau khi triển khai.

## 15. Swagger URL

- Preview cục bộ: `http://localhost:4000/api/docs` (JSON: `/api/docs-json`).
- Staging: `https://<domain>/api/docs`.
- Bản tĩnh: [api-specification.md](./api-specification.md) (92 endpoint, 33 DTO; sinh tự động từ OpenAPI).

## 16. Known issues

| # | Vấn đề | Mức | Ghi chú |
|---|---|---|---|
| 1 | Chưa triển khai công khai | Cao | Phụ thuộc hosting |
| 2 | Image Docker chưa được build thử (không có daemon) | Trung bình | `docker compose config` hợp lệ; standalone web và API đã chạy thử ngoài Docker |
| 3 | Khi chạy không có Nginx, API thấy IP của proxy web → rate limit theo IP gộp chung | Trung bình | Dùng Nginx (compose) hoặc định tuyến `/api` ở edge |
| 4 | Scheduler chạy trong tiến trình API (chu kỳ 30 giây) | Thấp | Thông báo mở bài theo lịch có thể trễ ≤ 30 giây |
| 5 | Trình soạn thảo tự luận chưa chèn ảnh/công thức trực tiếp | Thấp | Ảnh nộp qua câu "Nộp tệp"; công thức hiển thị trong đề bài |
| 6 | Cảnh báo AI vượt ngưỡng ngân sách chưa phát sinh (AI tắt) | Thấp | Bảng ngân sách đã có |
| 7 | Chưa có MFA, import Excel | Trung bình | Kế hoạch tiếp theo |

## 17. Future roadmap

1. Triển khai staging công khai khi có hosting; HTTPS; backup tự động.
2. MFA (TOTP) cho Platform Admin; import tài khoản từ Excel; quên mật khẩu qua email.
3. Bật AI grading sau phê duyệt D11: tích hợp Anthropic qua SDK chính thức ở worker, hàng đợi (BullMQ/Redis), ngân sách + cảnh báo, bộ đánh giá chất lượng (ai-grading-design §11–12).
4. Subdomain theo trường (O-01), tên miền riêng.
5. Giao theo nhóm, ngân hàng câu hỏi, xuất PDF, chèn ảnh/công thức trong bài tự luận.
6. Realtime (SSE), email notification, quét virus file, role tùy chỉnh, cổng phụ huynh.
