-- Chạy một lần trong Supabase SQL Editor để bổ sung cột STT lấy từ file TXT.
-- Không làm thay đổi entry_no hiện có và không xóa dữ liệu cũ.
alter table public.entries
  add column if not exists source_stt bigint;

create index if not exists entries_source_stt_idx
  on public.entries(source_stt);
