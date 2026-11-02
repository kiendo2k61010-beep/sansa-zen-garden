# Báo cáo kiểm thử An Nhiên

Ngày kiểm tra: **01/11/2026**, workspace **D:\webPhat_tu\real**.

## Kết quả đã xác minh

| Hạng mục                                 | Kết quả / bằng chứng                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| TypeScript + Vite production             | `npm run build` thành công                                                                                      |
| Node integration / navigation / geometry | **25/25 PASS**, lệnh `npm test`                                                                                 |
| Chrome browser end-to-end                | **9/9 PASS**, lệnh `npm run test:e2e`; 142 giây                                                                 |
| Production serving                       | Trang ở cổng 3001 tải assets và kết nối Socket.IO không qua Vite                                                |
| Render WebGL                             | Cảnh 3D hiển thị; không có lỗi JavaScript/Three.js nghiêm trọng trong các lượt kiểm tra có thu console          |
| Giao diện desktop                        | 1440 × 900, Chrome headless trên máy hiện tại                                                                   |
| Giao diện mobile                         | 390 × 844, Chrome mobile/touch emulation                                                                        |
| Âm thanh                                 | Trước tương tác chưa tạo AudioContext; bật âm thanh tạo tín hiệu RMS khác 0; mute làm RMS xuống dưới 1% mức bật |
| Hiệu năng mẫu ngắn                       | 296 frame / 2.505 giây ≈ **118.2 callback rAF/giây** trong cảnh chính điện, trên máy hiện tại                   |

Số đo rAF là mẫu ngắn của phiên headless, không phải cam kết FPS hiển thị trên mọi thiết bị hoặc kiểm thử tải 24 trình duyệt đồng thời.

## Nội dung kiểm thử

### Hai tab và máy chủ realtime

- Hai trang Chrome thật cùng `room/instance/region`, nhận số người **2/24** và snapshot qua Socket.IO.
- Phím di chuyển ở tab A làm tọa độ nhận tại tab B thay đổi; chắp tay và lễ Phật được đồng bộ đúng trạng thái.
- Tab B nhận lời chào gần đó; hai người ngồi hai bồ đoàn khác nhau.
- Server xử lý hai yêu cầu đồng thời vào một bồ đoàn: chỉ một yêu cầu thắng; giải phóng ghế khi đứng dậy, đổi phòng hoặc disconnect.
- Đóng tab B làm số người ở tab A về **1/24**; mô phỏng mất mạng làm UI về chế độ một mình, sau đó tự reconnect về **1/24**.
- Room, instance, region tách trạng thái; reconnect không để người hoặc ghế “ma”.
- 24 Socket.IO clients thật lấp đầy phòng kiểm thử; trình duyệt bị từ chối vào phòng đầy và vẫn giữ phòng, ghế, số người của phòng cũ.
- Payload null/sai kiểu, tọa độ ngoài giới hạn, vật cản, giả trạng thái ngồi và spam động tác đều có bài kiểm tra riêng.

### Tương tác và điều khiển

- Click canvas để đi, đường A* đến đủ 12 bồ đoàn từ nhiều phía; đường tránh cột, tường sau, bàn thờ, hồ, gác chuông và cây sân chính.
- Collision được kiểm tra theo từng bước di chuyển, không chỉ ở điểm đích; tuyến cầu thang đi qua đúng các cao độ.
- Ngồi từ nút và click trực tiếp bồ đoàn đều hoạt động. Dùng phím đi lại hủy yêu cầu tự đi tới ghế.
- Bấm spam nút lễ trong một lượt không tăng bộ đếm sớm; hoàn tất lượt tăng đúng 1; dừng không tự sinh lượt tiếp theo.
- Bấm lần hạt **108 lần thật qua UI**: đếm đúng 108, khóa tăng thêm, hiện hoàn thành; reset và Space hoạt động.
- Kéo/zoom camera, mô phỏng pointer hai ngón và nút khôi phục góc nhìn; toàn màn hình vào/ra được xác minh qua Fullscreen API.
- Volume, từng kênh, mute, chuông; tên, màu áo, chất lượng; đổi phòng bằng room/instance/region và khôi phục tên sau tải lại.
- Mobile emulation: các nút nằm trong viewport, touch vào chuỗi hạt và ngồi thiền hoạt động.

### Cảnh và tài nguyên

- 12 mesh bồ đoàn khớp hợp đồng dùng chung với server; raycast trúng bồ đoàn trước sàn.
- Cao độ sàn và bậc thang trùng collision; tâm cột trùng vật thể thực tế.
- Mesh và vật liệu được gộp; cây/cỏ dùng instancing; mái và xà mờ khi vào chính điện.
- Kiểm tra gọi dispose trên các geometry/material đang dùng và dọn event listener/socket khi đóng cảnh.
- Nguồn tài nguyên và 7 thông báo giấy phép đã đi cùng bản build ở `dist/licenses/`.

## Ảnh và log

- [Cảnh ngoài desktop](artifacts/desktop-exterior.png)
- [Cảnh trong chính điện](artifacts/desktop-final-interior.png)
- [Hai nhân vật trong phòng](artifacts/two-players.png)
- [Chuỗi đủ 108 hạt](artifacts/beads-complete.png)
- [Mobile bên ngoài](artifacts/mobile-exterior.png)
- [Mobile ngồi thiền](artifacts/mobile-meditation.png)
- [Báo cáo Playwright JSON](artifacts/browser-results.json)
- [Mẫu frame](artifacts/frame-sample.json)

Ảnh đã được mở để rà soát bố cục desktop/mobile, vật che camera và vị trí các bảng điều khiển. Các tên có “kiểm thử” và phòng QA trong ảnh thuộc phiên test thực; không phải người chơi giả gắn vào sản phẩm.

## Giới hạn chưa xác minh

- Chưa trực tiếp quan sát được trang Sansa Temple qua công cụ truy cập đã thử; không khẳng định độ giống chính xác với cảnh tham khảo. Bốn ảnh gốc được giữ nguyên, không đóng gói vào ứng dụng.
- Chưa đưa lên Internet, chưa có hạ tầng APAC/EU/US thật, chưa kiểm tra hai thiết bị vật lý qua LAN/WAN. Multiplayer đã kiểm tra trên hai tab Chrome và các Socket.IO clients cục bộ.
- Mobile là emulation, chưa kiểm tra điện thoại vật lý; chưa chạy bộ kiểm thử Edge/Safari riêng.
- Chưa đo tải 24 renderer đồng thời hoặc soak test nhiều giờ. Kiểm thử dispose không chứng minh tuyệt đối không có memory leak trong mọi phiên dài.
- Build có cảnh báo kích thước chunk Three.js khoảng 512 kB chưa gzip (~129 kB gzip), không phải lỗi build. Thư viện đã tách thành chunk riêng.
- Chưa có persistence cho tiến trình hoặc đăng nhập. Server một tiến trình lưu phòng trong RAM; tên/màu áo/chất lượng được lưu cục bộ.
