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

docker rm -f $C >/dev/null
echo "OK"
