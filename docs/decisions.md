# Decision Log – Homework Management System

> Nguồn tham chiếu duy nhất cho các quyết định nghiệp vụ và kiến trúc. Tài liệu khác chỉ tham chiếu mã quyết định ở đây, không tự đặt lại quyết định.
> Quy ước: **D-xx** là quyết định đã được chủ dự án xác nhận (không được tự ý thay đổi). **O-xx** là câu hỏi mở, kèm đề xuất, chờ xác nhận.

---

## 1. Quyết định đã xác nhận

### D1–D2 · Technology stack & Authentication
- **D1** Stack: Next.js, React, TypeScript, NestJS, PostgreSQL, Prisma, Redis, Docker và các thư viện liên quan (chi tiết: [architecture.md](./architecture.md)).
- **D2.1** Xác thực web dùng **cookie httpOnly + Secure** và cơ chế **chống CSRF**.
- **D2.2** **Không** lưu access token trong `localStorage` (hay `sessionStorage`).
- **D2.3** Thiết kế mở rộng được **Bearer authentication** cho mobile/API client trong tương lai.

### D3 · Multi-tenant SaaS
- **D3.1** Hệ thống là **Multi-tenant SaaS** hỗ trợ nhiều trường. Mỗi trường là một tenant độc lập.
- **D3.2** Dữ liệu giữa các tenant phải được **cô lập**.
- **D3.3** Có hai cấp quản trị: **Platform Admin** và **School Admin**.
- **D3.4** Giáo viên, học sinh thuộc phạm vi trường tương ứng.
- **D3.5** Mọi API **kiểm tra tenant context ở backend**.
- **D3.6** Database có `tenant_id` và **ràng buộc chống truy cập chéo tenant**.
- **D3.7** Mỗi trường có nhiều lớp, nhiều môn, nhiều năm học.
- **D3.8** Phải phân tích phương án isolation trước khi triển khai. MVP có thể dùng shared database + shared schema + `tenant_id`, kết hợp PostgreSQL Row-Level Security nếu phù hợp. → Phân tích: [architecture.md §3](./architecture.md#3-multi-tenancy).

### D4–D6 · Đăng nhập học sinh & quy tắc điểm
- **D4.1** Học sinh đăng nhập bằng **mã học sinh + mật khẩu**.
- **D4.2** Mã học sinh **duy nhất trong phạm vi tenant**.
- **D4.3** **Không** dùng mã học sinh (hay giá trị dễ đoán) làm mật khẩu mặc định.
- **D5.1** Tổng điểm **linh hoạt theo từng bài tập**, không cố định thang 10.
- **D5.2** Lưu `max_score` và `earned_score`.
- **D6.1** Khi nộp lại, mặc định lấy **điểm của lần nộp cuối**.
- **D6.2** Lưu **toàn bộ lịch sử** các lần nộp.
- **D6.3** Chỉ cho nộp lại khi **giáo viên bật quyền này**.
- **D6.4** Mở rộng được cấu hình **lấy điểm cao nhất** trong tương lai.

### D7–D10 · Quản trị, AI grading & nhận xét
- **D7.1** Platform Admin quản trị toàn hệ thống. School Admin quản trị trong phạm vi trường.
- **D7.2** Admin được **xem nội dung bài làm theo quyền được cấp**.
- **D7.3** **Mọi thao tác xem dữ liệu nhạy cảm và chỉnh sửa điểm phải có audit log.**
- **D8** Giáo viên là người **chịu trách nhiệm cuối cùng** về điểm số.
- **D9.1** AI grading **chỉ chạy khi giáo viên chủ động kích hoạt**.
- **D9.2** Kết quả AI là **điểm đề xuất**, không tự động công bố.
- **D10.1** Nhận xét AI **mặc định không hiển thị** cho học sinh.
- **D10.2** Giáo viên phải **duyệt điểm và nhận xét** trước khi công bố.

### D11 · Anthropic API & quyền riêng tư
- **D11.1** **Chưa gửi dữ liệu học sinh đến Anthropic** trong giai đoạn đầu (chưa có phê duyệt chính thức).
- **D11.2** AI Grading Engine là **module độc lập**.
- **D11.3** Bật/tắt AI grading bằng **cấu hình**.
- **D11.4** Có cơ chế **ẩn danh dữ liệu** trước khi gửi API.
- **D11.5** Không gửi thông tin nhận dạng học sinh nếu không cần thiết.
- **D11.6** Có **giới hạn chi phí** và **thống kê token**.
- **D11.7** Tích hợp Anthropic API **sau khi có phê duyệt**.
- **D11.8** Ngân sách chưa xác định: cấu hình ngân sách **thay đổi được**, **giới hạn chi phí**, **cảnh báo khi gần hạn mức**.
- **D11.9** **Không tự ý phát sinh chi phí API** (kể cả khi phát triển và kiểm thử).

### D12–D13 · Phạm vi MVP
- **D12.1** Ngoài MVP: **giao bài theo nhóm tùy chỉnh**, **ngân hàng câu hỏi nâng cao**, **xuất báo cáo PDF**.
- **D12.2** Kiến trúc phải **mở rộng được** các chức năng trên.
- **D13** **Giữ** khả năng upload PDF/DOCX (và các định dạng cấu hình) làm tài liệu bài tập và bài nộp.

### D14 · GitHub repository
- **D14** Chưa có repository. **Trước Phase 3 phải dừng lại** và yêu cầu chủ dự án cung cấp repository hoặc xác nhận tạo mới.

### Quy trình
- **P1** Chỉ chuyển phase sau khi chủ dự án review và phê duyệt.

---

## 2. Câu hỏi mở (chờ xác nhận)

| Mã | Câu hỏi | Đề xuất | Ảnh hưởng tới |
|---|---|---|---|
| **O-01** | Xác định tenant khi đăng nhập bằng cách nào? | **Subdomain** theo trường (`{ma-truong}.<domain>`), cookie gắn với từng host. Form đăng nhập có ô "Mã trường" dự phòng khi truy cập qua domain chung | Auth, Nginx, DNS/TLS (wildcard cert) |
| **O-02** | Một người dạy ở 2 trường có dùng chung 1 tài khoản không? | **Không**. Mỗi tenant một tài khoản riêng, cô lập hoàn toàn. Đăng nhập liên trường (SSO) là tính năng nâng cao | Database (`users` gắn `tenant_id`) |
| **O-03** | Platform Admin có được xem dữ liệu bài làm/điểm của trường không? | **Mặc định không**. Platform Admin chỉ quản lý tenant, cấu hình, thống kê tổng hợp. Truy cập hỗ trợ ("break-glass") là tính năng nâng cao: cần School Admin cấp quyền, có thời hạn, ghi audit | Authorization, audit |
| **O-04** | Quyền "xem nội dung bài làm" (D7.2) mặc định có trong role School Admin không? | **Có**, nhưng thu hồi được. Mỗi lần xem ghi audit "truy cập dữ liệu nhạy cảm" và bắt buộc nhập lý do | Authorization |
| **O-05** | School Admin có được **sửa điểm** không? (D8: GV chịu trách nhiệm cuối cùng) | **Không** theo mặc định. Có permission riêng `grade.override` (mặc định không gán cho ai), dùng khi cần sửa sai có thẩm quyền, bắt buộc lý do + audit + thông báo GV | Authorization, grading |
| **O-06** | MVP có cho trường tự tạo **role tùy chỉnh** (Giáo vụ, Tổ trưởng…) không? | **Không** trong MVP, chỉ 3 role hệ thống/tenant. Data model đã hỗ trợ role tùy chỉnh để mở rộng | Authorization UI |
| **O-07** | HS ghi danh vào lớp **sau khi** bài đã giao có nhận bài không? | **Có** (đối tượng lớp được đánh giá động) nếu bài còn mở | Assignment targeting |
| **O-08** | HS rời lớp khi đang làm dở bài của lớp đó có nộp được không? | **Không**. Bản nháp được giữ trong DB. Bài đã nộp và điểm đã công bố vẫn xem được (chỉ đọc) | Submission |
| **O-09** | Khi HS nộp lại một bài **đã công bố điểm**, điểm cũ có hiển thị cho tới khi lần nộp mới được công bố không? | **Có** | Grading, kết quả HS |
| **O-10** | Có bắt buộc **MFA (TOTP)** không? | **Bắt buộc** với Platform Admin ngay từ MVP. School Admin: tùy chọn (tính năng nâng cao) | Auth |
| **O-11** | Hosting/vị trí lưu dữ liệu, vai trò pháp lý (trường là bên kiểm soát dữ liệu, nền tảng là bên xử lý), thời hạn lưu trữ backup? | Cần xác nhận trước Phase 8. Ảnh hưởng chính sách quyền riêng tư theo Nghị định 13/2023/NĐ-CP | Deployment, legal |
| **O-12** | Đơn vị tiền của ngân sách AI? | Lưu **USD** (đơn vị tính phí của nhà cung cấp) ở dạng số nguyên micro-USD; hiển thị kèm VND theo tỷ giá cấu hình | AI budget |
| **O-13** | MVP có cần **hạn mức theo tenant** (số user, dung lượng lưu trữ) không? | **Có**, ở mức cấu hình đơn giản (không tính tiền/billing) | Tenant settings |
| **O-14** | Giới hạn file mặc định? | 20 MB/file, tối đa 10 file/câu trả lời, 100 MB/lần nộp; định dạng: PDF, DOCX, XLSX, PPTX, JPG, PNG. School Admin điều chỉnh được trong trần do Platform Admin đặt | File module |
| **O-15** | Thời hạn lưu **raw response của AI** và **audit log**? | Raw response AI: 180 ngày. Audit log: tối thiểu 2 năm. Cấu hình được | Retention jobs |
| **O-16** | Chấm tự động Short Answer có **bỏ qua dấu tiếng Việt** theo mặc định không? | **Không** (dấu mang nghĩa). GV bật từng câu nếu cần | Auto grading |
| **O-17** | Bài **chỉ gồm câu chấm tự động** có tự công bố điểm không? | **Không** trong MVP: GV bấm công bố (nhất quán với D10.2). Tùy chọn "tự công bố khi nộp" là tính năng nâng cao, thiết lập theo từng bài | Grading |
| **O-18** | Cách bàn giao **mật khẩu tạm** khi tạo/import tài khoản? | Hiển thị **một lần**, hoặc file Excel tải về **một lần** (link hết hạn sau 15 phút). Bắt buộc đổi mật khẩu khi đăng nhập lần đầu. Không gửi mật khẩu qua thông báo trong hệ thống | Auth, import |
| **O-19** | Grace period khi nộp (bù độ trễ mạng)? | 30 giây, cấu hình theo tenant (0–120s) | Submission |
| **O-20** | Tên miền chính thức và môi trường triển khai (VPS/cloud)? | Cần trước Phase 8 (wildcard TLS nếu chọn subdomain ở O-01) | Deployment |
| **O-21** | GV xem bài làm của HS **trong lớp mình dạy** có tính là "truy cập dữ liệu nhạy cảm" (D7.3, bắt buộc nhập lý do) không? | **Không**: đây là công việc thường ngày của GV. Vẫn ghi audit ở mức "mở grading workspace" nhưng không bắt nhập lý do. Truy cập của School Admin luôn là nhạy cảm | Audit, UX chấm bài |
| **O-22** | Có cần ngân sách riêng cho **bộ đánh giá chất lượng AI** trước khi bật, và ngưỡng chất lượng tối thiểu là bao nhiêu? | Cần. Quyết định khi có phê duyệt D11 (ai-grading-design §11–12) | AI activation |

---

## 3. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 2026-11-20 | Phase 1 bản đầu: đề xuất D1–D15 |
| 2026-11-20 | Chủ dự án xác nhận D1–D14 (nội dung mục 1). D3 đổi sang multi-tenant. D9 đổi sang AI chỉ chạy khi GV kích hoạt. D11 hoãn gửi dữ liệu đến Anthropic. Câu hỏi D15 cũ (môi trường triển khai) chuyển thành O-20. Thêm câu hỏi mở O-01..O-22. Soạn sớm architecture, database-design, erd, authentication-authorization, ai-grading-design, security (DRAFT) |
