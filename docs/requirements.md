# Yêu cầu chức năng — App Cây Gia Phả (MVP)

Phiên bản: 1.0 · Ngày: 2026-08-10 · Vai trò soạn: PO

## 1. Mục tiêu & phạm vi

**Mục tiêu:** một người trong họ nhập được thông tin thành viên và xem ra sơ đồ cây rõ ràng, chia sẻ được cho họ hàng xem.

**Trong phạm vi:** 1 cây / 1 tài khoản, CRUD thành viên, quan hệ cha–mẹ–con và vợ/chồng, hiển thị cây, tìm kiếm, xuất ảnh, chia sẻ link chỉ-xem.

**Ngoài phạm vi:** đa người cùng sửa, phân quyền theo nhánh, import GEDCOM, nhiều dòng họ trong một tài khoản, timeline/bản đồ, DNA, app mobile native.

## 2. Người dùng

| Persona | Nhu cầu |
|---|---|
| **Người biên tập** (thường là 1 người lớn trong họ) | Nhập & sửa dữ liệu, tự tin không làm hỏng cây |
| **Người xem** (họ hàng, con cháu) | Mở link, xem cây, tìm tên mình, biết mình liên quan ai |

## 3. Mô hình dữ liệu

**Person:** `id`, họ tên, tên gọi khác, giới tính (Nam/Nữ/Khác), ngày sinh, ngày mất, `is_deceased`, ảnh, ghi chú, thứ tự trong gia đình.

**Relationship:** chỉ 2 loại
- `parent_of` (parent_id → child_id)
- `spouse_of` (a_id ↔ b_id, kèm `status`: đang kết hôn / đã ly hôn / đã mất)

> **Quyết định thiết kế quan trọng nhất:** mọi quan hệ khác (ông bà, cô dì chú bác, anh chị em họ) được **suy ra** từ 2 loại trên, không lưu riêng.

Ngày tháng cho phép **không đầy đủ** (chỉ năm, hoặc "khoảng 1920") — dữ liệu gia phả thật luôn thiếu.

**Con nuôi / con riêng:** ghi trong field ghi chú, không có field cấu trúc ở MVP (đã chốt).

## 4. Yêu cầu chức năng

### EPIC 1 — Quản lý thành viên

**FR-1.1 Thêm thành viên**
- Bắt buộc: họ tên. Còn lại optional.
- AC: thiếu họ tên → không lưu được, hiện lỗi tại field.
- AC: lưu thành công → node xuất hiện trên cây ngay, không cần reload.

**FR-1.2 Sửa / xóa thành viên**
- AC: xóa người còn quan hệ → cảnh báo rõ ("X đang là cha của 3 người, xóa sẽ ngắt liên kết") + yêu cầu xác nhận.
- AC: xóa xong có **Undo** trong 10 giây.

**FR-1.3 Ảnh đại diện**
- 1 ảnh/người, tự crop vuông, tối đa 5MB, jpg/png/webp.
- AC: không có ảnh → hiện avatar chữ cái đầu, không hiện ô ảnh vỡ.

**FR-1.4 Đánh dấu đã mất**
- AC: có ngày mất hoặc tick "đã mất" → node hiển thị khác biệt (viền xám), có nhãn `năm sinh – năm mất`.

### EPIC 2 — Quan hệ

**FR-2.1 Thêm quan hệ từ chính node**
Mỗi node có nút nhanh: `+ Cha/Mẹ`, `+ Vợ/Chồng`, `+ Con`.
- AC: chọn 1 trong 2 — tạo người mới, hoặc gắn vào người đã có trong cây.
- AC: thêm Con cho một cặp vợ chồng → con tự gắn với **cả hai**.

**FR-2.2 Ràng buộc chống dữ liệu vô lý** *(không được lược bỏ)*
- Chặn vòng lặp: A là tổ tiên của B → B không thể là cha/mẹ của A.
- Một người tối đa 2 parent.
- Không cho tự làm vợ/chồng hoặc cha/mẹ của chính mình.
- Cảnh báo (không chặn): con sinh trước cha/mẹ; con sinh sau ngày mất của mẹ > 1 năm.
- AC: mọi ràng buộc kiểm ở **server**, không chỉ ở UI.

**FR-2.3 Nhiều vợ/chồng, ly hôn, tái hôn**
- Cho phép nhiều `spouse_of`, mỗi liên kết có `status` riêng. **Lưu đủ lịch sử**, không ghi đè (đã chốt).
- AC: cặp đã ly hôn / vợ chồng đã mất → đường nối vẽ **nét đứt**; cặp hiện tại vẽ nét liền.
- AC: mỗi cặp là một "nhóm gia đình" riêng, con hiển thị dưới đúng cặp cha–mẹ của nó.

**FR-2.4 Xóa quan hệ** — xóa liên kết mà **không** xóa người.

### EPIC 3 — Hiển thị cây *(trọng tâm sản phẩm)*

**FR-3.1 Sơ đồ dạng cây dọc**
- Đời trước trên cùng, đời sau xuống dưới. Vợ/chồng cạnh nhau nối ngang; con nối xuống từ giữa cặp.
- AC: node không đè lên nhau ở mọi cấu hình (kể cả 1 người 3 vợ, 8 con).

**FR-3.2 Điều hướng khung nhìn**
- Kéo để di chuyển, cuộn/pinch để zoom, nút "về gốc", nút "fit toàn cây".
- AC: cây 200 người vẫn kéo/zoom mượt (≥30fps).

**FR-3.3 Thu gọn / mở rộng nhánh**
- AC: nhánh thu gọn hiện badge số người đang ẩn.

**FR-3.4 Chọn người làm gốc (re-root)**
- AC: "Xem cây từ người này" → người đó thành trung tâm, tổ tiên hiện lên trên, hậu duệ xuống dưới.

**FR-3.5 Panel chi tiết**
- Click node → panel bên hông: ảnh, thông tin, danh sách cha mẹ / vợ chồng / con (click được để nhảy tới).

**FR-3.6 Danh sách dạng bảng** *(v2)*
- AC: sắp xếp được theo tên / năm sinh / đời. Đây là cách duy nhất soát dữ liệu hàng loạt.

### EPIC 4 — Tìm kiếm & tra quan hệ

**FR-4.1 Tìm theo tên** — không phân biệt dấu, khớp gần đúng.
- AC: gõ `nguyen van` khớp cả "Nguyễn Văn A".
- AC: chọn kết quả → cây tự pan/zoom tới node và highlight.

**FR-4.2 Tra quan hệ giữa 2 người** *(v2)*
- Chọn A và B → hiện đường nối ngắn nhất + diễn giải tiếng Việt ("B là cháu, gọi A là chú").
- Phạm vi đúng: **trong 3 đời** (cha/mẹ, ông/bà, cụ, con, cháu, chắt, anh chị em ruột, cô/dì/chú/bác, anh chị em họ). Ngoài phạm vi đó → chỉ hiện đường nối, không đoán tên gọi.

### EPIC 5 — Chia sẻ & xuất

**FR-5.1 Link chia sẻ chỉ-xem**
- Token ngẫu nhiên không đoán được; có nút tắt / tạo lại link.
- AC: người mở link không thấy nút sửa/xóa nào, **và API cũng chặn**, không chỉ ẩn UI.

**FR-5.2 Xuất ảnh PNG** của khung nhìn hiện tại hoặc toàn cây. (PDF: v2)

**FR-5.3 Xuất dữ liệu JSON/CSV** *(v2)* — người dùng phải mang được dữ liệu của họ đi; đây là điều kiện để họ tin mà nhập.

### EPIC 6 — Tài khoản & dữ liệu

**FR-6.1 Đăng nhập** — Google social login. Không tự làm form mật khẩu.

**FR-6.2 Một cây / một tài khoản** (đã chốt) — tài khoản mới tự tạo cây rỗng, không có UI chọn cây.

**FR-6.3 Tự lưu** — mọi thay đổi lưu ngay, không có nút "Save".
- AC: mất mạng khi đang sửa → hiện trạng thái "chưa lưu", tự thử lại, **không** mất nội dung đang nhập.

## 5. Yêu cầu phi chức năng

| | Yêu cầu |
|---|---|
| Quy mô | 500 người/cây |
| Tốc độ | Cây 200 người render < 2s |
| Thiết bị | Web responsive; mobile **xem tốt**, sửa ở mức cơ bản |
| Ngôn ngữ | Tiếng Việt; đúng dấu ở mọi font và khi xuất ảnh |
| Riêng tư | Cây mặc định **private**; người còn sống là dữ liệu cá nhân — không index, không public search |
| A11y | Điều hướng bàn phím, node có label đọc được cho screen reader |

## 6. Ranh giới MVP

**Ship trước:** EPIC 1, 2, 3.1–3.5, 4.1, 5.1, 5.2, 6.

**Ship sau nếu có người dùng thật đòi:** FR-3.6 bảng, FR-4.2 tra quan hệ, FR-5.3 xuất dữ liệu, xuất PDF, gộp người trùng, nhật ký thay đổi.

## 7. Chỉ số thành công

- ≥60% người tạo cây nhập được **≥10 người** trong lần dùng đầu — chỉ số quan trọng nhất; nhập liệu là chỗ chết của mọi app gia phả.
- ≥30% cây được chia sẻ ra ngoài trong 7 ngày.
- Tỉ lệ người bị ràng buộc FR-2.2 chặn rồi bỏ luôn phiên < 5%.
