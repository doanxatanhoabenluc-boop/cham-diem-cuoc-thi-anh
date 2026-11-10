-- Chạy một lần trong Supabase SQL Editor để cho phép lưu điểm thập phân.
-- Không xóa hoặc thay đổi dữ liệu điểm đã chấm.
ALTER TABLE public.scores
  ALTER COLUMN content_theme TYPE numeric(5,2) USING content_theme::numeric(5,2),
  ALTER COLUMN emotion_humanity TYPE numeric(5,2) USING emotion_humanity::numeric(5,2),
  ALTER COLUMN image_quality TYPE numeric(5,2) USING image_quality::numeric(5,2),
  ALTER COLUMN creativity TYPE numeric(5,2) USING creativity::numeric(5,2),
  ALTER COLUMN message TYPE numeric(5,2) USING message::numeric(5,2);
