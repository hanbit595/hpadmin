// 회사 페이지·사이트 설정 검사 (hopage build/cms_pages.py·build.py 의 빌드 실패 조건과 같은 규칙, 명세 6-3절)
// 형식 검사는 여기서 바로 하고, 이미지·내부 링크가 실제로 있는지는 모아서(refs) 저장소에서 한 번에 확인한다.

export class CheckError extends Error {}

export type PageName = 'cert' | 'history' | 'hanbit' | 'esg' | 'location';
export type SettingName = 'menu' | 'site' | 'popups';

export interface Refs {
  images: { path: string; where: string }[];
  links: { path: string; where: string }[];
}

type O = Record<string, unknown>;

const isObj = (v: unknown): v is O => !!v && typeof v === 'object' && !Array.isArray(v);

function obj(v: unknown, where: string): O {
  if (!isObj(v)) throw new CheckError(`${where}: 형식이 잘못되었습니다.`);
  return v;
}

function list(d: O, key: string, where: string, required = true): unknown[] {
  const v = d[key];
  if ((v === undefined || v === null || v === '') && !required) return [];
  if (!Array.isArray(v) || (required && !v.length)) throw new CheckError(`${where}${where ? ' ' : ''}${key} 목록이 비어 있습니다(1개 이상 필요).`);
  return v;
}

function text(v: unknown, where: string, required = true): string {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
    if (required) throw new CheckError(`${where} 을(를) 입력해 주세요.`);
    return '';
  }
  if (typeof v === 'object' || typeof v === 'boolean') throw new CheckError(`${where} 는 글자여야 합니다.`);
  return String(v);
}

function flag(v: unknown, where: string) {
  if (v === undefined || v === null || v === '') return;
  if (typeof v !== 'boolean') throw new CheckError(`${where} 는 켜기/끄기 값이어야 합니다.`);
}

function num(v: unknown, where: string, opts: { int?: boolean; min?: number; max?: number } = {}) {
  if (v === undefined || v === null || v === '') return;
  if (typeof v !== 'number' || (opts.int && !Number.isInteger(v))) throw new CheckError(`${where} 는 숫자여야 합니다.`);
  if (opts.min !== undefined && v < opts.min) throw new CheckError(`${where} 는 ${opts.min} 이상이어야 합니다.`);
  if (opts.max !== undefined && v > opts.max) throw new CheckError(`${where} 는 ${opts.max} 이하여야 합니다.`);
}

function image(v: unknown, where: string, refs: Refs, required = true) {
  const p = text(v, where, required).trim();
  if (!p) return;
  if (!p.startsWith('/') || p.startsWith('//')) throw new CheckError(`${where} 는 /로 시작하는 사이트 안 주소여야 합니다(현재: ${p}).`);
  refs.images.push({ path: p, where });
}

function link(v: unknown, where: string, refs: Refs, required: boolean) {
  const l = String(v ?? '').trim();
  if (!l && !required) return;
  if (l.startsWith('/') && !l.startsWith('//')) refs.links.push({ path: l, where });
  else if (!/^https?:\/\//.test(l)) throw new CheckError(`${where}: 주소는 / 또는 http 로 시작해야 합니다(현재: '${l}').`);
}

function day(v: unknown, where: string): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const ok =
    (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)) ||
    (/^\d{4}-\d{2}$/.test(s) && +s.slice(5) >= 1 && +s.slice(5) <= 12);
  if (!ok) throw new CheckError(`${where} 형식 오류(YYYY-MM-DD 또는 YYYY-MM, 현재: ${s}).`);
  return s;
}

function strictDay(v: unknown, where: string): string {
  const s = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !new Date(`${s}T00:00:00Z`).toISOString().startsWith(s))
    throw new CheckError(`${where} 날짜 형식 오류(YYYY-MM-DD, 현재: ${s || '빈 칸'}).`);
  return s;
}

// ───── 회사 페이지 ─────
function cert(d: O, refs: Refs) {
  const cats = list(d, 'categories', '').map((t, i) => text(t, `구분 ${i + 1}번째`));
  cats.forEach((t, i) => {
    if (cats.indexOf(t) !== i) throw new CheckError(`구분 '${t}' 이(가) 두 번 있습니다.`);
  });
  list(d, 'items', '').forEach((x, i) => {
    const it = obj(x, `인증 ${i + 1}번째`);
    const w = `인증 ${i + 1}번째 '${String(it.name ?? '')}'`;
    const c = text(it.category, `${w} 구분`);
    if (!cats.includes(c)) throw new CheckError(`${w}: 구분 '${c}' 이(가) 구분 목록(${cats.join(', ')})에 없습니다.`);
    text(it.name, `${w} 명칭`);
    text(it.issuer, `${w} 발급기관`, false);
    day(it.date, `${w} 날짜`);
    image(it.image, `${w} 인증서 이미지`, refs);
    flag(it.visible, `${w} 노출`);
    num(it.order, `${w} 순서`);
  });
}

function history(d: O, refs: Refs, lang: string) {
  const anchors = new Set<string>();
  list(d, 'periods', '').forEach((x, i) => {
    const p = obj(x, `기간 ${i + 1}번째`);
    const w = `기간 '${String(p.title ?? i + 1)}'`;
    text(p.title, `${w} 제목`);
    const a = text(p.anchor, `${w} 주소 이름표`, false).trim() || `his-${i + 1}`;
    if (!/^[A-Za-z0-9_-]+$/.test(a)) throw new CheckError(`${w}: 주소 이름표는 영문·숫자·-·_ 만 쓸 수 있습니다(현재: ${a}).`);
    if (anchors.has(a)) throw new CheckError(`${w}: 주소 이름표 '${a}' 이(가) 다른 기간과 겹칩니다.`);
    anchors.add(a);
    image(p.image, `${w} 사진`, refs);
    const years = new Set<number>();
    list(p, 'years', w).forEach((yx, j) => {
      const y = obj(yx, `${w} 연도 ${j + 1}번째`);
      const ys = typeof y.year === 'number' || typeof y.year === 'string' ? String(y.year).trim() : '';
      if (!/^(19|20)\d{2}$/.test(ys)) throw new CheckError(`${w}: 연도 형식 오류(4자리, 예: 2026, 현재: ${ys || '빈 칸'}).`);
      if (years.has(+ys)) throw new CheckError(`${w}: ${ys}년이 같은 기간 안에 두 번 있습니다(한 연도로 합쳐 주세요).`);
      years.add(+ys);
      list(y, 'months', `${w} ${ys}년`).forEach((mx, k) => {
        const m = obj(mx, `${w} ${ys}년 ${k + 1}번째 달`);
        const ms = typeof m.month === 'number' || typeof m.month === 'string' ? String(m.month).trim() : '';
        if (!/^\d{1,2}$/.test(ms) || +ms < 1 || +ms > 12) throw new CheckError(`${w} ${ys}년: 월 형식 오류(01~12, 현재: ${ms || '빈 칸'}).`);
        list(m, 'items', `${w} ${ys}년 ${ms}월`).forEach((t, n) => text(t, `${w} ${ys}년 ${ms}월 ${n + 1}번째 내용`));
      });
    });
  });
  void lang;
}

function fixed(d: O, key: string, count: number, label: string): unknown[] {
  const v = list(d, key, '');
  if (v.length !== count) throw new CheckError(`${label}은(는) 꼭 ${count}개여야 합니다(현재 ${v.length}개).`);
  return v;
}

function hanbit(d: O, refs: Refs, lang: string) {
  const hero = obj(d.hero, '맨 위 큰 화면');
  text(hero.title, '맨 위 큰 제목');
  if (lang === 'en') image(hero.video, '맨 위 배경 동영상', refs);
  else image(hero.image, '맨 위 배경 사진', refs);
  fixed(d, 'intro_texts', 3, '소개 문단').forEach((t, i) => text(t, `소개 문단 ${i + 1}`));
  fixed(d, 'photos', 6, '사진').forEach((p, i) => image(p, `사진 ${i + 1}`, refs));
  text(d.energy_text, '배경 사진 위 문단');
  fixed(d, 'sun_texts', 2, '해 사진 옆 문단').forEach((t, i) => text(t, `해 사진 옆 문단 ${i + 1}`));
  text(d.ending_text, '마지막 문장');
}

function esg(d: O, refs: Refs) {
  const intro = obj(d.intro, '소개');
  text(intro.title, '소개 제목');
  text(intro.text, '소개 문단');
  text(d.flow_text, '원 위로 흐르는 글자');
  list(d, 'pillars', '').forEach((x, i) => {
    const p = obj(x, `원 ${i + 1}번째`);
    text(p.title, `원 ${i + 1} 제목`);
    image(p.icon, `원 ${i + 1} 아이콘`, refs);
    text(p.text, `원 ${i + 1} 설명`);
  });
  list(d, 'details', '').forEach((x, i) => {
    const b = obj(x, `상세 상자 ${i + 1}번째`);
    text(b.title, `상세 상자 ${i + 1} 제목`);
    list(b, 'items', `상세 상자 ${i + 1}`).forEach((t, n) => text(t, `상세 상자 ${i + 1} 항목 ${n + 1}`));
  });
}

function location(d: O, officeNames: string[]) {
  list(d, 'locations', '').forEach((x, i) => {
    const L = obj(x, `사업장 ${i + 1}번째`);
    const w = `사업장 ${i + 1}번째 '${String(L.title ?? '')}'`;
    const office = text(L.office, `${w} 회사정보 연결 이름`).trim();
    if (!officeNames.includes(office))
      throw new CheckError(`${w}: 회사정보(사이트 설정)의 사업장 이름(${officeNames.join(', ')}) 중 하나와 똑같아야 합니다(현재: ${office}).`);
    text(L.label, `${w} 작은 제목`);
    text(L.title, `${w} 사업장 이름`);
    const m = text(L.map, `${w} 지도 주소`).trim();
    if (!m.startsWith('https://www.google.com/maps/embed'))
      throw new CheckError(`${w}: 지도 주소는 https://www.google.com/maps/embed 로 시작하는 구글 지도 퍼가기 주소여야 합니다.`);
    num(L.map_indent, `${w} map_indent`, { int: true, min: 0, max: 40 });
  });
}

// ───── 사이트 설정 ─────
function menu(d: O, refs: Refs) {
  list(d, 'menu', '').forEach((x, i) => {
    const m = obj(x, `대메뉴 ${i + 1}번째`);
    const w = `대메뉴 '${String(m.label ?? i + 1)}'`;
    text(m.label, `${i + 1}번째 대메뉴 이름`);
    if (m.visible === false) return;
    let shown = 0;
    list(m, 'items', w, false).forEach((sx, j) => {
      const s = obj(sx, `${w} ${j + 1}번째 소메뉴`);
      text(s.label, `${w} ${j + 1}번째 소메뉴 이름`);
      flag(s.new_window, `${w} 소메뉴 새 창`);
      if (s.visible === false) return;
      shown++;
      link(s.link, `${w} > 소메뉴 '${String(s.label)}' 링크`, refs, true);
    });
    if (String(m.link ?? '').trim()) link(m.link, `${w} 링크`, refs, true);
    else if (!shown) throw new CheckError(`${w}: 링크가 비어 있고 보이는 소메뉴도 없습니다.`);
  });
}

function site(d: O, refs: Refs, lang: string) {
  list(d, 'offices', '').forEach((x, i) => {
    const o = obj(x, `사업장 ${i + 1}번째`);
    text(o.name, `사업장 ${i + 1}번째 이름`);
    text(o.address, `사업장 ${i + 1}번째 주소`);
  });
  text(d.tel, '대표 전화');
  text(d.email, '대표 이메일');
  link(d.brochure, '회사소개서 PDF', refs, lang === 'ko');
  if (lang === 'ko') {
    if (typeof d.per_page !== 'number' || !Number.isInteger(d.per_page) || d.per_page < 1)
      throw new CheckError('게시판 쪽당 글 수는 1 이상의 숫자여야 합니다.');
    text(d.seo_description, '검색 설명');
  }
}

function popups(d: O, refs: Refs) {
  const items = d.popups ?? [];
  if (!Array.isArray(items)) throw new CheckError('팝업 목록 형식이 잘못되었습니다.');
  const ids = new Set<number>();
  items.forEach((x, i) => {
    const p = obj(x, `${i + 1}번째 팝업`);
    const w = `${i + 1}번째 팝업 '${String(p.title ?? '')}'`;
    const s = strictDay(p.start, `${w} 시작일`);
    const e = strictDay(p.end, `${w} 종료일`);
    if (s > e) throw new CheckError(`${w}: 시작일(${s})이 종료일(${e})보다 늦습니다.`);
    const id = p.id === undefined || p.id === null || p.id === '' ? i + 1 : p.id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) throw new CheckError(`${w}: id 는 1 이상의 숫자여야 합니다.`);
    if (ids.has(id)) throw new CheckError(`${w}: id ${id} 이(가) 다른 팝업과 겹칩니다.`);
    ids.add(id);
    flag(p.active, `${w} 사용`);
    for (const k of ['width', 'height', 'top', 'left']) num(p[k], `${w} ${k}`, { int: true, min: 0 });
    if (p.active === false) return;
    if (!String(p.image ?? '').trim()) throw new CheckError(`${w}: 사용 중인 팝업에는 이미지가 있어야 합니다.`);
    const img = String(p.image).trim();
    if (img.startsWith('/') && !img.startsWith('//')) refs.images.push({ path: img, where: `${w} 이미지` });
    else if (!/^https?:\/\//.test(img)) throw new CheckError(`${w} 이미지: 주소는 / 또는 http 로 시작해야 합니다.`);
    link(p.link, `${w} 링크`, refs, false);
  });
}

/** 형식 검사. 이미지·내부 링크 목록을 돌려준다(존재 확인은 따로) */
export function checkData(name: PageName | SettingName, lang: string, data: unknown, extra: { officeNames?: string[] } = {}): Refs {
  const refs: Refs = { images: [], links: [] };
  const d = obj(data, '파일');
  if (name === 'cert') cert(d, refs);
  else if (name === 'history') history(d, refs, lang);
  else if (name === 'hanbit') hanbit(d, refs, lang);
  else if (name === 'esg') esg(d, refs);
  else if (name === 'location') location(d, extra.officeNames ?? []);
  else if (name === 'menu') menu(d, refs);
  else if (name === 'site') site(d, refs, lang);
  else popups(d, refs);
  return refs;
}

export function officeNames(site: unknown): string[] {
  const offices = isObj(site) && Array.isArray(site.offices) ? site.offices : [];
  return offices.filter(isObj).map((o) => String(o.name ?? '').trim());
}
