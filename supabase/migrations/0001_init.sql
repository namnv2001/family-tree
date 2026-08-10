-- M0: schema + RLS + tự tạo cây khi đăng ký (FR-6.1, FR-6.2)

create table trees (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users on delete cascade,
  name         text not null default 'Gia phả',
  share_token  text unique,   -- null = tắt chia sẻ (FR-5.1, dùng ở M5)
  created_at   timestamptz not null default now()
);

-- FR-6.2: một cây / một tài khoản. Ràng buộc ở DB, không phải ở UI.
create unique index trees_one_per_owner on trees (owner_id);

create table people (
  id             uuid primary key default gen_random_uuid(),
  tree_id        uuid not null references trees on delete cascade,
  full_name      text not null check (length(trim(full_name)) > 0),  -- FR-1.1
  alias          text,
  gender         text check (gender in ('male', 'female', 'other')),
  birth_date     text,   -- text có chủ ý: cho phép '1920', '~1920' (FR-3 mục 3)
  death_date     text,
  is_deceased    boolean not null default false,
  photo_path     text,
  note           text,   -- con nuôi / con riêng ghi ở đây (đã chốt)
  sibling_order  int not null default 0
);

create index people_tree_id on people (tree_id);

create table relationships (
  id       uuid primary key default gen_random_uuid(),
  tree_id  uuid not null references trees on delete cascade,
  type     text not null check (type in ('parent_of', 'spouse_of')),
  from_id  uuid not null references people on delete cascade,
  to_id    uuid not null references people on delete cascade,
  status   text check (status in ('married', 'divorced', 'widowed')),

  -- FR-2.2: không tự làm vợ/chồng hoặc cha/mẹ của chính mình
  constraint no_self_relation check (from_id <> to_id),
  -- status chỉ có nghĩa với spouse_of (FR-2.3)
  constraint status_only_for_spouse check (type = 'spouse_of' or status is null)
);

create index relationships_tree_id on relationships (tree_id);
create index relationships_from_id on relationships (from_id);
create index relationships_to_id on relationships (to_id);

create unique index relationships_parent_uniq
  on relationships (from_id, to_id) where type = 'parent_of';

-- Hôn nhân không có hướng: (A,B) và (B,A) là cùng một liên kết, chặn trùng.
create unique index relationships_spouse_uniq
  on relationships (least(from_id, to_id), greatest(from_id, to_id))
  where type = 'spouse_of';

-- Còn lại của FR-2.2 (chặn vòng lặp, tối đa 2 parent, cảnh báo ngày tháng)
-- làm bằng trigger ở M3 — mọi client đều phải đi qua nó.

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table trees          enable row level security;
alter table people         enable row level security;
alter table relationships  enable row level security;

-- Không có policy insert/delete cho trees: cây do trigger dưới tạo, và
-- FR-6.2 nói không bao giờ xóa. Thiếu policy = bị chặn, đúng ý.
create policy trees_owner_read on trees
  for select using (owner_id = auth.uid());

create policy trees_owner_update on trees
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy people_owner_all on people
  for all
  using      (exists (select 1 from trees t where t.id = tree_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from trees t where t.id = tree_id and t.owner_id = auth.uid()));

create policy relationships_owner_all on relationships
  for all
  using      (exists (select 1 from trees t where t.id = tree_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from trees t where t.id = tree_id and t.owner_id = auth.uid()));

-- Đường đọc cho người xem qua share_token (FR-5.1) làm ở M5 bằng một hàm
-- SECURITY DEFINER chỉ select — không mở thêm policy nào cho anon.

-- ── Tự tạo cây khi có user mới (FR-6.2) ──────────────────────────────────────
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into trees (owner_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
