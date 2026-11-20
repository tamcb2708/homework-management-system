# Requirements – Homework Management System

> Phase 1 – Discovery & Requirement Analysis · **Bản 2 – DRAFT chờ review**
> Quyết định đã xác nhận (D-xx) và câu hỏi mở (O-xx): [decisions.md](./decisions.md). Tài liệu liên quan: [use-cases.md](./use-cases.md), [business-workflows.md](./business-workflows.md), [architecture.md](./architecture.md), [database-design.md](./database-design.md), [erd.md](./erd.md), [authentication-authorization.md](./authentication-authorization.md), [ai-grading-design.md](./ai-grading-design.md), [security.md](./security.md).

---

## 1. Kết quả kiểm tra repository

| Hạng mục | Kết quả |
|---|---|
| Thư mục làm việc | Trống, không có mã nguồn → **dự án mới (greenfield)** |
| Git | Chưa phải git repository, chưa có remote. Theo **D14**, phải dừng trước Phase 3 để chủ dự án cung cấp repository |
| Công cụ có sẵn | Node.js 22, pnpm 10, PostgreSQL 16, Redis 7, Docker, Chromium + Playwright |

---

## 2. Tổng quan giải pháp

- **Multi-tenant SaaS** (D3): mỗi trường là một tenant. Dùng chung database và schema, mọi bảng nghiệp vụ có `tenant_id`, kết hợp **PostgreSQL Row-Level Security** và **khóa ngoại kép `(tenant_id, id)`**. Phân tích các phương án: [architecture.md §3](./architecture.md#3-multi-tenancy).
- Stack (D1): monorepo pnpm, gồm `apps/web` (Next.js), `apps/api` (NestJS), `apps/worker` (NestJS + BullMQ), PostgreSQL + Prisma, Redis, S3-compatible storage, Docker Compose, Nginx.
- Xác thực (D2): cookie httpOnly + Secure + chống CSRF; thiết kế sẵn cho Bearer (tắt mặc định).
- **AI Grading** (D9, D11): module độc lập, **tắt mặc định**, chỉ chạy khi GV kích hoạt. Chưa gửi dữ liệu tới Anthropic cho tới khi có phê duyệt. Có ẩn danh, ngân sách, cảnh báo, thống kê token.

---

## 3. Actor và quyền

### 3.1 Actor

| Actor | Phạm vi | Mô tả |
|---|---|---|
| **Platform Admin** | Toàn nền tảng | Vận hành SaaS: tạo/tạm ngưng tenant, tạo School Admin đầu tiên, đặt trần cấu hình (file, AI), bảng giá model AI, theo dõi sức khỏe hệ thống và thống kê tổng hợp. Đăng nhập ở khu vực riêng, bắt buộc MFA (O-10). **Mặc định không xem dữ liệu bài làm/điểm của trường** (O-03) |
| **School Admin** | 1 tenant | Quản trị trường: tài khoản, năm học/học kỳ, môn, lớp, phân công, ghi danh, cấu hình trường (gồm AI và ngân sách AI của trường), audit log, thống kê. **Xem nội dung bài làm theo quyền được cấp** (D7.2) và mọi lần xem đều ghi audit (D7.3) |
| **Teacher** | Lớp/môn được phân công trong tenant | Tạo, giao bài; chấm; **kích hoạt AI** (D9.1); duyệt và công bố điểm. **Chịu trách nhiệm cuối cùng về điểm** (D8) |
| **Student** | Dữ liệu của chính mình trong tenant | Đăng nhập bằng mã học sinh (D4). Làm bài, nộp bài, xem kết quả đã công bố |
| **System (Scheduler/Worker)** | Theo tenant của từng job | Mở bài theo lịch, nhắc hạn, auto-submit, chấm tự động, thực thi job AI do GV yêu cầu, gửi thông báo, dọn dữ liệu theo retention |
| **AI Grading Provider** | Không truy cập DB | Dịch vụ ngoài (Anthropic, khi được phê duyệt). Chỉ nhận dữ liệu đã ẩn danh và chỉ **đề xuất** điểm |
| *Parent/Guardian* | – | Ngoài phạm vi. Data model để mở rộng sau |

Một user trong tenant có thể có nhiều role (ví dụ GV kiêm School Admin). Mỗi tài khoản chỉ thuộc **một** tenant (O-02).

### 3.2 Mô hình phân quyền

**RBAC theo permission + phạm vi dữ liệu (scope)**:
- Permission là mã cố định trong code (ví dụ `assignment.publish`, `submission.content.read`).
- Role là tập permission. Mỗi tenant có 3 role hệ thống: `SCHOOL_ADMIN`, `TEACHER`, `STUDENT`. Role tùy chỉnh là tính năng nâng cao (O-06).
- Scope giới hạn dữ liệu: `TENANT` (cả trường), `ASSIGNED_CLASSES` (lớp được phân công), `OWN` (của chính mình).
- Platform Admin dùng bộ permission `platform.*` riêng, không dùng chung bảng user với tenant.

Danh mục permission đầy đủ, role mặc định và các lớp kiểm tra: [authentication-authorization.md](./authentication-authorization.md).

### 3.3 Ma trận quyền tóm tắt

Ký hiệu: **C** tạo · **R** xem · **U** sửa · **D** xóa/khóa · **—** không có quyền.

| Tài nguyên | Platform Admin | School Admin | Teacher | Student |
|---|---|---|---|---|
| Tenant (trường) | CRUD, tạm ngưng | R/U thông tin trường | R | R |
| Cấu hình nền tảng & trần cấu hình | R/U | — | — | — |
| Cấu hình trường (file, AI, ngân sách) | R (trần) | R/U trong trần | — | — |
| Tài khoản trong trường | Chỉ tạo School Admin đầu tiên | CRUD, khóa, reset mật khẩu | R (HS lớp được phân công, thông tin cơ bản) | R/U hồ sơ của mình |
| Năm học, học kỳ, môn, lớp | — | CRUD | R | R (lớp của mình) |
| Phân công GV, ghi danh HS | — | CRUD | R (của mình) | — |
| Bài tập, câu hỏi, rubric | — | R | CRUD (của mình, cho lớp được phân công) | R đề bài; đáp án **chỉ khi chính sách cho phép** |
| Nội dung bài làm | — (O-03) | R **nếu có quyền** `submission.content.read`, ghi audit + lý do (O-04) | R (lớp được phân công) | C/U bản nháp, R của mình |
| Điểm | Thống kê tổng hợp (không định danh) | R; sửa chỉ khi có `grade.override` (O-05) | C/U/duyệt/công bố | R của mình **sau khi công bố** |
| Kích hoạt AI | — | Bật/tắt AI cấp trường | Kích hoạt từng bài/nhóm bài | — |
| Kết quả AI | — | R thống kê chi phí | R, chấm lại, duyệt | R nhận xét AI **chỉ khi GV bật và đã duyệt** |
| Audit log | Platform audit | Audit của trường | — | — |
| Báo cáo | Tổng hợp toàn nền tảng | Toàn trường | Lớp/môn được phân công | Cá nhân |

---

## 4. Danh sách chức năng

Mức ưu tiên: **MVP** (bản phát hành đầu, đủ cho 20 luồng kiểm thử bắt buộc) · **ADV** (sau MVP; kiến trúc phải sẵn sàng mở rộng).

### 4.1 Platform (PLT)

| ID | Chức năng | Ưu tiên |
|---|---|---|
| PLT-01 | Đăng nhập Platform Admin (khu vực riêng, MFA TOTP) | MVP |
| PLT-02 | Tạo tenant: tên, mã trường (slug, dùng làm subdomain – O-01), múi giờ, hạn mức; tạo School Admin đầu tiên | MVP |
| PLT-03 | Sửa, tạm ngưng, kích hoạt lại tenant (tạm ngưng thì chặn đăng nhập, giữ dữ liệu) | MVP |
| PLT-04 | Trần cấu hình nền tảng: định dạng & dung lượng file tối đa, hạn mức mặc định | MVP |
| PLT-05 | Công tắc AI toàn nền tảng (kill switch), bảng giá model AI (cấu hình, không hardcode) | MVP |
| PLT-06 | Thống kê tổng hợp: số tenant, user, bài tập, bài nộp, dung lượng, chi phí AI theo tenant | MVP |
| PLT-07 | Platform audit log | MVP |
| PLT-08 | Xuất dữ liệu tenant (khi trường yêu cầu) | ADV |
| PLT-09 | Xóa tenant theo quy trình retention | ADV |
| PLT-10 | Truy cập hỗ trợ có thời hạn do School Admin cấp (break-glass) | ADV (O-03) |
| PLT-11 | Tên miền riêng cho trường | ADV |

### 4.2 Authentication & Account (AUTH)

| ID | Chức năng | Ưu tiên |
|---|---|---|
| AUTH-01 | Đăng nhập trong tenant: HS bằng **mã học sinh** + mật khẩu (D4.1); GV/School Admin bằng username hoặc email + mật khẩu | MVP |
| AUTH-02 | Xác định tenant từ subdomain (dự phòng: ô "Mã trường") – O-01 | MVP |
| AUTH-03 | Phiên đăng nhập bằng cookie httpOnly + Secure + SameSite, chống CSRF (D2) | MVP |
| AUTH-04 | Refresh token xoay vòng, phát hiện dùng lại token cũ thì thu hồi cả chuỗi phiên | MVP |
| AUTH-05 | Đăng xuất (phiên hiện tại / tất cả phiên) | MVP |
| AUTH-06 | Mật khẩu tạm ngẫu nhiên, **không dùng mã HS** (D4.3); bắt buộc đổi khi đăng nhập lần đầu | MVP |
| AUTH-07 | School Admin reset mật khẩu (sinh mật khẩu tạm mới, thu hồi mọi phiên) | MVP |
| AUTH-08 | Chống brute force: giới hạn theo IP + tài khoản + tenant, khóa tạm tăng dần | MVP |
| AUTH-09 | Bearer token cho mobile/API client (endpoint và guard đã thiết kế, **tắt bằng cấu hình**) | ADV (D2.3) |
| AUTH-10 | Quên mật khẩu qua email | ADV |
| AUTH-11 | MFA cho School Admin | ADV (O-10) |
| AUTH-12 | SSO (Google Workspace for Education / Microsoft 365) | ADV |

### 4.3 Quản trị trường (ADM)

| ID | Chức năng | Ưu tiên |
|---|---|---|
| ADM-01 | Tạo, sửa, khóa/mở khóa tài khoản giáo viên | MVP |
| ADM-02 | Tạo, sửa, khóa/mở khóa tài khoản học sinh (mã HS duy nhất trong tenant – D4.2) | MVP |
| ADM-03 | Import GV/HS từ Excel: preview, báo lỗi từng dòng, mật khẩu tạm bàn giao một lần (O-18) | MVP |
| ADM-04 | CRUD năm học, học kỳ; đặt năm học hiện hành | MVP |
| ADM-05 | CRUD môn học | MVP |
| ADM-06 | CRUD lớp học (năm học, khối, GV chủ nhiệm) | MVP |
| ADM-07 | Phân công GV vào (lớp, môn, học kỳ); gỡ phân công kèm chuyển quyền sở hữu bài tập | MVP |
| ADM-08 | Ghi danh/gỡ/chuyển lớp HS (giữ lịch sử) | MVP |
| ADM-09 | Cấu hình trường: múi giờ, file (trong trần nền tảng), grace period nộp bài (O-19) | MVP |
| ADM-10 | **Cấu hình AI của trường**: bật/tắt, ghi nhận phê duyệt xử lý dữ liệu, ngân sách tháng, ngưỡng cảnh báo | MVP (chức năng có, mặc định **tắt** – D11) |
| ADM-11 | Xem nội dung bài làm / điểm (theo permission, có lý do, ghi audit – D7.2, D7.3) | MVP |
| ADM-12 | Xem audit log của trường (lọc theo người, hành động, đối tượng, truy cập nhạy cảm) | MVP |
| ADM-13 | Dashboard trường | MVP |
| ADM-14 | Role tùy chỉnh | ADV (O-06) |
| ADM-15 | Kết chuyển năm học (lên lớp hàng loạt) | ADV |

### 4.4 Lớp học – phía giáo viên (CLS)

| ID | Chức năng | Ưu tiên |
|---|---|---|
| CLS-01 | Danh sách lớp được phân công (lọc theo năm học/học kỳ) | MVP |
| CLS-02 | Danh sách học sinh trong lớp | MVP |
| CLS-03 | Lịch sử học tập của HS (trong phạm vi môn GV dạy) | MVP |
| CLS-04 | Điểm trung bình lớp (theo % `earned_score/max_score`), tỷ lệ hoàn thành | MVP |
| CLS-05 | Nhóm học sinh tùy chỉnh | ADV (D12) |

### 4.5 Bài tập (ASG)

| ID | Chức năng | Ưu tiên |
|---|---|---|
| ASG-01 | Tạo bài tập: tiêu đề, mô tả, môn, chủ đề/chương, hướng dẫn, điểm đạt | MVP |
| ASG-02 | Tổng điểm **linh hoạt** = tổng điểm các câu (D5.1); lưu `max_score` | MVP |
| ASG-03 | Thời gian: mở bài, hạn nộp, hạn nộp muộn, thời gian làm bài | MVP |
| ASG-04 | File đính kèm: PDF, DOCX, XLSX, PPTX, ảnh… (D13) | MVP |
| ASG-05 | Lưu nháp, xem trước dưới góc nhìn HS | MVP |
| ASG-06 | Giao cho 1 hoặc nhiều lớp | MVP |
| ASG-07 | Giao cho từng học sinh | MVP |
| ASG-08 | Giao theo nhóm tùy chỉnh (đã dành sẵn loại đối tượng `GROUP` trong schema) | ADV (D12) |
| ASG-09 | Lên lịch giao bài tự động | MVP |
| ASG-10 | Cho phép nộp muộn | MVP |
| ASG-11 | Trừ điểm nộp muộn | ADV |
| ASG-12 | **Cho phép nộp lại** (mặc định tắt – D6.3), giới hạn số lần nộp | MVP |
| ASG-13 | Chính sách tính điểm khi nộp lại: `LATEST` (mặc định – D6.1); `HIGHEST` đã dành sẵn trong schema | MVP / ADV (D6.4) |
| ASG-14 | Thu hồi / khôi phục bài tập | MVP |
| ASG-15 | Gia hạn hạn nộp (toàn bài) / gia hạn từng HS | MVP / ADV |
| ASG-16 | Nhân bản bài tập | MVP |
| ASG-17 | Chính sách hiển thị đáp án: không bao giờ / sau khi nộp / sau hạn / sau khi công bố | MVP |
| ASG-18 | Cho phép dùng AI hỗ trợ chấm với bài này (chỉ khả dụng khi trường đã bật AI) | MVP |
| ASG-19 | Cho phép công bố nhận xét AI cho HS (mặc định tắt – D10.1) | MVP |
| ASG-20 | Xáo trộn câu/đáp án | ADV |
| ASG-21 | Lưu trữ (archive) | MVP |

### 4.6 Câu hỏi (QST)

| ID | Chức năng | Ưu tiên |
|---|---|---|
| QST-01 | Loại câu: Single Choice, Multiple Choice, True/False, Short Answer, Essay, File Submission | MVP |
| QST-02 | Bài Mixed (nhiều loại câu trong 1 bài) | MVP |
| QST-03 | Đáp án, đáp án đúng, điểm từng câu, câu bắt buộc | MVP |
| QST-04 | Multiple Choice: tất cả hoặc không / điểm từng phần | MVP |
| QST-05 | Short Answer: danh sách đáp án chấp nhận, tùy chọn bỏ hoa thường/khoảng trắng/dấu (mặc định giữ dấu – O-16), so sánh số có sai số | MVP |
| QST-06 | Hình ảnh, file đính kèm trong câu hỏi | MVP |
| QST-07 | Công thức toán (KaTeX) | MVP |
| QST-08 | Sắp xếp câu hỏi | MVP |
| QST-09 | Đáp án tham khảo + rubric (có version) cho câu tự luận | MVP |
| QST-10 | Tái sử dụng câu hỏi từ bài cũ (sao chép, lưu nguồn gốc) | MVP |
| QST-11 | Ngân hàng câu hỏi nâng cao: tag, độ khó, tìm kiếm, chia sẻ tổ bộ môn | ADV (D12) |

### 4.7 Làm bài & nộp bài (SUB)

| ID | Chức năng | Ưu tiên |
|---|---|---|
| SUB-01 | Danh sách bài tập + bộ lọc: tất cả, chưa làm, đang làm, đã nộp, đã chấm, quá hạn | MVP |
| SUB-02 | Thông tin: tên, môn, GV, ngày giao, hạn nộp, tổng điểm, trạng thái, thời gian còn lại | MVP |
| SUB-03 | Bắt đầu làm bài (`started_at` theo giờ server) | MVP |
| SUB-04 | Trắc nghiệm: điều hướng câu, tiến độ, đánh dấu xem lại | MVP |
| SUB-05 | Tự động lưu nháp (debounce, chỉ báo trạng thái lưu, chống ghi đè giữa các tab) | MVP |
| SUB-06 | Đồng hồ đếm ngược theo giờ server, auto-submit khi hết giờ | MVP |
| SUB-07 | Rich text editor cho tự luận: định dạng, chèn ảnh, công thức | MVP |
| SUB-08 | Upload file trả lời: PDF, DOCX, XLSX, PPTX, JPG, PNG + định dạng cấu hình (D13) | MVP |
| SUB-09 | Xác nhận nộp; chặn khi thiếu câu bắt buộc | MVP |
| SUB-10 | Ghi thời gian nộp, đánh dấu muộn, tạo **phiên bản bất biến** | MVP |
| SUB-11 | Nộp lại khi GV bật (D6.3) hoặc GV yêu cầu nộp lại; **lưu toàn bộ lịch sử** (D6.2) | MVP |
| SUB-12 | Khóa chỉnh sửa khi hết quyền | MVP |
| SUB-13 | Xem kết quả sau công bố: `earned_score`/`max_score`, điểm từng câu, đáp án đúng (theo chính sách), bài làm, nhận xét GV, nhận xét AI (nếu GV cho phép), phần cần cải thiện | MVP |
| SUB-14 | HS xem lịch sử các lần nộp của mình | MVP (dữ liệu bắt buộc có theo D6.2; giao diện đơn giản) |

### 4.8 Chấm điểm (GRD)

| ID | Chức năng | Ưu tiên |
|---|---|---|
| GRD-01 | Theo dõi bài nộp theo trạng thái | MVP |
| GRD-02 | Chấm tự động khi nộp: SC, MC, T/F, Short Answer theo quy tắc | MVP |
| GRD-03 | Chấm thủ công: điểm từng câu, nhận xét từng câu, nhận xét chung, đánh dấu sai | MVP |
| GRD-04 | Rubric: tiêu chí, điểm tối đa, mô tả mức đạt; chấm theo tiêu chí | MVP |
| GRD-05 | **GV kích hoạt AI** cho 1 bài nộp, nhiều bài nộp hoặc cả bài tập (D9.1). Hiển thị **ước tính chi phí** trước khi xác nhận | MVP (hoạt động khi AI được bật – D11) |
| GRD-06 | Duyệt/sửa điểm và nhận xét AI trước khi công bố (D10.2) | MVP |
| GRD-07 | Ghi đè điểm tự động (bắt buộc lý do) | MVP |
| GRD-08 | Công bố điểm từng bài / hàng loạt; chặn khi còn câu chưa có điểm chính thức | MVP |
| GRD-09 | Yêu cầu HS nộp lại (kèm lý do, hạn riêng) | MVP |
| GRD-10 | Lịch sử chỉnh sửa điểm, append-only (D7.3) | MVP |
| GRD-11 | Yêu cầu AI chấm lại (lưu mọi lần chấm) | MVP |
| GRD-12 | Grading workspace: bài làm và bảng điểm song song, chuyển nhanh giữa các HS | MVP |
| GRD-13 | Chấm lại tự động khi GV sửa đáp án đúng | MVP |
| GRD-14 | AI đọc file nộp (PDF/ảnh viết tay) | ADV (cần phê duyệt riêng vì dữ liệu nhạy cảm hơn) |
| GRD-15 | Chấm AI hàng loạt qua Batch API (chi phí thấp hơn) | ADV |

### 4.9 Thông báo (NTF)

| ID | Chức năng | Ưu tiên |
|---|---|---|
| NTF-01 | Thông báo trong web: giao bài mới, sắp đến hạn, quá hạn, HS đã nộp, AI chấm xong/lỗi, đã công bố điểm, điểm được sửa, yêu cầu nộp lại, **ngân sách AI sắp/đã hết** | MVP |
| NTF-02 | Đánh dấu đã đọc / đọc tất cả, đếm chưa đọc | MVP |
| NTF-03 | Lọc thông báo | MVP |
| NTF-04 | Polling 30–60s (MVP); SSE/WebSocket (ADV) | MVP / ADV |
| NTF-05 | Gom nhóm thông báo "HS đã nộp" | MVP |
| NTF-06 | Email (kiến trúc kênh mở rộng) | ADV |

### 4.10 Báo cáo & thống kê (RPT)

| ID | Chức năng | Ưu tiên |
|---|---|---|
| RPT-01 | Dashboard GV | MVP |
| RPT-02 | Dashboard HS | MVP |
| RPT-03 | Dashboard School Admin: tổng HS, GV, lớp, bài tập, bài đã nộp, tỷ lệ hoàn thành | MVP |
| RPT-04 | Báo cáo GV: tỷ lệ hoàn thành, điểm TB (theo %), phân bố điểm, HS chưa hoàn thành, HS kết quả thấp, so sánh giữa các bài, theo môn | MVP |
| RPT-05 | Xuất Excel | MVP |
| RPT-06 | Xuất PDF (module export có giao diện định dạng để thêm sau) | ADV (D12) |
| RPT-07 | Thống kê AI: số job, token vào/ra, chi phí theo tháng/GV/bài, % ngân sách | MVP |

### 4.11 File (FIL)

| ID | Chức năng | Ưu tiên |
|---|---|---|
| FIL-01 | Upload qua presigned URL kèm bước xác nhận phía server | MVP |
| FIL-02 | Kiểm tra định dạng thật (magic bytes), phần mở rộng, dung lượng theo cấu hình trường (trong trần nền tảng) | MVP |
| FIL-03 | Download qua signed URL ngắn hạn sau khi kiểm tra quyền và tenant | MVP |
| FIL-04 | Object key có tiền tố tenant; dọn file mồ côi | MVP |
| FIL-05 | Hạn mức dung lượng theo tenant (O-13) | MVP |
| FIL-06 | Quét virus | ADV |

---

## 5. Yêu cầu phi chức năng

| Nhóm | Yêu cầu |
|---|---|
| **Cô lập tenant** | Không request nào đọc/ghi được dữ liệu của tenant khác, kể cả khi code ứng dụng có lỗi quên điều kiện lọc (RLS là lớp chặn cuối). Có bộ test cô lập tenant tự động cho mọi endpoint |
| Ngôn ngữ & thời gian | Giao diện tiếng Việt. DB lưu UTC (`timestamptz`). Hiển thị theo **múi giờ của tenant** (mặc định `Asia/Ho_Chi_Minh`) |
| Responsive | Desktop, Tablet, Mobile. Màn làm bài dùng tốt trên mobile. Grading workspace tối ưu desktop/tablet ngang |
| Hiệu năng (mục tiêu ban đầu) | API p95 < 300ms; ~500 HS nộp trong 1 phút ở một tenant; một tenant tải nặng không làm chậm tenant khác (rate limit + giới hạn concurrency theo tenant) |
| Tin cậy | Bài nộp ghi DB trước mọi xử lý sau. Lỗi AI không làm mất/treo bài nộp. Job có retry + dead-letter |
| Bảo mật | [security.md](./security.md) |
| Quyền riêng tư | Nghị định 13/2023/NĐ-CP; tối thiểu hóa dữ liệu; **không gửi dữ liệu HS ra ngoài khi chưa phê duyệt** (D11.1) |
| Chi phí | Không phát sinh chi phí AI ngoài ý muốn: AI tắt mặc định, ngân sách giới hạn cứng, test không gọi API thật (D11.9) |
| Quan sát | Log JSON có `request_id`, `tenant_id`; không log nội dung bài làm/mật khẩu/token. Metric hàng đợi, health check |
| Khả năng truy cập | Điều hướng bàn phím, label form, tương phản WCAG AA |
| Thiết kế | Primary `#5a5fe0`, hover `#4348c9`, nền `#eef1f8`, chữ `#0f172a`, border `rgba(15,23,42,0.06)`, radius 14–16px, Plus Jakarta Sans (subset tiếng Việt), Lucide icons, đủ trạng thái loading/empty/error/success |

---

## 6. Business rules

### 6.1 Tenant

- **BR-T01** Mọi bản ghi nghiệp vụ thuộc đúng 1 tenant (`tenant_id NOT NULL`). Không có bản ghi nghiệp vụ dùng chung giữa các tenant.
- **BR-T02** Tenant context được xác định **ở backend** từ host (subdomain) và được đối chiếu với tenant trong token. Không tin `tenant_id` do client gửi trong body hay query (D3.5).
- **BR-T03** Quan hệ giữa hai bản ghi chỉ hợp lệ khi cùng tenant, được ép bằng khóa ngoại kép `(tenant_id, id)` (D3.6).
- **BR-T04** Tenant `SUSPENDED`: chặn đăng nhập và mọi API của tenant, dừng job theo lịch của tenant, **giữ nguyên dữ liệu**.
- **BR-T05** Mã định danh duy nhất **theo tenant**: mã HS (D4.2), username, email (nếu có), mã môn, mã lớp (theo năm học).
- **BR-T06** Cấu hình trường không vượt trần nền tảng (dung lượng file, định dạng, ngân sách AI tối đa nếu Platform đặt).

### 6.2 Học vụ & phạm vi dữ liệu

- **BR-01** Mỗi lớp thuộc 1 năm học. Mã lớp duy nhất trong (tenant, năm học).
- **BR-02** GV được phân công theo (lớp, môn, học kỳ hoặc cả năm). GV chỉ tạo bài cho (lớp, môn) mình được phân công.
- **BR-03** Quyền của GV với bài nộp được tính **tại thời điểm truy cập** theo phân công hiện hành. GV bị gỡ phân công thì mất quyền ngay; dữ liệu giữ nguyên; School Admin chuyển quyền sở hữu bài tập.
- **BR-04** HS có thể thuộc nhiều lớp. Ghi danh có lịch sử (`joined_at`, `left_at`). Hành vi khi rời lớp: O-08.
- **BR-05** Không xóa cứng user, lớp, bài tập, bài nộp, điểm. Dùng khóa tài khoản và soft delete/archive.
- **BR-06** School Admin xem nội dung bài làm khi có permission `submission.content.read`: bắt buộc nhập lý do, ghi audit `SENSITIVE_READ` (D7.2, D7.3, O-04).

### 6.3 Bài tập

- **BR-10** Điều kiện giao bài: có ≥ 1 câu hỏi; `max_score` = tổng điểm các câu > 0 (D5.1); `open_at < due_at ≤ late_until` (nếu cho nộp muộn); có ≥ 1 đối tượng nhận; `0 ≤ pass_score ≤ max_score`.
- **BR-11** HS chỉ thấy bài khi: `PUBLISHED`, `now ≥ open_at`, chưa thu hồi, HS thuộc đối tượng nhận.
- **BR-12** Không bao giờ trả đáp án đúng, đáp án tham khảo hay rubric nội bộ trong API của HS, trừ khi chính sách hiển thị cho phép và điều kiện đã thỏa. Kiểm tra ở serializer phía server.
- **BR-13** Đã có bài nộp thì không được xóa câu hoặc đổi loại câu. Được phép: sửa chính tả, sửa đáp án đúng (kích hoạt chấm lại tự động, có lịch sử), gia hạn.
- **BR-14** Thu hồi: ẩn với HS, hủy job đã lên lịch, giữ bài nộp và điểm, khôi phục được.
- **BR-15** Job lên lịch giao bài phải idempotent.
- **BR-16** Bài nhân bản là bản sao độc lập (sao chép câu hỏi, lưu `source_question_id`).
- **BR-17** `allow_resubmit` mặc định `false` (D6.3). `grading_policy` mặc định `LATEST` (D6.1).

### 6.4 Làm bài & nộp bài

- **BR-20** Mọi mốc thời gian được xác định bằng giờ server.
- **BR-21** Một cặp (bài tập, HS) có đúng 1 submission. Mỗi lần nộp tạo 1 **phiên bản bất biến** (`version_no` tăng dần). Không xóa, không sửa phiên bản cũ (D6.2).
- **BR-22** Bản nháp chỉ ghi được khi submission `IN_PROGRESS` và còn quyền làm bài. Autosave dùng optimistic concurrency (revision).
- **BR-23** Nộp hợp lệ khi: còn hạn, hoặc cho nộp muộn và `now ≤ late_until`; còn lượt; với bài giới hạn thời gian thì `now ≤ deadline cá nhân + grace` (O-19).
- **BR-24** `deadline cá nhân = min(started_at + time_limit, hạn đóng)`. Hết giờ thì auto-submit bản nháp mới nhất.
- **BR-25** `is_late = submitted_at > due_at`.
- **BR-26** Thiếu câu bắt buộc thì chặn nộp, trừ auto-submit.
- **BR-27** Nộp bài idempotent: `Idempotency-Key` + khóa dòng (row lock) + unique `(submission_id, version_no)` và `(submission_id, idempotency_key)`.
- **BR-28** HS chủ động nộp lại chỉ khi `allow_resubmit = true`, còn lượt (`attempt_count < max_attempts`), còn hạn (D6.3).
- **BR-29** GV "yêu cầu nộp lại" mở quyền nộp cho riêng HS đó, **không tính** vào `max_attempts`, có thể kèm hạn riêng.
- **BR-30** Điểm hiệu lực của submission theo `grading_policy`: `LATEST` lấy phiên bản đã công bố mới nhất (D6.1). Điểm cũ tiếp tục hiển thị tới khi phiên bản mới được công bố (O-09). `HIGHEST` (ADV) lấy phiên bản đã công bố có `earned_score` cao nhất.

### 6.5 Chấm điểm

- **BR-31** Chấm tự động chạy trong transaction nộp bài, lưu `grade_details` nguồn `AUTO`.
- **BR-32** Câu Essay, File Submission và Short Answer không khớp quy tắc ở trạng thái **`NEEDS_MANUAL`** sau khi nộp. **AI không tự chạy** (D9.1). GV chọn chấm tay hoặc kích hoạt AI.
- **BR-33** Kết quả AI lưu riêng (`ai_grading_results`), **không bao giờ** tự thành điểm chính thức (D9.2). Chỉ khi GV chấp nhận hoặc sửa mới tạo điểm nguồn `TEACHER`.
- **BR-34** Chỉ công bố khi mọi câu có điểm chính thức (`AUTO` hoặc `TEACHER`). Câu có gợi ý AI phải được GV duyệt **cả điểm và nhận xét** (D10.2).
- **BR-35** Mọi thay đổi điểm ghi `grade_history` (append-only): giá trị cũ/mới, người sửa, thời gian, lý do (bắt buộc khi đã công bố hoặc khi ghi đè `AUTO`) – D7.3. Sửa sau công bố thì thông báo HS.
- **BR-36** `0 ≤ earned_score ≤ max_score` cho từng câu và từng tiêu chí; bước điểm mặc định 0.25 (cấu hình theo tenant). `earned_score` tổng do server tính, không nhận từ client (D5.2).
- **BR-37** `passed = earned_score ≥ pass_score`. Báo cáo so sánh dùng tỷ lệ `earned_score / max_score`.
- **BR-38** HS không gọi được API ghi điểm. School Admin chỉ sửa điểm khi có `grade.override` (O-05).
- **BR-39** `max_score` của câu và của bài được **chụp lại (snapshot)** vào bản ghi điểm tại thời điểm chấm, để thay đổi bài tập về sau không làm sai điểm cũ.

### 6.6 AI grading

- **BR-40** AI chỉ chạy khi **tất cả** cổng đều mở: (1) công tắc nền tảng bật, (2) trường bật AI và đã ghi nhận phê duyệt xử lý dữ liệu, (3) bài tập cho phép AI, (4) GV chủ động kích hoạt, (5) còn ngân sách. Thiếu một cổng thì không có dữ liệu nào rời hệ thống (D9.1, D11).
- **BR-41** Dữ liệu gửi AI đã **ẩn danh**: không họ tên, mã HS, lớp, email; lọc thông tin định danh trong nội dung (họ tên HS, số điện thoại, email, số định danh); mã yêu cầu là định danh giả, không liên kết được ngược lại từ phía nhà cung cấp (D11.4, D11.5).
- **BR-42** Nội dung bài làm chỉ là dữ liệu, không phải chỉ dẫn. Output bị ràng buộc theo JSON schema và **được validate lại** ở backend. Backend tự tính lại tổng điểm.
- **BR-43** Lỗi/timeout/JSON sai: retry có giới hạn → `FAILED` → câu trở về `NEEDS_MANUAL`. Bài nộp không bị ảnh hưởng.
- **BR-44** Lưu mỗi lần chấm: model, prompt version, rubric version, token vào/ra, chi phí, thời gian xử lý, raw response (có thời hạn lưu – O-15).
- **BR-45** Ngân sách: hạn mức tháng theo tenant (và tùy chọn theo GV). **Đặt trước (reserve)** chi phí ước tính trước khi gọi, quyết toán theo token thực tế. Cảnh báo ở các ngưỡng cấu hình được (mặc định 50%, 80%, 100%). Đạt 100% thì từ chối job mới (`SKIPPED_BUDGET`). Hạn mức chưa cấu hình thì AI không chạy (D11.8).
- **BR-46** Nhận xét AI chỉ hiển thị cho HS khi bài bật "công bố nhận xét AI" **và** GV đã duyệt nội dung (D10).
- **BR-47** Chấm lại tạo kết quả mới, không ghi đè kết quả cũ.
- **BR-48** Môi trường dev/test **không gọi API thật**. Provider giả lập chỉ dùng trong test và bị chặn khởi động ở production (D11.9).

### 6.7 Thông báo

- **BR-50** Thông báo tạo sau khi transaction nghiệp vụ commit (transactional outbox).
- **BR-51** Nhắc sắp đến hạn gửi 1 lần cho HS chưa nộp (mặc định 24 giờ trước hạn). Chống trùng bằng `dedupe_key`.

---

## 7. Phạm vi MVP và tính năng nâng cao

### 7.1 MVP

- Nền tảng multi-tenant: tạo/tạm ngưng tenant, Platform Admin (MFA), cô lập dữ liệu (RLS + composite FK + kiểm tra ở ứng dụng), hạn mức cơ bản.
- Auth bằng cookie + CSRF; đăng nhập bằng mã HS; mật khẩu tạm an toàn; RBAC theo permission + scope.
- School Admin: tài khoản (gồm import Excel), học vụ, phân công, ghi danh, cấu hình, xem bài làm có audit, audit log, dashboard.
- Bài tập: 7 loại câu (gồm Mixed), giao cho lớp/nhiều lớp/từng HS, lên lịch, nộp muộn, nộp lại (khi GV bật), thu hồi, nhân bản, chính sách đáp án, file PDF/DOCX/…
- Làm bài: autosave, timer, rich text, upload file, phiên bản bất biến, lịch sử nộp.
- Chấm: tự động, thủ công, rubric, **AI Grading Engine hoàn chỉnh nhưng tắt** (kích hoạt thủ công bởi GV, ẩn danh, ngân sách, cảnh báo, thống kê; chỉ kiểm thử bằng provider giả lập). Duyệt, công bố, lịch sử điểm, yêu cầu nộp lại.
- Thông báo trong web; dashboard 3 vai trò + Platform; báo cáo GV; xuất Excel.
- Docker Compose (dev/prod), Nginx, tài liệu.

### 7.2 Nâng cao (kiến trúc đã dành sẵn điểm mở rộng)

| Nhóm | Tính năng | Điểm mở rộng đã thiết kế |
|---|---|---|
| Bài tập | Giao theo nhóm (D12) | `assignment_targets.target_type = GROUP`, bảng `student_groups` dự kiến |
| Câu hỏi | Ngân hàng câu hỏi nâng cao (D12) | `questions.source_question_id`; bảng `question_bank_items` riêng, sao chép khi dùng |
| Báo cáo | Xuất PDF (D12) | Interface `ReportExporter` (Excel là cài đặt đầu tiên) |
| Điểm | Lấy điểm cao nhất (D6.4) | `assignments.grading_policy` enum có `HIGHEST` |
| Auth | Bearer cho mobile (D2.3) | Guard đọc token từ cookie **hoặc** header; endpoint cấp token tắt bằng cấu hình |
| AI | Đọc file/ảnh, Batch API | Interface `AiGradingProvider`; payload builder theo loại câu |
| Khác | Trừ điểm muộn, xáo trộn câu, email, realtime, SSO, MFA School Admin, role tùy chỉnh, break-glass, xuất/xóa tenant, phụ huynh, tên miền riêng | – |

---

## 8. Rủi ro kỹ thuật

| # | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| R1 | **Rò rỉ dữ liệu chéo tenant** do thiếu điều kiện `tenant_id` | Rất cao | Ba lớp: tenant context bắt buộc ở ứng dụng → khóa ngoại kép `(tenant_id, id)` → RLS ở PostgreSQL (fail-closed). Test cô lập tenant tự động cho mọi endpoint |
| R2 | RLS + Prisma + connection pool cấu hình sai (context rò sang request khác) | Cao | Chỉ dùng `set_config(..., is_local = true)` trong transaction; không dùng `SET` cấp session; test đồng thời nhiều tenant |
| R3 | Role DB của ứng dụng vô tình có quyền BYPASSRLS / là owner bảng | Cao | Tách role `hms_owner` (migration), `hms_app` (runtime, chịu RLS), `hms_system` (tác vụ liên tenant, giới hạn module). Test khẳng định `hms_app` không đọc được bảng khi chưa đặt tenant |
| R4 | Prompt injection trong bài làm | Cao | Tách dữ liệu và chỉ dẫn, structured output, validate, GV luôn duyệt, test với payload injection |
| R5 | AI chấm không nhất quán | Cao | Rubric chi tiết, đáp án tham khảo, prompt version, đánh giá so với điểm GV trước khi bật rộng |
| R6 | **Gửi dữ liệu HS ra ngoài khi chưa phê duyệt** / ẩn danh không đủ | Cao | 5 cổng (BR-40); AI tắt mặc định; bộ lọc thông tin định danh có test; log payload đã ẩn danh để kiểm tra |
| R7 | Phát sinh chi phí AI ngoài ý muốn | Trung bình | Không có hạn mức thì không chạy; reserve trước khi gọi; giới hạn cứng; test không gọi API thật |
| R8 | IDOR trong tenant (HS xem bài HS khác, GV xem lớp không được phân công) | Cao | Policy tập trung ở service, query luôn có scope, test phân quyền cho từng endpoint |
| R9 | Lộ đáp án qua API | Cao | Serializer riêng cho HS, test response không có trường đáp án |
| R10 | Race condition khi nộp bài | Trung bình | Idempotency + row lock + unique |
| R11 | XSS qua rich text/công thức/tên file | Cao | Lưu JSON Tiptap, sanitize theo whitelist, KaTeX `trust: false`, CSP, file tải về bằng `attachment` từ domain storage riêng |
| R12 | File độc hại | Trung bình | Magic bytes, giới hạn dung lượng, bucket private, quét virus (ADV) |
| R13 | Tenant lớn gây chậm tenant khác (noisy neighbor) | Trung bình | Rate limit và concurrency queue theo tenant; index bắt đầu bằng `tenant_id`; theo dõi truy vấn chậm |
| R14 | Cookie/CSRF với subdomain cấu hình sai (cookie lộ sang subdomain khác) | Trung bình | Cookie `__Host-` (gắn đúng host, không có `Domain`), CSRF double-submit + kiểm tra `Origin` |
| R15 | Wildcard DNS/TLS cho subdomain | Thấp | Chứng chỉ wildcard (DNS-01), quyết định ở O-01/O-20 |
| R16 | Container phát triển tạm thời, chưa có repository | Trung bình | D14: dừng trước Phase 3 để xác nhận repository |

---

## 9. Kế hoạch triển khai theo phase

| Phase | Nội dung | Deliverables | Điều kiện chuyển phase |
|---|---|---|---|
| **1. Discovery** *(bản 2)* | Phân tích yêu cầu theo quyết định đã xác nhận | `requirements.md`, `use-cases.md`, `business-workflows.md`, `decisions.md` | Duyệt bản 2 + trả lời câu hỏi mở cần thiết |
| **2. Architecture & DB** | Hoàn thiện các bản thiết kế đã soạn sớm (multi-tenant, DB, ERD, auth, AI, security); thêm API specification | `architecture.md`, `database-design.md`, `erd.md`, `authentication-authorization.md`, `ai-grading-design.md`, `security.md` (**đã có bản nháp**), `api-specification.md` (sẽ soạn) | Duyệt schema + API |
| ⛔ **Điểm dừng D14** | Xác nhận GitHub repository | – | Chủ dự án cung cấp/tạo repository |
| **3. Foundation** | Monorepo, Docker Compose (Postgres, Redis, MinIO), Prisma + migration + RLS + DB roles, tenant context, auth, RBAC, logging, exception, validation, Swagger, layout UI + design tokens, CI | Code chạy được; test auth/RBAC/**cô lập tenant** | Test pass |
| **4. Core modules** | Tenant/Platform → User → Class → Subject (+ năm học/học kỳ) → Assignment → Question → Submission → File → Notification | Mỗi module đạt Definition of Done + báo cáo module | DoD từng module |
| **5. Grading engine** | Auto → manual → rubric → **AI engine với provider giả lập** (không gọi API thật) → duyệt → công bố → lịch sử. Bật Anthropic thật **chỉ sau phê duyệt D11** | Bộ test AI (timeout, JSON lỗi, injection, ngân sách, ẩn danh) | Test pass |
| **6. Dashboard & Analytics** | Dashboard, báo cáo, Excel | – | Số liệu khớp truy vấn kiểm chứng |
| **7. Integration testing** | E2E 20 luồng bắt buộc + ngoại lệ + cô lập tenant | `testing-strategy.md` | Tất cả pass |
| **8. Production readiness** | Security review, load test đa tenant, backup/restore, monitoring, Docker prod, Nginx HTTPS (wildcard) | `deployment.md` | Checklist production |

---

## 10. Câu hỏi mở

Xem [decisions.md §2](./decisions.md#2-câu-hỏi-mở-chờ-xác-nhận) (O-01 … O-22).
