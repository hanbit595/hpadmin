// 게시판 글 저장·검사 공통 (명세 6-2절)
import { CATEGORIES, boardDir, boardLabel, isKoMedia, type Board, type Lang } from '../shared/boards';
import { ContentError, fileSha } from './content';
import { FormatError, validate } from './frontmatter';
import type { Env } from './http';
import type { SessionUser } from './session';

export function postPath(lang: Lang, board: Board, name: string): string {
  return `${boardDir(lang, board)}/${name}.md`;
}

export function commitMessage(lang: Lang, board: Board, kind: '저장' | '삭제', title: string, user: SessionUser): string {
  const t = title.replace(/\s+/g, ' ').trim().slice(0, 80);
  return `[관리자] ${boardLabel(lang, board)} ${kind}: ${t} (${user.displayName})`;
}

/** 화면이 바꿀 수 있는 칸(게시판별). 그 밖의 칸은 받지 않는다(기존 칸 보존). */
function allowedKeys(lang: Lang, board: Board): Record<string, 'text' | 'bool' | 'list' | 'int'> {
  const keys: Record<string, 'text' | 'bool' | 'list' | 'int'> = {
    title: 'text',
    date: 'text',
    draft: 'bool',
    thumbnail: 'text',
    summary: 'text',
  };
  if (isKoMedia(lang, board)) {
    Object.assign(keys, {
      category: 'list',
      capacity: 'text',
      program: 'text',
      gallery: 'list',
      featured: 'bool',
      featured_order: 'int',
      featured_image: 'text',
    });
  }
  if (board === 'library') keys.file = 'text';
  return keys;
}

/** 화면에서 받은 칸 값 정리(형식이 틀리면 400) */
export function cleanFields(lang: Lang, board: Board, input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ContentError(400, '입력 값이 올바르지 않습니다.');
  const allowed = allowedKeys(lang, board);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const kind = allowed[k];
    if (!kind) throw new ContentError(400, `이 게시판에서 바꿀 수 없는 칸입니다: ${k}`);
    if (kind === 'text') {
      if (typeof v !== 'string') throw new ContentError(400, `${k} 값이 올바르지 않습니다.`);
      out[k] = k === 'summary' ? v.replace(/\r\n/g, '\n').trim() : v.replace(/[\r\n]+/g, ' ').trim();
    } else if (kind === 'bool') {
      if (typeof v !== 'boolean') throw new ContentError(400, `${k} 값이 올바르지 않습니다.`);
      out[k] = v;
    } else if (kind === 'list') {
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new ContentError(400, `${k} 값이 올바르지 않습니다.`);
      out[k] = (v as string[]).map((x) => x.trim()).filter(Boolean);
    } else {
      if (v === '' || v === null) out[k] = '';
      else if (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1000) out[k] = v;
      else throw new ContentError(400, '메인 노출 순서는 0~999 숫자여야 합니다.');
    }
  }
  if (Array.isArray(out.category)) {
    for (const c of out.category as string[])
      if (!(CATEGORIES as readonly string[]).includes(c)) throw new ContentError(400, `분류 '${c}' 는 허용 목록에 없습니다.`);
  }
  return out;
}

/** 빌드 실패 조건 검사 + E-Catalog PDF 가 저장소에 있는지(바뀌었을 때만) */
export async function checkPost(
  env: Env,
  fm: Record<string, unknown>,
  lang: Lang,
  board: Board,
  where: string,
  fileChanged: boolean,
  renames: Record<string, string> = {},
): Promise<void> {
  try {
    validate(fm, lang, board, where);
  } catch (e) {
    if (e instanceof FormatError) throw new ContentError(400, e.message);
    throw e;
  }
  if (board === 'library' && fileChanged) {
    const file = String(fm.file).trim();
    if (!/\.pdf$/i.test(file)) throw new ContentError(400, 'E-Catalog 파일은 PDF 여야 합니다.');
    const rel = file.replace(/^\//, '').split(/[?#]/)[0];
    const repoPath = rel.toLowerCase().startsWith('uploads/') ? rel : `static/${renames[rel] ?? rel}`;
    const known = repoPath.startsWith('uploads/') && (await env.DB.prepare('SELECT 1 FROM uploads WHERE path = ?').bind(repoPath).first());
    if (!known && !(await fileSha(env, repoPath))) throw new ContentError(400, `E-Catalog PDF 가 홈페이지 저장소에 없습니다: ${file}`);
  }
}
