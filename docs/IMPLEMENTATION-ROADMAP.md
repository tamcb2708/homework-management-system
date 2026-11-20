# Implementation Roadmap

> Cập nhật: 2026-11-20 · Nhánh làm việc: `feat/mvp-implementation` · Repository: `tamcb2708/homework-management-system`

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
| 1 | Requirement & Architecture | Bổ sung `api-specification.md`, cập nhật thiết kế theo điều chỉnh §3 | Đang làm |
| 2 | Foundation | Monorepo, Prisma + migration + RLS + roles, NestJS (config, logging, lỗi, validation, Swagger), auth 2 realm, RBAC, tenant context | Đang làm |
| 3 | Core modules | Platform, trường, người dùng, GV, HS, lớp, môn, năm học, bài tập, câu hỏi, bài nộp, file, thông báo | Chưa |
| 4 | Grading | Tự động, thủ công, rubric, lịch sử, công bố, yêu cầu nộp lại, AI gates (DISABLED) | Chưa |
| 5 | Dashboard | Platform, School Admin, Teacher, Student + xuất Excel | Chưa |
| 6 | UI/UX | Design system, responsive, trạng thái loading/empty/error, toast, dialog | Chưa |
| 7 | Testing | Typecheck, lint, unit, integration (DB thật), tenant isolation, E2E Playwright | Chưa |
| 8 | Deployment | Dockerfile, docker-compose, Nginx, script triển khai, hướng dẫn staging, local preview | Chưa |

Chi tiết chức năng đã có / còn thiếu / lỗi tồn tại được cập nhật ở cuối quá trình (mục 5).

## 5. Kết quả (cập nhật khi hoàn tất)

_Sẽ cập nhật._
