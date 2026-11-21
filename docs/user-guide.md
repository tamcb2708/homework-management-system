# Hướng dẫn sử dụng – Homework Management System

## 1. Đăng nhập

| Vai trò | Trang | Thông tin đăng nhập |
|---|---|---|
| Quản trị nền tảng | `/platform/login` | Email + mật khẩu |
| Quản trị trường, Giáo viên | `/login` | **Mã trường** + email (hoặc tên đăng nhập) + mật khẩu |
| Học sinh | `/login` | **Mã trường** + **mã học sinh** (hoặc email nếu có) + mật khẩu |

- Mã trường của môi trường demo: `demo`.
- Tài khoản mới tạo nhận **mật khẩu tạm** (hiển thị một lần). Lần đăng nhập đầu, hệ thống yêu cầu đổi mật khẩu.
- Sai mật khẩu 5 lần liên tiếp thì tài khoản bị khóa tạm (5 phút, tăng dần).

## 2. Quản trị nền tảng

- **Tổng quan**: số trường, người dùng, bài tập, lượt nộp theo từng trường (không xem được nội dung bài làm). Công tắc AI của nền tảng (chỉ là một trong năm cổng; AI vẫn tắt khi máy chủ cấu hình `disabled`).
- **Trường học**: thêm trường (tên, mã trường, giới hạn tài khoản, quản trị trường đầu tiên), tạm ngưng hoặc kích hoạt lại. Tạm ngưng thì mọi người dùng của trường bị đăng xuất ngay.
- **Nhật ký nền tảng**: mọi thao tác của quản trị nền tảng.

## 3. Quản trị trường (Workflow A)

1. **Tổng quan**: số giáo viên, học sinh, lớp, bài tập, tỷ lệ hoàn thành, hoạt động gần đây.
2. **Năm học**: tạo năm học, đặt năm hiện hành, thêm học kỳ.
3. **Môn học**: thêm môn, lưu trữ môn không dùng.
4. **Giáo viên / Học sinh**: *Thêm* → mật khẩu tạm hiện một lần. Menu `⋯` ở mỗi dòng: sửa thông tin, đặt lại mật khẩu, khóa/mở khóa. Học sinh có thể được xếp lớp ngay khi tạo.
5. **Lớp học** → *Thêm lớp* → mở lớp → *Thêm học sinh* (tìm và chọn nhiều) → *Phân công* giáo viên theo môn. Gỡ phân công thì giáo viên mất quyền với lớp ngay lập tức.
6. **Bài tập toàn trường**: theo dõi tiến độ. *Xem bài làm* bắt buộc chọn lý do và được ghi vào nhật ký truy cập nhạy cảm.
7. **Nhật ký hoạt động**: lọc theo hành động, chỉ truy cập nhạy cảm.
8. **Cấu hình**: định dạng và dung lượng tệp, thời gian bù trễ khi nộp, bước điểm; trạng thái năm cổng AI.

## 4. Giáo viên (Workflow B)

1. **Tổng quan**: lớp, học sinh, bài đã giao, chờ chấm, chờ công bố, tỷ lệ hoàn thành, thống kê điểm, danh sách cần xử lý.
2. **Lớp học**: danh sách lớp được phân công → học sinh, tỷ lệ hoàn thành, điểm trung bình → *Lịch sử học tập* của từng học sinh.
3. **Bài tập → Tạo bài tập**: nhập tiêu đề, chọn môn.
4. **Thêm câu hỏi**: chọn loại (Chọn một đáp án, Trắc nghiệm nhiều đáp án, Đúng/Sai, Trả lời ngắn, Tự luận, Nộp tệp), nội dung (công thức viết trong `$...$`), điểm, đáp án đúng; tự luận có đáp án tham khảo và rubric (tổng điểm tiêu chí phải bằng điểm câu). Có thể đính kèm hình ảnh/tệp. Sắp xếp câu bằng nút ↑ ↓.
5. **Thông tin & cài đặt** (cột phải): mô tả, hướng dẫn, điểm đạt, thời gian làm bài, cho phép nộp lại + số lần, thời điểm học sinh được xem đáp án, tài liệu đính kèm.
6. **Giao bài**: chọn lớp (hoặc *Chọn từng học sinh*), thời gian mở (tương lai thì hệ thống tự giao theo lịch), hạn nộp, cho phép nộp muộn. Học sinh nhận thông báo khi bài mở.
7. **Bài nộp**: lọc theo trạng thái (Chưa bắt đầu, Đang làm, Đã nộp, Nộp muộn, Đang chấm, Đã chấm, Đã công bố, Cần nộp lại, Không nộp). *Yêu cầu nộp lại* kèm lý do và hạn mới.
8. **Chấm**: bài làm bên trái, bảng điểm bên phải. Câu trắc nghiệm đã được chấm tự động (muốn sửa phải nhập lý do). Câu tự luận nhập điểm theo từng tiêu chí rubric + nhận xét → *Lưu điểm*. Thêm nhận xét chung. Dùng ← → để chuyển học sinh. *Lịch sử điểm* ghi mọi thay đổi.
9. **Công bố điểm**: từng bài (trong màn chấm) hoặc *Công bố điểm* hàng loạt ở danh sách bài nộp. Sửa điểm sau khi công bố phải nhập lý do, và học sinh được thông báo.
10. Khác: *Thu hồi / Khôi phục / Nhân bản / Lưu trữ / Xuất Excel* ở đầu trang bài tập.

## 5. Học sinh (Workflow C)

1. **Tổng quan**: bài được giao, cần làm, đang làm, đã nộp, đã chấm, quá hạn, điểm trung bình, tiến độ, bài sắp đến hạn, điểm mới.
2. **Bài tập của tôi**: lọc Tất cả / Chưa làm / Đang làm / Đã nộp / Đã chấm / Quá hạn; mỗi thẻ hiển thị môn, giáo viên, ngày giao, hạn nộp, tổng điểm, thời gian còn lại.
3. **Làm bài**: *Bắt đầu làm bài* → trả lời từng câu (thanh số câu cho biết câu đã làm). Bài làm **tự động lưu** (trạng thái hiển thị ở cột phải); có nút *Lưu nháp ngay*. Bài có giới hạn thời gian hiển thị đồng hồ đếm ngược theo giờ máy chủ, hết giờ thì bài tự được nộp.
4. **Nộp bài**: hệ thống liệt kê câu chưa làm; câu bắt buộc phải được trả lời. Sau khi nộp, trạng thái là "Đã nộp – đang chờ giáo viên chấm".
5. **Xem kết quả** (sau khi giáo viên công bố): điểm, đạt/chưa đạt, điểm từng câu và từng tiêu chí, câu trả lời của em, đáp án đúng (nếu giáo viên cho phép), nhận xét của giáo viên, phần cần cải thiện.
6. **Nộp lại**: khi giáo viên bật quyền nộp lại hoặc yêu cầu nộp lại, bài làm cũ được giữ trong lịch sử; điểm tính theo lần nộp cuối.
7. **Thông báo**: chuông ở góc trên (bài mới, sắp đến hạn, đã có điểm, yêu cầu nộp lại…).
