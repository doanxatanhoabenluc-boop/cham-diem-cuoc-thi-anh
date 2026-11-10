import React, { useEffect, useMemo, useState } from 'react';
import {
  Aperture, ImagePlus, LayoutDashboard, Images, ClipboardCheck, FileBarChart,
  Users, LogOut, Menu, X, Search, ChevronLeft, ChevronRight, CheckCircle2,
  Eye, MessageSquareText, Save, Upload, FileSpreadsheet, ShieldCheck, Lock,
  AlertTriangle, RefreshCw, UserRound, Trash2, Filter, Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase, supabaseReady } from './lib/supabase';
import { CRITERIA, totalScore, isComplete } from './lib/criteria';
import { parseEntryTxt, pairUploads } from './lib/txtParser';

const BUCKET = 'contest-images';
const fmt = n => Number(n || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const errText = e => e?.message || 'Đã xảy ra lỗi. Vui lòng thử lại.';
const blankScore = () => Object.fromEntries(CRITERIA.map(c => [c.key, '']));

// Tác phẩm có STT trong TXT được xếp trước theo STT tăng dần.
// Tác phẩm không có STT được xếp tiếp theo theo họ và tên tác giả (A-Z, tiếng Việt).
function compareEntryOrder(a, b) {
  const rawA = a?.source_stt;
  const rawB = b?.source_stt;
  const sttA = rawA !== null && rawA !== undefined && String(rawA).trim() !== '' && Number.isFinite(Number(rawA))
    ? Number(rawA) : null;
  const sttB = rawB !== null && rawB !== undefined && String(rawB).trim() !== '' && Number.isFinite(Number(rawB))
    ? Number(rawB) : null;

  if (sttA !== null && sttB !== null && sttA !== sttB) return sttA - sttB;
  if (sttA !== null && sttB === null) return -1;
  if (sttA === null && sttB !== null) return 1;

  const nameA = String(a?.author_name || '').trim();
  const nameB = String(b?.author_name || '').trim();
  const byName = nameA.localeCompare(nameB, 'vi', { sensitivity: 'accent', ignorePunctuation: true });
  if (byName) return byName;

  const titleA = String(a?.title || '').trim();
  const titleB = String(b?.title || '').trim();
  return titleA.localeCompare(titleB, 'vi', { sensitivity: 'accent', ignorePunctuation: true });
}

const entryNumber = (entry, fallback = '') => entry?.source_stt ?? entry?.entry_no ?? fallback;

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('gallery');
  const [entries, setEntries] = useState([]);
  const [scores, setScores] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabaseReady) {
      setLoading(false);
      return;
    }

    let alive = true;

    // Chỉ cập nhật trạng thái React khi tài khoản thực sự thay đổi.
    // Supabase phát TOKEN_REFRESHED định kỳ; thay toàn bộ session object ở
    // mỗi lần refresh sẽ khiến hồ sơ và toàn bộ thư viện tác phẩm tải lại.
    const applySession = nextSession => {
      if (!alive) return;
      setSession(currentSession => {
        const currentUserId = currentSession?.user?.id || null;
        const nextUserId = nextSession?.user?.id || null;
        return currentUserId === nextUserId ? currentSession : nextSession;
      });
    };

    // Đăng ký listener trước để không bỏ lỡ sự kiện xác thực ban đầu.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => applySession(nextSession)
    );

    supabase.auth.getSession().then(({ data }) => {
      applySession(data?.session || null);
    }).catch(error => {
      if (alive) setNotice('Không kiểm tra được phiên đăng nhập: ' + errText(error));
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Theo dõi ID tài khoản, không theo dõi toàn bộ session object.
  // TOKEN_REFRESHED giữ nguyên user ID nên không làm tải lại thư viện tác phẩm.
  const sessionUserId = session?.user?.id || null;

  useEffect(() => {
    let alive = true;

    async function loadProfile() {
      if (!sessionUserId) {
        setProfile(null);
        setEntries([]);
        setScores([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sessionUserId)
        .single();

      if (!alive) return;

      if (error) {
        setNotice('Không tải được hồ sơ tài khoản: ' + error.message);
      }

      setProfile(data || null);
      setLoading(false);
    }

    loadProfile();

    return () => {
      alive = false;
    };
  }, [sessionUserId]);

  useEffect(() => {
    if (!profile) return;
    loadData();
  }, [profile]);

  async function loadData() {
    setBusy(true);

    const [
      { data: entryData, error: entryError },
      { data: scoreData, error: scoreError }
    ] = await Promise.all([
      supabase.from('entries').select('*').order('created_at', { ascending: false }),
      supabase.from('scores').select('*')
    ]);

    if (entryError) setNotice(errText(entryError));
    if (scoreError) setNotice(errText(scoreError));

    const withSignedImages = await Promise.all(
      (entryData || []).map(async entry => {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(entry.image_path, 60 * 60);

        return {
          ...entry,
          image_url: signed?.signedUrl || ''
        };
      })
    );

    setEntries(withSignedImages);
    setScores(scoreData || []);
    setBusy(false);
  }

  // Đăng nhập chỉ bằng tên người dùng và mật khẩu.
  async function signIn(username, password) {
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        action: 'login',
        username: String(username).trim().toLowerCase(),
        password
      }
    });

    if (error || data?.error) {
      alert('Đăng nhập thất bại: ' + (data?.error || error?.message || 'Không thể đăng nhập.'));
      return;
    }

    if (!data?.access_token || !data?.refresh_token) {
      alert('Không nhận được phiên đăng nhập. Vui lòng thử lại.');
      return;
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    });

    if (sessionError) alert('Đăng nhập thất bại: ' + sessionError.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setPage('gallery');
  }

  // Chỉ tài khoản quản trị mới được xóa tác phẩm.
  // Xóa bản ghi entries sẽ đồng thời xóa các phiếu chấm liên quan nhờ ON DELETE CASCADE.
  async function deleteEntry(entry) {
    if (profile?.role !== 'admin') {
      setNotice('Bạn không có quyền xóa tác phẩm.');
      return;
    }

    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn xóa tác phẩm \"${entry.title || 'không có tiêu đề'}\"?\n\n` +
      'Thao tác này sẽ xóa tác phẩm, ảnh lưu trữ và toàn bộ phiếu chấm của các giám khảo cho tác phẩm này. Không thể hoàn tác.'
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const { data, error } = await supabase
        .from('entries')
        .delete()
        .eq('id', entry.id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error(
          'Không tìm thấy tác phẩm hoặc Supabase chưa cấp quyền DELETE cho tài khoản quản trị. Hãy kiểm tra chính sách RLS của bảng entries.'
        );
      }

      // Gỡ tác phẩm và điểm liên quan khỏi giao diện ngay sau khi DB xác nhận xóa.
      setEntries(current => current.filter(item => item.id !== entry.id));
      setScores(current => current.filter(score => score.entry_id !== entry.id));
      if (selected?.id === entry.id) setSelected(null);

      let imageWarning = '';
      if (entry.image_path) {
        const { error: imageError } = await supabase.storage
          .from(BUCKET)
          .remove([entry.image_path]);
        if (imageError) {
          imageWarning = ` Tuy nhiên, chưa xóa được tệp ảnh trong kho lưu trữ: ${imageError.message}`;
        }
      }

      setNotice(`Đã xóa tác phẩm \"${entry.title || ''}\" và các phiếu chấm liên quan.${imageWarning}`);
      await loadData();
    } catch (error) {
      setNotice('Không xóa được tác phẩm: ' + errText(error));
    } finally {
      setBusy(false);
    }
  }

  // Chỉ Admin được xóa toàn bộ tác phẩm. Thao tác yêu cầu nhập đúng cụm xác nhận
  // để tránh bấm nhầm; xóa entries sẽ cascade xóa scores nhờ khóa ngoại Supabase.
  async function deleteAllEntries() {
    if (profile?.role !== 'admin') {
      setNotice('Bạn không có quyền xóa toàn bộ tác phẩm.');
      return;
    }

    setBusy(true);
    try {
      const { data: allRows, error: listError } = await supabase
        .from('entries')
        .select('id,image_path');

      if (listError) throw listError;
      const rows = allRows || [];

      if (!rows.length) {
        setNotice('Hiện không có bài đăng nào cần xóa.');
        return;
      }

      const phrase = window.prompt(
        `CẢNH BÁO: Bạn sắp xóa TOÀN BỘ ${rows.length} bài đăng.\n\n` +
        'Toàn bộ ảnh và phiếu chấm của tất cả giám khảo cũng sẽ bị xóa.\n' +
        'Thao tác này không thể hoàn tác.\n\n' +
        'Để tiếp tục, hãy nhập chính xác: XOA TAT CA'
      );

      if (String(phrase || '').trim().toUpperCase() !== 'XOA TAT CA') {
        setNotice('Đã hủy thao tác xóa toàn bộ bài đăng.');
        return;
      }

      const finalConfirm = window.confirm(
        `Xác nhận lần cuối: xóa ${rows.length} bài đăng cùng toàn bộ điểm chấm và ảnh?`
      );
      if (!finalConfirm) {
        setNotice('Đã hủy thao tác xóa toàn bộ bài đăng.');
        return;
      }

      const { data: deletedRows, error: deleteError } = await supabase
        .from('entries')
        .delete()
        .not('id', 'is', null)
        .select('id');

      if (deleteError) throw deleteError;

      const deletedCount = (deletedRows || []).length;
      if (deletedCount !== rows.length) {
        throw new Error(
          `Supabase chỉ xác nhận xóa ${deletedCount}/${rows.length} bài. ` +
          'Vui lòng kiểm tra chính sách DELETE của bảng entries trước khi thử lại.'
        );
      }

      // Bản ghi scores được xóa tự động nhờ ON DELETE CASCADE. Dọn tiếp các ảnh
      // trong bucket riêng tư; lỗi xóa ảnh không làm mất trạng thái xóa bài đã hoàn tất.
      const imagePaths = [...new Set(rows.map(row => row.image_path).filter(Boolean))];
      const imageErrors = [];
      for (let i = 0; i < imagePaths.length; i += 100) {
        const batch = imagePaths.slice(i, i + 100);
        const { error: imageError } = await supabase.storage
          .from(BUCKET)
          .remove(batch);
        if (imageError) imageErrors.push(imageError.message);
      }

      setEntries([]);
      setScores([]);
      setSelected(null);
      setSearch('');
      setFilter('all');

      const imageWarning = imageErrors.length
        ? ` Tuy nhiên, có ảnh chưa xóa được khỏi kho lưu trữ: ${imageErrors.join('; ')}`
        : '';
      setNotice(
        `Đã xóa ${deletedCount} bài đăng, toàn bộ phiếu chấm liên quan và ${imagePaths.length} ảnh.${imageWarning}`
      );
    } catch (error) {
      setNotice('Không xóa được toàn bộ bài đăng: ' + errText(error));
      // Đồng bộ lại trạng thái giao diện trong trường hợp thao tác bị lỗi giữa chừng.
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  const mine = useMemo(
    () => scores.filter(s => s.judge_id === profile?.id),
    [scores, profile]
  );

  const orderedEntries = useMemo(
    () => [...entries].sort(compareEntryOrder),
    [entries]
  );

  const filteredEntries = useMemo(() => orderedEntries.filter(e => {
    const q = search.toLocaleLowerCase('vi');

    const matches = [
      e.author_name,
      e.unit,
      e.title,
      String(e.source_stt ?? ''),
      String(e.entry_no || '')
    ].some(v => String(v || '').toLocaleLowerCase('vi').includes(q));

    const own = mine.find(s => s.entry_id === e.id);
    const done = Boolean(own && isComplete(own));

    return matches && (
      filter === 'all' ||
      (filter === 'done' && done) ||
      (filter === 'todo' && !done)
    );
  }), [orderedEntries, search, filter, mine]);

  if (!supabaseReady) return <SetupScreen />;

  if (loading) {
    return (
      <div className="loading-screen">
        <Aperture className="spin" size={34} />
        <p>Đang kết nối hệ thống…</p>
      </div>
    );
  }

  if (!session) return <Login onLogin={signIn} notice={notice} />;

  if (!profile) {
    return (
      <div className="center-card">
        <AlertTriangle />
        <h2>Tài khoản chưa được cấp hồ sơ</h2>
        <p>Liên hệ Admin để kích hoạt quyền truy cập.</p>
        <button onClick={signOut}>Đăng xuất</button>
      </div>
    );
  }

  const role = profile.role;
  const canJudge = role === 'judge' || role === 'admin';
  const canAdmin = role === 'admin';
  const canReport = role === 'reporter' || role === 'admin';

  function openEntry(entry) {
    setSelected(entry);
  }

  function navigateEntry(delta) {
    const idx = filteredEntries.findIndex(e => e.id === selected?.id);
    const next = filteredEntries[idx + delta];

    if (next) setSelected(next);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-btn mobile-menu" onClick={() => setDrawer(true)}>
          <Menu />
        </button>

        <div className="brand">
          <span className="brand-mark"><Aperture /></span>
          <div>
            <b>CHẠM VÀO KHOẢNH KHẮC</b>
            <small>HỆ THỐNG CHẤM ĐIỂM CUỘC THI ẢNH</small>
          </div>
        </div>

        <div className="top-actions">
          <button className="quick-score" onClick={() => setQuickOpen(true)}>
            <ClipboardCheck size={17} />
            Điểm của tôi
            <span>{mine.length}</span>
          </button>

          <div className="user-chip">
            <span className="avatar">
              {(profile.full_name || profile.email || 'U').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <b>{profile.full_name || profile.email}</b>
              <small>{roleLabel(role)}</small>
            </div>
          </div>

          <button className="icon-btn" title="Đăng xuất" onClick={signOut}>
            <LogOut />
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className={`sidebar ${drawer ? 'sidebar-open' : ''}`}>
          <div className="side-mobile-head">
            <b>Danh mục</b>
            <button className="icon-btn" onClick={() => setDrawer(false)}>
              <X />
            </button>
          </div>

          <p className="nav-caption">KHÔNG GIAN LÀM VIỆC</p>

          <NavItem
            icon={<Images />}
            label="Tác phẩm dự thi"
            active={page === 'gallery'}
            onClick={() => {
              setPage('gallery');
              setDrawer(false);
            }}
          />

          {canJudge && (
            <NavItem
              icon={<ClipboardCheck />}
              label="Phiếu chấm của tôi"
              active={page === 'my-scores'}
              onClick={() => {
                setPage('my-scores');
                setDrawer(false);
              }}
            />
          )}

          {canReport && (
            <NavItem
              icon={<FileBarChart />}
              label="Báo cáo tổng hợp"
              active={page === 'reports'}
              onClick={() => {
                setPage('reports');
                setDrawer(false);
              }}
            />
          )}

          {canAdmin && (
            <>
              <p className="nav-caption">QUẢN TRỊ HỆ THỐNG</p>

              <NavItem
                icon={<ImagePlus />}
                label="Đăng bài dự thi"
                active={page === 'upload'}
                onClick={() => {
                  setPage('upload');
                  setDrawer(false);
                }}
              />

              <NavItem
                icon={<Users />}
                label="Quản lý tài khoản"
                active={page === 'users'}
                onClick={() => {
                  setPage('users');
                  setDrawer(false);
                }}
              />
            </>
          )}

          <div className="sidebar-bottom">
            <ShieldCheck size={17} />
            <span>Phân quyền bảo mật Supabase</span>
          </div>
        </aside>

        {drawer && (
          <div className="scrim" onClick={() => setDrawer(false)} />
        )}

        <main className="main-content">
          {notice && (
            <div className="notice">
              <span>{notice}</span>
              <button onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}

          {page === 'gallery' && (
            <Gallery
              entries={filteredEntries}
              search={search}
              setSearch={setSearch}
              filter={filter}
              setFilter={setFilter}
              scores={mine}
              onOpen={openEntry}
              onDelete={deleteEntry}
              onDeleteAll={deleteAllEntries}
              totalEntries={entries.length}
              busy={busy}
              role={role}
            />
          )}

          {page === 'my-scores' && (
            <MyScores
              entries={entries}
              scores={mine}
              onOpen={openEntry}
            />
          )}

          {page === 'reports' && (
            <Reports
              entries={entries}
              scores={scores}
              users={users}
            />
          )}

          {page === 'upload' && canAdmin && (
            <UploadPage
              onDone={async msg => {
                setNotice(msg);
                await loadData();
              }}
            />
          )}

          {page === 'users' && canAdmin && <UsersPage onScoresReset={loadData} />}
        </main>
      </div>

      <QuickDrawer
        open={quickOpen}
        close={() => setQuickOpen(false)}
        profile={profile}
        scores={mine}
        entries={entries}
      />

      {selected && (
        <EntryModal
          entry={selected}
          entries={filteredEntries}
          scores={scores}
          profile={profile}
          canJudge={canJudge}
          onClose={() => setSelected(null)}
          onNavigate={navigateEntry}
          onSaved={async () => {
            await loadData();
          }}
          setNotice={setNotice}
        />
      )}
    </div>
  );
}

function roleLabel(role) {
  return ({
    admin: 'Quản trị viên',
    judge: 'Ban Giám khảo',
    reporter: 'Người xem báo cáo'
  })[role] || 'Tài khoản';
}

function SetupScreen() {
  return (
    <div className="center-card setup">
      <Aperture size={42} />
      <h1>Chưa cấu hình Supabase</h1>
      <p>
        Tạo file <code>.env</code> từ <code>.env.example</code>,
        sau đó điền Project URL và anon key của dự án Supabase.
      </p>
      <code>npm install && npm run dev</code>
    </div>
  );
}

function Login({ onLogin, notice }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username.trim() || !password) return;

    setBusy(true);

    try {
      await onLogin(username.trim(), password);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page login-simple">
      <div className="login-box">
        <div className="login-logo">
          <Aperture size={32} />
        </div>

        <span className="eyebrow">CHẠM VÀO KHOẢNH KHẮC</span>

        <h2>Đăng nhập</h2>

        <p className="muted">
          Vui lòng đăng nhập để sử dụng hệ thống.
        </p>

        {notice && <div className="notice">{notice}</div>}

        <form onSubmit={handleSubmit}>
          <label>Tên đăng nhập</label>

          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Nhập tên đăng nhập"
            autoComplete="username"
            required
          />

          <label>Mật khẩu</label>

          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Nhập mật khẩu"
            autoComplete="current-password"
            required
          />

          <button
            type="submit"
            className="primary-btn full"
            disabled={busy}
          >
            {busy ? 'Đang đăng nhập...' : 'ĐĂNG NHẬP'}
            <ChevronRight size={18} />
          </button>
        </form>

        <small className="login-foot">
          HỆ THỐNG CHẤM ĐIỂM TRỰC TUYẾN
        </small>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {active && <i />}
    </button>
  );
}

function Gallery({
  entries, search, setSearch, filter, setFilter,
  scores, onOpen, onDelete, onDeleteAll, totalEntries, busy, role
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THƯ VIỆN CUỘC THI</span>
          <h1>Tác phẩm dự thi</h1>
          <p>
            Khám phá những khoảnh khắc đẹp và câu chuyện tri ân của các tác giả.
          </p>
        </div>

        <div className="gallery-heading-actions">
          <div className="heading-stat">
            <b>{totalEntries ?? entries.length}</b>
            <span>Tác phẩm</span>
          </div>
          {role === 'admin' && (
            <button
              type="button"
              className="delete-all-btn"
              onClick={onDeleteAll}
              disabled={busy || !(totalEntries ?? entries.length)}
              title="Xóa toàn bộ bài đăng, ảnh và phiếu chấm của tất cả giám khảo"
            >
              <Trash2 size={16} />
              Xóa toàn bộ bài đăng
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tác giả, đơn vị, tên tác phẩm…"
          />
        </div>

        <div className="filter-tabs">
          <button
            className={filter === 'all' ? 'selected' : ''}
            onClick={() => setFilter('all')}
          >
            Tất cả
          </button>

          {(role === 'judge' || role === 'admin') && (
            <>
              <button
                className={filter === 'todo' ? 'selected' : ''}
                onClick={() => setFilter('todo')}
              >
                Chưa chấm
              </button>

              <button
                className={filter === 'done' ? 'selected' : ''}
                onClick={() => setFilter('done')}
              >
                Đã chấm
              </button>
            </>
          )}
        </div>
      </div>

      {busy ? (
        <div className="empty">
          <RefreshCw className="spin" />
          Đang tải tác phẩm…
        </div>
      ) : entries.length === 0 ? (
        <div className="empty">
          <Images size={36} />
          <b>Chưa có tác phẩm phù hợp</b>
          <span>Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc.</span>
        </div>
      ) : (
        <div className="gallery-grid">
          {entries.map((e, i) => {
            const score = scores.find(s => s.entry_id === e.id);
            const done = score && isComplete(score);

            return (
              <div className="gallery-item" key={e.id}>
                <button
                  type="button"
                  className="art-card"
                  onClick={() => onOpen(e)}
                >
                  <div className="art-image-wrap">
                    <img src={e.image_url} alt={e.title} loading="lazy" />
                    <span className="art-number">
                      #{String(entryNumber(e, i + 1)).padStart(2, '0')}
                    </span>

                    {done && (
                      <span className="done-mark">
                        <CheckCircle2 size={17} />
                        Đã chấm
                      </span>
                    )}
                  </div>

                  <div className="art-card-body">
                    <b>{e.title || 'Chưa đặt tên tác phẩm'}</b>
                    <span>{e.author_name || 'Chưa rõ tác giả'}</span>
                    <small>{e.unit || 'Chưa có đơn vị'}</small>
                  </div>
                </button>

                {role === 'admin' && (
                  <div className="gallery-item-actions">
                    <button
                      type="button"
                      className="delete-entry-btn"
                      onClick={() => onDelete(e)}
                      disabled={busy}
                      aria-label={`Xóa tác phẩm ${e.title || ''}`}
                    >
                      <Trash2 size={15} />
                      Xóa bài đăng
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function EntryModal({
  entry, entries, scores, profile, canJudge,
  onClose, onNavigate, onSaved, setNotice
}) {
  const [showScore, setShowScore] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [values, setValues] = useState(blankScore());
  const [comment, setComment] = useState('');
  const [excluded, setExcluded] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationMessages, setValidationMessages] = useState([]);

  const existing = scores.find(
    s => s.entry_id === entry.id && s.judge_id === profile.id
  );

  useEffect(() => {
    setValues(
      Object.fromEntries(CRITERIA.map(c => [c.key, existing?.[c.key] ?? '']))
    );
    setComment(existing?.comment || '');
    setExcluded(Boolean(existing?.excluded));
    setReason(existing?.exclusion_reason || '');
    setShowScore(false);
    setShowMessage(false);
  }, [entry.id, existing?.id]);

  const total = totalScore(values);
  const allComplete = isComplete(values);

  async function save() {
    const problems = [];
    if (!excluded) {
      const missing = CRITERIA.filter(c =>
        values[c.key] === null || values[c.key] === undefined || String(values[c.key]).trim() === ''
      );
      if (missing.length) {
        problems.push(`Chưa chấm: ${missing.map(c => c.title).join(', ')}.`);
      }

      const invalid = CRITERIA.filter(c => {
        const raw = String(values[c.key]).trim();
        if (!raw) return false;
        const validFormat = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw);
        const score = Number(raw);
        return !validFormat || !Number.isFinite(score) || score < 0;
      });
      if (invalid.length) {
        problems.push(`Điểm phải là số không âm, tối đa 2 chữ số thập phân (ví dụ 10.75): ${invalid.map(c => c.title).join(', ')}.`);
      }

      const overLimit = CRITERIA.filter(c => String(values[c.key]).trim() !== '' && Number(values[c.key]) > c.max);
      if (overLimit.length) {
        problems.push(`Vượt điểm tối đa: ${overLimit.map(c => `${c.title} (tối đa ${c.max} điểm)`).join('; ')}.`);
      }
    }

    if (excluded && !reason.trim()) {
      problems.push('Bạn đã chọn đề nghị loại trừ tác phẩm nhưng chưa ghi lý do.');
    }

    if (problems.length) {
      setValidationMessages(problems);
      return;
    }

    setSaving(true);

    const payload = {
      entry_id: entry.id,
      judge_id: profile.id,
      ...Object.fromEntries(
        CRITERIA.map(c => [
          c.key,
          excluded ? 0 : Number(values[c.key])
        ])
      ),
      comment,
      excluded,
      exclusion_reason: excluded ? reason : null,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('scores')
      .upsert(payload, { onConflict: 'entry_id,judge_id' });

    setSaving(false);

    if (error) {
      setValidationMessages([`Không lưu được phiếu chấm: ${errText(error)}`]);
      return;
    }

    setNotice('Đã lưu phiếu chấm của bạn.');
    setShowScore(false);
    await onSaved();
  }

  const idx = entries.findIndex(e => e.id === entry.id);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="entry-modal">
        <div className="modal-top">
          <span className="eyebrow">
            TÁC PHẨM #{entryNumber(entry, idx + 1)}
          </span>
          <button className="icon-btn" onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="viewer-layout">
          <div className="viewer-image">
            <img src={entry.image_url} alt={entry.title} />

            <div className="image-nav">
              <button onClick={() => onNavigate(-1)} disabled={idx <= 0}>
                <ChevronLeft /> Ảnh trước
              </button>

              <button
                onClick={() => onNavigate(1)}
                disabled={idx >= entries.length - 1}
              >
                Ảnh tiếp theo <ChevronRight />
              </button>
            </div>
          </div>

          <div className="viewer-info">
            <span className="eyebrow">THÔNG TIN TÁC PHẨM</span>
            <h2>{entry.title}</h2>

            <div className="info-row">
              <small>Tác giả</small>
              <b>{entry.author_name || '—'}</b>
            </div>

            <div className="info-row">
              <small>Đơn vị</small>
              <b>{entry.unit || '—'}</b>
            </div>

            <div className="viewer-actions">
              <button
                className="secondary-btn"
                onClick={() => setShowMessage(!showMessage)}
              >
                <MessageSquareText size={17} />
                {showMessage ? 'Ẩn thông điệp' : 'Xem thông điệp'}
              </button>

              {canJudge && (
                <button
                  className="primary-btn"
                  onClick={() => setShowScore(!showScore)}
                >
                  <ClipboardCheck size={17} />
                  {showScore ? 'Đóng phiếu chấm' : 'Chấm điểm'}
                </button>
              )}
            </div>

            {showMessage && (
              <div className="message-panel">
                <b>Thông điệp của tác phẩm</b>
                <p>{entry.message || 'Tác phẩm chưa có thông điệp.'}</p>
              </div>
            )}

            {showScore && canJudge && (
              <div className="score-panel">
                <div className="score-panel-head">
                  <div>
                    <b>Phiếu chấm của bạn</b>
                    <small>Chấm độc lập · Thang điểm 100</small>
                  </div>

                  <strong>
                    {fmt(total)}
                    <small>/100</small>
                  </strong>
                </div>

                <p className="score-decimal-warning" role="note">
                  LƯU Ý: BGK được nhập điểm thập phân tối đa 2 chữ số, ví dụ 10.75 hoặc 9.5. Vui lòng không nhập vượt điểm tối đa của từng tiêu chí.
                </p>

                {CRITERIA.map(c => (
                  <div className="criterion" key={c.key}>
                    <div>
                      <b>{c.title}</b>
                      <small>{c.description}</small>
                    </div>

                    <div className="score-input">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`${c.title}, tối đa ${c.max} điểm; được nhập tối đa 2 chữ số thập phân`}
                        value={values[c.key]}
                        onChange={e =>
                          setValues(v => ({
                            ...v,
                            [c.key]: e.target.value
                          }))
                        }
                        placeholder="0"
                      />
                      <small>/{c.max}</small>
                    </div>
                  </div>
                ))}

                <label className="field-label">
                  Nhận xét của giám khảo
                </label>

                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows="3"
                  placeholder="Nhập nhận xét (không bắt buộc)…"
                />

                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={excluded}
                    onChange={e => setExcluded(e.target.checked)}
                  />
                  Đề nghị loại trừ tác phẩm (điểm 0)
                </label>

                {excluded && (
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Ghi rõ lý do loại trừ…"
                    rows="2"
                  />
                )}

                <button
                  className="primary-btn full"
                  onClick={save}
                  disabled={saving}
                >
                  <Save size={17} />
                  {saving ? 'Đang lưu…' : 'Lưu phiếu chấm'}
                </button>

                {existing && (
                  <small className="muted">
                    Bạn đã chấm tác phẩm này. Lưu lại sẽ cập nhật phiếu của chính bạn.
                  </small>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {validationMessages.length > 0 && (
        <div className="validation-dialog-backdrop" role="presentation">
          <section className="validation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="validation-dialog-title">
            <div className="validation-dialog-icon"><AlertTriangle size={26} /></div>
            <h3 id="validation-dialog-title">Chưa thể lưu phiếu chấm</h3>
            <p>Vui lòng kiểm tra và điều chỉnh các nội dung sau:</p>
            <ul>
              {validationMessages.map((message, index) => <li key={index}>{message}</li>)}
            </ul>
            <button className="primary-btn full" onClick={() => setValidationMessages([])}>Đóng và kiểm tra lại</button>
          </section>
        </div>
      )}
    </div>
  );
}

function QuickDrawer({ open, close, profile, scores, entries }) {
  if (!open) return null;

  return (
    <div className="quick-drawer-wrap">
      <div className="quick-drawer-scrim" onClick={close} />

      <aside className="quick-drawer">
        <div className="drawer-head">
          <div>
            <span className="eyebrow">TÀI KHOẢN</span>
            <h3>{profile.full_name || profile.email}</h3>
            <small>{roleLabel(profile.role)}</small>
          </div>

          <button className="icon-btn" onClick={close}>
            <X />
          </button>
        </div>

        <div className="drawer-stats">
          <div>
            <b>{scores.length}</b>
            <small>Phiếu đã lưu</small>
          </div>

          <div>
            <b>{scores.filter(isComplete).length}</b>
            <small>Đã chấm đủ</small>
          </div>

          <div>
            <b>{fmt(scores.reduce((s, x) => s + totalScore(x), 0))}</b>
            <small>Tổng điểm</small>
          </div>
        </div>

        <h4>Điểm các tác phẩm đã chấm</h4>

        <div className="drawer-list">
          {scores.map(s => {
            const e = entries.find(x => x.id === s.entry_id);

            return (
              <div className="drawer-score" key={s.id}>
                <div>
                  <b>{e?.title || 'Tác phẩm'}</b>
                  <small>{e?.author_name || ''}</small>
                </div>
                <strong>{fmt(totalScore(s))}</strong>
              </div>
            );
          })}

          {!scores.length && (
            <p className="muted">Bạn chưa lưu phiếu chấm nào.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function MyScores({ entries, scores, onOpen }) {
  const rows = scores
    .map(s => ({
      ...s,
      entry: entries.find(e => e.id === s.entry_id)
    }))
    .filter(x => x.entry);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CÁ NHÂN</span>
          <h1>Phiếu chấm của tôi</h1>
          <p>Danh sách tác phẩm và điểm số do bạn đánh giá.</p>
        </div>

        <div className="heading-stat">
          <b>{rows.length}</b>
          <span>Phiếu đã lưu</span>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tác phẩm</th>
              <th>Tác giả</th>
              <th>Trạng thái</th>
              <th>Điểm</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td><b>{r.entry.title}</b></td>
                <td>{r.entry.author_name}</td>
                <td>
                  <span className="status-pill">
                    {isComplete(r) ? 'Đã chấm đủ' : 'Chưa hoàn tất'}
                  </span>
                </td>
                <td><b>{fmt(totalScore(r))}/100</b></td>
                <td>
                  <button
                    className="text-btn"
                    onClick={() => onOpen(r.entry)}
                  >
                    Xem / sửa điểm
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!rows.length && (
          <div className="empty">Chưa có phiếu chấm.</div>
        )}
      </div>
    </>
  );
}

function Reports({ entries, scores }) {
  // Gán mã GK ổn định theo judge_id để cùng một giám khảo luôn là GK1/GK2...
  const judgeIds = [...new Set(scores.map(s => s.judge_id).filter(Boolean))].sort();
  const judgeLabel = Object.fromEntries(judgeIds.map((id, index) => [id, `GK${index + 1}`]));

  const rows = entries.map(entry => {
    const allScores = scores.filter(score => score.entry_id === entry.id);
    const validScores = allScores.filter(score => isComplete(score) || score.excluded);
    const average = validScores.length
      ? validScores.reduce((sum, score) => sum + (score.excluded ? 0 : totalScore(score)), 0) / validScores.length
      : null;

    const criterionAverages = Object.fromEntries(CRITERIA.map(criterion => {
      const values = validScores.map(score => score.excluded ? 0 : Number(score[criterion.key]) || 0);
      return [criterion.key, values.length ? values.reduce((a, b) => a + b, 0) / values.length : null];
    }));

    const scoreByJudge = Object.fromEntries(validScores.map(score => [score.judge_id, score]));
    return {
      entry,
      judged: validScores.length,
      average,
      criterionAverages,
      scoreByJudge,
      validScores
    };
  }).sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  const judgedEntries = rows.filter(row => row.judged).length;

  function scoreValue(score, key) {
    if (!score) return '';
    if (score.excluded) return 0;
    const value = score[key];
    return value === null || value === undefined || value === '' ? '' : Number(value);
  }

  function exportExcel() {
    // Sheet 1: tổng hợp theo tác phẩm, có tổng điểm của từng GK và TB từng tiêu chí.
    const summaryData = rows.map((row, index) => {
      const output = {
        'Xếp hạng': row.judged ? index + 1 : '',
        'STT': row.entry.source_stt ?? row.entry.entry_no,
        'Tên tác phẩm': row.entry.title,
        'Tác giả': row.entry.author_name,
        'Đơn vị': row.entry.unit,
        'Số giám khảo đã chấm': row.judged
      };

      judgeIds.forEach(id => {
        const score = row.scoreByJudge[id];
        output[`${judgeLabel[id]} - Tổng điểm (/100)`] = score ? (score.excluded ? 0 : totalScore(score)) : '';
      });

      CRITERIA.forEach(criterion => {
        const value = row.criterionAverages[criterion.key];
        output[`TB ${criterion.title} (/${criterion.max})`] = value === null ? '' : Number(value.toFixed(2));
      });
      output['Tổng điểm trung bình (/100)'] = row.average === null ? '' : Number(row.average.toFixed(2));
      return output;
    });

    // Sheet 2: chi tiết từng tiêu chí của từng tác phẩm, từng GK.
    const detailData = [];
    rows.forEach(row => {
      CRITERIA.forEach(criterion => {
        const output = {
          'STT': row.entry.source_stt ?? row.entry.entry_no,
          'Tên tác phẩm': row.entry.title,
          'Tác giả': row.entry.author_name,
          'Tiêu chí': criterion.title,
          'Điểm tối đa': criterion.max
        };
        judgeIds.forEach(id => {
          output[judgeLabel[id]] = scoreValue(row.scoreByJudge[id], criterion.key);
        });
        const avg = row.criterionAverages[criterion.key];
        output['Điểm trung bình tiêu chí'] = avg === null ? '' : Number(avg.toFixed(2));
        detailData.push(output);
      });

      const totalRow = {
        'STT': row.entry.source_stt ?? row.entry.entry_no,
        'Tên tác phẩm': row.entry.title,
        'Tác giả': row.entry.author_name,
        'Tiêu chí': 'TỔNG ĐIỂM',
        'Điểm tối đa': 100
      };
      judgeIds.forEach(id => {
        const score = row.scoreByJudge[id];
        totalRow[judgeLabel[id]] = score ? (score.excluded ? 0 : totalScore(score)) : '';
      });
      totalRow['Điểm trung bình tiêu chí'] = row.average === null ? '' : Number(row.average.toFixed(2));
      detailData.push(totalRow);
    });

    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    const detailSheet = XLSX.utils.json_to_sheet(detailData);
    summarySheet['!cols'] = Object.keys(summaryData[0] || {}).map(key => ({ wch: Math.min(Math.max(key.length + 3, 14), 34) }));
    detailSheet['!cols'] = Object.keys(detailData[0] || {}).map(key => ({ wch: Math.min(Math.max(key.length + 3, 14), 30) }));
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Tong hop');
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Chi tiet diem');
    XLSX.writeFile(workbook, 'Bao-cao-chi-tiet-cuoc-thi-anh.xlsx');
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THỐNG KÊ & KẾT QUẢ</span>
          <h1>Báo cáo tổng hợp</h1>
          <p>Hiển thị điểm từng giám khảo, điểm trung bình từng tiêu chí và tổng điểm trung bình của tác phẩm.</p>
        </div>
        <button className="primary-btn" onClick={exportExcel}>
          <FileSpreadsheet size={17} />
          Xuất Excel chi tiết
        </button>
      </div>

      <div className="report-cards">
        <div className="report-card"><span>Tổng tác phẩm</span><b>{entries.length}</b></div>
        <div className="report-card"><span>Đã có điểm</span><b>{judgedEntries}</b></div>
        <div className="report-card"><span>Chưa có điểm</span><b>{entries.length - judgedEntries}</b></div>
        <div className="report-card"><span>Số giám khảo</span><b>{judgeIds.length}</b></div>
      </div>

      <div className="section-head">
        <h2>Bảng xếp hạng và tổng điểm từng giám khảo</h2>
        <span>Điểm tối đa 100</span>
      </div>
      <div className="table-wrap report-table-wrap report-desktop-only">
        <table className="report-table">
          <thead>
            <tr>
              <th>Hạng</th><th>Tác phẩm</th><th>Tác giả</th><th>Đơn vị</th>
              {judgeIds.map(id => <th key={id}>{judgeLabel[id]}<br />Tổng điểm</th>)}
              <th>Số GK</th><th>Tổng điểm TB</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.entry.id}>
                <td>{row.judged ? `#${index + 1}` : '—'}</td>
                <td><b>{row.entry.title}</b></td>
                <td>{row.entry.author_name}</td>
                <td>{row.entry.unit}</td>
                {judgeIds.map(id => {
                  const score = row.scoreByJudge[id];
                  return <td key={id} className="score-cell">{score ? fmt(score.excluded ? 0 : totalScore(score)) : '—'}</td>;
                })}
                <td>{row.judged}</td>
                <td><strong>{row.average === null ? '—' : fmt(row.average)}</strong></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={judgeIds.length + 6}>Chưa có tác phẩm.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="report-mobile-list">
        {rows.map((row, index) => (
          <article className="report-mobile-card" key={row.entry.id}>
            <div className="report-mobile-card-top">
              <span className="eyebrow">TÁC PHẨM #{entryNumber(row.entry, index + 1)}</span>
              <strong>{row.average === null ? '—' : fmt(row.average)}<small>/100</small></strong>
            </div>
            <h3>{row.entry.title}</h3>
            <p>{row.entry.author_name} · {row.entry.unit || 'Chưa có đơn vị'}</p>
            <div className="report-mobile-judge-grid">
              {judgeIds.map(id => {
                const score = row.scoreByJudge[id];
                return (
                  <div className="report-mobile-judge" key={id}>
                    <small>{judgeLabel[id]}</small>
                    <b>{score ? fmt(score.excluded ? 0 : totalScore(score)) : '—'}</b>
                    <span>/100</span>
                  </div>
                );
              })}
              {!judgeIds.length && <span className="muted">Chưa có giám khảo chấm.</span>}
            </div>
            <div className="report-mobile-card-foot">
              <span>{row.judged}/{judgeIds.length} giám khảo đã chấm</span>
              <b>{row.average === null ? 'Chưa có điểm' : `Trung bình: ${fmt(row.average)}/100`}</b>
            </div>
          </article>
        ))}
      </div>

      <div className="section-head report-detail-heading">
        <h2>Chi tiết điểm theo từng tiêu chí</h2>
        <span>Điểm từng GK và điểm trung bình / điểm tối đa</span>
      </div>

      <div className="report-details">
        {rows.map((row, index) => (
          <section className="report-detail-card" key={row.entry.id}>
            <div className="report-detail-title">
              <div>
                <span className="eyebrow">TÁC PHẨM #{entryNumber(row.entry, index + 1)}</span>
                <h3>{row.entry.title}</h3>
                <p>{row.entry.author_name} · {row.entry.unit || 'Chưa có đơn vị'}</p>
              </div>
              <div className="report-average">
                <small>ĐIỂM TRUNG BÌNH</small>
                <b>{row.average === null ? '—' : fmt(row.average)}<span>/100</span></b>
              </div>
            </div>

            <div className="table-wrap report-detail-table-wrap report-desktop-only">
              <table className="report-detail-table">
                <thead>
                  <tr>
                    <th>Tiêu chí chấm</th><th>Điểm tối đa</th>
                    {judgeIds.map(id => <th key={id}>{judgeLabel[id]}</th>)}
                    <th>Điểm TB</th>
                  </tr>
                </thead>
                <tbody>
                  {CRITERIA.map(criterion => {
                    const average = row.criterionAverages[criterion.key];
                    return (
                      <tr key={criterion.key}>
                        <td><b>{criterion.title}</b></td>
                        <td>/{criterion.max}</td>
                        {judgeIds.map(id => (
                          <td key={id} className="score-cell">{scoreValue(row.scoreByJudge[id], criterion.key) === '' ? '—' : fmt(scoreValue(row.scoreByJudge[id], criterion.key))}</td>
                        ))}
                        <td><strong>{average === null ? '—' : fmt(average)}</strong> <small>/{criterion.max}</small></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td><b>TỔNG ĐIỂM</b></td><td>/100</td>
                    {judgeIds.map(id => {
                      const score = row.scoreByJudge[id];
                      return <td key={id}><b>{score ? fmt(score.excluded ? 0 : totalScore(score)) : '—'}</b></td>;
                    })}
                    <td><b>{row.average === null ? '—' : fmt(row.average)}</b> /100</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="report-mobile-criteria">
              {CRITERIA.map(criterion => {
                const average = row.criterionAverages[criterion.key];
                return (
                  <div className="report-mobile-criterion" key={criterion.key}>
                    <div className="report-mobile-criterion-head">
                      <b>{criterion.title}</b>
                      <span>Tối đa {criterion.max} điểm</span>
                    </div>
                    <div className="report-mobile-judge-grid compact">
                      {judgeIds.map(id => {
                        const value = scoreValue(row.scoreByJudge[id], criterion.key);
                        return (
                          <div className="report-mobile-judge" key={id}>
                            <small>{judgeLabel[id]}</small>
                            <b>{value === '' ? '—' : fmt(value)}</b>
                          </div>
                        );
                      })}
                      {!judgeIds.length && <span className="muted">Chưa có điểm.</span>}
                    </div>
                    <div className="report-mobile-criterion-average">
                      <span>Điểm trung bình</span>
                      <b>{average === null ? '—' : fmt(average)}<small>/{criterion.max}</small></b>
                    </div>
                  </div>
                );
              })}
              <div className="report-mobile-total">
                <div><span>TỔNG ĐIỂM TỪNG GIÁM KHẢO</span></div>
                <div className="report-mobile-judge-grid compact">
                  {judgeIds.map(id => {
                    const score = row.scoreByJudge[id];
                    return (
                      <div className="report-mobile-judge" key={id}>
                        <small>{judgeLabel[id]}</small>
                        <b>{score ? fmt(score.excluded ? 0 : totalScore(score)) : '—'}</b>
                        <span>/100</span>
                      </div>
                    );
                  })}
                </div>
                <div className="report-mobile-total-average">
                  <span>Tổng điểm trung bình tác phẩm</span>
                  <b>{row.average === null ? '—' : fmt(row.average)}<small>/100</small></b>
                </div>
              </div>
            </div>
            {!row.judged && <p className="muted report-no-score">Tác phẩm chưa có phiếu chấm hợp lệ.</p>}
          </section>
        ))}
      </div>

      <p className="report-note">
        <AlertTriangle size={15} />
        GK1, GK2, GK3… được gán cố định theo mã tài khoản giám khảo. Điểm trung bình chỉ tính trên các phiếu đã hoàn tất hoặc được đề nghị loại trừ; phiếu loại trừ được tính 0 điểm.
      </p>
    </>
  );
}

function UploadPage({ onDone }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  const pairs = useMemo(() => pairUploads(files), [files]);

  async function uploadAll() {
    if (!pairs.length) {
      onDone('Vui lòng chọn ảnh và file TXT.');
      return;
    }

    const unmatched = pairs.filter(p => !p.matched);

    if (unmatched.length) {
      onDone(
        'Có ảnh chưa tìm thấy file TXT trùng tên: ' +
        unmatched.map(p => p.image.name).join(', ')
      );
      return;
    }

    const invalid = pairs.find(
      p => p.image.size > 2 * 1024 * 1024 ||
        !p.image.type.startsWith('image/')
    );

    if (invalid) {
      onDone(
        `Ảnh ${invalid.image.name} vượt quá 2 MB hoặc không đúng định dạng ảnh.`
      );
      return;
    }

    setBusy(true);

    try {
      for (let i = 0; i < pairs.length; i++) {
        const { image, txt } = pairs[i];

        setProgress(`Đang tải ${i + 1}/${pairs.length}: ${image.name}`);

        const parsed = parseEntryTxt(await txt.text());

        if (!parsed.author_name || !parsed.title) {
          throw new Error(
            `Không đọc đủ Họ tên tác giả hoặc Tên tác phẩm trong ${txt.name}`
          );
        }

        const ext = image.name.split('.').pop().toLowerCase();
        const path = `${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, image, {
            contentType: image.type,
            upsert: false
          });

        if (upErr) throw upErr;

        const { error: dbErr } = await supabase
          .from('entries')
          .insert({
            ...parsed,
            image_path: path,
            image_url: '',
            original_filename: image.name
          });

        if (dbErr) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw dbErr;
        }
      }

      setFiles([]);
      onDone(`Đã đăng thành công ${pairs.length} tác phẩm.`);
    } catch (e) {
      onDone('Lỗi tải bài: ' + errText(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">QUẢN TRỊ NỘI DUNG</span>
          <h1>Đăng bài dự thi</h1>
          <p>
            Tải ảnh và file TXT cùng tên để hệ thống tự đọc thông tin tác phẩm.
          </p>
        </div>
      </div>

      <div className="upload-layout">
        <div className="upload-card">
          <div className="upload-icon">
            <Upload size={26} />
          </div>

          <h2>Tải ảnh và thông tin tác phẩm</h2>

          <p>
            Chọn nhiều ảnh và các file TXT tương ứng. Ví dụ:
            <b> Bui Anh Lan.png</b> và <b>Bui Anh Lan.txt</b>.
          </p>

          <label className="drop-zone">
            <input
              type="file"
              multiple
              accept="image/*,.txt,text/plain"
              onChange={e => setFiles(Array.from(e.target.files || []))}
            />
            <ImagePlus size={30} />
            <b>Nhấn để chọn tệp</b>
            <span>
              Ảnh JPG, PNG, WEBP… · Tối đa 2 MB mỗi ảnh ·
              TXT không giới hạn theo cấu hình ứng dụng
            </span>
          </label>

          <button
            className="primary-btn full"
            disabled={busy || !pairs.length}
            onClick={uploadAll}
          >
            <Upload size={17} />
            {busy ? 'Đang tải lên…' : `Đăng ${pairs.length} tác phẩm`}
          </button>

          {progress && <p className="muted">{progress}</p>}
        </div>

        <div className="upload-check">
          <h3>Kiểm tra tệp đã chọn</h3>

          {pairs.length === 0 ? (
            <p className="muted">Chưa chọn tệp nào.</p>
          ) : (
            pairs.map(p => (
              <div className="file-pair" key={p.image.name}>
                <div>
                  <b>{p.image.name}</b>
                  <small>
                    {(p.image.size / 1024 / 1024).toFixed(2)} MB ·
                    {' '}{p.txt?.name || 'Thiếu file TXT'}
                  </small>
                </div>

                {p.matched
                  ? <CheckCircle2 className="green" />
                  : <AlertTriangle className="red" />}
              </div>
            ))
          )}

          <div className="tip-box">
            Tên ảnh và TXT cần giống nhau, chỉ khác phần đuôi.
            Ảnh quá 2 MB sẽ bị từ chối, không tự động nén để tránh
            thay đổi chất lượng ảnh gốc.
          </div>
        </div>
      </div>
    </>
  );
}

// Quản lý tài khoản và reset toàn bộ điểm của từng giám khảo.
// Chỉ tài khoản Admin mới mở được trang này; thao tác xóa được RLS kiểm soát ở Supabase.
function UsersPage({ onScoresReset }) {
  const [list, setList] = useState([]);
  const [scoreCounts, setScoreCounts] = useState({});
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('judge');
  const [busy, setBusy] = useState(false);
  const [resettingJudgeId, setResettingJudgeId] = useState(null);
  const [msg, setMsg] = useState('');

  async function load() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,full_name,username,role,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      setMsg(error.message);
      return;
    }

    const accounts = data || [];
    setList(accounts);

    // Đếm chính xác ở phía Supabase, tránh giới hạn số dòng trả về khi có nhiều tác phẩm.
    const judges = accounts.filter(account => account.role === 'judge');
    const countResults = await Promise.all(judges.map(async judge => {
      const result = await supabase
        .from('scores')
        .select('id', { count: 'exact', head: true })
        .eq('judge_id', judge.id);
      return { id: judge.id, count: result.count, error: result.error };
    }));

    const nextCounts = {};
    const failedCounts = [];
    countResults.forEach(result => {
      nextCounts[result.id] = result.error ? null : (result.count ?? 0);
      if (result.error) failedCounts.push(result.error.message);
    });
    setScoreCounts(nextCounts);
    if (failedCounts.length) {
      setMsg('Không đọc được số phiếu của một số giám khảo: ' + failedCounts[0]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();

    setBusy(true);
    setMsg('');

    const { data, error } = await supabase.functions.invoke(
      'admin-create-user',
      {
        body: {
          action: 'create',
          username: username.trim().toLowerCase(),
          password,
          full_name: name.trim(),
          role
        }
      }
    );

    setBusy(false);

    if (error || data?.error) {
      setMsg(error?.message || data?.error || 'Không tạo được tài khoản.');
      return;
    }

    setName('');
    setUsername('');
    setPassword('');
    setRole('judge');
    setMsg('Đã tạo tài khoản thành công.');

    await load();
  }

  async function resetJudgeScores(judge) {
    if (!judge || judge.role !== 'judge') return;

    const scoreCount = scoreCounts[judge.id];
    if (!Number.isFinite(scoreCount)) {
      setMsg('Chưa đọc được số phiếu của giám khảo này. Vui lòng tải lại danh sách trước khi reset.');
      return;
    }
    if (scoreCount === 0) {
      setMsg('Giám khảo này chưa có phiếu chấm nào để reset.');
      return;
    }

    const judgeName = judge.full_name || judge.username || 'giám khảo';
    const confirmed = window.confirm(
      `RESET ĐIỂM CỦA ${judgeName.toLocaleUpperCase('vi')}?\n\n` +
      `Hệ thống sẽ xóa toàn bộ ${scoreCount} phiếu chấm của riêng giám khảo này trên tất cả tác phẩm.\n\n` +
      'Giám khảo có thể đăng nhập và chấm lại từ đầu. Điểm của các giám khảo khác và tác phẩm dự thi vẫn được giữ nguyên.\n\n' +
      'Thao tác này không thể hoàn tác. Bạn có chắc chắn muốn tiếp tục?'
    );
    if (!confirmed) return;

    setResettingJudgeId(judge.id);
    setMsg('');
    try {
      const { count, error } = await supabase
        .from('scores')
        .delete({ count: 'exact' })
        .eq('judge_id', judge.id);

      if (error) throw error;

      const removed = Number.isFinite(count) ? count : scoreCount;
      setMsg(`Đã reset thành công ${removed} phiếu chấm của ${judgeName}. Giám khảo có thể bắt đầu chấm lại từ đầu.`);

      // Đồng bộ số liệu trên báo cáo và danh sách phiếu chấm của toàn ứng dụng.
      if (typeof onScoresReset === 'function') await onScoresReset();
      await load();
    } catch (error) {
      setMsg('Không reset được điểm: ' + errText(error) + ' Hãy kiểm tra chính sách DELETE của bảng scores trong Supabase.');
    } finally {
      setResettingJudgeId(null);
    }
  }

  const renderResetAction = account => {
    if (account.role !== 'judge') {
      return <span className="muted">Không áp dụng</span>;
    }

    const count = scoreCounts[account.id];
    const resetting = resettingJudgeId === account.id;
    return (
      <button
        type="button"
        className="reset-score-btn"
        onClick={() => resetJudgeScores(account)}
        disabled={resetting || !Number.isFinite(count) || count === 0}
        title={count === 0 ? 'Giám khảo chưa có điểm để reset' : 'Xóa toàn bộ điểm của riêng giám khảo này'}
      >
        <RefreshCw size={14} />
        {resetting ? 'Đang reset…' : 'Reset điểm'}
      </button>
    );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">QUẢN TRỊ HỆ THỐNG</span>
          <h1>Quản lý tài khoản</h1>
          <p>Tạo tài khoản Ban Giám khảo, người xem báo cáo và quản lý phiếu chấm.</p>
        </div>
      </div>

      <div className="users-layout">
        <form className="form-card" onSubmit={create}>
          <h2>Tạo tài khoản mới</h2>

          <label>Họ và tên</label>
          <input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nhập họ và tên"
          />

          <label>Tên người dùng</label>
          <input
            required
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9._-]+"
            title="Dùng 3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang."
            value={username}
            onChange={e => setUsername(e.target.value.toLowerCase())}
            placeholder="Ví dụ: nguyenvana"
          />

          <label>Mật khẩu tạm thời</label>
          <input
            type="password"
            minLength={8}
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Tối thiểu 8 ký tự"
          />

          <label>Phân quyền</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
          >
            <option value="judge">Ban Giám khảo – được chấm điểm</option>
            <option value="reporter">Người báo cáo – chỉ xem</option>
            <option value="admin">Quản trị viên</option>
          </select>

          <button className="primary-btn full" disabled={busy}>
            {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
          </button>

          {msg && <p className="muted users-message" role="status">{msg}</p>}
        </form>

        <div className="users-right-stack">
          <div className="reset-score-notice">
            <AlertTriangle size={18} />
            <div>
              <b>Reset điểm giám khảo</b>
              <p>Chọn “Reset điểm” ở đúng tài khoản để xóa tất cả phiếu chấm của riêng giám khảo đó trên mọi tác phẩm. Các giám khảo khác không bị ảnh hưởng.</p>
            </div>
          </div>

          <div className="table-wrap users-desktop-list">
            <h2 className="table-title">Tài khoản hiện có</h2>
            <table>
              <thead>
                <tr>
                  <th>Họ tên</th>
                  <th>Tên đăng nhập</th>
                  <th>Vai trò</th>
                  <th>Số phiếu đã chấm</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {list.map(account => (
                  <tr key={account.id}>
                    <td><b>{account.full_name || '—'}</b></td>
                    <td>{account.username || '—'}</td>
                    <td><span className="status-pill">{roleLabel(account.role)}</span></td>
                    <td>{account.role === 'judge' ? (Number.isFinite(scoreCounts[account.id]) ? scoreCounts[account.id] : '—') : '—'}</td>
                    <td>{renderResetAction(account)}</td>
                  </tr>
                ))}
                {!list.length && <tr><td colSpan="5">Chưa có tài khoản.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="users-mobile-list">
            <h2>Tài khoản hiện có</h2>
            {list.map(account => (
              <div className="user-account-card" key={account.id}>
                <div className="user-account-head">
                  <div>
                    <b>{account.full_name || 'Chưa cập nhật họ tên'}</b>
                    <small>{account.username || '—'}</small>
                  </div>
                  <span className="status-pill">{roleLabel(account.role)}</span>
                </div>
                {account.role === 'judge' && (
                  <div className="user-account-score-count">
                    <span>Số phiếu đã chấm</span>
                    <b>{Number.isFinite(scoreCounts[account.id]) ? scoreCounts[account.id] : '—'}</b>
                  </div>
                )}
                {renderResetAction(account)}
              </div>
            ))}
            {!list.length && <div className="empty">Chưa có tài khoản.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
