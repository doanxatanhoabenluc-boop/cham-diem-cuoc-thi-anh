-- Chạy trong Supabase SQL Editor nếu tài khoản admin vẫn gặp lỗi quyền khi xóa tác phẩm.
-- Chính sách này chỉ cho tài khoản có role = 'admin' xóa bài đăng và ảnh của bài đăng.

DROP POLICY IF EXISTS "admin delete entries" ON public.entries;
CREATE POLICY "admin delete entries" ON public.entries
FOR DELETE TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin delete contest images" ON storage.objects;
CREATE POLICY "admin delete contest images" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'contest-images'
  AND public.is_admin()
);
