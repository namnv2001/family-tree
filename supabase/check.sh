#!/bin/sh
# Kiểm tra mọi migration chạy được trên Postgres trần. Cần Docker.
#   sh supabase/check.sh
set -e
C=ft-check-db
docker rm -f $C >/dev/null 2>&1 || true
docker run -d --name $C -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
until docker exec $C pg_isready -q 2>/dev/null; do docker exec $C sleep 1; done

run() { docker exec -i $C psql -q -U postgres -v ON_ERROR_STOP=1; }

# auth.* và storage.* là của Supabase — stub để chạy được ngoài Supabase.
run <<'SQL'
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets,
  name      text,
  owner     uuid
);
alter table storage.objects enable row level security;
-- Cùng cách Supabase thật tính thư mục: bỏ phần tử cuối (tên file) của path.
create function storage.foldername(name text) returns text[]
  language sql immutable as $$ select trim_array(string_to_array(name, '/'), 1) $$;

-- anon/authenticated: 2 role PostgREST dùng theo JWT của request (không có
-- JWT = anon, khách xem link chia sẻ FR-5.1; có JWT = authenticated, chủ cây
-- đăng nhập). Supabase thật tự cấp GRANT bảng cho cả 2 lúc tạo bảng (default
-- privileges ở tầng project) — mô phỏng bằng ALTER DEFAULT PRIVILEGES TRƯỚC
-- khi migrations chạy, để bảng nào cũng tự có đúng grant như trên Supabase
-- thật (nếu không, test "anon bị RLS chặn" dưới sẽ ăn may vì anon còn chưa
-- có quyền chạm bảng, không chứng minh được RLS mới là thứ chặn).
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
SQL

for f in "$(dirname "$0")"/migrations/*.sql; do
  echo "-- apply $f"
  run < "$f"
done

# FR-6.2: user mới phải tự có đúng một cây
run <<'SQL'
insert into auth.users default values;
do $$ begin
  assert (select count(*) from trees) = 1, 'handle_new_user khong tao cay';
end $$;
SQL

# M3 / FR-2.2: trigger relationships_check phải chặn tối đa 2 cha/mẹ và vòng lặp tổ tiên.
run <<'SQL'
do $$
declare
  t_id uuid;
  a uuid; b uuid; c uuid; d uuid;
  failed boolean;
begin
  select id into t_id from trees limit 1;

  insert into people (tree_id, full_name) values (t_id, 'A') returning id into a;
  insert into people (tree_id, full_name) values (t_id, 'B') returning id into b;
  insert into people (tree_id, full_name) values (t_id, 'C') returning id into c;
  insert into people (tree_id, full_name) values (t_id, 'D') returning id into d;

  -- Toi da 2 cha/me: A, B da la cha/me cua C -> C them D lam cha/me thu 3 phai fail.
  insert into relationships (tree_id, type, from_id, to_id) values (t_id, 'parent_of', a, c);
  insert into relationships (tree_id, type, from_id, to_id) values (t_id, 'parent_of', b, c);
  failed := false;
  begin
    insert into relationships (tree_id, type, from_id, to_id) values (t_id, 'parent_of', d, c);
  exception when others then
    failed := true;
  end;
  assert failed, 'trigger khong chan duoc cha/me thu 3';

  -- Vong lap: C la con cua A. A khong the la con cua C (A da la to tien cua C).
  failed := false;
  begin
    insert into relationships (tree_id, type, from_id, to_id) values (t_id, 'parent_of', c, a);
  exception when others then
    failed := true;
  end;
  assert failed, 'trigger khong chan duoc vong lap to tien';
end $$;
SQL

# FR-5.1: get_shared_tree tra dung cay khi token dung, null khi token sai/rong.
run <<'SQL'
do $$
declare
  t_id uuid;
  tok text := 'tok-test-share';
  result jsonb;
begin
  select id into t_id from trees limit 1;
  update trees set share_token = tok where id = t_id;

  select get_shared_tree(tok) into result;
  assert result is not null, 'RPC khong tra duoc cay khi token dung';
  assert jsonb_array_length(result->'people') = 4, 'RPC thieu nguoi trong danh sach';

  select get_shared_tree('token-khong-ton-tai') into result;
  assert result is null, 'RPC phai tra null voi token sai';
end $$;
SQL

# FR-5.1 AC "API cung chan": switch sang role anon (nhu PostgREST dung khi
# khach xem link, khong dang nhap) roi thu sua/xoa truc tiep tren bang - du
# anon CO grant bang (mo phong dung Supabase thuc) va biet token, RLS van phai
# chan. UPDATE/DELETE khong nem loi, chi loc ra 0 dong (USING) - assert o
# phien SAU (superuser), khong assert ngay trong phien anon (anon cung bi
# chan SELECT nen "not exists" se luon dung mot cach gia tao, khong chung
# minh duoc gi).
run <<'SQL'
set role anon;
update trees set name = 'HACKED' where true;
update people set full_name = 'HACKED' where true;
delete from people where true;
SQL

run <<'SQL'
do $$
declare
  failed boolean := false;
begin
  begin
    set role anon;
    insert into people (tree_id, full_name) values ((select id from trees limit 1), 'anon-injected');
    reset role;
  exception when others then
    reset role;
    failed := true;
  end;
  assert failed, 'anon INSERT truc tiep tren people khong bi RLS chan';

  assert not exists (select 1 from trees where name = 'HACKED'), 'anon UPDATE truc tiep tren trees khong bi chan';
  assert not exists (select 1 from people where full_name in ('HACKED', 'anon-injected')),
    'anon UPDATE/INSERT truc tiep tren people khong bi chan';
  assert (select count(*) from people) = 4, 'anon DELETE truc tiep tren people khong bi chan';
end $$;
SQL

docker rm -f $C >/dev/null
echo "OK"
