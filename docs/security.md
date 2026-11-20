# Security & Privacy Requirements – Homework Management System

> **DRAFT – soạn sớm theo yêu cầu, chờ duyệt ở Phase 2; hoàn thiện ở Phase 8 (security review).**
> Chi tiết liên quan: [authentication-authorization.md](./authentication-authorization.md), [architecture.md §3](./architecture.md#3-multi-tenancy), [ai-grading-design.md](./ai-grading-design.md).

---

## 1. Phạm vi và mô hình mối đe dọa

| Tài sản | Mối đe dọa chính |
|---|---|
| Dữ liệu cá nhân HS (đa số là trẻ vị thành niên), bài làm, điểm | Rò chéo tenant, IDOR trong tenant, lộ ra bên thứ ba (AI), lộ qua log/backup |
| Đáp án, đề chưa mở | HS xem trước qua API/DevTools |
| Tính toàn vẹn của điểm | HS sửa điểm, sửa không có dấu vết, AI tự công bố |
| Tài khoản | Brute force, đánh cắp phiên, CSRF, XSS lấy phiên |
| Chi phí | Gọi AI ngoài ý muốn, lạm dụng upload |
| Hạ tầng | Lộ secret, cấu hình DB role sai, file độc hại |

Kẻ tấn công giả định: HS tò mò/có kỹ năng; người dùng của trường khác; tài khoản bị chiếm; người bên ngoài không đăng nhập; lỗi lập trình (không cố ý).

---

## 2. Ma trận yêu cầu bảo mật (master prompt §11 + multi-tenant)

| # | Yêu cầu | Biện pháp | Kiểm thử |
|---|---|---|---|
| S1 | Authentication | Cookie `__Host-` httpOnly/Secure/SameSite, JWT ngắn hạn, refresh xoay vòng + phát hiện dùng lại, MFA cho Platform Admin | auth test suite |
| S2 | Authorization / RBAC | Permission + scope, 10 lớp kiểm tra (auth §7) | Test mọi endpoint × mọi role |
| S3 | **Cô lập tenant** | Tenant từ host + kiểm tra claim `tid`; khóa ngoại kép; RLS fail-closed; role DB tách biệt; cookie theo host; prefix storage/cache | Bộ test cô lập tenant (architecture §3.11) |
| S4 | Password hashing | Argon2id, chặn mật khẩu yếu/phổ biến, mật khẩu tạm ngẫu nhiên (không từ mã HS – D4.3) | Unit + kiểm tra DB |
| S5 | Input validation | Zod schema dùng chung web/api; whitelist trường (không mass assignment); giới hạn độ dài/kích thước; kiểm tra ràng buộc nghiệp vụ ở service | Test giá trị biên |
| S6 | SQL injection | Prisma (truy vấn có tham số); raw SQL chỉ dùng `Prisma.sql` có tham số; lint cấm `$queryRawUnsafe` | Lint + test |
| S7 | XSS | Rich text lưu JSON Tiptap, sanitize theo whitelist node/mark/thuộc tính ở server; render qua renderer kiểm soát (không `dangerouslySetInnerHTML` với HTML từ người dùng); KaTeX `trust: false`; nhận xét AI là văn bản thuần; CSP chặt | Test payload XSS |
| S8 | CSRF | Double-submit gắn phiên + kiểm tra `Origin` + SameSite | Test thiếu/sai token |
| S9 | Rate limiting | Nginx (thô) + throttler Redis theo IP, user, tenant; giới hạn riêng cho đăng nhập, upload, autosave, kích hoạt AI | Test vượt ngưỡng |
| S10 | Secure file upload | Presigned PUT có giới hạn kích thước; xác nhận phía server: magic bytes, extension, dung lượng thật, checksum; tên lưu là UUID; bucket private; domain storage riêng | Test file giả mạo |
| S11 | File type validation | Whitelist theo tenant trong trần nền tảng (PDF, DOCX, XLSX, PPTX, JPG, PNG…); DOCX/XLSX/PPTX kiểm tra cấu trúc ZIP hợp lệ; chặn file thực thi, SVG (trừ khi sanitize), HTML | Test |
| S12 | File size limits | Theo file, theo câu trả lời, theo lần nộp, theo tenant (hạn mức) | Test |
| S13 | Signed URL | GET 60–300 giây, sau khi kiểm tra quyền trên bản ghi chủ; `Content-Disposition: attachment`; không cache công khai | Test URL hết hạn, URL tenant khác |
| S14 | Kiểm soát truy cập bài nộp | Policy scope + RLS + serializer; 404 khi ngoài scope | business-workflows §8 |
| S15 | Audit logs | Append-only (trigger chặn sửa/xóa); truy cập nhạy cảm có lý do; thay đổi điểm có `grade_history` (D7.3) | Test bản ghi audit tồn tại |
| S16 | API key protection | Key AI chỉ ở secret của worker; không bao giờ tới frontend/API; không log; xoay vòng được | Kiểm tra cấu hình |
| S17 | Không commit `.env` | `.gitignore` + `.env.example` không có giá trị thật; secret scanning (gitleaks) trong CI và pre-commit | CI |
| S18 | HS không xem bài HS khác | S14 | Test |
| S19 | GV không truy cập lớp không được phân công | Scope A tính theo phân công hiện hành | Test, kể cả sau khi gỡ phân công |
| S20 | HS không sửa điểm | Không có permission `grade.write`; không có endpoint HS ghi điểm | Test |
| S21 | HS không xem đáp án trước khi được phép | Serializer HS loại bỏ `is_correct`, `config`, `reference_answer`, `explanation`, rubric nội bộ theo `answer_visibility` | Test khẳng định response không chứa các trường này |
| S22 | AI không tự công bố điểm | Điểm AI ở bảng riêng; công bố chỉ qua `grade.publish` của GV; công bố kiểm tra mọi câu `FINAL`/`AUTO_GRADED` | Test |

---

## 3. HTTP security headers (Nginx + Next.js)

| Header | Giá trị |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (bật `preload` sau khi ổn định) |
| `Content-Security-Policy` | `default-src 'self'`; `script-src 'self' 'nonce-…'`; `style-src 'self' 'unsafe-inline'` (giảm dần); `img-src 'self' data: <storage-domain>`; `connect-src 'self'`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Tắt camera, microphone, geolocation… |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cache-Control` | `no-store` cho response API có dữ liệu cá nhân |

---

## 4. Bảo vệ dữ liệu cá nhân

Tham chiếu: Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân. Vai trò pháp lý (trường là bên kiểm soát dữ liệu, nền tảng là bên xử lý) chờ xác nhận ở O-11.

| Nguyên tắc | Biện pháp |
|---|---|
| Tối thiểu hóa | Hồ sơ HS chỉ gồm họ tên, mã HS, ngày sinh (tùy chọn). Không thu thập số định danh, địa chỉ. Nội dung không gửi ra ngoài khi chưa phê duyệt |
| Giới hạn mục đích | Dữ liệu chỉ dùng cho học tập và chấm điểm. Thống kê nền tảng chỉ dùng số liệu tổng hợp, không định danh |
| Kiểm soát truy cập | RBAC + scope; truy cập nhạy cảm cần lý do và có audit |
| Chuyển dữ liệu cho bên thứ ba (AI) | Chỉ sau phê duyệt (D11.1), qua 5 cổng, đã ẩn danh, có dry-run để rà soát |
| Lưu trữ có thời hạn | Retention (O-15): raw response AI 180 ngày, audit ≥ 2 năm, file tạm 24 giờ, file kết quả import xóa sau khi tải |
| Mã hóa | TLS khi truyền; mã hóa khi lưu ở mức đĩa/DB/bucket (cấu hình hạ tầng – Phase 8); secret TOTP mã hóa ở ứng dụng |
| Quyền của chủ thể dữ liệu | Xuất dữ liệu theo HS/tenant (ADV, PLT-08); xóa theo yêu cầu thực hiện qua quy trình của trường |
| Log | Không log nội dung bài làm, mật khẩu, token, cookie; che PII trong log lỗi |
| Môi trường dev/test | Chỉ dùng dữ liệu giả; không sao chép dữ liệu production về dev |

---

## 5. Bảo mật AI (tóm tắt – chi tiết ở ai-grading-design.md)

1. 5 cổng kích hoạt, mặc định đóng; GV chủ động kích hoạt (D9.1).
2. Ẩn danh fail-closed, có báo cáo các mục đã che, có dry-run (D11.4).
3. Prompt injection: tách dữ liệu bằng ranh giới ngẫu nhiên, system prompt cố định theo version, structured output, validate, gắn cờ nghi ngờ, GV luôn duyệt.
4. Không tin output: tính lại tổng điểm, kiểm tra biên, nhận xét là văn bản thuần.
5. Chi phí: không hạn mức thì không chạy; đặt trước atomic; cảnh báo; kill switch; test không gọi API thật (D11.9).
6. Key chỉ ở worker; provider `fake` bị chặn ở production.
7. Lưu lịch sử chấm: model, prompt version, token, chi phí, thời gian, raw response (có hạn).

---

## 6. Bảo mật hạ tầng & vận hành

| Hạng mục | Yêu cầu |
|---|---|
| DB roles | `hms_owner` (migration), `hms_app` (NOBYPASSRLS, không phải owner), `hms_system` (BYPASSRLS, chỉ dùng trong module được phép). Ứng dụng kiểm tra lúc khởi động |
| Secrets | Đọc từ biến môi trường hoặc secret manager; không có trong image Docker; xoay vòng khóa JWT bằng `kid` |
| Container | Chạy non-root, filesystem read-only khi có thể, image tối giản, quét lỗ hổng image |
| Mạng | Chỉ Nginx mở ra Internet; DB/Redis/MinIO trong mạng nội bộ; Redis có mật khẩu/ACL |
| Phụ thuộc | Lockfile; `pnpm audit`/Dependabot; review khi thêm thư viện |
| Backup | Backup DB định kỳ có mã hóa, kiểm thử khôi phục; giữ theo O-11 |
| Giám sát | Cảnh báo: tăng đột biến đăng nhập lỗi, 403/404 bất thường (dò ID), lỗi RLS, chi phí AI, job lỗi |
| Quy trình | Review code bắt buộc với module auth/authz/tenancy/grading/ai; security review ở Phase 8 |

---

## 7. Danh sách kiểm thử bảo mật bắt buộc (tóm tắt)

1. Cô lập tenant cho **mọi** endpoint (ID chéo, token chéo, liên kết chéo, truy vấn DB không có context).
2. Ma trận permission × endpoint.
3. IDOR trong tenant: HS–HS, GV–lớp không được phân công, GV sau khi bị gỡ phân công.
4. Không lộ đáp án/điểm chưa công bố/nhận xét AI chưa duyệt trong response.
5. CSRF, cookie flags, refresh reuse.
6. Brute force, khóa tạm.
7. XSS qua rich text, công thức, tên file, nhận xét.
8. Upload: đổi đuôi, magic bytes sai, quá dung lượng, vượt hạn mức, ZIP bomb trong DOCX.
9. AI: cổng đóng không gửi dữ liệu; payload không có PII; injection; output độc hại/không hợp lệ.
10. Audit: truy cập nhạy cảm và thay đổi điểm có bản ghi; bảng audit không sửa/xóa được.
11. Không có secret trong repo/image/log.
