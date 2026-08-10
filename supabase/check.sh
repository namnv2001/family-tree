#!/bin/sh
# Kiểm tra mọi migration chạy được trên Postgres trần. Cần Docker.
#   sh supabase/check.sh
set -e
C=ft-check-db
docker rm -f $C >/dev/null 2>&1 || true
docker run -d --name $C -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
until docker exec $C pg_isready -q 2>/dev/null; do docker exec $C sleep 1; done

run() { docker exec -i $C psql -q -U postgres -v ON_ERROR_STOP=1; }

# auth.users và auth.uid() là của Supabase — stub để chạy được ngoài Supabase.
run <<'SQL'
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
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

docker rm -f $C >/dev/null
echo "OK"
