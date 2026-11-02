import { readFile, writeFile } from 'node:fs/promises';
const read = async (path) => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const browser = await read('artifacts/browser-results.json'),
  unit = await read('artifacts/unit-results.json'),
  perf = await read('artifacts/phase13-performance.json'),
  publicTest = await read('artifacts/public-verification.json'),
  server = await read('artifacts/production-server-report.json');
if (browser.stats.expected !== 13 || browser.stats.unexpected || browser.stats.skipped)
  throw Error('Full 13-test suite must pass first.');
if (unit.exitCode !== 0 || unit.tests !== unit.passed || unit.failed || unit.skipped)
  throw Error('Full Node test suite must pass first.');
if (publicTest.errors.length || perf.drawCalls <= 0) throw Error('Public/render verification is incomplete.');
const when = new Date(publicTest.verifiedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
await writeFile(
  'PUBLIC_PREVIEW.md',
  `# Link chơi thử SANSA Zen Garden

[**Mở SANSA Zen Garden**](${publicTest.shareUrl})

Xác minh lúc **${when} (giờ Việt Nam)** bằng hai phiên trình duyệt độc lập trên máy hiện tại, cùng truy cập URL Internet qua HTTPS/WSS. Đã kiểm tra di chuyển, chào, ngồi thiền, chat, tải lại trang không nhân đôi nhân vật và rời phòng. Đã đi tới rừng, nhà tắm và hội chợ trong cùng phòng. Chưa kiểm thử bằng hai thiết bị vật lý ở hai mạng khác nhau.

**Đây là link Cloudflare Quick Tunnel tạm thời.** Máy này phải bật, có mạng và giữ server cùng tunnel chạy. Khi một trong hai tiến trình dừng, bạn bè không truy cập được game. Khởi động lại tunnel có thể cấp URL mới; hãy chia sẻ URL vừa nhận. Chưa triển khai hosting 24/7. Quick Tunnel không có bảo đảm thời gian hoạt động theo [Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Mở link, chọn tên, giữ cùng phòng **an-nhien** rồi bấm **Bước vào sân chùa**. Dùng **Chia sẻ phòng** để mời bạn. Phòng riêng tạo trong giao diện có khóa mời trong URL.

Chạy bản public tạm thời từ thư mục dự án:

\x60\x60\x60powershell
npm run build
node scripts/download-tunnel.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-public-preview.ps1
node scripts/verify-public.mjs
\x60\x60\x60

Nếu bản public cũ đang chạy, dừng bằng \x60scripts/stop-public-preview.ps1\x60 trước khi khởi động lại để dùng bản build mới. Lấy URL từ kết quả lệnh hoặc \x60.runtime/public-preview.json\x60. Công cụ tải tunnel kiểm tra SHA-256 theo bản phát hành chính thức của Cloudflare và không thay đổi Windows Firewall.

Để game tiếp tục chạy khi máy này tắt, triển khai một Web Service theo [DEPLOYMENT.md](DEPLOYMENT.md) bằng tài khoản Render của bạn. Cấu hình đã có; chưa có kết nối tài khoản hosting được xác nhận để thực hiện bước đó.
`,
);
await writeFile(
  'TEST_REPORT.md',
  `# SANSA Zen Garden — báo cáo Phase 13

Kiểm tra ngày 02/11/2026; workspace \x60D:\\webPhat_tu\\real\x60. Bản public được xác minh lúc ${when} (giờ Việt Nam).

## Kết quả đã chạy

| Hạng mục | Kết quả |
| --- | --- |
| TypeScript + Vite + server ESM | \x60npm run build\x60 thành công |
| Node unit/integration | **${unit.passed}/${unit.tests} PASS**, cùng bộ test của \x60npm test\x60; gồm server, network, controller, character, environment và collision |
| Chrome end-to-end | **${browser.stats.expected}/13 PASS**, ${Math.round(browser.stats.duration / 1000)} giây; không có kiểm thử bị bỏ qua |
| Production server riêng | 20 client Socket.IO tạo tải kiểm thử; ${server.load.acceptedPoses} pose được nhận hợp lệ, ${server.load.rejectedPoses} bị từ chối |
| Public HTTPS/WSS | Hai phiên trình duyệt độc lập qua URL Internet; toàn bộ điều kiện kiểm tra đạt |
| Desktop / mobile | Chrome 1440 × 900 và màn hình mobile giả lập 390 × 844; cần cảm ứng điều khiển được nhân vật |
| Hành động | Đi/chạy, chào/vẫy, cầu nguyện đúng vùng, ghế độc quyền, 108 lễ, chuỗi 108 hạt, âm thanh và tắt tiếng |
| Phòng / xã hội | Link riêng, cách ly room/instance/region, chat/chặn/ẩn; từ chối chuyển vào phòng đầy và giữ ghế ở phòng cũ; tải lại trang/kết nối lại không nhân đôi nhân vật |
| Cảnh | Đường đến 12 ghế, va chạm, rừng/nhà tắm/hội chợ; tư thế chân/tay, LOD và giải phóng tài nguyên |
| Tương tác chung | Thỉnh chuông và thả đèn hoa đăng; server kiểm tra khoảng cách, trạng thái và thời gian chờ; người cùng phòng nhận cùng sự kiện, người vào sau thấy hiệu ứng còn hoạt động |

## Số đo 20 avatar

Một trình duyệt dựng cảnh WebGL cùng 19 client Socket.IO tạo tải kiểm thử, chạy trên cùng máy Windows. Mẫu này không đại diện cho 20 người dùng trên 20 thiết bị độc lập. Thời gian đo ${perf.seconds.toFixed(2)} giây, chất lượng ${perf.quality}:

- Nhịp rAF: **${perf.fps.toFixed(1)} khung hình/giây**; phân vị 95 của khoảng cách giữa hai khung hình là ${perf.p95.toFixed(1)} ms.
- ${perf.drawCalls} lệnh vẽ/khung theo \x60renderer.info\x60; heap JavaScript khoảng ${(perf.heap / 1024 / 1024).toFixed(1)} MiB.
- \x60TaskDuration\x60 của luồng chính: ${perf.mainThreadTaskSeconds.toFixed(2)} giây trong mẫu; đây không phải phần trăm CPU toàn máy.
- Dữ liệu WebSocket nhận vào khoảng ${(perf.inboundBytesPerSecond / 1024).toFixed(1)} KiB/s; chưa gồm phần phụ trội của TLS và khung truyền mạng.
- Công cụ không cung cấp thời gian xử lý trên GPU. Chưa đo FPS trên điện thoại cấu hình yếu.

Production server được đo riêng qua loopback trên cùng máy: trung vị thời gian ACK ${server.load.poseAckMedianMs} ms, phân vị 95 là ${server.load.poseAckP95Ms} ms, bộ nhớ RSS ${server.load.serverRssMB} MB. Các số này không phải độ trễ Internet. Chi tiết nhân vật đã được gộp từ khoảng 66 mesh xuống 24 mesh khi ở gần và 15 mesh khi ở xa.

Client chỉ giữ một bản cập nhật vị trí đang chờ ACK. Trong thời gian chờ, các vị trí mới thay thế bản đang đợi gửi, giúp tránh tích lũy dữ liệu chuyển động cũ khi mạng chậm. Vị trí dự đoán chưa gửi được xóa khi server hiệu chỉnh, khi ngắt kết nối hoặc đổi phòng. Server vẫn giữ nguyên kiểm tra giới hạn tốc độ.

Đã kiểm thử gói vị trí bị trì hoãn một giây, đồng bộ vị trí trước tương tác và tiếp tục đi tới đích sau khi nhận hiệu chỉnh muộn. Thao tác ngồi/chào/lễ/cầu nguyện chờ xác nhận vị trí; các kiểm thử chống vượt tốc độ và xuyên vật cản vẫn đạt.

## Link thực và phạm vi chứng minh

[Chơi thử SANSA](${publicTest.shareUrl}) — **link tạm thời**, cần máy, server và tunnel tiếp tục chạy. Frontend/API truy cập được qua HTTPS; hai client dùng WSS và đồng bộ di chuyển, chào, ngồi thiền, chat. Kiểm tra tải lại trang và ngắt kết nối đạt. Thời gian nhận biết người rời phòng trong phép thử: ${publicTest.departureMs} ms. Mất mạng đột ngột có thể cần khoảng 25 giây để heartbeat phát hiện.

Hai phiên trình duyệt chạy trên máy hiện tại và truy cập qua địa chỉ Internet của Cloudflare. Chưa kiểm thử bằng hai thiết bị vật lý ở hai mạng độc lập. Phương án hosting lâu dài đã chuẩn bị gồm \x60render.yaml\x60, \x60Dockerfile\x60, biến môi trường và hướng dẫn. Chưa triển khai lên Render; bước đó cần kết nối tài khoản hosting.

## Bằng chứng

- [Node test log](artifacts/unit-tests.tap), [Playwright JSON](artifacts/browser-results.json), [số đo 20 avatar](artifacts/phase13-performance.json), [production server](artifacts/production-server-report.json), [xác minh public](artifacts/public-verification.json).
- [Màn hình chào](artifacts/phase13-onboarding.png), [mobile](artifacts/phase13-mobile-world.png), [nhân vật và tư thế](artifacts/phase13-character-poses.png), [20 kết nối](artifacts/phase13-20-players.png).
- [Hai client qua URL public](artifacts/public-https-two-clients.png), [rừng](artifacts/public-forest.png), [nhà tắm](artifacts/public-bath.png), [hội chợ](artifacts/public-market.png).

## Giới hạn còn lại

- Chưa có hosting 24/7, lưu trạng thái lâu dài, Redis, nhiều server dùng chung trạng thái, tài khoản hoặc công cụ quản trị người dùng. Link mời riêng và chat mất khi khởi động lại server.
- Giữ nhân vật chibi DCK với đầu tròn lớn, thân và tay chân ngắn theo tỷ lệ bản gốc. Animation, va chạm sàn và tối ưu mesh được giữ; không thay bằng người thật hoặc model GLB khác.
- Nhà tắm và hội chợ là khu khám phá; chưa có hoạt động tắm hoặc mua bán. Hành trang gồm chuỗi hạt và dấu ghé thăm theo phiên.
- Chưa kiểm thử điện thoại vật lý/Safari, tải liên tục nhiều giờ, thời gian xử lý trên GPU hoặc 20 trình duyệt cùng dựng cảnh.
- Chưa build Docker image vì daemon không chạy. Chunk Three khoảng 513 kB (129 kB gzip) có cảnh báo kích thước; build vẫn thành công.
- Chưa đối chiếu hình ảnh trực tiếp với trang Sansa Temple tham khảo. Nguồn tài nguyên nguyên bản và giấy phép được ghi ở \x60ASSETS.md\x60.

Các lỗi đã xử lý trong QA: React effect của chat trả về giá trị không hợp lệ trên Chrome mới; chân khi quỳ/lễ thấp hơn sàn; HUD mobile chồng nhãn phòng; hiệu chỉnh vị trí từ server và thay đổi focus làm hủy đường đi. Các kiểm thử liên quan đã được chạy lại.
`,
);
console.log('Wrote TEST_REPORT.md and PUBLIC_PREVIEW.md from completed verification artifacts.');
