# Link chơi thử SANSA Zen Garden

[**Mở SANSA Zen Garden**](https://voluntary-suggested-innovations-jean.trycloudflare.com/?room=an-nhien&instance=0&region=apac)

Xác minh lúc **18:34:13 3/11/2026 (giờ Việt Nam)** bằng hai phiên trình duyệt độc lập trên máy hiện tại, cùng truy cập URL Internet qua HTTPS/WSS. Đã kiểm tra di chuyển, chào, ngồi thiền, chat, thỉnh chuông và thả đèn hoa đăng chung, tải lại trang không nhân đôi nhân vật và rời phòng. Đã đi tới rừng, nhà tắm và hội chợ trong cùng phòng. Chưa kiểm thử bằng hai thiết bị vật lý ở hai mạng khác nhau.

**Đây là link Cloudflare Quick Tunnel tạm thời.** Máy này phải bật, có mạng và giữ server cùng tunnel chạy. Khi một trong hai tiến trình dừng, bạn bè không truy cập được game. Khởi động lại tunnel có thể cấp URL mới; hãy chia sẻ URL vừa nhận. Chưa triển khai hosting 24/7. Quick Tunnel không có bảo đảm thời gian hoạt động theo [Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Mở link, chọn tên, giữ cùng phòng **an-nhien** rồi bấm **Bước vào sân chùa**. Dùng **Chia sẻ phòng** để mời bạn. Phòng riêng tạo trong giao diện có khóa mời trong URL.

Chạy bản public tạm thời từ thư mục dự án:

```powershell
npm run build
node scripts/download-tunnel.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launch-services.ps1 -Mode public
```

Launcher trả về PID ngay và khởi động tiến trình ẩn, không phụ thuộc việc giữ cửa sổ terminal mở. Chờ `.runtime/public-launcher.log` ghi kết quả thành công rồi đọc URL trong `.runtime/public-preview.json`; file có thể vẫn chứa URL của lần chạy trước trong lúc launcher đang khởi động. Sau đó chạy `node scripts/verify-public.mjs` để kiểm tra URL thật.

Sau khi build bản mới, nếu tunnel hiện tại còn chạy, dùng `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launch-services.ps1 -Mode restart` để khởi động lại server và giữ URL. Restart xóa phòng riêng và chat đang lưu trong RAM. Muốn dừng cả server và tunnel, dùng `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-public-preview.ps1`. Lần chạy `-Mode public` tiếp theo có thể nhận URL mới. Công cụ tải tunnel kiểm tra SHA-256 theo bản phát hành chính thức của Cloudflare; launcher không tạo Windows service, lịch tự chạy hoặc thay đổi Windows Firewall.

Để game tiếp tục chạy khi máy này tắt, triển khai một Web Service theo [DEPLOYMENT.md](DEPLOYMENT.md) bằng tài khoản Render của bạn. Cấu hình đã có; chưa có kết nối tài khoản hosting được xác nhận để thực hiện bước đó.
