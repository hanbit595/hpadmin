// 게시판 6종 정의(화면·서버 공통). 규칙 출처: hopage build/cms_posts.py, 명세 6-2절
export type Lang = 'ko' | 'en';
export type Board = 'notice' | 'media' | 'library';

export const BOARDS: Board[] = ['notice', 'media', 'library'];
export const CATEGORIES = ['태양광발전장치', 'BIPV', '주차장태양광', '기타'] as const;

export const BOARD_KO: Record<Board, string> = { notice: '회사소식', media: '시공사례', library: 'E-Catalog' };
export const BOARD_EN: Record<Board, string> = { notice: 'News', media: 'Projects', library: 'E-Catalog' };

/** 커밋 메시지·화면에 쓰는 게시판 이름. 영문은 "회사소식(영문)" */
export function boardLabel(lang: Lang, board: Board): string {
  return lang === 'en' ? `${BOARD_KO[board]}(영문)` : BOARD_KO[board];
}

/** 화면 제목: 영문은 "회사소식 (News)" 처럼 병기 */
export function boardTitle(lang: Lang, board: Board): string {
  return lang === 'en' && board !== 'library' ? `${BOARD_KO[board]} (${BOARD_EN[board]})` : BOARD_KO[board];
}

export function boardDir(lang: Lang, board: Board): string {
  return `${lang === 'en' ? 'cms/en/' : 'cms/'}${board}`;
}

/** 국문 시공사례만 분류·용량·사업구분·현장 사진·메인 노출 칸이 있다(영문은 제목 통째로) */
export function isKoMedia(lang: Lang, board: Board): boolean {
  return lang === 'ko' && board === 'media';
}

export function isLang(v: unknown): v is Lang {
  return v === 'ko' || v === 'en';
}

export function isBoard(v: unknown): v is Board {
  return v === 'notice' || v === 'media' || v === 'library';
}

/** 파일명: 기존 글번호(99) 또는 새 글 YYYYMMDD-HHMMSS */
export const NAME_RE = /^(?:[1-9]\d*|\d{8}-\d{6})$/;

/** 관리자 화면 업로드 경로: uploads/YYYYMMDD-HHMMSS-난수6.확장자 */
export const IMAGE_EXT = ['jpg', 'png', 'gif'] as const;
export const FILE_EXT = ['pdf', 'hwp', 'hwpx', 'docx', 'xlsx', 'zip'] as const;
export const UPLOAD_RE = /^uploads\/\d{8}-\d{6}-[a-z0-9]{6}\.(jpg|png|gif|pdf|hwp|hwpx|docx|xlsx|zip)$/;
export const IMAGE_MAX = 10 * 1024 * 1024;
export const FILE_MAX = 20 * 1024 * 1024;

/** 시공사례 표시 제목: [분류,분류] 현장명 용량 ㅣ 사업구분 (cms_posts.compose_media_title) */
export function mediaSubject(category: string[], title: string, capacity = '', program = ''): string {
  let s = `[${category.join(',')}] ${title}`;
  if (capacity) s += ` ${capacity}`;
  if (program) s += ` ㅣ ${program}`;
  return s;
}

/** date 값 → "YYYY-MM-DD HH:MM:SS". 형식이 틀리거나 없는 날짜면 null (cms_posts.parse_date 와 같은 규칙, 시간대 표기는 한국 시간으로) */
export function normDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss, tz] = m;
  if (tz) {
    const t = Date.parse(v.trim().replace(' ', 'T'));
    if (Number.isNaN(t)) return null;
    return new Date(t + 9 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
  }
  const Y = +y, M = +mo, D = +d, H = hh ? +hh : 0, I = mi ? +mi : 0, S = ss ? +ss : 0;
  const dt = new Date(Date.UTC(Y, M - 1, D, H, I, S));
  if (dt.getUTCFullYear() !== Y || dt.getUTCMonth() !== M - 1 || dt.getUTCDate() !== D) return null;
  if (H > 23 || I > 59 || S > 59) return null;
  return `${y}-${mo}-${d} ${hh ?? '00'}:${mi ?? '00'}:${ss ?? '00'}`;
}

/** 한국 시간 지금 → "YYYY-MM-DD HH:MM:SS" */
export function kstNow(t = Date.now()): string {
  return new Date(t + 9 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
}

/** 목록 정렬: date 최신순, 같은 date 는 파일명 역순(새 형식 > 글번호, 글번호는 숫자 크기) */
export function comparePosts(a: { date: string; name: string }, b: { date: string; name: string }): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const ka = /^\d+$/.test(a.name), kb = /^\d+$/.test(b.name);
  if (ka !== kb) return ka ? 1 : -1;
  if (ka) return Number(b.name) - Number(a.name);
  return a.name < b.name ? 1 : a.name > b.name ? -1 : 0;
}

/** 사이트 주소(/data/..., http://www.hanbitinnotech.com/...) → 사이트 안 경로. 바깥 주소면 null (boards.site_path) */
export function sitePath(u: string): string | null {
  const s = u
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const host = /^(?:https?:)?\/\/(?:www\.)?hanbitinnotech\.com/i;
  if (host.test(s)) return s.replace(host, '') || '/';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return null;
}

export const SITE = 'https://hanbitinnotech.com';
export const RAW = 'https://raw.githubusercontent.com/hanbit595/hopage';
