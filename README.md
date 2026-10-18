# family-tree

Ứng dụng web hiển thị cây gia phả đơn giản. Một người biên tập nhập dữ liệu trên máy, push lên git, họ hàng xem trên GitHub Pages.

**Trạng thái:** CRUD thành viên (undo xóa 10s), ảnh đại diện, tự lưu, quan hệ cha mẹ/vợ chồng/con (tối đa 2 cha/mẹ, chặn vòng lặp tổ tiên), cây pan/zoom, panel chi tiết, thu gọn nhánh, tìm không dấu, xuất PNG. Đã bỏ Supabase: không còn đăng nhập/link chia sẻ — site Pages công khai, chỉ xem; sửa trên máy rồi push.

Vite + React + TS + Tailwind. Dữ liệu là file JSON trong repo, deploy bằng GitHub Pages.

## Tài liệu

| File | Nội dung |
|---|---|
| [docs/requirements.md](docs/requirements.md) | Yêu cầu chức năng MVP (FR), mô hình dữ liệu, ranh giới phạm vi |
| [docs/plan.md](docs/plan.md) | Kế hoạch triển khai: tech stack, milestone, rủi ro |

## Dữ liệu & deploy

Không có backend. Toàn bộ cây nằm trong [public/tree.json](public/tree.json), ảnh trong `public/photos/`. Site trên GitHub Pages là bản tĩnh **chỉ xem** — ai có link đều xem được, không cần đăng nhập.

**Sửa cây** (chỉ chạy được trên máy, không sửa được trên site):

```bash
npm install && npm run dev
```

Mở `http://localhost:5173`, sửa như bình thường — mỗi thay đổi tự ghi thẳng vào `public/tree.json` / `public/photos/`. Xong thì đẩy lên:

```bash
npm run save
```

(= `git add` dữ liệu + commit + push.) Push lên `master` → GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) build và deploy Pages, ~1 phút sau site cập nhật.

**Bật Pages lần đầu:** repo → Settings → Pages → Source: **GitHub Actions**.

**Chuyển dữ liệu cũ từ Supabase** (một lần): bật chia sẻ trên app cũ để lấy token, rồi

```bash
node --env-file=.env.local scripts/export-supabase.mjs <share_token>
```

## Quyết định đã chốt

1. **Con nuôi / con riêng** — chỉ ghi trong ghi chú, không thêm field riêng ở MVP.
2. **Ly hôn / tái hôn** — lưu đủ lịch sử, hiển thị bằng đường nét đứt.
3. **Một cây** — một file `public/tree.json`, một người biên tập.
4. **Không realtime** — dữ liệu lên site sau mỗi lần push + deploy.
