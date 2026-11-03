# SANSA Zen Garden — báo cáo Phase 13

Kiểm tra bản public ngày 3/11/2026; workspace `D:\webPhat_tu\real`. Bản public được xác minh lúc 18:34:13 3/11/2026 (giờ Việt Nam); thời điểm các lượt kiểm thử khác được ghi trong từng artifact.

## Kết quả đã chạy

| Hạng mục                       | Kết quả                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript + Vite + server ESM | `npm run build` thành công                                                                                                                                                |
| Node unit/integration          | **74/74 PASS**, cùng bộ test của `npm test`; gồm server, network, controller, character, environment và collision                                                         |
| Chrome end-to-end              | **13/13 PASS**, 151 giây; không có kiểm thử bị bỏ qua                                                                                                                     |
| Production server riêng        | 20 client Socket.IO tạo tải kiểm thử; 700 pose được nhận hợp lệ, 0 bị từ chối                                                                                             |
| Public HTTPS/WSS               | Hai phiên trình duyệt độc lập qua URL Internet; toàn bộ điều kiện kiểm tra đạt                                                                                            |
| Desktop / mobile               | Chrome 1440 × 900 và màn hình mobile giả lập 390 × 844; cần cảm ứng điều khiển được nhân vật                                                                              |
| Hành động                      | Đi/chạy, chào/vẫy, cầu nguyện đúng vùng, ghế độc quyền, 108 lễ, chuỗi 108 hạt, âm thanh và tắt tiếng                                                                      |
| Phòng / xã hội                 | Link riêng, cách ly room/instance/region, chat/chặn/ẩn; từ chối chuyển vào phòng đầy và giữ ghế ở phòng cũ; tải lại trang/kết nối lại không nhân đôi nhân vật             |
| Cảnh                           | Đường đến 12 ghế và các điểm tương tác; va chạm tường bên chính điện, chân cột, đèn đá, quầy chợ và thành bồn tắm; tư thế chân/tay, LOD và giải phóng tài nguyên          |
| Tương tác chung                | Thỉnh chuông và thả đèn hoa đăng; server kiểm tra khoảng cách, trạng thái và thời gian chờ; người cùng phòng nhận cùng sự kiện, người vào sau thấy hiệu ứng còn hoạt động |

## Số đo 20 avatar

Một trình duyệt dựng cảnh WebGL cùng 19 client Socket.IO tạo tải kiểm thử, chạy trên cùng máy Windows. Mẫu này không đại diện cho 20 người dùng trên 20 thiết bị độc lập. Thời gian đo 8.04 giây, chất lượng auto:

- Nhịp rAF: **106.7 khung hình/giây**; phân vị 95 của khoảng cách giữa hai khung hình là 16.8 ms.
- 558 lệnh vẽ/khung theo `renderer.info`; heap JavaScript khoảng 106.2 MiB.
- `TaskDuration` của luồng chính: 7.03 giây trong mẫu; đây không phải phần trăm CPU toàn máy.
- Dữ liệu WebSocket nhận vào khoảng 45.3 KiB/s; chưa gồm phần phụ trội của TLS và khung truyền mạng.
- Công cụ không cung cấp thời gian xử lý trên GPU. Chưa đo FPS trên điện thoại cấu hình yếu.

Production server được đo riêng qua loopback trên cùng máy: trung vị thời gian ACK 0.88 ms, phân vị 95 là 2.06 ms, bộ nhớ RSS 92 MB. Các số này không phải độ trễ Internet. Nhân vật chibi giữ tỷ lệ bản gốc, dùng 22 mesh khi ở gần và 13 mesh khi ở xa.

Client chỉ giữ một bản cập nhật vị trí đang chờ ACK. Trong thời gian chờ, các vị trí mới thay thế bản đang đợi gửi, giúp tránh tích lũy dữ liệu chuyển động cũ khi mạng chậm. Vị trí dự đoán chưa gửi được xóa khi server hiệu chỉnh, khi ngắt kết nối hoặc đổi phòng. Server vẫn giữ nguyên kiểm tra giới hạn tốc độ.

Kết nối ưu tiên WebSocket trực tiếp và tự thử polling khi WebSocket bị từ chối. Kiểm thử đã buộc máy chủ từ chối WebSocket, xác nhận client vẫn vào phòng và thực hiện hành động qua polling. Thời gian chờ kết nối ban đầu đã được điều chỉnh để không báo thất bại quá sớm.

Đã kiểm thử một gói vị trí bị trì hoãn một giây và mọi gói liên tiếp bị trì hoãn 700 ms. Client giới hạn khoảng dự đoán đi trước vị trí đã được server xác nhận: tạm dừng bước đi khi cần, giữ đích đến/phím đang giữ và tiếp tục khi nhận ACK. Trong kiểm thử trễ liên tục, vị trí server vẫn tiến hơn 3 m sau 3,6 giây và không phát sinh hiệu chỉnh kéo lùi. ACK cũ đến sau hiệu chỉnh không được hủy bản vị trí mới. Thao tác ngồi/chào/lễ/cầu nguyện chờ xác nhận vị trí; các kiểm thử chống vượt tốc độ và xuyên vật cản vẫn đạt.

Quá trình vào chùa hoàn tất khởi động âm thanh và nhận lịch sử phòng trước khi mở điều khiển, tránh lệnh đi vào sân ghi đè lệnh ngồi thiền vừa chọn. Nếu server hiệu chỉnh vị trí ngay trước tương tác, client đồng bộ lại một lần; khi vị trí mới cách xa bồ đoàn, nhân vật tìm đường tới ghế rồi mới xin ngồi. Tán lá nằm giữa camera và nhân vật được ẩn để giữ tầm nhìn, rồi hiện lại khi đổi góc; thân cây và va chạm vẫn giữ nguyên.

Lượt Chrome bàn giao chạy bằng `npx playwright test --trace=off`. Ghi trace WebGL liên tục đã làm chậm callback mạng trên máy kiểm thử này; vì vậy cấu hình mặc định giữ ảnh khi lỗi và cho bật trace bằng `--trace=on` khi cần chẩn đoán riêng. Kiểm thử chức năng chờ tối đa 30 giây để tới bồ đoàn và 45 giây cho tuyến tương tác dài. Các lượt có trace từng hết giới hạn cũ dù nhân vật vẫn đi đúng đường và hoàn tất ngay sau đó. Điều kiện đạt vẫn yêu cầu ghế thực hoặc cả vị trí client lẫn server tới đúng điểm; không bỏ qua kiểm tra va chạm/tốc độ. Số đo hiệu năng được thực hiện riêng, không lấy thời gian chờ này làm chỉ tiêu độ trễ.

## Link thực và phạm vi chứng minh

[Chơi thử SANSA](https://voluntary-suggested-innovations-jean.trycloudflare.com/?room=an-nhien&instance=0&region=apac) — **link tạm thời**, cần máy, server và tunnel tiếp tục chạy. Frontend/API truy cập được qua HTTPS; hai client dùng WSS và đồng bộ di chuyển, chào, ngồi thiền, chat, thỉnh chuông và thả đèn hoa đăng. Kiểm tra tải lại trang và ngắt kết nối đạt. Thời gian nhận biết người rời phòng trong phép thử: 106 ms. Mất mạng đột ngột có thể cần khoảng 25 giây để heartbeat phát hiện.

Hai phiên trình duyệt chạy trên máy hiện tại và truy cập qua địa chỉ Internet của Cloudflare. Chưa kiểm thử bằng hai thiết bị vật lý ở hai mạng độc lập. Phương án hosting lâu dài đã chuẩn bị gồm `render.yaml`, `Dockerfile`, biến môi trường và hướng dẫn. Chưa triển khai lên Render; bước đó cần kết nối tài khoản hosting.

## Bằng chứng

- [Node test log](artifacts/unit-tests.tap), [Playwright JSON](artifacts/browser-results.json), [số đo 20 avatar](artifacts/phase13-performance.json), [production server](artifacts/production-server-report.json), [xác minh public](artifacts/public-verification.json).
- [Màn hình chào](artifacts/phase13-onboarding.png), [mobile](artifacts/phase13-mobile-world.png), [chibi gốc và tư thế](artifacts/original-chibi-restored-poses.png), [20 kết nối](artifacts/phase13-20-players.png).
- [Hai client qua URL public](artifacts/public-https-two-clients.png), [rừng](artifacts/public-forest.png), [nhà tắm](artifacts/public-bath.png), [hội chợ](artifacts/public-market.png).
- [Thỉnh chuông chung](artifacts/public-shared-bell.png), [thả đèn hoa đăng chung](artifacts/public-shared-lantern.png).

## Giới hạn còn lại

- Chưa có hosting 24/7, lưu trạng thái lâu dài, Redis, nhiều server dùng chung trạng thái, tài khoản hoặc công cụ quản trị người dùng. Link mời riêng và chat mất khi khởi động lại server.
- Giữ nhân vật chibi DCK với đầu tròn lớn, thân và tay chân ngắn theo tỷ lệ bản gốc. Animation, va chạm sàn và tối ưu mesh được giữ; không thay bằng người thật hoặc model GLB khác.
- Nhà tắm và hội chợ là khu khám phá; chưa có hoạt động tắm hoặc mua bán. Hành trang gồm chuỗi hạt và dấu ghé thăm theo phiên.
- Chưa kiểm thử điện thoại vật lý/Safari, tải liên tục nhiều giờ, thời gian xử lý trên GPU hoặc 20 trình duyệt cùng dựng cảnh.
- Chưa build Docker image vì daemon không chạy. Chunk Three khoảng 512 kB (129 kB gzip) có cảnh báo kích thước; build vẫn thành công.
- Chưa đối chiếu hình ảnh trực tiếp với trang Sansa Temple tham khảo. Nguồn tài nguyên nguyên bản và giấy phép được ghi ở `ASSETS.md`.

Các lỗi đã xử lý trong QA: React effect của chat trả về giá trị không hợp lệ trên Chrome mới; chân khi quỳ/lễ thấp hơn sàn; HUD mobile chồng nhãn phòng; hiệu chỉnh vị trí từ server và thay đổi focus làm hủy đường đi; thiếu va chạm ở tường bên chính điện, chân cột, đèn đá và thành bồn tắm. Bán kính va chạm nhân vật được đối chiếu với phần áo rộng nhất. Các kiểm thử liên quan đã được chạy lại.
