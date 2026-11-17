// YAML 부분 고치기 (명세 6-3절): 원문은 그대로 두고 바뀐 값의 자리만 고친다.
// - 글자 칸: 원래 따옴표 방식(없음·"…"·'…'·|-)을 따른다. 따옴표 없이 쓰면 뜻이 바뀌는 값(yes·no·숫자·날짜 모양 등)은 작은따옴표
// - 목록: 바뀌지 않은 항목은 원문 그대로 재사용(추가·삭제·순서 변경 후 되돌리면 원문과 같아짐), 고친 항목은 그 안에서 다시 부분 고치기
// - 주석·모르는 칸은 그대로. 고친 뒤 다시 읽어 보낸 값과 똑같은지 확인(다르면 저장하지 않음)
import { Document, isMap, isPair, isScalar, isSeq, parseDocument, type Node, type Scalar } from 'yaml';

export class YamlPatchError extends Error {}

interface Edit {
  start: number;
  end: number;
  text: string;
}

const NEW_OPTS = { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN', indentSeq: true } as const;

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function js(node: unknown): unknown {
  if (node === null || node === undefined) return null;
  return (node as { toJSON: () => unknown }).toJSON();
}

function lineStart(src: string, p: number): number {
  return src.lastIndexOf('\n', p - 1) + 1;
}

/** p 가 있는 줄의 끝(줄바꿈 다음) */
function lineEnd(src: string, p: number): number {
  if (p > 0 && src[p - 1] === '\n') return p;
  const i = src.indexOf('\n', p);
  return i < 0 ? src.length : i + 1;
}

// PyYAML(1.1)·yaml(1.2) 어느 쪽이든 따옴표 없는 글자를 무엇으로 읽는지
function implicitType(s: string): string {
  if (/^(y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/.test(s)) return 'bool';
  if (/^(~|null|Null|NULL)?$/.test(s)) return 'null';
  if (/^[-+]?(0|[1-9][0-9_]*|0[0-7_]+|0o[0-7]+|0x[0-9a-fA-F_]+|0b[01_]+|[1-9][0-9_]*(:[0-5]?[0-9])+)$/.test(s)) return 'int';
  if (/^[-+]?(\.[0-9]+|[0-9][0-9_]*(\.[0-9_]*)?)([eE][-+]?[0-9]+)?$/.test(s) || /^[-+]?\.(inf|Inf|INF)$|^\.(nan|NaN|NAN)$/.test(s)) return 'float';
  if (/^\d{4}-\d\d?-\d\d?([Tt ]|$)/.test(s)) return 'ts';
  if (/^(<<|=)$/.test(s)) return 'special';
  return 'str';
}

function safePlain(s: string): boolean {
  if (!s || s !== s.trim()) return false;
  if (/[\n\r\t\u0000-\u001f]/.test(s)) return false;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return false;
  if (/: |\s#|:$/.test(s)) return false;
  return true;
}

function single(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function dbl(s: string): string {
  return JSON.stringify(s);
}

/** 글자 하나를 원래 칸의 모양대로 */
function writeScalar(src: string, node: Scalar, val: unknown): string {
  if (val === null || val === undefined) return node.type === 'QUOTE_DOUBLE' ? '""' : "''";
  if (typeof val === 'boolean' || typeof val === 'number') return String(val);
  if (typeof val !== 'string') throw new YamlPatchError('글자 칸에 목록·묶음을 넣을 수 없습니다.');
  const raw = src.slice(node.range![0], node.range![1]);
  const type = node.type;
  if ((type === 'BLOCK_LITERAL' || type === 'BLOCK_FOLDED') && !/^ /.test(val)) {
    const lines = raw.split('\n');
    let header = lines[0];
    const content = lines.slice(1).find((l) => l.trim());
    const indent = content ? (/^ */.exec(content)?.[0] ?? '  ') : ' '.repeat(node.range![0] - lineStart(src, node.range![0]) + 2);
    const keep = val.endsWith('\n');
    const body = keep ? val.slice(0, -1) : val;
    header = header.replace(/^([|>])([-+]?)/, (_m, a: string) => `${a}${keep ? '' : '-'}`);
    const out = `${header}\n${body.split('\n').map((l) => (l ? indent + l : '')).join('\n')}`;
    return raw.endsWith('\n') ? `${out}\n` : out;
  }
  if (val.includes('\n')) return dbl(val);
  if (type === 'QUOTE_DOUBLE') return dbl(val);
  if (type === 'QUOTE_SINGLE') return single(val);
  if (type === 'PLAIN') {
    const origType = typeof node.value === 'string' ? implicitType(raw.trim()) : 'other';
    if (safePlain(val) && implicitType(val) === origType) return val;
    return single(val);
  }
  return single(val);
}

/** 새 값을 블록 YAML 로(첫 줄 들여쓰기 없음, 둘째 줄부터 indent) */
function block(val: unknown, indent: number): string {
  const text = new Document(val).toString(NEW_OPTS).replace(/\n$/, '');
  const pad = ' '.repeat(indent);
  return text
    .split('\n')
    .map((l, i) => (i === 0 || !l ? l : pad + l))
    .join('\n');
}

function flow(val: unknown): string {
  const doc = new Document(val);
  if (isSeq(doc.contents) || isMap(doc.contents)) doc.contents.flow = true;
  return doc.toString(NEW_OPTS).trim();
}

function applyEdits(text: string, edits: Edit[], offset = 0): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start - offset) + e.text + out.slice(e.end - offset);
  }
  return out;
}

function diffNode(src: string, node: Node | null, val: unknown): Edit[] {
  if (eq(js(node), val)) return [];
  if (!node || !node.range) throw new YamlPatchError('빈 칸에 값을 넣는 형식은 지원하지 않습니다.');
  const [start, end] = node.range;

  if (isScalar(node)) {
    if (val !== null && typeof val === 'object') return [{ start, end, text: flow(val) }];
    return [{ start, end, text: writeScalar(src, node, val) }];
  }

  if (isMap(node) && val && typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    const keys = node.items.map((p) => String(isScalar(p.key) ? p.key.value : p.key));
    if (node.flow) return [{ start, end, text: flow(val) }];
    const edits: Edit[] = [];
    node.items.forEach((p, i) => {
      if (!isPair(p)) return;
      const k = keys[i];
      if (!(k in obj)) {
        // 칸 지우기: 그 칸의 줄만 지운다
        const kStart = (p.key as Node).range![0];
        const vEnd = (p.value as Node | null)?.range?.[1] ?? (p.key as Node).range![1];
        if (i === 0 && keys.length === 1) throw new YamlPatchError('마지막 남은 칸은 지울 수 없습니다.');
        edits.push({ start: lineStart(src, kStart), end: lineEnd(src, vEnd), text: '' });
        return;
      }
      const v = p.value as Node | null;
      if (v === null || v === undefined) {
        if (obj[k] === null || obj[k] === undefined) return;
        const at = (p.key as Node).range![1];
        const colon = src.indexOf(':', at) + 1;
        const nv = obj[k];
        edits.push({ start: colon, end: colon, text: ` ${typeof nv === 'object' ? flow(nv) : typeof nv === 'string' ? dbl(nv) : String(nv)}` });
      } else edits.push(...diffNode(src, v, obj[k]));
    });
    const added = Object.keys(obj).filter((k) => !keys.includes(k));
    if (added.length) {
      const first = node.items[0]?.key as Node | undefined;
      const col = first?.range ? first.range[0] - lineStart(src, first.range[0]) : 0;
      const at = lineEnd(src, end);
      const pad = ' '.repeat(col);
      const text = added.map((k) => `${pad}${block({ [k]: obj[k] }, col)}\n`).join('');
      edits.push({ start: at, end: at, text: src[at - 1] === '\n' || at === 0 ? text : `\n${text}` });
    }
    return edits;
  }

  if (isSeq(node) && Array.isArray(val)) {
    if (node.flow) return [{ start, end, text: flow(val) }];
    if (!val.length) throw new YamlPatchError('목록을 모두 비울 수 없습니다(1개 이상 필요).');
    const items = node.items as Node[];
    const starts = items.map((it) => lineStart(src, it.range![0]));
    const seqStart = starts[0];
    const ends = items.map((it, i) => (i < items.length - 1 ? starts[i + 1] : lineEnd(src, it.range![1])));
    const seqEnd = ends[ends.length - 1];
    const dash = /^ */.exec(src.slice(seqStart))![0].length;
    const chunks = items.map((_, i) => src.slice(starts[i], ends[i]));
    const old = items.map((it) => js(it));
    const used = new Set<number>();
    const pick: (number | null)[] = val.map((v) => {
      const i = old.findIndex((o, n) => !used.has(n) && eq(o, v));
      if (i >= 0) used.add(i);
      return i >= 0 ? i : null;
    });
    // 똑같은 옛 항목이 없으면 가장 비슷한(같은 칸 값이 많은, 가까운 자리) 옛 항목을 고쳐 쓴다
    const score = (o: unknown, v: unknown, i: number, j: number): number => {
      if (o && v && typeof o === 'object' && typeof v === 'object' && !Array.isArray(o) && !Array.isArray(v)) {
        const ks = Object.keys(v as object);
        const same = ks.filter((k) => eq((o as Record<string, unknown>)[k], (v as Record<string, unknown>)[k])).length;
        return same * 2 >= ks.length ? same * 1000 - Math.abs(i - j) : -1;
      }
      return i === j ? 1 : -1; // 글자 항목은 같은 자리만
    };
    val.forEach((v, j) => {
      if (pick[j] !== null) return;
      let best = -1;
      let bestScore = -1;
      old.forEach((o, i) => {
        if (used.has(i)) return;
        const s = score(o, v, i, j);
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
      if (best >= 0) {
        pick[j] = -(best + 1); // 음수 = 고쳐 씀
        used.add(best);
      }
    });
    const out = val.map((v, j) => {
      const p = pick[j];
      let text: string;
      if (p !== null && p >= 0) text = chunks[p];
      else if (p !== null) {
        const i = -p - 1;
        text = applyEdits(chunks[i], diffNode(src, items[i], v), starts[i]);
      } else text = `${' '.repeat(dash)}- ${block(v, dash + 2)}\n`;
      return text.endsWith('\n') ? text : `${text}\n`;
    });
    let joined = out.join('');
    if (!src.slice(seqStart, seqEnd).endsWith('\n')) joined = joined.replace(/\n$/, '');
    return [{ start: seqStart, end: seqEnd, text: joined }];
  }

  // 모양이 바뀐 칸(글자 → 목록 등): 그 칸만 새로 쓴다
  if (val !== null && typeof val === 'object') return [{ start, end, text: flow(val) }];
  return [{ start, end, text: typeof val === 'string' ? dbl(val) : String(val) }];
}

/** 원문 src 를 next 값이 되도록 부분 고친다. 바뀐 것이 없으면 changed=false */
export function patchYaml(src: string, next: unknown): { text: string; changed: boolean } {
  const doc = parseDocument(src);
  if (doc.errors.length) throw new YamlPatchError(`파일 형식 오류: ${doc.errors[0].message.split('\n')[0]}`);
  const edits = diffNode(src, doc.contents as Node, next);
  if (!edits.length) return { text: src, changed: false };
  const text = applyEdits(src, edits);
  const check = parseDocument(text);
  if (check.errors.length || !eq(check.toJSON(), next)) {
    throw new YamlPatchError('저장할 내용을 파일로 바꾸는 중 확인에 실패했습니다. 관리자에게 알려 주세요(저장하지 않았습니다).');
  }
  return { text, changed: text !== src };
}

export function readYaml(src: string): unknown {
  const doc = parseDocument(src);
  if (doc.errors.length) throw new YamlPatchError(`파일 형식 오류: ${doc.errors[0].message.split('\n')[0]}`);
  return doc.toJSON();
}
