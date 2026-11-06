import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Phương thức không được hỗ trợ.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !service) {
      return json({ error: 'Edge Function chưa được cấu hình.' }, 500);
    }

    const body = await req.json();
    const action = String(body.action || 'login');
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!/^[a-z0-9._-]{3,30}$/.test(username) || !password) {
      return json({ error: 'Vui lòng nhập tên đăng nhập hợp lệ và mật khẩu.' }, 400);
    }

    const admin = createClient(url, service);

    // Đăng nhập: tra username trong hồ sơ rồi xác thực bằng Supabase Auth.
    // Email nội bộ không được hiển thị hoặc yêu cầu người dùng nhập.
    if (action === 'login') {
      const { data: profile, error: lookupErr } = await admin
        .from('profiles')
        .select('email')
        .eq('username', username)
        .maybeSingle();

      if (lookupErr || !profile?.email) {
        return json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' }, 401);
      }

      const publicClient = createClient(url, anon, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await publicClient.auth.signInWithPassword({
        email: profile.email,
        password,
      });

      if (error || !data.session) {
        return json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' }, 401);
      }

      return json({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }

    // Tạo tài khoản: chỉ Admin đã đăng nhập mới được phép.
    if (action !== 'create') return json({ error: 'Thao tác không hợp lệ.' }, 400);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Bạn cần đăng nhập Admin.' }, 401);

    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: 'Phiên đăng nhập không hợp lệ.' }, 401);

    const { data: adminProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminProfile?.role !== 'admin') {
      return json({ error: 'Chỉ Admin được tạo tài khoản.' }, 403);
    }

    const full_name = String(body.full_name || '').trim();
    const role = String(body.role || 'judge');
    if (password.length < 8 || !full_name || !['judge', 'reporter', 'admin'].includes(role)) {
      return json({ error: 'Mật khẩu tối thiểu 8 ký tự; vui lòng nhập họ tên và chọn quyền hợp lệ.' }, 400);
    }

    const { data: existing, error: checkErr } = await admin
      .from('profiles').select('id').eq('username', username).maybeSingle();
    if (checkErr) return json({ error: 'Không kiểm tra được tên đăng nhập.' }, 500);
    if (existing) return json({ error: 'Tên đăng nhập đã tồn tại.' }, 409);

    // Email nội bộ kỹ thuật; người dùng không cần biết hoặc nhập email này.
    const internalEmail = `${username}@username.login.invalid`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name, username },
    });
    if (createErr || !created.user) {
      return json({ error: createErr?.message || 'Không tạo được tài khoản.' }, 400);
    }

    const { error: saveErr } = await admin.from('profiles').upsert({
      id: created.user.id,
      email: internalEmail,
      full_name,
      username,
      role,
    });
    if (saveErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: 'Không lưu được hồ sơ: ' + saveErr.message }, 500);
    }

    return json({ success: true, user_id: created.user.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Lỗi máy chủ.' }, 500);
  }
});
