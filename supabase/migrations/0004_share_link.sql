-- M5: link chia sẻ chỉ-xem (FR-5.1).
--
-- Đường ĐỌC duy nhất cho khách (anon, không đăng nhập) là hàm SECURITY DEFINER
-- dưới đây — không mở thêm RLS policy nào cho anon trên trees/people/
-- relationships. Hàm này chỉ SELECT, không có câu lệnh ghi nào bên trong, và
-- các bảng gốc vẫn giữ đúng policy owner-only cũ (0001_init.sql) — nên dù
-- khách có token hợp lệ trong tay, KHÔNG có cách nào để họ update/insert/
-- delete trực tiếp qua REST API (AC "API cũng chặn, không chỉ ẩn UI"). Test ở
-- supabase/check.sh.
create function get_shared_tree(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'tree', jsonb_build_object('id', t.id, 'name', t.name),
    -- Sắp cùng thứ tự với listPeople() (lib/people.ts) để trải nghiệm nhất
    -- quán giữa xem đã đăng nhập và xem qua link chia sẻ.
    'people', coalesce(
      (select jsonb_agg(p order by p.sibling_order, p.full_name) from people p where p.tree_id = t.id),
      '[]'::jsonb
    ),
    'relationships', coalesce((select jsonb_agg(r) from relationships r where r.tree_id = t.id), '[]'::jsonb)
  )
  from trees t
  where t.share_token = p_token
  limit 1;
$$;
-- Không match token nào (kể cả p_token null, vì so sánh với null luôn ra
-- null/false) → hàm SQL không SETOF trả về đúng 0 dòng thì tự thành NULL —
-- client coi null là "link sai hoặc đã tắt chia sẻ", không cần xử lý riêng.

-- SECURITY DEFINER bỏ qua RLS khi query BÊN TRONG hàm (chạy bằng quyền người
-- tạo hàm — chủ bảng, được miễn RLS theo mặc định Postgres) — nhưng CALLER
-- vẫn cần quyền EXECUTE để gọi được hàm; mặc định chỉ owner có, phải grant
-- rõ cho anon (khách chưa đăng nhập) và authenticated (chủ cây xem link của
-- chính mình cũng đi qua đường này nếu muốn, dù họ có đường đọc trực tiếp rồi).
grant execute on function get_shared_tree(text) to anon, authenticated;

-- Ảnh đại diện: bucket 'photos' hiện chỉ cho CHỦ cây đọc (photos_owner_select,
-- 0002_photos_storage.sql) — người xem qua link chia sẻ sẽ không tải được ảnh
-- (đúng như ghi chú "làm ở M5" trong file đó). Mở thêm policy đọc cho MỌI
-- role khi cây đang BẬT chia sẻ (share_token is not null) — không cần biết
-- token cụ thể nào, vì muốn tải được ảnh thì trước đó phải gọi get_shared_tree
-- thành công rồi mới có đúng `photo_path` (đường dẫn nằm trong kết quả JSON
-- của người đó) — path đã coi như bí mật đủ (uuid, không đoán được), không
-- lộ thêm gì so với những gì get_shared_tree đã trả.
create policy photos_shared_select on storage.objects
  for select using (
    bucket_id = 'photos'
    and exists (
      select 1 from trees t
      where t.id::text = (storage.foldername(objects.name))[1]
        and t.share_token is not null
    )
  );
