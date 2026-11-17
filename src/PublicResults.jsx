import React, { useEffect, useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronUp, Trophy, Medal, Award, Users, Camera, Heart, MessageCircle, Share2, ArrowUpRight, Sparkles } from 'lucide-react';
import resultData from './ket-qua-data.json';
import './public-results.css';
import { supabase } from './lib/supabase';

const fmt = (n, digits = 2) => Number(n || 0).toLocaleString('vi-VN', { maximumFractionDigits: digits });
const awardClass = award => award.includes('Nhất') ? 'first' : award.includes('Nhì') ? 'second' : award.includes('Ba') ? 'third' : award.includes('Khuyến') ? 'encourage' : 'participate';

function ScoreBar({ label, score, max }) {
  const pct = Math.max(0, Math.min(100, (Number(score || 0) / max) * 100));
  return <div className="pub-criterion">
    <div className="pub-criterion-line"><span>{label}</span><b>{fmt(score)} <small>/ {max}</small></b></div>
    <div className="pub-track"><i style={{ width: `${pct}%` }} /></div>
  </div>;
}

function ResultCard({ item, expanded, onToggle }) {
  const winner = item.award.includes('Giải') && !item.award.includes('phụ');
  return <article className={`pub-result-card ${winner ? 'pub-winner' : ''}`}>
    <button className="pub-card-main" onClick={onToggle} aria-expanded={expanded}>
      <div className="pub-card-topline">
        <span className="pub-rank">#{item.rank}</span>
        <span className={`pub-award ${awardClass(item.award)}`}>{item.award}</span>
        <strong className="pub-final-score">{fmt(item.finalScore)}<small> điểm</small></strong>
      </div>
      <h3 className="pub-author-name">{item.author}</h3>
      <p className="pub-work-title">{item.title}</p>
      <p className="pub-unit">{item.unit}</p>
      <div className="pub-card-bottom">
        <span>Mã bài thi: {item.sourceNo}</span>
        <span className="pub-detail-link">{expanded ? 'Thu gọn' : 'Xem điểm chi tiết'} {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</span>
      </div>
    </button>
    {expanded && <div className="pub-expanded">
      <div className="pub-score-section">
        <div className="pub-section-title"><span>01</span><div><b>Điểm tổng hợp</b><small>Điểm chung cuộc được tính theo bảng kết quả chính thức</small></div></div>
        <div className="pub-breakdown">
          <div><small>Fanpage quy đổi</small><b>{fmt(item.fanpageScore)}</b><em>/ 100</em></div>
          <div><small>Trung bình BGK</small><b>{fmt(item.judgeAverage)}</b><em>/ 100</em></div>
          <div><small>Điểm Follows</small><b>{fmt(item.followsScore)}</b><em>điểm</em></div>
        </div>
        <div className="pub-formula">({fmt(item.fanpageScore)} + {fmt(item.judgeAverage)} + {fmt(item.followsScore)}) ÷ 2 = <b>{fmt(item.finalScore)}</b></div>
      </div>
      <div className="pub-score-section">
        <div className="pub-section-title"><span>02</span><div><b>Điểm Ban Giám khảo</b><small>Điểm của từng giám khảo và điểm trung bình 5 tiêu chí</small></div></div>
        <div className="pub-judge-row">{item.judgeScores.map((score, i) => <div key={i}><small>Giám khảo {i + 1}</small><b>{fmt(score)}</b></div>)}</div>
        <div className="pub-criteria">{item.criteria.map((c, i) => <ScoreBar key={i} label={c.name} score={c.score} max={c.max}/>)}</div>
      </div>
      <div className="pub-score-section">
        <div className="pub-section-title"><span>03</span><div><b>Đối soát tương tác Fanpage</b><small>Công khai số liệu ghi nhận, số lượng bị loại/điều chỉnh và số lượng được duyệt</small></div></div>
        <div className="pub-audit-summary">
          <div className="pub-audit-total"><small>Tổng điểm tương tác ghi nhận</small><b>{fmt(item.fanpageAudit.interactionPointsActual,0)}</b><span>Like + Bình luận + Chia sẻ × 2</span></div>
          <div className="pub-audit-total pub-audit-deduct"><small>Chênh lệch đối soát</small><b>{fmt(item.fanpageAudit.interactionPointsDeducted,0)}</b><span>Số ghi nhận − số được duyệt</span></div>
          <div className="pub-audit-total pub-audit-approved"><small>Tổng điểm tương tác được duyệt</small><b>{fmt(item.fanpageAudit.interactionPointsApproved,0)}</b><span>Căn cứ quy đổi điểm Fanpage</span></div>
        </div>
        <div className="pub-audit-table">
          <div className="pub-audit-head"><span>Loại tương tác</span><span>Ghi nhận</span><span>Bị trừ*</span><span>Được duyệt</span></div>
          <div className="pub-audit-row"><span><Heart size={15}/> Like</span><b>{fmt(item.fanpageAudit.likesActual,0)}</b><b>{fmt(item.fanpageAudit.likesDeducted,0)}</b><b>{fmt(item.fanpageAudit.likesApproved,0)}</b></div>
          <div className="pub-audit-row"><span><MessageCircle size={15}/> Bình luận</span><b>{fmt(item.fanpageAudit.commentsActual,0)}</b><b>{fmt(item.fanpageAudit.commentsDeducted,0)}</b><b>{fmt(item.fanpageAudit.commentsApproved,0)}</b></div>
          <div className="pub-audit-row"><span><Share2 size={15}/> Chia sẻ</span><b>{fmt(item.fanpageAudit.sharesActual,0)}</b><b>{fmt(item.fanpageAudit.sharesDeducted,0)}</b><b>{fmt(item.fanpageAudit.sharesApproved,0)}</b></div>
        </div>
        <div className="pub-audit-explain"><b>* Cách hiểu số liệu:</b> Số bị trừ là chênh lệch giữa dữ liệu thực tế Meta ghi nhận và số lượng được Ban tổ chức duyệt. Số âm (nếu có) thể hiện lượt duyệt bổ sung thủ công nhiều hơn số API ghi nhận tại thời điểm đối soát. Điểm tương tác có trọng số: Like = 1 điểm, Bình luận = 1 điểm, Chia sẻ = 2 điểm.</div>
      </div>
      <div className="pub-note">Điểm chi tiết được công bố theo bảng tổng hợp kết quả chung cuộc do Ban tổ chức cung cấp.</div>
    </div>}
  </article>;
}

export default function PublicResults() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [sort, setSort] = useState('rank');
  const [winnerImages, setWinnerImages] = useState({});
  const [previewImage, setPreviewImage] = useState(null);
  useEffect(() => {
    let active = true;
    async function loadWinnerImages() {
      if (!supabase) return;
      const { data, error } = await supabase.from('winner_gallery').select('entry_source_no,image_path');
      if (!active || error) return;
      setWinnerImages(Object.fromEntries((data || []).map(row => [String(row.entry_source_no), supabase.storage.from('contest-winners').getPublicUrl(row.image_path).data.publicUrl])));
    }
    loadWinnerImages();
    return () => { active = false; };
  }, []);
  const awards = useMemo(() => [...new Set(resultData.map(x => x.award))], []);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('vi');
    return resultData.filter(x => {
      const matches = !q || [x.author,x.title,x.unit,String(x.sourceNo)].some(v => String(v || '').toLocaleLowerCase('vi').includes(q));
      const byAward = filter === 'all' || (filter === 'prize' ? x.award.includes('Giải') && !x.award.includes('phụ') : x.award === filter);
      return matches && byAward;
    }).sort((a,b) => sort === 'score' ? b.finalScore-a.finalScore : a.rank-b.rank);
  }, [query, filter, sort]);
  const official = resultData.filter(x => x.award.includes('Giải') && !x.award.includes('phụ')).length;
  const top = [...resultData.filter(x => x.award === 'Giải Nhất'), ...resultData.filter(x => x.award === 'Giải Nhì'), ...resultData.filter(x => x.award === 'Giải Ba')];
  return <main className="public-results">
    <header className="pub-header">
      <div className="pub-header-inner">
        <div className="pub-brand"><span><Camera size={23}/></span><div className="pub-brand-copy"><b className="pub-contest-name">CUỘC THI ẢNH ĐẸP ONLINE <span>“CHẠM VÀO KHOẢNH KHẮC – GỬI LỜI TRI ÂN”</span></b></div></div>
        <span className="pub-open-label"><i/> CÔNG BỐ CHÍNH THỨC</span>
      </div>
    </header>
    <section className="pub-hero">
      <div className="pub-hero-glow"/>
      <div className="pub-hero-content">
        <span className="pub-kicker"><Sparkles size={14}/> VINH DANH NHỮNG KHOẢNH KHẮC ĐẸP</span>
        <h1 className="pub-result-title"><span className="pub-result-prefix">KẾT QUẢ</span><span className="pub-result-contest-name">CUỘC THI ẢNH ĐẸP ONLINE “CHẠM VÀO KHOẢNH KHẮC – GỬI LỜI TRI ÂN”</span></h1>
        <p>Thiết thực chào mừng kỷ niệm 44 năm Ngày Nhà giáo Việt Nam (20/11/1982 – 20/11/2026).</p>
        <div className="pub-hero-stats">
          <div><b>{resultData.length}</b><small>Tác phẩm</small></div>
          <div><b>{official}</b><small>Giải chính thức</small></div>
          <div><b>100</b><small>Thang điểm</small></div>
        </div>
      </div>
      <div className="pub-hero-art"><div className="pub-lens"><Camera size={76}/><span>✦</span></div><div className="pub-art-caption">MỖI KHOẢNH KHẮC<br/>LÀ MỘT CÂU CHUYỆN</div></div>
    </section>
    <section className="pub-content">
      <div className="pub-heading-row"><div><span className="pub-overline">THE HONORED</span><h2>VINH DANH TÁC GIẢ ĐẠT GIẢI</h2><p>Những tác phẩm có thành tích nổi bật trong cuộc thi</p></div><Trophy size={28}/></div>
      <div className="pub-winner-marquee" aria-label="Tác phẩm đạt giải Nhất, Nhì và Ba">
        <div className="pub-winner-track">
          {[...top, ...top].map((x,i)=>{
            const rank = x.award === 'Giải Nhất' ? 1 : x.award === 'Giải Nhì' ? 2 : 3;
            const imageSrc = winnerImages[String(x.sourceNo)];
            return <article className={`pub-winner-slide winner-${rank}`} key={`${x.sourceNo}-${i}`}>
              <div className="pub-winner-photo">
                {imageSrc ? <><img src={imageSrc} alt={`Tác phẩm ${x.title} - ${x.award}`} loading="eager" decoding="async" title="Nhấn để xem ảnh đầy đủ" onClick={()=>setPreviewImage({src:imageSrc,alt:`Tác phẩm ${x.title} - ${x.award}`})} onError={(e)=>{e.currentTarget.style.display="none"; const fallback=e.currentTarget.parentElement.querySelector(".pub-winner-photo-empty"); if(fallback) fallback.style.display="grid";}}/><div className="pub-winner-photo-empty" style={{display:"none"}}><Camera size={34}/><b>KHÔNG TẢI ĐƯỢC ẢNH</b><small>Vui lòng kiểm tra lại ảnh trong trang quản trị</small></div></> : <div className="pub-winner-photo-empty"><Camera size={34}/><b>ẢNH TÁC PHẨM SẼ ĐƯỢC CẬP NHẬT</b><small>Ban tổ chức đang chuẩn bị ảnh vinh danh</small></div>}
                <span className="pub-winner-ribbon">{x.award.toUpperCase()}</span>
              </div>
              <div className="pub-winner-caption">
                <span className="pub-winner-medal">{rank===1?'🏆':rank===2?'🥈':'🥉'}</span>
                <div className="pub-winner-info"><b>{x.author}</b><span>{x.title}</span></div>
                <strong>{fmt(x.finalScore)}<small> điểm</small></strong>
              </div>
            </article>;
          })}
        </div>
      </div>
      <p className="pub-winner-hint">01 giải Nhất · 02 giải Nhì · 03 giải Ba · Ảnh được Ban tổ chức cập nhật · Pano tự động chạy ngang</p>
      <div className="pub-list-heading"><div><span className="pub-overline">OFFICIAL RANKING</span><h2>BẢNG KẾT QUẢ CHUNG CUỘC</h2><p>Chọn từng thí sinh để xem bảng điểm chi tiết</p></div><span className="pub-total-pill">{filtered.length} / {resultData.length} bài thi</span></div>
      <div className="pub-controls">
        <label className="pub-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm tên tác giả, tác phẩm, đơn vị..."/>{query && <button onClick={()=>setQuery('')}>×</button>}</label>
        <div className="pub-filter-row">
          <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tất cả kết quả</option><option value="prize">Các giải chính thức</option>{awards.filter(a=>!a.includes('Giải') || a.includes('phụ')).map(a=><option key={a} value={a}>{a}</option>)}</select>
          <select value={sort} onChange={e=>setSort(e.target.value)}><option value="rank">Theo thứ hạng</option><option value="score">Điểm cao đến thấp</option></select>
        </div>
      </div>
      <div className="pub-results-list">
        {filtered.map(item=><ResultCard key={item.sourceNo} item={item} expanded={expanded===item.sourceNo} onToggle={()=>setExpanded(v=>v===item.sourceNo?null:item.sourceNo)}/>)}
        {!filtered.length && <div className="pub-empty"><Search size={28}/><b>Không tìm thấy kết quả phù hợp</b><span>Thử tìm bằng tên tác giả hoặc tên tác phẩm khác.</span></div>}
      </div>
      <footer className="pub-footer"><div className="pub-footer-mark"><Camera size={20}/></div><b>TRÂN TRỌNG CẢM ƠN</b><p>Cảm ơn tất cả tác giả đã tham gia và góp phần tạo nên thành công của cuộc thi.</p><small>KẾT QUẢ ĐƯỢC TỔNG HỢP TỪ BẢNG ĐIỂM CHÍNH THỨC CỦA BAN TỔ CHỨC</small></footer>
    </section>
    {previewImage && <div className="pub-image-lightbox" role="dialog" aria-modal="true" aria-label="Xem ảnh tác phẩm" onClick={()=>setPreviewImage(null)}>
      <button className="pub-image-lightbox-close" type="button" aria-label="Đóng ảnh" onClick={()=>setPreviewImage(null)}>×</button>
      <div className="pub-image-lightbox-scroll" onClick={e=>e.stopPropagation()}>
        <img src={previewImage.src} alt={previewImage.alt}/>
      </div>
      <p>Nhấn bên ngoài ảnh hoặc nút × để đóng</p>
    </div>}
  </main>;
}
