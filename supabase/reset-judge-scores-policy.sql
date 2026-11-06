-- Chạy một lần trong Supabase SQL Editor nếu thao tác Reset điểm báo lỗi quyền.
-- Chỉ tài khoản có role = 'admin' mới được xóa phiếu chấm.
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin delete scores" ON public.scores;
CREATE POLICY "admin delete scores" ON public.scores
FOR DELETE TO authenticated
USING (public.is_admin());
