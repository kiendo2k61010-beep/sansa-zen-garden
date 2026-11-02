# Nguồn tài nguyên và quyền sử dụng

Toàn bộ hình học 3D hiển thị trong ứng dụng được tạo trực tiếp bằng mã Three.js trong dự án này. Không tải hay trích xuất model, texture, âm thanh, mã nguồn hoặc thương hiệu từ Sansa Temple.

| Thành phần                                                                        | Nguồn                                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Chính điện, mái cong, ngói, cột, bộ đấu, sàn, tượng Phật, đài sen, đèn và bàn thờ | Hình học nguyên bản tại `src/scene/architecture.ts`                                  |
| Vườn, cây, tre, núi, đường đá, hồ sen, cầu, gác chuông và tháp nhỏ                | Hình học nguyên bản tại `src/scene/nature.ts`                                        |
| Nhà tắm gỗ, bồn nước, khăn, bếp, hội chợ trà/gốm/vải và lối đi liên kết           | Hình học thủ tục nguyên bản tại `src/scene/nature.ts`; không dùng model bên ngoài    |
| Vân gỗ, độ nhám đá và sợi vải                                                     | Ba `DataTexture` RGBA 64 × 64 được sinh xác định tại `src/scene/architecture.ts`     |
| Bồ đoàn, lớp đánh dấu tương tác, bụi và khói hương                                | Hình học và hiệu ứng nguyên bản tại `src/scene/environment.ts`                       |
| Nhân vật chibi, trang phục, hoạt ảnh và nhãn tên                                  | Giữ tỷ lệ chibi gốc; hình học, rig và canvas nguyên bản tại `src/scene/character.ts` |
| Chim, gió, chuông, mõ, âm nền và tiếng lần hạt                                    | Tổng hợp bằng Web Audio trong `src/audio.ts`; không dùng bản ghi âm bên ngoài        |
| Biểu tượng giao diện                                                              | `lucide-react`, giấy phép ISC; giữ thông báo bản quyền khi phân phối thư viện        |
| Three.js                                                                          | Thư viện dựng hình, giấy phép MIT                                                    |
| Be Vietnam Pro, Noto Serif                                                        | Fontsource, SIL Open Font License 1.1; đóng gói tiếng Việt và Latin trong build      |

Bốn ảnh JPG có sẵn ở thư mục gốc là tư liệu do người dùng cung cấp. Chúng không được đưa vào mã nguồn tải lên trình duyệt, không được đóng gói trong bản build và không được sử dụng làm texture hoặc model. Dự án không cấp lại quyền đối với các ảnh này. Trang tham khảo chỉ được dùng để định hướng loại trải nghiệm và bố cục chung.

Các tài nguyên thủ tục do dự án tạo ra không phụ thuộc giấy phép tài sản 3D bên thứ ba. Giấy phép của toàn bộ ứng dụng do chủ dự án quyết định; tệp này ghi nhận nguồn tài nguyên, không tự áp dụng giấy phép phát hành cho mã của chủ dự án. Font Be Vietnam Pro và Noto Serif được đóng gói cục bộ qua Fontsource, giấy phép SIL Open Font License 1.1. Trình duyệt không cần truy cập Google Fonts; bản build có đủ bộ ký tự Latin và tiếng Việt. Thông báo giấy phép gốc nằm trong thư mục của mỗi gói font ở `node_modules`.

## Thiết kế và tối ưu

Cảnh dùng các vật liệu dùng chung và gộp hình học tĩnh theo vật liệu. Cây thông và cỏ dùng `InstancedMesh`; gió được tính trong vertex shader. Hai lớp mái cong có nhiều hàng ngói và tự mờ khi nhân vật vào chính điện. Các mặt sàn điều hướng và bồ đoàn có mesh raycast riêng, dùng cùng vị trí chuẩn với server. Hình học, vật liệu và tài nguyên canvas được giải phóng khi đóng cảnh.

Phase 13 thêm nhà tắm tại `(21, -16)` và hội chợ tại `(-21, 20)` trong cùng cảnh. Nhà tắm có lối vào và hành lang giữa hai bồn; mái ẩn khi vào trong. Quầy hàng bao quanh một sân mở. Các lối đi nối sân, rừng, nhà tắm và hội chợ; collider tường, bồn, quầy và ghế nằm trong `shared/world.ts`. Đây là các địa điểm để đi bộ khám phá cùng nhau; bồn tắm và hàng hóa hiện là cảnh quan, chưa có hoạt động tắm hoặc giao dịch.

Ba texture bề mặt chỉ chiếm 48 KiB dữ liệu RGBA cơ sở, dùng lại giữa vật liệu và có mipmap; không tải texture mạng, không cần canvas hoặc texture nén bên ngoài. Chúng tạo độ nhám và gờ nhỏ, không tăng emissive của tượng Phật. Cảnh giữ UV khi gộp hình học, giải phóng texture một lần khi hủy môi trường và cho phép gọi `dispose()` lặp lại an toàn.

Hai đèn ở nhà tắm đung đưa nhẹ, khói hơi nước dùng một draw call, gợn hồ giảm độ hiện theo vòng đời. Tán cây xa dùng hai tầng ít cạnh thay vì bốn tầng; khoảng cách LOD được kiểm tra mỗi nửa giây, còn `InstancedMesh` có bounding sphere để frustum culling hoạt động. Low/Medium/High lần lượt dùng 24%/58%/100% cỏ và 26/78/130 hạt bụi; Low tắt bóng môi trường và hơi nước, Medium giảm bóng cây và đèn. Đây là mức điều chỉnh chi phí dựng hình, không phải cam kết FPS trên phần cứng chưa đo.

Các kiểm thử Node kiểm tra khởi tạo, bồ đoàn/raycast, độ cao cầu thang, cột/collision, trạng thái chiếm chỗ, mái và giải phóng tài nguyên. Chúng không thay thế kiểm tra hình ảnh, WebGL, shader và FPS trong trình duyệt.

Các kiểm thử môi trường Phase 13 còn kiểm tra lối đi liên tục đến hai khu mới, collider khớp hình học, ba mức chất lượng, LOD xa/gần, UV, biên độ đèn và hủy texture. Các bộ phận của nhân vật và lượt shadow render được tính riêng khi đo renderer thực tế. Chuông và đèn hoa đăng tương tác dùng hình học của dự án; không tải tài nguyên bên ngoài.

Thông báo giấy phép nguyên bản của font và thư viện frontend được sao chép vào `public/licenses/`, rồi đi cùng bản build tại `dist/licenses/`. Chạy `npm run licenses` để cập nhật sau khi đổi phiên bản dependency.
