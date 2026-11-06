import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD || '12345678';
const fullName = process.env.ADMIN_FULL_NAME || 'Quản trị viên';
const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();

if (!url || !serviceKey || !email) {
  console.error('Thiếu SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY hoặc ADMIN_EMAIL trong .env.bootstrap');
  process.exit(1);
}
if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('ADMIN_USERNAME phải từ 3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
if (password.length < 8) throw new Error('Mật khẩu Admin phải có ít nhất 8 ký tự.');
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
let user = existing.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName, username, role: 'admin' }
  });
  if (error) throw error;
  user = data.user;
} else {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    password, email_confirm: true, user_metadata: { full_name: fullName, username, role: 'admin' }
  });
  if (error) throw error;
  user = data.user;
}
const { error } = await supabase.from('profiles').upsert({
  id: user.id, email, username, full_name: fullName, role: 'admin'
});
if (error) throw error;
console.log(`Đã khởi tạo Admin. Tên đăng nhập: ${username}`);
console.log('Đăng nhập bằng tên đăng nhập và mật khẩu đã cấu hình.');
