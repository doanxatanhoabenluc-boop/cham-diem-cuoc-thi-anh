# Website chấm điểm cuộc thi ảnh – Supabase

Dự án React + Vite + Supabase, mở và chạy bằng Visual Studio Code.

## 1. Mở bằng VS Code
1. Tải và giải nén `cuoc-thi-anh-supabase.zip`.
2. VS Code > File > Open Folder... > chọn thư mục `cuoc-thi-anh`.
3. Mở Terminal > New Terminal.
4. Cài Node.js bản LTS nếu máy chưa có: https://nodejs.org/
5. Chạy `npm install`, sau đó `npm run dev`.

File `.env` đã được điền Project URL và Publishable Key của dự án Supabase bạn cung cấp. Publishable key dùng được ở frontend; tuyệt đối không đặt `service_role`/secret key vào biến `VITE_` hoặc file frontend.

## 2. Tạo database và kho ảnh
1. Mở Supabase Dashboard > dự án của bạn > SQL Editor > New query.
2. Mở `supabase/schema.sql` trong VS Code, sao chép toàn bộ và dán vào SQL Editor > Run.
3. Sau đó mở `supabase/username-login-migration.sql`, sao chép toàn bộ và chạy thêm một lần trong SQL Editor.
4. Chạy thành công sẽ tạo bảng profiles, entries, scores và bucket private `contest-images` (giới hạn 2 MB/ảnh). Nếu đang dùng bản cũ, `schema.sql` cũng tự bổ sung cột STT còn thiếu.
5. Hoặc chỉ chạy riêng `supabase/source-stt-migration.sql` nếu bạn không muốn chạy lại toàn bộ `schema.sql`.

## 3. Tạo Admin đầu tiên (chỉ chạy trên máy quản trị)
1. Supabase Dashboard > Project Settings > API Keys, lấy `service_role` secret key (không phải publishable key).
2. Sao chép `.env.bootstrap.example` thành `.env.bootstrap`.
3. Điền service role key, email Admin. Chọn mật khẩu Admin riêng, tối thiểu 8 ký tự.
4. Trong `.env.bootstrap`, đặt `ADMIN_USERNAME=admin`, mật khẩu Admin và email nội bộ dùng khi khởi tạo. Email chỉ để Supabase Auth quản lý, người dùng không nhập email.
5. Terminal chạy: `node --env-file=.env.bootstrap scripts/bootstrap-admin.js`
6. Không gửi `.env.bootstrap` cho ai, không tải lên GitHub và không đưa secret key vào frontend.

## 4. Triển khai chức năng đăng nhập và tạo tài khoản
Cần cài Supabase CLI và Docker (theo hướng dẫn Supabase). Tại Terminal:

```bash
supabase login
supabase link --project-ref kvtbjkckewuwsvqwroxd
supabase functions deploy admin-create-user --no-verify-jwt
```

Một Function `admin-create-user` xử lý cả đăng nhập bằng tên người dùng và tạo tài khoản. Chỉ Admin đã đăng nhập mới được tạo tài khoản. Người dùng không cần nhập email; hệ thống tự tạo email nội bộ cho Supabase Auth. Secret service role được Supabase cấp cho Edge Function, không đưa vào trình duyệt.

## 5. Định dạng ảnh và TXT
Chọn nhiều ảnh và TXT có tên tương ứng, ví dụ `Bui Anh Lan.png` + `Bui Anh Lan.txt`. TXT đọc các trường STT (nếu có), Họ tên tác giả, Đơn vị, Tên tác phẩm, Thông điệp theo mẫu bạn cung cấp. Thư viện xếp tác phẩm có STT theo thứ tự tăng dần; tác phẩm không có STT được xếp tiếp theo theo họ và tên tác giả (A-Z, tiếng Việt). Ảnh tối đa 2 MB.

## 6. Vai trò
- Admin: đăng tác phẩm, quản lý tài khoản, xem báo cáo.
- Judge: xem tác phẩm, chấm và sửa phiếu của chính mình.
- Reporter: chỉ xem tác phẩm và báo cáo.

Mỗi giám khảo có một phiếu riêng cho từng tác phẩm. Báo cáo lấy trung bình các phiếu đã hoàn tất; phiếu đánh dấu loại trừ tính 0 theo quy tắc đang cấu hình.

## 7. Tiêu chí chấm
- Nội dung & Chủ đề: 30 điểm
- Cảm xúc & Nhân văn: 20 điểm
- Chất lượng hình ảnh & Góc chụp: 20 điểm
- Tính sáng tạo & Dấu ấn: 15 điểm
- Lời giới thiệu & Thông điệp: 15 điểm

## 8. Chạy và đóng gói
```bash
npm install
npm run dev
npm run build
```
Mở URL local mà Vite hiển thị, thường là http://localhost:5173.

Lưu ý: đây là mã nguồn cần cấu hình SQL, tạo Admin và deploy Edge Function trước khi vận hành thật. Không dùng tài khoản mặc định 12345678 lâu dài.

**Thông điệp tác phẩm:** Nếu file TXT có dạng `Nội dung[... ]`, ứng dụng lấy toàn bộ nội dung bên trong dấu ngoặc vuông làm trường “Thông điệp của tác phẩm”. Các trường STT, họ tên, đơn vị và tên tác phẩm vẫn được đọc riêng từ file TXT.

## Reset toàn bộ điểm của một giám khảo (Admin)

Trong mục **Quản lý tài khoản**, Admin xem được số phiếu chấm của từng tài khoản Ban Giám khảo và có thể chọn **Reset điểm** ở đúng tài khoản cần chấm lại. Hệ thống yêu cầu xác nhận trước khi xóa toàn bộ bản ghi trong `public.scores` có `judge_id` tương ứng. Tác phẩm, ảnh và điểm của các giám khảo khác không bị thay đổi.

Schema chính đã có chính sách RLS `admin delete scores`. Nếu dự án Supabase hiện tại chưa có quyền này và thao tác reset báo lỗi, mở **Supabase → SQL Editor** và chạy một lần file `supabase/reset-judge-scores-policy.sql`. Chính sách này chỉ cấp quyền DELETE cho tài khoản có vai trò `admin`.


## Xóa toàn bộ bài đăng (Admin)

Trong mục **Tác phẩm dự thi**, tài khoản Admin có nút **Xóa toàn bộ bài đăng**. Để tránh thao tác nhầm, Admin phải nhập đúng cụm `XOA TAT CA` và xác nhận lần cuối. Hệ thống xóa toàn bộ bản ghi `entries`; các phiếu chấm trong `scores` được xóa theo khóa ngoại `ON DELETE CASCADE`, sau đó ứng dụng dọn ảnh trong bucket `contest-images`. Tài khoản giám khảo và người xem báo cáo không có nút và không có quyền xóa. Đây là thao tác vĩnh viễn; nên xuất/lưu báo cáo cần thiết trước khi thực hiện.

Chính sách RLS dành cho Admin xóa bài và ảnh đã có trong `supabase/schema.sql` và `supabase/delete-entry-policy.sql`. Nếu dự án Supabase hiện tại chưa có chính sách này, chạy một lần file `supabase/delete-entry-policy.sql` trong SQL Editor.
