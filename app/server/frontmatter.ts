// 게시판 md 파일(머리말 YAML + 본문) 읽기·부분 수정·검사 (명세 6-2절)
// 원칙: 바뀐 칸의 줄만 바꾸고, 나머지 칸(모르는 칸 포함)·순서·따옴표·본문은 글자 그대로 둔다.
import { Document, parse } from 'yaml';
import { CATEGORIES, isKoMedia, normDate, type Board, type Lang } from '../shared/boards';

export class FormatError extends Error {}

export interface Md {
  bom: string;
  open: string; // 여는 --- 줄(줄바꿈 포함)
  fmText: string; // 머리말 본문(여는·닫는 줄 제외, 끝 줄바꿈 없음)
  close: string; // 닫는 --- 줄부터 파일 끝까지(본문 포함)
  fm: Record<string, unknown>;
  body: string; // 앞뒤 줄바꿈을 뗀 본문(빌드와 같음)
  eol: string;
}

export function parseMd(text: string, where: string): Md {
  const bom = text.startsWith('﻿') ? '﻿' : '';
  const t = bom ? text.slice(1) : text;
  const lines = t.split('\n');
  if (lines[0].replace(/\r$/, '') !== '---') throw new FormatError(`${where}: 머리말(--- 로 시작·끝)이 없습니다.`);
  let j = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].replace(/\r$/, '') === '---') {
      j = i;
      break;
    }
  }
  if (j < 0) throw new FormatError(`${where}: 머리말(--- 로 시작·끝)이 없습니다.`);
  const eol = lines[0].endsWith('\r') ? '\r\n' : '\n';
  const fmLines = lines.slice(1, j);
  const fmText = fmLines.join('\n');
  let fm: unknown;
  try {
    fm = parse(fmText) ?? {};
  } catch (e) {
    throw new FormatError(`${where}: 머리말 형식 오류: ${e instanceof Error ? e.message.split('\n')[0] : ''}`);
  }
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) throw new FormatError(`${where}: 머리말 형식 오류(칸: 값 형태가 아님)`);
  const close = lines.slice(j).join('\n');
  const rest = lines.slice(j + 1).join('\n');
  return { bom, open: lines[0] + '\n', fmText, close, fm: fm as Record<string, unknown>, body: rest.replace(/^[\r\n]+|[\r\n]+$/g, ''), eol };
}

const KEY_LINE = /^(?:'([^']*)'|"([^"]*)"|([A-Za-z0-9_][\w-]*))[ \t]*:(?:[ \t]|$)/;
const BOOL_KEYS = new Set(['draft', 'featured']);

/** 한 칸을 YAML 줄로. 글자는 모두 작은따옴표(빌드의 PyYAML 1.1 이 숫자·날짜로 잘못 읽지 않게) */
export function yamlLine(key: string, value: unknown): string {
  const doc = new Document({ [key]: value });
  return doc
    .toString({ lineWidth: 0, defaultStringType: 'QUOTE_SINGLE', defaultKeyType: 'PLAIN', indentSeq: true })
    .replace(/\n$/, '');
}

function canon(key: string, v: unknown): string {
  if (key === 'date') {
    const d = normDate(typeof v === 'string' ? v : '');
    return JSON.stringify(d ?? v ?? null);
  }
  if (key === 'category' && typeof v === 'string') v = [v];
  const norm = (x: unknown): unknown => {
    if (x === undefined || x === null || x === '') return null;
    if (Array.isArray(x)) return x.length ? x.map(norm) : null;
    if (BOOL_KEYS.has(key) && x === false) return null;
    if (typeof x === 'number') return String(x);
    if (x && typeof x === 'object')
      return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, y]) => [k, norm(y)]));
    return x;
  };
  return JSON.stringify(norm(v));
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

/** 머리말에서 바뀐 칸만 고친다. 돌려주는 값: 새 머리말 글자, 실제로 바뀐 칸 목록 */
export function editFrontMatter(fmText: string, fm: Record<string, unknown>, changes: Record<string, unknown>) {
  const lines = fmText.length ? fmText.split('\n') : [];
  // 최상위 칸별 줄 범위
  const blocks: { key: string | null; start: number; end: number }[] = [];
  lines.forEach((line, i) => {
    const m = KEY_LINE.exec(line);
    if (m) blocks.push({ key: m[1] ?? m[2] ?? m[3], start: i, end: i + 1 });
    else if (blocks.length) blocks[blocks.length - 1].end = i + 1;
    else blocks.push({ key: null, start: i, end: i + 1 });
  });
  const changed: string[] = [];
  const replace = new Map<number, string[]>(); // 시작 줄 → 새 줄들
  const append: string[] = [];
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    if (canon(key, fm[key]) === canon(key, value)) continue;
    const block = blocks.find((b) => b.key === key);
    if (block) {
      // 원래 줄이 CRLF 였으면 맞춘다
      const cr = lines[block.start].endsWith('\r') ? '\r' : '';
      replace.set(block.start, yamlLine(key, value).split('\n').map((l) => l + cr));
      changed.push(key);
    } else if (!isEmpty(value)) {
      append.push(...yamlLine(key, value).split('\n'));
      changed.push(key);
    }
  }
  const out: string[] = [];
  for (const b of blocks) {
    const r = replace.get(b.start);
    if (r) out.push(...r);
    else out.push(...lines.slice(b.start, b.end));
  }
  if (append.length) {
    const cr = lines.length && lines[lines.length - 1].endsWith('\r') ? '\r' : '';
    // 마지막 줄이 빈 줄이면 그 앞에 붙인다
    out.push(...append.map((l) => l + cr));
  }
  return { fmText: out.join('\n'), changed };
}

/** 새 글 파일 */
export function newMd(fields: [string, unknown][], body: string): string {
  const fm = fields
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => yamlLine(k, v))
    .join('\n');
  return `---\n${fm}\n---\n${body.replace(/^[\r\n]+|[\r\n]+$/g, '')}\n`;
}

/** 머리말 부분만 바꿔 파일 전체를 다시 만든다(본문을 바꾸면 body 를 준다) */
export function rebuild(md: Md, fmText: string, body?: string): string {
  let close = md.close;
  if (body !== undefined) {
    const firstEnd = close.indexOf('\n');
    const closeLine = firstEnd < 0 ? close + '\n' : close.slice(0, firstEnd + 1);
    // 원래 닫는 줄 다음에 빈 줄이 있었으면 그대로 둔다
    const after = firstEnd < 0 ? '' : close.slice(firstEnd + 1);
    const lead = /^(\r?\n)+/.exec(after)?.[0] ?? '';
    const b = body.replace(/^[\r\n]+|[\r\n]+$/g, '');
    close = `${closeLine}${lead}${md.eol === '\r\n' ? b.replace(/\r?\n/g, '\r\n') : b}${md.eol}`;
  }
  return `${md.bom}${md.open}${fmText}${fmText.length ? '\n' : ''}${close}`;
}

// ───── 빌드 실패 조건 검사 (hopage build/cms_posts.py load_board 와 같은 규칙) ─────
function text(fm: Record<string, unknown>, key: string, where: string, required = false): string {
  const v = fm[key];
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
    if (required) throw new FormatError(`${where}: 필수 칸 ${key} 이(가) 비어 있습니다.`);
    return '';
  }
  if (typeof v === 'object' || typeof v === 'boolean') throw new FormatError(`${where}: ${key} 는 글자여야 합니다.`);
  return String(v);
}

function flag(fm: Record<string, unknown>, key: string, where: string) {
  const v = fm[key];
  if (v === undefined || v === null || v === '') return false;
  if (typeof v !== 'boolean') throw new FormatError(`${where}: ${key} 는 true 또는 false 여야 합니다.`);
  return v;
}

const LABEL: Record<string, string> = {
  title: '제목',
  date: '게시일',
  category: '분류',
  file: 'E-Catalog PDF',
};

/** 화면에 보일 한국어로 바꿔 던진다 */
export function validate(fm: Record<string, unknown>, lang: Lang, board: Board, where: string): void {
  const need = (key: string) => {
    try {
      text(fm, key, where, true);
    } catch {
      throw new FormatError(`${LABEL[key] ?? key}을(를) 입력해 주세요.`);
    }
  };
  need('title');
  text(fm, 'title', where);
  if (fm.date === undefined || fm.date === null || fm.date === '') throw new FormatError('게시일을 입력해 주세요.');
  if (normDate(typeof fm.date === 'string' ? fm.date : '') === null)
    throw new FormatError(`게시일 형식이 맞지 않습니다(YYYY-MM-DD HH:MM:SS, 현재: ${String(fm.date)}).`);
  flag(fm, 'draft', where);
  const fmt = text(fm, 'body_format', where).trim().toLowerCase();
  if (!['', 'html', 'markdown'].includes(fmt)) throw new FormatError('body_format 은 html 또는 markdown 이어야 합니다.');
  for (const k of ['link1', 'link2', 'thumbnail', 'summary']) text(fm, k, where);
  const files = fm.files;
  if (files !== undefined && files !== null && files !== '') {
    if (!Array.isArray(files)) throw new FormatError('files 는 목록이어야 합니다.');
    files.forEach((f, i) => {
      const o = f as Record<string, unknown>;
      if (!o || typeof o !== 'object' || !String(o.stored ?? '').trim())
        throw new FormatError(`files ${i + 1}번째 항목에 stored 가 없습니다.`);
      const no = 'no' in o ? o.no : i;
      const size = o.size ?? 0;
      if (!Number.isInteger(no) || !Number.isInteger(size)) throw new FormatError(`files ${i + 1}번째 항목의 no·size 는 숫자여야 합니다.`);
    });
  }
  if (isKoMedia(lang, board)) {
    let cats = fm.category;
    if (typeof cats === 'string') cats = [cats];
    if (!cats || (Array.isArray(cats) && cats.length === 0)) throw new FormatError('분류를 1개 이상 선택해 주세요.');
    if (!Array.isArray(cats)) throw new FormatError('category 는 목록이어야 합니다.');
    for (const c of cats)
      if (!(CATEGORIES as readonly unknown[]).includes(c))
        throw new FormatError(`분류 '${String(c)}' 는 허용 목록(${CATEGORIES.join(', ')})에 없습니다.`);
    text(fm, 'capacity', where);
    text(fm, 'program', where);
    text(fm, 'featured_image', where);
    text(fm, 'featured_label', where);
    text(fm, 'featured_text', where);
    flag(fm, 'featured', where);
    const order = fm.featured_order;
    if (!(order === undefined || order === null || order === '') && !Number.isInteger(order))
      throw new FormatError('메인 노출 순서는 숫자여야 합니다.');
    const g = fm.gallery;
    if (!(g === undefined || g === null || g === '')) {
      if (!Array.isArray(g)) throw new FormatError('gallery 는 목록이어야 합니다.');
      g.forEach((x, i) => {
        const s = x && typeof x === 'object' ? ((x as Record<string, unknown>).image ?? (x as Record<string, unknown>).src) : x;
        if (typeof s !== 'string') throw new FormatError(`현장 사진 ${i + 1}번째 항목이 이미지 주소가 아닙니다.`);
      });
    }
  }
  if (board === 'library') {
    const file = text(fm, 'file', where).trim();
    if (!file) throw new FormatError('E-Catalog PDF 파일을 올려 주세요(필수).');
    if (!file.startsWith('/') || file.startsWith('//')) throw new FormatError(`E-Catalog 파일은 / 로 시작하는 사이트 주소여야 합니다(현재: ${file}).`);
  }
}
