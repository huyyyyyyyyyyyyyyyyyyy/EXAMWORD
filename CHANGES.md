# Cập nhật: cộng đồng, gia sư, live, khóa học & thanh toán trung gian

Hệ thống đã có sẵn: chat giáo viên, nhóm chat lớp, thông báo, gia sư, phòng live, khóa học, ví/đối soát 10% - 90%.
Bản này bổ sung phần còn thiếu:

1. **Thông báo cho cả lớp** – `POST /api/community/announcements`
   Giáo viên (chủ lớp) / admin gửi thông báo: đăng vào nhóm chat lớp + chuông thông báo cho từng học sinh.
   UI: nút "Gửi thông báo" trong nhóm chat lớp (trang Tin nhắn).
2. **Theo dõi giáo viên để chờ live** – `POST/DELETE /api/teachers/:id/follow`
   Học sinh theo dõi giáo viên; khi giáo viên tạo lịch live mới, người theo dõi nhận thông báo.
   UI: nút "Theo dõi giáo viên" trên thẻ phòng live. Bảng mới `app.teacher_follows` (đã thêm vào `schema.sql`).
3. **Bắt buộc khai ngân hàng trước khi bán khóa học có phí**
   Không thể xuất bản / bán khóa có giá > 0 nếu giáo viên chưa lưu đủ: tên ngân hàng, họ tên chủ TK, số TK (`teacher_bank_required`).
   UI: banner cảnh báo ở trang Khóa học dẫn tới "Đơn & doanh thu".
4. Sửa lỗi chính tả thông báo lỗi; mở rộng `dev/smoke.mjs` (toàn bộ test pass).

Chạy thử: `node dev/server.mjs` rồi `node dev/smoke.mjs`; frontend: `cd frontend && npm i && npm run dev`.

## Lưu ý quan trọng về thanh toán
- Quy trình chuyển khoản là **thủ công**: học sinh chuyển vào tài khoản trung gian, admin đối soát sao kê rồi bấm "Xác nhận tiền về", sau đó chuyển 90% cho giáo viên và nhập mã giao dịch. Hệ thống KHÔNG tự động nhận biết tiền về.
- Muốn tự động: tích hợp cổng như PayOS / SePay / Casso (webhook xác nhận chuyển khoản) – cần tài khoản doanh nghiệp.
- Khi chạy thật cần chạy lại `schema.sql` (phần `teacher_follows`) trên cơ sở dữ liệu.
