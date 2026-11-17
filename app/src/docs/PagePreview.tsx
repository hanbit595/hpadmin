// 회사 페이지 미리보기: 홈페이지 본문 조각(content/pages/{lang}/page/*.html)과 같은 마크업·클래스 + 홈페이지 실제 CSS.
// 상단 큰 화면·메뉴·푸터는 빼고 내용 영역만. 스크립트 없음(sandbox). PC 1280px 축소 / 모바일 375px.
import { useEffect, useRef, useState } from 'react';
import { SITE } from '../../shared/boards';

const CSS = [
  'theme/basic/css/default.css',
  'js/font-awesome/css/font-awesome.min.css',
  'theme/basic/css/base.css',
  'theme/basic/css/xeicon.min.css',
  'theme/basic/css/layout.css',
  'theme/basic/css/board.css',
  'theme/basic/css/res.css',
];
const WIDTH = { pc: 1280, mobile: 375 } as const;

export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export default function PagePreview({ lang, bodyClass, inner, title }: { lang: string; bodyClass: string; inner: string; title: string }) {
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
  const css = [...CSS, ...(lang === 'en' ? ['theme/basic/css/layout_en.css'] : [])].map((c) => `<link rel="stylesheet" href="${SITE}/${c}">`).join('\n');
  const html = `<!doctype html><html lang="${lang}" class="sok"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">${css}
<style>html,body{overflow-x:hidden}a{pointer-events:none}.animate,[data-animate]{opacity:1!important;visibility:visible!important;transform:none!important}</style>
</head><body class="${bodyClass}"><div id="wrap"><div class="motion_visual_wrap"><div class="sec_wrap"><div class="sec_in">${inner}</div></div></div></div></body></html>`;
  const [shown, setShown] = useState(html);
  useEffect(() => {
    const t = setTimeout(() => setShown(html), 400);
    return () => clearTimeout(t);
  }, [html]);
  const w = WIDTH[device];
  const scale = Math.min(1, boxW / w);
  const frameH = 640;
  return (
    <div className="pv">
      <div className="pv-head">
        <span className="pv-title">미리보기 · {title}</span>
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
          title={`${title} 미리보기`}
          sandbox="allow-same-origin"
          srcDoc={shown}
          style={{
            width: w,
            height: Math.round(frameH / scale),
            transform: `scale(${scale})`,
            marginLeft: device === 'mobile' ? Math.max(0, (boxW - w * scale) / 2) : 0,
          }}
        />
      </div>
      <p className="pv-note">홈페이지와 같은 틀·CSS 로 그립니다(위쪽 큰 화면·메뉴·하단 정보 제외). 저장 전 화면 값으로 바로 바뀝니다.</p>
    </div>
  );
}
