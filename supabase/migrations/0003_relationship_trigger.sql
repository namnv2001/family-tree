-- M3: phần còn lại của FR-2.2 mà check constraint không diễn tả được — chặn
-- vòng lặp tổ tiên và tối đa 2 cha/mẹ. Làm bằng trigger vì mọi client (kể cả
-- share link sau này) đều phải đi qua, không thể bypass bằng cách gọi thẳng API.

create function check_relationship() returns trigger
language plpgsql as $$
declare
  parent_count int;
  to_is_ancestor_of_from boolean;
begin
  if new.type <> 'parent_of' then
    return new;
  end if;

  -- Tối đa 2 cha/mẹ (FR-2.2). "id is distinct from new.id" để update không tự đếm chính nó.
  select count(*) into parent_count
  from relationships
  where type = 'parent_of' and to_id = new.to_id and id is distinct from new.id;
  if parent_count >= 2 then
    raise exception 'Người này đã có đủ 2 cha/mẹ.';
  end if;

  -- Chặn vòng lặp: new.from_id sẽ là cha/mẹ của new.to_id, nên nếu new.to_id
  -- đã là tổ tiên (trực tiếp hoặc gián tiếp) của new.from_id thì cạnh mới này
  -- khép thành vòng lặp (A là tổ tiên của B → B không thể là cha/mẹ của A).
  with recursive ancestors_of_from as (
    select from_id as id
    from relationships
    where type = 'parent_of' and to_id = new.from_id and id is distinct from new.id
    union
    select r.from_id
    from relationships r
    join ancestors_of_from a on r.to_id = a.id
    where r.type = 'parent_of' and r.id is distinct from new.id
  )
  select exists (select 1 from ancestors_of_from where id = new.to_id)
  into to_is_ancestor_of_from;

  if to_is_ancestor_of_from then
    raise exception 'Không thể tạo quan hệ này: sẽ tạo vòng lặp tổ tiên.';
  end if;

  return new;
end;
$$;

create trigger relationships_check
  before insert or update on relationships
  for each row execute function check_relationship();
