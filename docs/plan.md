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
| M4 🔶 | Panel chi tiết, thu gọn nhánh, re-root, tìm theo tên | 3.3–3.5, 4.1 | 2d |
| M5 🔶 | Link chia sẻ chỉ-xem + xuất PNG | 5.1, 5.2 | 1d |
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
- **Sửa bug (báo cáo thật):** rể/dâu chưa khai cha/mẹ ruột kết hôn vào một nhánh đã có cha/mẹ (vd Tân chưa có cha/mẹ, vợ là Thu có cha/mẹ) → cây chỉ hiện đúng cặp Tân-Thu trở xuống, cha/mẹ Thu biến mất. Nguyên nhân xác nhận bằng spike gọi thẳng `calcTree`: thư viện chỉ vẽ đúng MỘT nhánh tổ tiên — nhánh của `rootId` — dù mọi người vẫn cùng một thành phần liên thông; chọn nhầm root là Tân (cũng hợp lệ vì cũng không có cha/mẹ) thì cha/mẹ Thu bị loại thẳng khỏi output của `calcTree`. Sửa: `pickRoot` giờ ưu tiên ứng viên gốc có vợ/chồng CŨNG không có cha/mẹ (đầu nhánh thật) trước khi áp quy ước "ưu tiên không phải nữ" cũ.
  **Giới hạn đã biết:** chỉ cứu được ca có ĐÚNG MỘT nhánh rể/dâu chưa rõ gốc. Cây có từ 2 nhánh rể/dâu trở lên ở các đời khác nhau (vừa thiếu cha/mẹ vợ đời 1, vừa thiếu cha/mẹ dâu đời 3) thì `relatives-tree` không thể vẽ đủ cả hai cùng lúc — giới hạn cấu trúc của thư viện (một cây chỉ có một nhánh tổ tiên), không sửa được ở tầng chọn root.
- Highlight thẻ của người thuộc **dòng họ gốc**: viền vàng (`border-amber-400`) cho `primaryRootId` + mọi hậu duệ huyết thống của họ (`descendantsOf` đệ quy qua `parent_of`, hàm có sẵn phục vụ RelationshipModal). Vợ/chồng — kể cả vợ/chồng của chính người gốc — KHÔNG được tô, vì họ kết hôn vào chứ không cùng huyết thống. Tính ở `TreeView` (đọc thẳng `relationships`), không đụng `treeLayout.ts` — giữ file đó thuần hình học, không lẫn ý nghĩa "ai thuộc dòng họ".
- **Sửa bug (báo cáo thật):** vào tab Danh sách bắn hẳn N PATCH `/people` vô ích (N = số người), dù chưa sửa gì. Nguyên nhân: `useAutosave` bỏ qua lần lưu đầu bằng cờ boolean `savedOnce` — nhưng app bọc `<StrictMode>` (`main.tsx`), và React 18/19 cố tình chạy lại effect mount 2 lần (mount → cleanup → mount lại, để bắt lỗi thiếu cleanup) ở dev; cờ boolean không reset giữa 2 lần chạy đó nên lần chạy giả lập thứ 2 tưởng nhầm là thay đổi thật, tự lên lịch lưu dù value y hệt. Mỗi `PersonRow` trong danh sách đều dính → N PATCH khi vào trang. Sửa: so sánh value hiện tại với value ĐÃ LÊN LỊCH lần trước theo NỘI DUNG (`JSON.stringify`) thay vì cờ boolean — double-invoke chạy lại với đúng giá trị cũ vẫn nhận ra "không đổi" nên bỏ qua, không phụ thuộc effect chạy mấy lần. Sửa một chỗ trong hook dùng chung, tự động hết luôn cho `PhotoField` (cũng dùng `useAutosave`).
- **Sửa bug (báo cáo thật):** tên dài (vd "Nguyễn Thị Thanh Thanh") đè lên card kế bên. Nguyên nhân: wrapper của node đặt `width: fit-content` (quyết định ở M2, "drop truncate, show full name") — node vẫn absolute-position theo tọa độ lưới CỐ ĐỊNH, không tự reflow, nên card nào rộng hơn khổ ô của nó (`NODE_WIDTH`=224px) sẽ tràn đè lên card bên phải. Đo lại bằng DOM thật (`getBoundingClientRect`) qua dev server xác nhận đúng: card "Nguyễn Thị Thanh Thanh" rộng 258px, tràn 34px vào ô của card kế bên. Sửa: quay lại khổ CỐ ĐỊNH (`width: NODE_WIDTH`), tên dài cắt bớt + "…" (`truncate`, cần thêm `min-w-0` ở flex item chứa tên — mặc định flex item không co nhỏ hơn nội dung, thiếu dòng này thì `truncate` vô tác dụng), xem đầy đủ qua tooltip (`title`). Đảo ngược một phần quyết định "luôn hiện tên đầy đủ" của M2 — đánh đổi chấp nhận được vì ưu tiên không đè UI.
- `tsc -b`, `vite build`, `oxlint` sạch. Đã dựng được dev server qua Browser tool (`.claude/launch.json` ở thư mục cha, tự chọn port rảnh khi 5173 bận) + đo DOM thật để verify bug trên — không cần qua Google OAuth, chỉ cần 1 trang preview dựng tay render thẳng `TreeNode`/`TreeView` với dữ liệu giả (throwaway, không commit). **Còn thiếu:** vẫn chưa click-test được TOÀN BỘ app thật qua OAuth (đăng nhập/tạo quan hệ trên UI thật) vì không có sẵn phiên Google đã đăng nhập trên máy dev. Cần người thật click thử ít nhất một lượt (spouse ly hôn + con chung) trước khi coi M3 là xong hẳn.

**M4 (2026-08-22):** code xong — panel chi tiết (FR-3.5), thu gọn/mở rộng nhánh (FR-3.3), "Xem cây từ người này" (FR-3.4), tìm theo tên (FR-4.1).
- Click node (hoặc chọn từ tìm kiếm, hoặc bấm người liên quan trong panel) → `PersonPanel` bên phải: ảnh, tên/tên gọi khác/giới tính/năm sinh–mất, ghi chú, 3 danh sách Cha/Mẹ – Vợ/Chồng – Con (đọc lại `parentsOf`/`spousesOf`/`childrenOf` đã có từ M3, không viết lại). Click một người trong danh sách → "nhảy tới": người đó thành chủ đề panel mới, đồng thời pan/zoom camera tới node của họ.
- FR-3.3: thu gọn nhánh không đụng gì tới thuật toán layout — lọc hẳn người bị ẩn ra khỏi ĐẦU VÀO của `buildTreeLayout` trước khi tính, tái dùng đúng cơ chế tách thành phần liên thông đã có sẵn (người bị ẩn coi như không tồn tại, giống cách app đã xử lý dữ liệu mồ côi ở `buildGraph`). `collapsedBranchIds(personId)` (lib/relationships.ts) = hậu duệ huyết thống (`descendantsOf`) CỘNG vợ/chồng của từng người đó (rể/dâu married vào nhánh phải ẩn theo) — KHÔNG tính vợ/chồng của chính `personId`, vì cặp đó vẫn là "gốc" của nhánh đang thu gọn. Badge số người ẩn hiện ngay trên node (bấm để mở lại ngay tại canvas), nhưng nút BẮT ĐẦU thu gọn chỉ đặt trong panel — card trên canvas đã chật 3 nút nhanh FR-2.1, thêm nút thu gọn ngay đó dễ bấm nhầm.
- **FR-3.4 — bug thật + đổi hướng (báo cáo 2026-08-22):** bản đầu implement "Xem cây từ người này" bằng cách đổi `rootId` truyền vào `calcTree` (giống cách pickRoot chọn gốc) — nhưng **sếp báo tính năng chỉ work khi người đó không có bố mẹ**. Điều tra bằng script gọi thẳng `buildTreeLayout` với cây giả 15 người (đủ 3 đời + dâu/rể có cha mẹ riêng ở nhiều nhánh), re-root lần lượt vào TỪNG người: hóa ra quy luật thật không phải "có cha/mẹ hay không" — mà **`relatives-tree` chỉ vẽ được đúng MỘT nhánh tổ tiên duy nhất từ rootId** (rộng hơn bug rể/dâu đã ghi ở M3 — không chỉ mất cha/mẹ của dâu/rể, mà mất LUÔN CẢ cô/chú/bác và hậu duệ của họ, tức toàn bộ nhánh không nằm trên đúng đường thẳng tổ-tiên→rootId→hậu-duệ). Gốc thật của cả họ tình cờ trùng với "đường thẳng duy nhất" đó nên không mất gì — đó là lý do tưởng như "chỉ work nếu không có bố mẹ" (test đối chứng: re-root vào một người KHÔNG có bố mẹ nhưng cũng KHÔNG phải gốc thật — vd dâu/rể chưa rõ gốc — mất còn NHIỀU hơn re-root vào người có bố mẹ, ví dụ chỉ còn 3/15). Cho sếp chọn giữa 2 hướng sửa: (1) đổi thành pan/zoom camera thuần, không đụng dữ liệu hiển thị, hoặc (2) giữ nguyên cách đổi rootId, coi mất nhánh không liên quan là đánh đổi chấp nhận được cho tính năng "cô lập 1 nhánh, ẩn phần còn lại" (hữu ích khi cây rất lớn) — sếp chọn (1).
  - **Quyết định:** bỏ hẳn việc đổi `rootId` — `buildTreeLayout` quay lại đúng chữ ký cũ (không còn tham số `rootOverride`, revert sạch về bản M2/M3). "Xem cây từ người này" giờ chỉ gọi `focusPerson` (cùng cơ chế "nhảy tới" của panel/tìm kiếm) — pan/zoom camera tới đúng node, KHÔNG đổi gì ở layout. Cây vẫn hiện đầy đủ 100% người, không ai biến mất. Vẫn đúng chữ AC gốc ("tổ tiên hiện lên trên, hậu duệ xuống dưới") vì cây luôn vẽ từ gốc THẬT xuống — tổ tiên/hậu duệ của BẤT KỲ ai vốn đã tự nằm trên/dưới họ trong layout hiện có, không cần đổi rootId mới đạt được điều đó. An toàn hơn, đơn giản hơn, không rủi ro mất nhánh — đánh đổi: không còn "cô lập 1 nhánh, ẩn phần còn lại" như hướng (2) từng đề xuất (chấp nhận, vì đó không phải điều AC yêu cầu, và mất dữ liệu trên màn hình dễ bị hiểu lầm là bug hơn là tính năng).
- FR-4.1: `stripDiacritics`/`matchesName` (lib/people.ts) — so khớp substring sau khi bỏ dấu, đúng quyết định ở mục 1 ("một dòng stdlib, không cần lib fuzzy"), khớp cả theo tên gọi khác. Dropdown tối đa 8 kết quả.
- "Nhảy tới" (từ tìm kiếm, từ panel, cả nút "Về gốc" cũ và giờ cả "Xem cây từ người này") dùng chung một cơ chế: `ensureVisible` tự mở lại bất kỳ nhánh đang thu gọn nào che người đích, rồi một `useEffect` theo dõi `focusTarget` + `layout` mới gọi `zoomToElement` của `react-zoom-pan-pinch` — KHÔNG gọi ngay trong handler, vì DOM lúc đó vẫn còn tọa độ layout CŨ (React gộp state update, chưa commit lại trong cùng lần gọi). Cần nhất khi vừa phải mở một nhánh trước: node đích còn chưa tồn tại trong DOM ngay lúc handler chạy, phải chờ layout mới commit xong effect mới thấy.
- `collapsedIds`/`selectedPersonId` đều là view-state thuần (không lưu DB) — mất khi rời tab hoặc tải lại trang; đúng phạm vi FR-3.3/3.5, không AC nào yêu cầu nhớ lại.
- Không có browser tool trong session này (khác M2/M3) nên không click-test qua DOM thật được. Verify bằng cách gọi thẳng `buildTreeLayout`/`collapsedBranchIds` thật qua script bundle rolldown (cùng cách M3 đã dùng để tái tạo bug) — cả bug FR-3.4 kể trên lẫn `collapsedBranchIds` (đúng tập hợp ẩn: chứa hậu duệ + vợ/chồng của họ, không chứa vợ/chồng của chính người đang thu gọn) đều xác nhận bằng script này, không chỉ đọc code bằng mắt. `tsc -b`, `vite build`, `oxlint` sạch. **Còn thiếu:** chưa soát bằng mắt qua trình duyệt thật (panel/badge/dropdown render đúng vị trí, không đè lên node khác trên canvas) — cần người thật click thử trước khi coi M4 là xong hẳn, giống lời nhắc còn treo từ M3.

**M5 (2026-08-22):** code xong — link chia sẻ chỉ-xem (FR-5.1), xuất PNG (FR-5.2).
- `supabase/migrations/0004_share_link.sql`: hàm `get_shared_tree(p_token)` — `SECURITY DEFINER`, chỉ SELECT, trả `jsonb` gồm tên cây + toàn bộ `people`/`relationships` của cây khớp `share_token`. Đây là đường ĐỌC DUY NHẤT cho anon — không mở thêm RLS policy nào trên `trees`/`people`/`relationships`, nên dù khách có token hợp lệ trong tay cũng không có cách nào update/insert/delete qua REST API (AC "API cũng chặn, không chỉ ẩn UI"). Bảo mật đúng như migration 0001 đã ghi chú sẵn từ M0 ("làm ở M5 bằng một hàm SECURITY DEFINER chỉ select").
- **Vá lỗ hổng phát hiện thêm:** bucket ảnh đại diện (`photos`, migration 0002) trước đó chỉ cho CHỦ cây đọc (`photos_owner_select` yêu cầu `auth.uid()`) — người xem qua link chia sẻ sẽ không tải được ảnh, dù ghi chú "làm ở M5" đã có sẵn trong 0002 từ M1. Thêm policy `photos_shared_select`: cho đọc khi cây đang BẬT chia sẻ (`share_token is not null`), không cần khớp đúng token cụ thể — vì muốn có `photo_path` để tải ảnh, trước đó bắt buộc phải gọi `get_shared_tree` thành công rồi (path nằm trong kết quả JSON), không lộ thêm gì so với những gì hàm đó đã trả.
- **Test bắt buộc theo plan §6** ("RLS chia sẻ — client dùng share_token gọi update phải bị từ chối") thêm vào `check.sh`: (1) RPC trả đúng cây khi token đúng, trả `null` khi token sai; (2) switch sang role `anon` (mô phỏng đúng PostgREST khi request không JWT, có stub thêm role `anon`/`authenticated` + `alter default privileges` cho check.sh — trước đó 2 role này chỉ tồn tại trên Supabase thật) rồi thử update/insert/delete trực tiếp trên `trees`/`people` — **PASS cả 3**, không bị chặn bởi thiếu quyền (đã có grant bảng đầy đủ, mô phỏng đúng thực tế) mà bởi RLS. Tự kiểm test có "răng" thật (không pass giả): tạm bỏ `enable row level security` trên bảng test riêng, xác nhận assert THẤT BẠI đúng như kỳ vọng khi RLS bị tắt — chứng minh bài test thật sự đang đo RLS, không phải đo nhầm thứ khác. `sh supabase/check.sh` chạy qua Docker thật (Docker Desktop chưa mở sẵn, đã tự mở) — **PASS toàn bộ**, không chỉ đọc migration bằng mắt.
- Client `lib/share.ts`: `getSharedTree` (gọi RPC), `enableSharing`/`disableSharing` (ghi `share_token` qua policy owner-update sẵn có, không cần RPC riêng để SET token — chỉ ĐỌC mới cần bỏ qua RLS), sinh token bằng `crypto.randomUUID()` (Web Crypto, đủ ngẫu nhiên, không cần round-trip `gen_random_uuid()` của Postgres).
- UI: nút "Chia sẻ" ở header (`App.tsx`) mở `ShareModal` — bật/tắt/tạo lại link, chép link. Khách mở link (`?share=<token>` — query param, không dùng path riêng vì SPA 1 file `index.html` sẽ 404 trên path khác `/` trừ khi cấu hình rewrite ở host, query param chạy được ngay không cần đụng hosting) → `SharedApp` gọi `getSharedTree` một lần, render `TreeView` ở chế độ chỉ-xem, bỏ qua toàn bộ luồng đăng nhập.
- `TreeView` nhận `readOnlyData` (đã tải sẵn) thay cho `treeId` (tự fetch) khi ở chế độ chia sẻ — tái dùng TOÀN BỘ phần hiển thị/panel/thu gọn/tìm kiếm đã có từ M2–M4, không viết lại gì. `TreeNode` nhận `onAddParent`/`onAddSpouse`/`onAddChild` dạng optional — TreeView không truyền ở chế độ chia sẻ, hàng 3 nút nhanh tự ẩn hẳn (đúng AC "không thấy nút sửa/xóa nào"), phần nội dung thẻ tự giãn full-height lấp khoảng trống thay vì để lại hàng trống. `PersonPanel` (thu gọn nhánh, "Xem cây từ người này") giữ nguyên cho cả 2 chế độ — không mutate gì, an toàn để khách dùng.
- FR-5.2: `html-to-image` (`toPng`) xuất "khung nhìn hiện tại" (chụp `wrapperComponent` — đúng phần đang hiện, vì `overflow:hidden` + transform pan/zoom áp ở đó) hoặc "toàn cây" (chụp `contentComponent` — div canvas kích thước cố định theo `layout.canvas`, không phụ thuộc đang cuộn tới đâu). Cả 2 đều truyền `backgroundColor` tường minh — 2 div này không tự có nền (màu nền `bg-stone-100` nằm ở div CHA, không inherit qua CSS), thiếu thì PNG xuất ra nền trong suốt.
  **Rủi ro chưa xác nhận được:** ảnh đại diện tải qua Supabase Storage (domain khác) — `html-to-image` cần nhúng được ảnh vào SVG trung gian, có thể bị chặn nếu response thiếu CORS header phù hợp; không có browser tool để test thật trên project thật. Đã bọc try/catch, báo lỗi rõ ("có thể do ảnh đại diện tải từ nguồn ngoài") thay vì crash im lặng, nhưng chưa xác nhận việc xuất ảnh thực sự thành công với người có ảnh đại diện.
- Không có browser tool trong session này nên không click-test UI qua trình duyệt thật được — phần DB (migration + RLS) đã verify bằng Docker thật (xem trên), phần UI mới chỉ soát bằng đọc code + `tsc -b`/`vite build`/`oxlint` sạch. **Còn thiếu:** click-test thật: mở link chia sẻ bằng tab ẩn danh xác nhận đúng không thấy nút sửa/xóa + ảnh tải được, bấm 2 nút xuất PNG xác nhận file tải xuống đúng và mở được, test trên người có ảnh đại diện thật.

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
