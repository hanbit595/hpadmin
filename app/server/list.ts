// GET /api/posts?lang&board&page&q&category&hidden : 게시판 목록 20건씩 (명세 6-2절)
import { isBoard, isLang } from '../shared/boards';
import { fail, json, type Env } from './http';
import { boardIndex } from './posts';
import { resolvePaths } from './resolve';

const PER_PAGE = 20;

export async function listPosts(env: Env, url: URL): Promise<Response> {
  const sp = url.searchParams;
  const lang = sp.get('lang');
  const board = sp.get('board');
  if (!isLang(lang) || !isBoard(board)) return fail(400, '게시판을 찾지 못했습니다.');

  const idx = await boardIndex(env, lang, board);
  const q = (sp.get('q') ?? '').trim().toLowerCase();
  const category = sp.get('category') ?? '';
  const hidden = sp.get('hidden') ?? '';
  let rows = idx.rows;
  if (q) rows = rows.filter((r) => r.subject.toLowerCase().includes(q) || r.name.includes(q));
  if (category) rows = rows.filter((r) => r.category.includes(category));
  if (hidden === '1') rows = rows.filter((r) => r.draft);
  else if (hidden === '0') rows = rows.filter((r) => !r.draft);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1));
  const items = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  // 썸네일: 홈페이지에 실제로 있는 파일(축소본)로. 읽지 못해도 목록은 보여 준다
  const resolved = await resolvePaths(env, items.map((r) => r.thumb).filter(Boolean), idx.renames, 'list').catch(() => ({}) as Record<string, string>);
  return json({
    ok: true,
    branch: idx.branch,
    total: idx.rows.length,
    hiddenCount: idx.rows.filter((r) => r.draft).length,
    found: rows.length,
    page,
    pages,
    perPage: PER_PAGE,
    items: items.map((r) => ({ ...r, thumb: resolved[r.thumb] ?? r.thumb })),
  });
}
