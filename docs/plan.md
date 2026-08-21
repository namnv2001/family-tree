# Kế hoạch triển khai — family-tree MVP

Đi kèm [requirements.md](requirements.md). Nguyên tắc: không tự viết lại thứ đã có sẵn. Mỗi lựa chọn dưới đây đều là "cái gì đã tồn tại giải được việc này", không phải "kiến trúc đẹp".

## 1. Tech stack

| Lớp | Chọn | Vì sao |
|---|---|---|
| Frontend | Vite + React + TypeScript | Không cần SSR — app sau đăng nhập, dữ liệu private. Next.js là thừa. |
| Backend + DB + Auth + Storage | **Supabase** | Postgres + Google OAuth (FR-6.1) + Storage ảnh (FR-1.3) + Row Level Security (FR-5.1 private) trong một dependency. Không viết backend riêng. |
| Layout cây | **`relatives-tree`** (npm) | Đây là bài toán khó nhất của app: sắp xếp node có cặp vợ chồng + nhiều đời không đè nhau (FR-3.1). Lib này nhận `{id, parents, children, spouses}` và trả về tọa độ. **Không tự viết layout engine.** |
| Pan/zoom | `react-zoom-pan-pinch` | Xử lý pinch trên mobile đúng — phần dễ làm sai nếu tự viết. |
| Xuất PNG | `html-to-image` | Một hàm `toPng(node)`. |
| Form | React state thuần | Form có ~8 field, không cần react-hook-form. |
| State | TanStack Query + React state | Query lo cache/refetch/optimistic (FR-6.3 tự lưu). Không cần Redux/Zustand. |
| Bỏ dấu khi tìm | `String.normalize('NFD').replace(/\p{Diacritic}/gu,'')` | Một dòng stdlib, không cần lib (FR-4.1). |
| CSS | Tailwind | |

**Không dùng:** ORM riêng (Supabase client đủ), state manager, backend Node riêng, thư viện đồ thị đa dụng (d3/cytoscape — quá tổng quát cho bài này).

## 2. Schema

```sql
create table trees (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users,
  name text not null default 'Gia phả',
  share_token text unique,          -- null = tắt chia sẻ (FR-5.1)
  created_at timestamptz default now()
);

create table people (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees on delete cascade,
  full_name text not null,
  alias text,
  gender text check (gender in ('male','female','other')),
  birth_date text,                  -- text: cho phép '1920', '~1920' (dữ liệu gia phả luôn thiếu)
  death_date text,
  is_deceased boolean default false,
  photo_path text,
  note text,                        -- con nuôi / con riêng ghi ở đây (đã chốt)
  sibling_order int default 0
);

create table relationships (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees on delete cascade,
  type text not null check (type in ('parent_of','spouse_of')),
  from_id uuid not null references people on delete cascade,
  to_id uuid not null references people on delete cascade,
  status text,                      -- chỉ cho spouse_of: married | divorced | widowed
  check (from_id <> to_id),         -- FR-2.2: không tự làm vợ/chồng mình
  unique (type, from_id, to_id)
);
```

RLS: `people`/`relationships` đọc-ghi khi `tree.owner_id = auth.uid()`; đọc-only khi khớp `share_token`. Đây là cách FR-5.1 được thực thi ở tầng DB, không phải ở UI.

Ràng buộc còn lại của FR-2.2 (vòng lặp, tối đa 2 parent, cảnh báo ngày tháng) làm bằng một **Postgres trigger** trên `relationships` — vì client nào cũng phải đi qua nó, không thể bypass.

## 3. Milestone

| # | Việc | FR | Ước lượng |
|---|---|---|---|
| M0 ✅ | Scaffold Vite + Supabase project, schema, RLS, Google login | 6.1, 6.2 | 1d |
| M1 ✅ | CRUD người + upload ảnh + tự lưu + undo xóa | 1.1–1.4, 6.3 | 2d |
| M2 🔶 | Render cây: `relatives-tree` + node component + pan/zoom + fit/reset | 3.1, 3.2 | 3d |
| M3 ✅ | Thêm/xóa quan hệ từ node + trigger ràng buộc + nét đứt cho ly hôn | 2.1–2.4 | 2d |
| M4 | Panel chi tiết, thu gọn nhánh, re-root, tìm theo tên | 3.3–3.5, 4.1 | 2d |
| M5 | Link chia sẻ chỉ-xem + xuất PNG | 5.1, 5.2 | 1d |
| M6 | Mobile, a11y bàn phím, seed 200 người kiểm hiệu năng | NFR | 2d |

**Tổng ≈ 13 ngày dev.** Đường găng là M2 — nếu `relatives-tree` không xử lý được ca "một người 3 vợ, con chia theo từng cặp", cả timeline lệch. Xem mục 5.

**M2 (2026-08-20):** code xong — `src/lib/treeLayout.ts` (chuyển `people`+`relationships` sang input của `relatives-tree`, tự tách theo thành phần liên thông vì cây thật không phải lúc nào cũng liền một mảnh), `TreeNode`/`TreeView` (pan/zoom bằng `react-zoom-pan-pinch`, nút "Về gốc"/"Fit toàn cây"). `tsc -b`, `vite build`, `oxlint` sạch; đã chạy dev server + Playwright xác nhận trang không lỗi console. **Còn thiếu:** chưa soát được bằng mắt ca nhiều đời/nhiều vợ thật trong trình duyệt — vì chưa có UI tạo `relationships` (đó là M3), nên trên UI hiện tại mỗi người vẫn hiển thị như một cây độc lập. Đã tin ở phần thuật toán qua spike (mục 5), còn phần hiển thị thật cần chờ M3 hoặc seed tay để soát.

**M3 (2026-08-21):** code xong.
- `supabase/migrations/0003_relationship_trigger.sql`: trigger `relationships_check` (before insert/update trên `relationships`) chặn nốt 2 phần còn lại của FR-2.2 mà check constraint không diễn tả được — tối đa 2 cha/mẹ, và vòng lặp tổ tiên (recursive CTE dò xem `to_id` mới có đã là tổ tiên của `from_id` không). 2 test bắt buộc theo plan §6 đã thêm vào `supabase/check.sh` — **PASS cả hai** (cha/mẹ thứ 3 bị chặn, gán ngược tổ tiên làm con bị chặn).
- `lib/relationships.ts`: thêm `createRelationship`/`deleteRelationship` (FR-2.1, FR-2.4) và các helper thuần đọc từ mảng đã tải sẵn — `parentsOf`/`spousesOf`/`childrenOf` (hiển thị), `ancestorsOf`/`descendantsOf` (lọc trước ở client những lựa chọn chắc chắn bị trigger chặn, đỡ round-trip báo lỗi vô ích), `dateWarnings` (cảnh báo không chặn theo FR-2.2: con sinh trước cha/mẹ, hoặc sau ngày mất của mẹ > 1 năm).
- `TreeNode` có 3 nút nhanh **+Cha/Mẹ / +Vợ/Chồng / +Con** (đúng AC FR-2.1), mở `RelationshipModal`. Modal gộp cả thêm lẫn xóa cho một kind: liệt kê quan hệ hiện có kèm nút "Xóa liên kết" (FR-2.4, không đụng người), và form thêm bên dưới (chọn người có sẵn trong cây hoặc tạo người mới ngay trong modal). Thêm Con khi node đang có vợ/chồng → modal hỏi "cùng với ai", chọn xong tạo 2 quan hệ `parent_of` cùng lúc (FR-2.1 AC "con tự gắn với cả hai").
- `treeLayout.ts`: tự tính lại đoạn nối vợ/chồng từ tọa độ node (tâm-tới-tâm, xác nhận khớp 100% với connector thật của `relatives-tree` bằng một spike tọa độ riêng) rồi lọc đoạn trùng khỏi connector chung, thay bằng bản có `dashed` theo `status` — ly hôn/đã mất vẽ nét đứt, đang hôn vẽ nét liền (FR-2.3 AC).
- Sửa status của một liên kết vợ/chồng đã có (`updateRelationshipStatus`) ngay tại dòng liên kết trong modal — cần cho ca thật nhất: đang "Đang kết hôn" thì người kia mất, chuyển sang "Đã mất" cho đúng, không phải xóa-tạo-lại. Khác với ca ly hôn-rồi-tái hôn cùng một người (đó mới cần 2 row riêng để giữ lịch sử).
- **Sửa bug:** 2 cha/mẹ của cùng 1 người mà chưa có `spouse_of` thật giữa họ (cha/mẹ đơn thân nhận thêm 1 cha/mẹ nữa, hoặc 2 cha/mẹ ruột chưa từng khai vợ/chồng trong app) → `relatives-tree` không biết ghép họ thành 1 gia đình, **âm thầm loại người thứ 2 khỏi cây** (không throw). Sửa bằng cách tự thêm một cặp "spouse" ảo trong `buildGraph` chỉ để tính layout khi phát hiện 2 người có chung con mà chưa là spouse_of — không ghi DB, không ảnh hưởng tới nét đứt/liền (chỗ đó vẫn đọc thẳng `relationships` thật). Đã tái tạo bug bằng script gọi trực tiếp `buildTreeLayout` và xác nhận hết sau khi sửa.
- Thêm Con khi người đó chỉ có đúng 1 vợ/chồng → chọn "cùng với ai" tự mặc định luôn người đó (thay vì mặc định "không chọn"), đỡ 1 bước bấm cho ca phổ biến nhất; vẫn đổi được nếu con đó thật ra chỉ có 1 cha/mẹ.
- **Thứ tự hiển thị:** con sắp trái→phải theo tuổi giảm dần (lớn tuổi bên trái, lấy năm từ `birth_date`, thiếu ngày thì lùi về `sibling_order`); vợ/chồng: chồng bên trái, vợ bên phải theo `gender`. Cách làm: `relatives-tree` xếp trái/phải của TOÀN CÂY (mọi cặp vợ/chồng trong cả cây, không riêng từng cặp) theo giới tính của DUY NHẤT node gốc — xác nhận bằng thực nghiệm (gốc nam → chồng luôn trái ở mọi cặp; gốc nữ → lật ngược toàn bộ). `pickRoot` giờ ưu tiên chọn gốc không phải nữ trong số ứng viên hợp lệ; ca không có ứng viên nam (mẹ đơn thân) vẫn ép gender riêng node gốc thành nam cho input layout (không đụng gender thật hiển thị ở UI). Con thì khác — lib xếp đúng theo THỨ TỰ MẢNG `children` mình đưa vào (xác nhận bằng spike tọa độ), nên chỉ cần sort mảng đó theo tuổi trước khi build input.
  **Giới hạn đã biết:** với 1 chồng ≥ 2 vợ, `relatives-tree` luôn kẹp chồng ở giữa (vợ đang hôn bên phải chồng, các vợ khác dồn hết sang trái theo thứ tự `sibling_order`) — không có cách nào ép chồng thành người ngoài cùng bên trái tuyệt đối bằng cách sắp input, vì thư viện quy định cứng "vợ/chồng khác của gốc luôn nằm bên trái", không phải bên phải. Muốn chồng luôn ngoài cùng bên trái ở ca 2+ vợ thì phải tự tính lại tọa độ sau khi `relatives-tree` chạy xong (đổi hẳn cách vẽ connector, rủi ro cao hơn nhiều) — chưa làm, vì FR-3.1 chỉ yêu cầu "không đè node", không yêu cầu thứ tự chồng-vợ tuyệt đối cho ca nhiều vợ.
- Có thử nới khe hở giữa vợ/chồng (chèn thêm khoảng trống ở ranh giới mỗi cặp, dịch phải toàn bộ tọa độ từ đó trở đi) rồi **bỏ lại** theo yêu cầu — quay về đúng khoảng cách gốc của `relatives-tree` (vợ/chồng chạm nhau, không khe hở riêng).
- `tsc -b`, `vite build`, `oxlint` sạch. **Còn thiếu:** chưa click-test bằng trình duyệt thật — máy dev hiện tại không có `chromium-cli` và không có sẵn phiên Google đã đăng nhập để tự động qua OAuth, nên mới xác nhận dev server serve được trang (curl 200), chưa tận mắt xem nét đứt/thêm-xóa quan hệ chạy đúng trên UI thật. Cần người thật click thử ít nhất một lượt (spouse ly hôn + con chung) trước khi coi M3 là xong hẳn.

## 4. Thứ tự làm & lý do

Làm M1 (nhập liệu) trước M2 (hiển thị): cần dữ liệu thật, xấu, thiếu ngày tháng để test layout, không phải data giả sạch sẽ. Và chỉ số thành công số 1 là nhập liệu, không phải sơ đồ đẹp.

## 5. Rủi ro

| Rủi ro | Xử lý |
|---|---|
| **`relatives-tree` không đủ cho ca nhiều vợ / con theo từng cặp** | ✅ **Đã spike (2026-08-20)** — `scripts/spike-relatives-tree.mjs` dựng ca "1 người 3 vợ (1 đang hôn, 2 ly hôn), 8 con chia 3+3+2" và gọi `calcTree` thật của lib. Kết quả PASS cả 10 assertion: không đè node, 3 vợ cùng hàng với P, 3 nhóm con nằm liền nhau và tách biệt nhau (đúng AC "mỗi cặp là một nhóm gia đình riêng"). Mẫu chính thức `several-spouses-n2.json` của lib cũng test đúng ca này (3 vợ, con chia theo mẹ) — không phải chỉ ăn may với input của mình. **Quyết định: Go với `relatives-tree`**, không cần phương án B. Cách chạy lại spike ghi trong header file script (bundle bằng `rolldown` có sẵn qua Vite 8, vì lib build ESM thiếu đuôi file, Node không tự resolve được). |
| Cây 500 người render chậm | Node là DOM thuần trước. Chậm → cull node ngoài viewport. Chưa đo thì chưa tối ưu. |
| Người dùng nhập 5 người rồi bỏ | Đây là rủi ro sản phẩm lớn nhất, không phải rủi ro kỹ thuật. Đo FR chỉ số #1 từ tuần đầu. |
| Tên gọi họ hàng tiếng Việt (FR-4.2) | Đã đẩy sang v2 đúng chỗ. Đừng để nó bò vào MVP. |

## 6. Kiểm thử

Không dựng bộ test đầy đủ cho MVP. Chỉ 2 chỗ **bắt buộc** có test, vì sai thì dữ liệu hỏng không cứu được:

1. Trigger ràng buộc FR-2.2 — test SQL: tạo vòng lặp phải fail, gán parent thứ 3 phải fail.
2. RLS chia sẻ FR-5.1 — test: client dùng `share_token` gọi update phải bị từ chối.

Còn lại kiểm bằng tay + một cây seed 200 người.
