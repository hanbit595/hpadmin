// 미리보기: 홈페이지 상세 페이지(templates/board_view.html)와 같은 마크업·클래스에 홈페이지 실제 CSS 를 불러와 그린다.
// 상단 메뉴·하단 푸터는 빼고 글 영역만. 스크립트는 돌리지 않는다(sandbox). PC(1280px)/모바일(375px) 폭 전환.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SITE, isKoMedia, type Board, type Lang } from '../../shared/boards';
import { displayHtml, displayUrl, type AssetCtx } from '../assets';
import type { Form } from './PostEditor';

const CSS = [
  'theme/basic/css/default.css',
  'js/font-awesome/css/font-awesome.min.css',
  'theme/basic/css/base.css',
  'theme/basic/css/xeicon.min.css',
  'theme/basic/css/layout.css',
  'theme/basic/css/board.css',
  'theme/basic/css/res.css',
];
const SKIN: Record<Board, string> = {
  notice: 'theme/basic/skin/board/notice/style.css',
  media: 'theme/basic/skin/board/reference/style.css',
  library: 'theme/basic/skin/board/notice/style.css',
};
const SUB: Record<Board, string> = { notice: 'sub_06_01', media: 'sub_06_02', library: 'sub_06_03' };
const LABELS = {
  ko: { writer: '작성자', date: '작성일', views: '조회수' },
  en: { writer: 'Writer', date: 'Date', views: 'Views' },
};
const WIDTH = { pc: 1280, mobile: 375 } as const;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function viewDate(d: string) {
  return d.length >= 16 ? `${d.slice(2, 4)}-${d.slice(5, 7)}-${d.slice(8, 10)} ${d.slice(11, 16)}` : d;
}

function buildPreview(lang: Lang, board: Board, subject: string, form: Form, body: string, ctx: AssetCtx): string {
  const L = LABELS[lang];
  const table = lang === 'en' ? `${board}_en` : board;
  const bodyClass = ` pc sub sub_06 ${SUB[board]} sub file_board bbs bbs_${table} b_view lang_${lang === 'en' ? 'en_US' : 'ko_KR'} b_tp`;
  const css = [...CSS, ...(lang === 'en' ? ['theme/basic/css/layout_en.css'] : []), SKIN[board]]
    .map((c) => `<link rel="stylesheet" href="${SITE}/${c}">`)
    .join('\n');
  const title = subject.length > 70 ? `${subject.slice(0, 70)}…` : subject;
  const gallery =
    isKoMedia(lang, board) && form.gallery.length
      ? `<style>#bo_v_gallery{width:100%;overflow:hidden}#bo_v_gallery a.view_image{display:block}#bo_v_gallery img{margin-bottom:20px;max-width:100%;height:auto}</style>
<div id="bo_v_gallery">${form.gallery.map((g) => `<a href="#" class="view_image"><img src="${esc(displayUrl(g, ctx))}" alt=""/></a>`).join('')}</div>`
      : '';
  const file =
    board === 'library' && form.file
      ? `<section id="bo_v_file"><h2>첨부파일</h2><ul><li><i class="fa fa-folder-open" aria-hidden="true"></i>
<a href="#" class="view_file_download"><strong>${esc(form.file.split('/').pop() ?? '')}</strong></a><br>
<span class="bo_v_file_cnt">0 | DATE : ${esc(form.date)}</span></li></ul></section>`
      : '';
  return `<!doctype html>
<html lang="${lang}" class="sok"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
${css}
<style>html,body{overflow-x:hidden}a{pointer-events:none}</style>
</head>
<body class="${bodyClass}"><div id="wrap">
<div class="notice_wrap"><div class="notice_wrap_in sec_in">
<div class="notice_con_wrap"><div class="notice_con_wrap_in"><div class="board_wrap" style="margin: 0 auto"><div class="gnu5_wrap">
<article id="bo_v" style="width:100%">
<div class="board_view_top">
<div class="board_view_label"><div class="main_board_line"><div class="main_board_line_in">${esc(title)}</div></div></div>
<div class="board_view_info">
<div class="board_view_info_left"><div class="board_view_info_div board_view_info_name"><b>${L.writer}</b><span><span class="sv_member">Hanbit</span></span></div></div>
<div class="board_view_info_right">
<div class="board_view_info_div board_view_info_date"><b>${L.date}</b><span>${esc(viewDate(form.date))}</span></div>
<div class="board_view_info_div board_view_info_hit"><b>${L.views}</b><span>0</span></div>
</div></div></div>
<section id="bo_v_atc"><h2 id="bo_v_atc_title">본문</h2>
<div id="bo_v_img"></div>
<div id="bo_v_con">${displayHtml(body, ctx)}</div>
${gallery}
</section>
${file}
</article>
</div></div></div></div></div></div></div></body></html>`;
}

export default function Preview({
  lang,
  board,
  subject,
  form,
  body,
  ctx,
}: {
  lang: Lang;
  board: Board;
  subject: string;
  form: Form;
  body: string;
  ctx: AssetCtx;
}) {
  const [device, setDevice] = useState<'pc' | 'mobile'>('pc');
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 입력할 때마다 iframe 을 다시 그리면 깜빡이므로 잠깐 모았다가 그린다
  const html = useMemo(() => buildPreview(lang, board, subject, form, body, ctx), [lang, board, subject, form, body, ctx]);
  const [shown, setShown] = useState(html);
  useEffect(() => {
    const t = setTimeout(() => setShown(html), 400);
    return () => clearTimeout(t);
  }, [html]);

  const w = WIDTH[device];
  const scale = Math.min(1, boxW / w);
  // 보이는 높이는 640px 로 고정하고, 축소 비율만큼 iframe 을 길게(PC 폭도 위아래로 충분히 보이게)
  const frameH = 640;
  const viewH = Math.round(frameH / scale);

  return (
    <div className="pv">
      <div className="pv-head">
        <span className="pv-title">미리보기 · 실제 홈페이지 모양</span>
        <div className="pv-dev" role="group" aria-label="미리보기 폭">
          {(['pc', 'mobile'] as const).map((d) => (
            <button key={d} type="button" className={device === d ? 'on' : ''} aria-pressed={device === d} onClick={() => setDevice(d)}>
              {d === 'pc' ? 'PC' : '모바일'}
            </button>
          ))}
        </div>
      </div>
      <div className="pv-frame" ref={box} style={{ height: frameH + 2 }}>
        <iframe
          title="홈페이지 미리보기"
          sandbox="allow-same-origin"
          srcDoc={shown}
          style={{ width: w, height: viewH, transform: `scale(${scale})`, marginLeft: device === 'mobile' ? Math.max(0, (boxW - w * scale) / 2) : 0 }}
        />
      </div>
      <p className="pv-note">홈페이지 글 화면과 같은 틀·CSS 로 그립니다(상단 메뉴·하단 정보 제외). 입력을 바꾸면 곧 바뀝니다.</p>
    </div>
  );
}
