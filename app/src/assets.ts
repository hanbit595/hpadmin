// 글 속 사진 주소 → 관리자 화면에서 보이는 주소
// - 기존 사진(/data/…, /theme/…): 서버가 저장소 파일 목록으로 정한 실제 파일(resolved, 원본이 없으면 large-·thumb- 본)
//   을 홈페이지 주소(https://hanbitinnotech.com)에 붙인다
// - /uploads/…: 아직 홈페이지에 반영되지 않았을 수 있어 저장소(저장 대상 브랜치) 원본 주소
// - 저장 전 붙여넣은 사진: 브라우저 안 임시 주소(blob:)
import { RAW, SITE, sitePath } from '../shared/boards';

export interface AssetCtx {
  branch: string;
  resolved?: Record<string, string>;
}

/** 저장 전(아직 올리지 않은) 파일: 사이트 경로 → { 파일, 임시 주소 } */
export const pending = new Map<string, { blob: Blob; url: string; name: string; kind: 'image' | 'file' }>();

function safeEncode(s: string): string {
  try {
    return encodeURI(decodeURI(s));
  } catch {
    return encodeURI(s);
  }
}

export function displayUrl(src: string, ctx: AssetCtx | null): string {
  if (!src) return '';
  if (/^(blob:|data:)/.test(src)) return src;
  const p = sitePath(src);
  if (p === null) return src;
  const pend = pending.get(p);
  if (pend) return pend.url;
  if (/^\/uploads\//i.test(p)) return `${RAW}/${encodeURIComponent(ctx?.branch ?? 'main')}/${safeEncode(p.slice(1))}`;
  const real = ctx?.resolved?.[p] ?? p;
  return `${SITE}${safeEncode(real)}`;
}

/** HTML 안의 모든 img src 를 화면 표시용으로(저장용 HTML 은 그대로 두고 복사본에만) */
export function displayHtml(html: string, ctx: AssetCtx | null): string {
  return html.replace(/(<img\b[^>]*?\ssrc\s*=\s*")([^"]*)(")/gi, (_m, a: string, src: string, b: string) => a + displayUrl(src, ctx) + b);
}
