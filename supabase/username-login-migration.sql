-- Chạy một lần trong Supabase SQL Editor để bật đăng nhập bằng tên người dùng.
alter table public.profiles add column if not exists username text;

create unique index if not exists profiles_username_lower_unique
on public.profiles (lower(username))
where username is not null;

-- Tự lưu username từ metadata nếu Auth tạo tài khoản.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, email, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    nullif(lower(new.raw_user_meta_data->>'username'), ''),
    'judge'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    username = coalesce(excluded.username, public.profiles.username);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
