# family-tree

Ứng dụng web hiển thị cây gia phả đơn giản. Một người biên tập nhập dữ liệu thành viên, xem ra sơ đồ cây, chia sẻ link chỉ-xem cho họ hàng.

**Trạng thái:** M0 xong — scaffold, schema + RLS, đăng nhập Google. Chưa có CRUD người (M1).

Vite + React + TS + Tailwind, backend là Supabase (Postgres + Auth + Storage + RLS).

## Tài liệu

| File | Nội dung |
|---|---|
| [docs/requirements.md](docs/requirements.md) | Yêu cầu chức năng MVP (FR), mô hình dữ liệu, ranh giới phạm vi |
| [docs/plan.md](docs/plan.md) | Kế hoạch triển khai: tech stack, milestone, rủi ro |

## Setup Supabase (làm một lần)

### 1. Tạo project

[supabase.com](https://supabase.com) → **New project**. Region **Southeast Asia (Singapore)**. Lưu lại DB password. Chờ ~2 phút.

### 2. Chạy migration

**SQL Editor → New query** → dán toàn bộ [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) → **Run**.

Kiểm: **Table Editor** thấy 3 bảng `trees`, `people`, `relationships`, cả 3 đều báo *RLS enabled*.

### 3. Lấy callback URL của Supabase

**Authentication → Sign In / Providers → Google** → bật **Enable**. Trang này hiện sẵn:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

Copy URL đó, để nguyên tab này.

### 4. Google Cloud Console

[console.cloud.google.com](https://console.cloud.google.com) → tạo project (hoặc dùng project có sẵn).

**APIs & Services → OAuth consent screen**
- User type: **External**
- App name, support email, developer email → Save
- App còn ở chế độ *Testing* → thêm email của mình vào **Test users**, không thì đăng nhập sẽ bị chặn

**APIs & Services → Credentials → Create credentials → OAuth client ID**
- Application type: **Web application**
- Authorized JavaScript origins: `http://localhost:5173`
- Authorized redirect URIs: **dán callback URL ở bước 3**
- Create → copy **Client ID** và **Client secret**

Về lại tab Supabase, dán Client ID + Secret vào provider Google → **Save**.

### 5. URL Configuration + env

**Authentication → URL Configuration**
- Site URL: `http://localhost:5173`
- Redirect URLs: thêm `http://localhost:5173/**`

**Project Settings → API Keys** → copy Project URL và anon/public key (project mới gọi là *publishable key*, `sb_publishable_...` — dùng đúng chỗ đó).

```bash
cp .env.example .env.local   # rồi điền 2 giá trị vừa copy
npm install && npm run dev
```

Mở `http://localhost:5173` → Đăng nhập bằng Google → thấy header có email và tên cây. Kiểm **Table Editor → trees**: phải có đúng 1 dòng của user vừa đăng nhập (FR-6.2).

> **Nếu đăng nhập lỗi `Database error saving new user`:** trigger `handle_new_user` chạy trong cùng transaction với việc tạo user, nên trigger fail là signup fail. Xem **Logs → Postgres** để biết lý do; thường là bước 2 chưa chạy hoặc chạy thiếu.

## Kiểm tra migration

Chạy mọi file trong `supabase/migrations/` trên một Postgres tạm trong Docker, kiểm luôn trigger tạo cây tự động (FR-6.2):

```bash
sh supabase/check.sh
```

## Quyết định đã chốt

1. **Con nuôi / con riêng** — chỉ ghi trong ghi chú, không thêm field riêng ở MVP.
2. **Ly hôn / tái hôn** — lưu đủ lịch sử, hiển thị bằng đường nét đứt.
3. **Một cây / một tài khoản** — không hỗ trợ nhiều cây (ràng buộc bằng unique index `trees_one_per_owner`).
