# SANSA Zen Garden — Phase 13

Không gian chùa 3D nhiều người, nâng cấp trực tiếp từ An Nhiên. Chọn tên và nhân vật, cùng đi dạo, chào hỏi, cầu nguyện, ngồi thiền, trò chuyện và khám phá. Người xuất hiện trong phòng là kết nối Socket.IO thực; không có NPC giả làm người online.

## Mở và chạy

Yêu cầu Node.js 22+, npm và trình duyệt hỗ trợ WebGL2. Chạy tại `D:\webPhat_tu\real`:

```powershell
npm ci
npm run dev
```

Mở http://localhost:5173/?room=an-nhien&instance=0&region=apac. Vite phục vụ frontend tại 5173 và proxy API/Socket.IO tới Node tại 3001. Chọn tên rồi bấm **Bước vào sân chùa**; màn hình chào chưa tính là người trong phòng.

Production:

```powershell
npm run build
$env:NODE_ENV = 'production'
$env:PORT = '3002'
npm start
```

Mở http://localhost:3002/?room=an-nhien&instance=0&region=apac. Server JavaScript tại `dist-server/index.mjs` phục vụ cả `dist/` và Socket.IO. Production không cần `tsx`. Không chạy hai server cùng cổng.

URL Internet và thời điểm xác minh nằm trong [PUBLIC_PREVIEW.md](PUBLIC_PREVIEW.md). Bản public tạm thời cần máy này, server và tunnel tiếp tục chạy; không phải hosting 24/7. Cấu hình Render/Docker có trong [DEPLOYMENT.md](DEPLOYMENT.md).

Launcher nền: sau khi build và tải tunnel bằng `node scripts/download-tunnel.mjs`, chạy `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launch-services.ps1 -Mode public`. Chờ `.runtime/public-launcher.log` báo thành công rồi đọc URL mới trong `.runtime/public-preview.json`. Dùng `-Mode restart` sau lần build tiếp theo để khởi động lại server, giữ tunnel và URL đang chạy. Launcher không tự chạy lại sau khi tắt máy.

## Cách chơi

| Thao tác               | Điều khiển                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Đi / chạy              | WASD hoặc mũi tên; Shift để chạy. Click/chạm mặt đất để tự tìm đường.                                                                                                                      |
| Điện thoại             | Cần cảm ứng; nút Chạy bật/tắt chạy; nút Tương tác tương đương E.                                                                                                                           |
| Nhìn quanh             | Kéo chuột/vuốt; cuộn chuột/chụm hai ngón để zoom.                                                                                                                                          |
| Ngồi thiền             | E/F cạnh bồ đoàn; click bồ đoàn; hoặc nút Ngồi thiền tự đi tới chỗ trống.                                                                                                                  |
| Cầu nguyện             | E trước tượng Phật; E lần nữa để kết thúc, hoặc tự kết thúc sau 7 giây. Minimap có điểm Tượng Phật.                                                                                        |
| Thỉnh chuông / thả đèn | Chọn Chuông chùa hoặc Hồ sen trên bản đồ, đến gần rồi nhấn E hoặc nút Tương tác. Người cùng phòng thấy cùng hiệu ứng; tiếng chuông nhỏ dần theo khoảng cách và tuân theo cài đặt âm thanh. |
| Lễ Phật                | Chu kỳ 108 lễ, 4,2 giây/lượt. Dừng lễ hoàn tất lượt hiện tại rồi dừng.                                                                                                                     |
| Biểu cảm               | Chắp tay và Vẫy tay được người cùng phòng nhìn thấy.                                                                                                                                       |
| Chuỗi hạt              | Click/chạm/vuốt hoặc Space/Enter khi chuỗi có focus, tối đa 108 hạt.                                                                                                                       |
| Chat / hiện diện       | Thanh bên trái; danh sách người có nút ẩn avatar và chặn chat theo phiên.                                                                                                                  |
| Minimap / hành trang   | Chọn nơi để tự đi; hành trang ghi địa điểm đã ghé và mở chuỗi hạt.                                                                                                                         |
| Phòng                  | Chọn tên phòng; tạo phòng riêng qua link; đổi room/instance/region; về phòng chính hoặc rời chùa.                                                                                          |
| Âm thanh / đồ họa      | Mixer, volume, mute; Nhẹ/Vừa/Cao hoặc tự động, có số đo khung hình.                                                                                                                        |

Mái/xà mờ khi vào chính điện. Nhà tắm và hội chợ là khu cảnh quan trong cùng thế giới; chưa có cơ chế tắm/mua bán. Hành trang là chuỗi hạt và nhật ký khám phá, chưa có kinh tế vật phẩm.

DCK mặc định giữ dáng chibi gốc: đầu tròn lớn, thân và tay chân ngắn. Các nhân vật được dựng bằng mã của dự án, có khớp và animation; không thay bằng model người thật hoặc GLB khác. Tên, kiểu nhân vật, màu áo và chất lượng lưu trên thiết bị. Số lễ, hạt và nơi đã ghé bắt đầu lại khi tải trang.

## Multiplayer thực tế

- Một Express/Socket.IO process quản lý phòng trong RAM. Frontend React/Vite/TypeScript; Three.js trực tiếp dựng cảnh.
- Khóa `region:room:instance`, tối đa 24 người/phòng, 12 ghế độc quyền. `region` là namespace, chưa phải hosting nhiều vùng địa lý.
- Snapshot 12 Hz; client chuẩn bị pose tối đa khoảng 12,5 Hz, nội suy avatar ở xa và nhận hiệu chỉnh vị trí từ server. Snapshot làm tròn 3 chữ số; server giữ độ chính xác đầy đủ.
- Client chỉ gửi một cập nhật vị trí đang chờ ACK; trong lúc chờ, vị trí mới nhất thay thế bản đợi gửi. Dữ liệu dự đoán chưa gửi được xóa khi có hiệu chỉnh, ngắt kết nối hoặc đổi phòng. Cách này giới hạn hàng đợi khi mạng chậm; kiểm tra tốc độ phía server vẫn giữ nguyên.
- Ngồi, chào, lễ và cầu nguyện chờ server nhận vị trí trước khi gửi tương tác. Đích tự đi vẫn được giữ nếu nhận hiệu chỉnh muộn sau khi đã đến nơi trên client; thao tác di chuyển mới sẽ hủy đích cũ.
- Server kiểm tra tốc độ đi 3,5 m/s/chạy 5,8 m/s, đường xuyên vật cản, ghế, khu vực cầu nguyện, đầu vào và tần suất. Session ID ngẫu nhiên riêng từng client, từ chối trùng phiên đang hoạt động.
- Va chạm dùng chung giữa client/server, đối chiếu độ rộng áo chibi và vật thể nhìn thấy: tường bên chính điện, chân cột, đèn đá, quầy chợ và thành bồn tắm. Kiểm thử ép nhân vật vào vật cản gồm cả bước thời gian lớn; đường tới bồ đoàn và điểm tương tác vẫn đi được.
- Phòng riêng có token mời 192 bit, không lộ trong room list/snapshot. Người có link được vào. Restart server hoặc dọn phòng trống quá hạn làm link riêng hết hiệu lực.
- Chat 200 ký tự/tin, giữ 50 tin/phòng, giới hạn spam và lọc cơ bản. Chặn/ẩn áp dụng cục bộ theo ID phiên; chưa có tài khoản hoặc ban vĩnh viễn.
- Thỉnh chuông/thả đèn được server kiểm tra khoảng cách và thời gian chờ rồi phát cùng sự kiện tới người cùng phòng. Hiệu ứng còn hoạt động được trả cho người mới vào; đổi phòng xóa hiệu ứng của phòng cũ.
- Reconnect lấy lại trạng thái server. Pagehide chủ động disconnect; mất mạng đột ngột có thể cần khoảng 25 giây để heartbeat dọn người chơi.
- CORS kiểm tra polling/WebSocket, dùng cùng origin hoặc allowlist. HTTPS/WSS kết thúc tại hosting/tunnel, không có secret frontend. Health: `/api/health`.

## Các file chính nâng cấp

| Nhóm                  | File                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Hợp đồng thế giới     | `shared/world.ts`: action, avatar, chat, invite, địa điểm, collision                                               |
| Backend / kết nối     | `server/app.ts`, `server/index.ts`, `src/network.ts`                                                               |
| Nhân vật / điều khiển | `src/scene/character.ts`, `src/scene/controller.ts`                                                                |
| Cảnh quan             | `src/scene/architecture.ts`, `nature.ts`, `environment.ts`                                                         |
| Gameplay              | `src/scene/engine.ts`, `src/state.ts`                                                                              |
| Giao diện             | `src/ui/App.tsx`, `Experience.tsx`, `phase13.css`, `src/main.tsx`, `index.html`                                    |
| Triển khai            | `package.json`, lockfile, `scripts/build-server.mjs`, `Dockerfile`, `.dockerignore`, `render.yaml`, `.env.example` |
| QA                    | `tests/*.test.ts`, `tests/browser/*.spec.ts`, `scripts/verify-public.mjs`, `scripts/production-smoke.mjs`          |

Cây/cỏ dùng instancing, kiến trúc gộp geometry, nhân vật gộp chi tiết theo xương và giảm LOD ở xa. Texture vi bề mặt 64×64 do dự án tạo; font đóng gói cục bộ. Shader chuẩn bị trước khi loading hoàn tất; phần trăm biểu diễn các bước đã hoàn thành. Cảnh, socket, input và GPU resource có đường dispose.

## Kiểm thử lặp lại

```powershell
npm test
npm run build
npm run test:e2e
node scripts/production-smoke.mjs
node scripts/verify-unit.mjs
```

Playwright dùng Chrome cài sẵn với profile headless riêng. Build trước browser tests; có bài tải frontend production từ backend 3001. Nếu Vite đã chạy qua các lần sửa source, khởi động lại bằng `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/restart-dev-preview.ps1` trước khi chạy suite, để các bài đọc state không nhập nhầm module cũ do HMR. Không sửa source hay chạy hai suite chung output directory khi đo. Kết quả và giới hạn: [TEST_REPORT.md](TEST_REPORT.md). Giấy phép: [ASSETS.md](ASSETS.md).

Sau khi tunnel chạy: `node scripts/verify-public.mjs`. Script mở hai browser context qua HTTPS, kiểm tra WSS, chuyển động, chào, thiền, chat, thỉnh chuông/thả đèn chung, refresh và disconnect; chỉ ghi báo cáo thành công khi mọi assertion đạt.

Chưa có Redis/shared-state adapter, tài khoản, lưu tiến trình server, soak test nhiều giờ, điện thoại vật lý/Safari. Không tăng replica khi trạng thái còn nằm trong RAM. Dockerfile đã chuẩn bị; chưa build image vì Docker daemon chưa chạy.
