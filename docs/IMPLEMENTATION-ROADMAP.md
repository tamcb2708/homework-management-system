# Implementation Roadmap

> Cập nhật: 2026-11-21 · Nhánh làm việc: `feat/mvp-implementation` · Repository: `tamcb2708/homework-management-system`

## 1. Trạng thái khi bắt đầu chế độ Autonomous

| Hạng mục | Kết quả kiểm tra |
|---|---|
| Git | Nhánh `main` có 1 commit (tài liệu), working tree sạch, remote `origin` → GitHub |
| CLAUDE.md | Không có |
| Code | **Chưa có** – chỉ có tài liệu trong `docs/` |
| Phase 1 (phân tích) | Bản 2 hoàn tất; quyết định D1–D14 đã xác nhận |
| Phase 2 (thiết kế) | Bản nháp sớm: architecture, database-design, erd, auth, ai-grading, security. Chưa có api-specification |
| Môi trường build | Node 22, pnpm 10, PostgreSQL 16 có sẵn. **Không có Docker daemon. Mạng ra ngoài bị chặn với dịch vụ tunnel/hosting** (Cloudflare tunnel, ngrok, localhost.run, Railway, Render API) |

## 2. Câu hỏi mở chưa được trả lời → áp dụng mặc định đề xuất

Chế độ autonomous yêu cầu không dừng lại hỏi từng module. Các câu hỏi mở trong `decisions.md` được triển khai theo **đề xuất mặc định** đã ghi ở đó, trừ các điểm sau:

| Mã | Áp dụng trong MVP | Lý do |
|---|---|---|
| O-01 | Chế độ **một host** (đăng nhập bằng *mã trường* + định danh + mật khẩu; tenant lấy từ token đã ký, không từ dữ liệu client gửi). Subdomain để sau khi có domain | Staging/preview chưa có domain và wildcard DNS |
| O-10 | MFA cho Platform Admin **chưa làm** (ghi ở Known issues) | Ưu tiên luồng MVP; cần ứng dụng authenticator khi demo |
| Đăng nhập demo | Chấp nhận **mã HS hoặc email** cho học sinh (mã HS vẫn là định danh chính – D4.1) | Yêu cầu tài khoản demo dạng `student1@demo.local` |

## 3. Điều chỉnh kiến trúc cho MVP (so với bản nháp thiết kế)

| Thiết kế | MVP | Lý do / đường nâng cấp |
|---|---|---|
| Redis + BullMQ, transactional outbox | **Không dùng Redis**. Thông báo ghi trong cùng transaction nghiệp vụ; scheduler chạy trong tiến trình API dùng `FOR UPDATE SKIP LOCKED` | Giảm hạ tầng staging; vẫn an toàn khi chạy nhiều instance. BullMQ thêm khi bật AI thật |
| Role DB `hms_system` có BYPASSRLS | Policy `system_access` riêng cho `hms_system` | Chạy được trên PostgreSQL managed (không cấp được BYPASSRLS) |
| Bảng `roles`/`role_permissions` | `user_roles(role enum)` + ánh xạ permission trong code | Role tùy chỉnh là ADV (O-06) |
| Bản nháp là các dòng `submission_answers` có `version_id NULL` | Bản nháp ở `submissions.draft` (JSON, có revision); câu trả lời đã nộp là dòng bất biến | Đơn giản, autosave atomic |
| Upload qua presigned URL | Upload qua API (multipart) → storage driver `local` hoặc `s3` | Kiểm tra magic bytes đồng bộ; driver S3 dùng signed URL khi tải |
| `packages/ai-grading` riêng | Thư mục `apps/api/src/ai-grading/engine` (không phụ thuộc Nest/DB) | Bớt bước build workspace |

## 4. Kế hoạch triển khai

| # | Phase | Nội dung | Trạng thái |
|---|---|---|---|
| 1 | Requirement & Architecture | `api-specification.md` (sinh từ OpenAPI), cập nhật thiết kế theo điều chỉnh §3 | ✅ |
| 2 | Foundation | Monorepo, Prisma + migration + RLS + roles, NestJS (config, logging, lỗi, validation, Swagger), auth 2 realm, RBAC, tenant context | ✅ |
| 3 | Core modules | Platform, trường, người dùng, GV, HS, lớp, môn, năm học, bài tập, câu hỏi, bài nộp, file, thông báo | ✅ |
| 4 | Grading | Tự động, thủ công, rubric, lịch sử, công bố, yêu cầu nộp lại, AI gates (DISABLED) | ✅ (AI pipeline gọi nhà cung cấp chưa bật – D11) |
| 5 | Dashboard | Platform, School Admin, Teacher, Student + xuất Excel | ✅ |
| 6 | UI/UX | Design system, responsive, trạng thái loading/empty/error, toast, dialog | ✅ |
| 7 | Testing | Typecheck, lint, unit, integration (DB thật), tenant isolation, E2E Playwright | ✅ 26 unit + 38 integration + 12 E2E |
| 8 | Deployment | Dockerfile, docker-compose, Nginx, script triển khai, hướng dẫn staging, local preview | ⚠️ File sẵn sàng, preview cục bộ chạy; **chưa có URL công khai** (thiếu hosting) |

Chi tiết chức năng đã có / còn thiếu / lỗi tồn tại được cập nhật ở cuối quá trình (mục 5).

## 5. Kết quả

### 5.1 Chức năng đã có (đã kiểm thử)

- **Nền tảng & bảo mật**: multi-tenant (RLS FORCE + khóa ngoại kép + tenant context theo transaction), 3 role DB, cookie `__Host-` httpOnly, CSRF gắn phiên + kiểm tra Origin, refresh xoay vòng + phát hiện dùng lại, khóa tạm khi đăng nhập sai, rate limit, Argon2id, mật khẩu tạm ngẫu nhiên, đổi mật khẩu bắt buộc, audit append-only (truy cập nhạy cảm có lý do), log JSON che dữ liệu nhạy cảm, Swagger.
- **Platform Admin**: thống kê, tạo/tạm ngưng/kích hoạt trường (kèm School Admin đầu tiên), nhật ký nền tảng, công tắc AI.
- **School Admin**: dashboard, giáo viên/học sinh (tạo, sửa, khóa, reset mật khẩu, lọc, tìm kiếm, phân trang), lớp (ghi danh, phân công), môn, năm học/học kỳ, bài tập toàn trường + xem bài làm có audit, nhật ký, cấu hình.
- **Teacher**: dashboard, lớp/học sinh/lịch sử học tập, soạn bài tập 6 loại câu (Mixed), rubric có version, công thức KaTeX, tệp đính kèm, giao bài (lớp/nhiều lớp/từng HS, lên lịch, nộp muộn, nộp lại, giới hạn lượt), thu hồi/khôi phục/nhân bản/lưu trữ, theo dõi trạng thái, chấm tự động + thủ công + rubric, lịch sử điểm, công bố từng bài/hàng loạt, yêu cầu nộp lại, sửa đáp án → chấm lại, xuất Excel.
- **Student**: dashboard, danh sách + bộ lọc, làm bài (autosave có revision, đồng hồ theo giờ server, tự nộp khi hết giờ, rich text, nộp tệp), nộp idempotent, nộp lại, xem kết quả theo chính sách đáp án, kết quả học tập.
- **Thông báo**: bài mới, sắp đến hạn, bài nộp mới (gom nhóm), đã công bố điểm, điểm được sửa, yêu cầu nộp lại; chuông + trang thông báo, đánh dấu đã đọc.
- **AI grading (DISABLED)**: 5 cổng kích hoạt, bộ ẩn danh, validator output, provider tắt/giả lập (giả lập bị cấm ở production), từ chối 409 khi cổng đóng.

### 5.2 Chức năng còn thiếu / ngoài MVP

| Hạng mục | Ghi chú |
|---|---|
| URL staging công khai | Cần hosting/VPS hoặc cho phép tunnel (deployment.md §8) |
| Pipeline gọi Anthropic thật | Chờ phê duyệt D11; mã chỉ có provider tắt/giả lập |
| MFA cho Platform Admin | O-10 chưa xác nhận |
| Import tài khoản từ Excel (ADM-03) | Chưa làm; tạo từng tài khoản qua giao diện |
| Subdomain theo trường (O-01) | Đang dùng mã trường khi đăng nhập |
| Giao theo nhóm, ngân hàng câu hỏi, xuất PDF | Ngoài MVP (D12) – schema đã dành sẵn |
| Email, realtime (SSE), quét virus file, role tùy chỉnh, break-glass | ADV |
| Chèn ảnh/công thức ngay trong trình soạn thảo tự luận | Hiện hỗ trợ định dạng văn bản; ảnh nộp qua câu "Nộp tệp" |

### 5.3 Lỗi/hạn chế đang biết

Xem FINAL-DELIVERY.md §16.
