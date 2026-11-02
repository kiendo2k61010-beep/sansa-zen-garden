# Triển khai SANSA Zen Garden

Ứng dụng production dùng **một Node.js process** để phục vụ frontend đã build và Socket.IO trên cùng domain, cùng cổng. Trình duyệt dùng origin hiện tại, nên HTTPS tự dùng kết nối WSS. `region` là nhãn chia phòng; không định tuyến đến máy chủ địa lý.

## Chạy production trên máy hiện tại

Yêu cầu Node.js 22 trở lên. Chạy từ thư mục dự án:

```powershell
npm ci --include=dev
npm run build
$env:NODE_ENV = 'production'
$env:HOST = '0.0.0.0'
$env:PORT = '3002'
npm start
```

Mở `http://localhost:3002/?room=an-nhien&instance=0&region=apac`. Đây là URL cục bộ, chưa phải link Internet. `npm run dev` vẫn chạy Vite 5173 và backend 3001 cho phát triển. Bản server biên dịch nằm ở `dist-server/index.mjs`; production không cần `tsx` hoặc TypeScript compiler.

Có thể chép `.env.example` thành `.env`, điền giá trị thật rồi dùng `node --env-file=.env dist-server/index.mjs`. `npm start` không tự đọc `.env`: trên hosting hãy đặt biến trong dashboard.

## Render: một Web Service

1. Đưa repository này vào Git provider mà tài khoản Render của bạn có quyền đọc. Không đưa `.env`, token hosting, hoặc dữ liệu riêng lên repository.
2. Trong Render, tạo Blueprint từ repository, chọn `render.yaml`. File đã khai báo một Web Service, build production, start command và `/api/health`.
3. Xem lại gói được dashboard hiển thị trước khi triển khai. Blueprint đặt `plan: free`; không có dịch vụ trả phí được tạo bởi thao tác chuẩn bị file này.
4. Đợi build và health check thành công. Lấy **URL thực tế do Render cấp** trong dashboard. `PUBLIC_ORIGIN` tự tham chiếu `RENDER_EXTERNAL_URL`; khi dùng domain riêng, đổi `PUBLIC_ORIGIN` thành HTTPS origin chính và thêm origin phụ vào `ALLOWED_ORIGINS` nếu cần.
5. Mở URL thật với `?room=an-nhien&instance=0&region=apac`, sau đó kiểm tra bằng hai trình duyệt hoặc hai máy/mạng độc lập. Tạo phòng riêng từ UI rồi dùng nút sao chép link để giữ token mời.

Render cung cấp TLS và chuyển HTTP sang HTTPS. WebSocket và HTTP dùng cùng cổng `PORT` do platform cấp; server đã bind `0.0.0.0`. Cấu hình này theo [Web Services](https://render.com/docs/web-services) và [WebSockets](https://render.com/docs/websocket) của Render. Cú pháp tự tham chiếu biến môi trường dùng [Blueprint YAML Reference](https://render.com/docs/blueprint-spec).

Không tăng số instance hoặc bật autoscaling cho bản hiện tại: phòng, chỗ ngồi và chat đang nằm trong RAM của một process. Muốn nhiều instance cần shared state cùng Socket.IO adapter và kiểm tra lại quyền sở hữu ghế/phòng. Deploy/restart xóa phòng riêng và lịch sử chat; link riêng cũ hết hiệu lực. Phòng công khai có thể vào lại qua URL cũ.

Gói miễn phí có thể tạm dừng khi không có hoạt động; lúc đó người đầu tiên phải chờ khởi động. Cần đối chiếu giới hạn hiện tại trong [Free instances](https://render.com/docs/free) trước khi tổ chức buổi đông người. Chưa có phép đo chứng minh tài nguyên của gói này đủ cho mọi cấu hình người chơi.

## Docker hoặc VPS

```text
docker build -t sansa-zen-garden .
docker run --rm -p 3001:3001 -e PUBLIC_ORIGIN=https://your-actual-domain.example sansa-zen-garden
```

Domain trong lệnh là **placeholder**, phải thay bằng domain thật. Container chỉ phục vụ HTTP nội bộ; dùng reverse proxy có TLS và hỗ trợ HTTP Upgrade/WebSocket để cung cấp HTTPS/WSS. Image chạy bằng user `node`, cài production dependencies, và có health check. Không có secret frontend hoặc API key cần cấp cho gameplay.

## Biến môi trường và vận hành

| Biến              | Ý nghĩa                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| `NODE_ENV`        | Dùng `production` trên Internet để chặn origin localhost không nằm trong allowlist. |
| `HOST`            | `0.0.0.0` để nhận kết nối từ reverse proxy/platform.                                |
| `PORT`            | Platform cấp; local mặc định 3001.                                                  |
| `PUBLIC_ORIGIN`   | HTTPS origin chính chính xác, không có path; không phải secret.                     |
| `ALLOWED_ORIGINS` | Danh sách origin bổ sung, phân cách bằng dấu phẩy; không dùng wildcard.             |
| `MAX_CONNECTIONS` | Giới hạn socket đồng thời toàn process, mặc định 240; mỗi phòng tối đa 24 người.    |

Origin được kiểm tra cho cả polling và WebSocket handshake, cho phép cùng HTTP Host hoặc allowlist. Server không dùng `X-Forwarded-Host` để mở quyền origin. Token phòng riêng có 192 bit ngẫu nhiên, chỉ nằm trong link mời và response tạo phòng; không nằm trong snapshot, room list hoặc health response. Người có link mời có thể tham gia; đây chưa phải hệ thống tài khoản/quyền quản trị.

`GET /api/health` trả số player, connection, room, uptime, RSS memory và bộ đếm thao tác. Log khởi động là JSON; không log tên người chơi, chat hoặc token mời. Chat giữ 50 tin gần nhất mỗi phòng, tối đa 200 ký tự/tin, giới hạn tần suất và lọc cơ bản. Phòng riêng trống được dọn khi đã quá 6 giờ kể từ lúc tạo.

Khi trình duyệt phát `pagehide` để điều hướng/đóng trang, client chủ động disconnect để giải phóng nhân vật và bồ đoàn. Trang được khôi phục từ BFCache (`pageshow.persisted`) kết nối lại với cùng session trong bộ nhớ. Nếu mạng mất đột ngột, trình duyệt bị kill hoặc tín hiệu đóng không đến server, việc phát hiện phụ thuộc heartbeat: `pingInterval=15 giây` cộng `pingTimeout=10 giây`, tức thường trong khoảng 25 giây kể từ lần trao đổi cuối (có thể trễ thêm nếu event loop bị nghẽn). Không giảm heartbeat chỉ để làm đẹp số đo trên máy local vì kết nối điện thoại có thể bị gián đoạn ngắn.

Trước khi gửi link: kiểm tra health, refresh URL phòng trực tiếp, hai avatar độc lập, di chuyển/chào/ngồi đồng bộ, phòng riêng không lộ vào public list, chat không xuyên phòng, mất mạng/kết nối lại không nhân đôi. `npm test` chạy các kiểm thử server/network lặp lại được, gồm 20 Socket.IO client thực. Kiểm thử này không tự chứng minh FPS của 20 trình duyệt hay chất lượng đường truyền Internet.

File cấu hình sẵn sàng triển khai; việc có domain public hoạt động chỉ được xác nhận sau khi deployment thật hoàn tất và được kiểm tra. URL công khai tạm thời hoặc kết quả triển khai thực tế, nếu có, được ghi riêng trong báo cáo kiểm thử của phiên làm việc.

Đã kiểm tra bản Node production cục bộ với 20 socket client, 700 cập nhật vị trí được chấp nhận và 0 cập nhật bị từ chối trong lần chạy ghi tại `artifacts/production-server-report.json`. Script lặp lại: `node artifacts/production-smoke.mjs` sau khi build. Dockerfile chưa được build thử trong phiên này vì Docker daemon không chạy; không xem phần cấu hình Docker là bằng chứng image đã chạy thành công.
