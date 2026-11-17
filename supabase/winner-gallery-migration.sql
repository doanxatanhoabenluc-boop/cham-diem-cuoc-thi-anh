-- Thư viện ảnh vinh danh: 01 giải Nhất, 02 giải Nhì, 03 giải Ba.
-- Người xem công bố kết quả chỉ đọc metadata và ảnh; chỉ Admin được thêm/sửa/xóa.

create table if not exists public.winner_gallery (
  entry_source_no text primary key,
  award text not null check (award in ('Giải Nhất', 'Giải Nhì', 'Giải Ba')),
  image_path text not null,
  author_name text not null default '',
  entry_title text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.winner_gallery enable row level security;

drop policy if exists "public read winner gallery" on public.winner_gallery;
create policy "public read winner gallery" on public.winner_gallery
for select to anon, authenticated using (true);

drop policy if exists "admin insert winner gallery" on public.winner_gallery;
create policy "admin insert winner gallery" on public.winner_gallery
for insert to authenticated with check (public.is_admin());

drop policy if exists "admin update winner gallery" on public.winner_gallery;
create policy "admin update winner gallery" on public.winner_gallery
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin delete winner gallery" on public.winner_gallery;
create policy "admin delete winner gallery" on public.winner_gallery
for delete to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contest-winners', 'contest-winners', true, 8388608,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public view winner images" on storage.objects;
create policy "public view winner images" on storage.objects
for select to anon, authenticated using (bucket_id = 'contest-winners');

drop policy if exists "admin upload winner images" on storage.objects;
create policy "admin upload winner images" on storage.objects
for insert to authenticated with check (bucket_id = 'contest-winners' and public.is_admin());

drop policy if exists "admin update winner images" on storage.objects;
create policy "admin update winner images" on storage.objects
for update to authenticated using (bucket_id = 'contest-winners' and public.is_admin())
with check (bucket_id = 'contest-winners' and public.is_admin());

drop policy if exists "admin delete winner images" on storage.objects;
create policy "admin delete winner images" on storage.objects
for delete to authenticated using (bucket_id = 'contest-winners' and public.is_admin());
