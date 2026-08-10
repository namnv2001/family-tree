# family-tree

Ứng dụng web hiển thị cây gia phả đơn giản. Một người biên tập nhập dữ liệu thành viên, xem ra sơ đồ cây, chia sẻ link chỉ-xem cho họ hàng.

**Trạng thái:** M0 xong — scaffold, schema + RLS, đăng nhập Google. Chưa có CRUD người (M1).

Vite + React + TS + Tailwind, backend là Supabase (Postgres + Auth + Storage + RLS).

## Tài liệu

| File | Nội dung |
|---|---|
| [docs/requirements.md](docs/requirements.md) | Yêu cầu chức năng MVP (FR), mô hình dữ liệu, ranh giới phạm vi |
| [docs/plan.md](docs/plan.md) | Kế hoạch triển khai: tech stack, milestone, rủi ro |

## Chạy local

Cần làm thủ công trên [supabase.com](https://supabase.com) trước (em không tự tạo được):

1. Tạo project mới, chọn region Singapore.
2. **SQL Editor** → dán toàn bộ [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) → Run.
3. **Authentication → Sign In / Providers → Google** → bật, điền Client ID/Secret từ Google Cloud Console. Authorized redirect URI lấy từ trang đó, dán vào Google Console.
4. **Authentication → URL Configuration** → Site URL: `http://localhost:5173`.

Rồi:

```bash
cp .env.example .env.local
```

Điền `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` (Project Settings → API Keys → anon/public), sau đó:

```bash
npm install && npm run dev
```

## Kiểm tra migration

Chạy mọi file trong `supabase/migrations/` trên một Postgres tạm trong Docker, kiểm luôn trigger tạo cây tự động (FR-6.2):

```bash
sh supabase/check.sh
```

## Quyết định đã chốt

1. **Con nuôi / con riêng** — chỉ ghi trong ghi chú, không thêm field riêng ở MVP.
2. **Ly hôn / tái hôn** — lưu đủ lịch sử, hiển thị bằng đường nét đứt.
3. **Một cây / một tài khoản** — không hỗ trợ nhiều cây (ràng buộc bằng unique index `trees_one_per_owner`).
