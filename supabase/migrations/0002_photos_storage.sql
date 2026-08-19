-- M1: storage bucket cho ảnh đại diện người (FR-1.3)
-- Bucket private — đọc qua signed URL, không public. Path: {tree_id}/{person_id}.webp,
-- nên RLS theo tree_id (thư mục đầu) là đủ, không cần cột tree_id riêng.
--
-- Lưu ý: dùng `objects.name` (có tiền tố), KHÔNG viết trần `name`. Bên trong EXISTS,
-- bảng `trees` cũng có cột `name` — viết trần sẽ bị Postgres resolve nhầm thành
-- `t.name` (tên cây) chứ không phải path file, khiến foldername() luôn ra rỗng và
-- policy luôn fail. Đã tự bắt lỗi này bằng cách test trực tiếp trên project thật.

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy photos_owner_select on storage.objects
  for select using (
    bucket_id = 'photos'
    and exists (
      select 1 from trees t
      where t.id::text = (storage.foldername(objects.name))[1]
        and t.owner_id = auth.uid()
    )
  );

create policy photos_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and exists (
      select 1 from trees t
      where t.id::text = (storage.foldername(objects.name))[1]
        and t.owner_id = auth.uid()
    )
  );

create policy photos_owner_update on storage.objects
  for update using (
    bucket_id = 'photos'
    and exists (
      select 1 from trees t
      where t.id::text = (storage.foldername(objects.name))[1]
        and t.owner_id = auth.uid()
    )
  );

create policy photos_owner_delete on storage.objects
  for delete using (
    bucket_id = 'photos'
    and exists (
      select 1 from trees t
      where t.id::text = (storage.foldername(objects.name))[1]
        and t.owner_id = auth.uid()
    )
  );

-- Đường đọc cho người xem qua share_token (FR-5.1) làm ở M5, chưa mở ở đây.
