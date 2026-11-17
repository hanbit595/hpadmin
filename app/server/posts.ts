// 게시판 목록 색인: GraphQL 로 폴더 한 번에 읽기(폴더 tree oid 로 캐시) + 썸네일·표시 제목 (명세 6-2절)
import { boardDir, comparePosts, isKoMedia, mediaSubject, normDate, sitePath, type Board, type Lang } from '../shared/boards';
import { ContentError, NAME, OWNER, contentBranch, graphql } from './content';
import { FormatError, parseMd } from './frontmatter';
import type { Env } from './http';

export interface PostRow {
  name: string;
  sha: string;
  title: string;
  subject: string;
  category: string[];
  date: string;
  draft: boolean;
  featured: boolean;
  featuredOrder: number | null;
  thumb: string; // 사이트 안 경로(/data/…, /uploads/…) 또는 ''
  error?: string; // 머리말을 읽지 못한 글(빌드도 실패함)
}

export interface BoardIndex {
  oid: string;
  rows: PostRow[];
  renames: Record<string, string>;
}

const memory = new Map<string, BoardIndex>();
const IMG_EXT = /\.(jpe?g|png|gif|webp|bmp)$/i;

function firstImg(html: string): string {
  for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/gi)) {
    const p = sitePath(m[1]);
    if (p) return p;
  }
  return '';
}

export function rowOf(name: string, sha: string, text: string, lang: Lang, board: Board): PostRow {
  const where = `${boardDir(lang, board)}/${name}.md`;
  try {
    const md = parseMd(text, where);
    const fm = md.fm;
    const title = typeof fm.title === 'string' || typeof fm.title === 'number' ? String(fm.title) : '';
    let cats = fm.category;
    if (typeof cats === 'string') cats = [cats];
    const category = Array.isArray(cats) ? cats.map(String) : [];
    const str = (k: string) => (typeof fm[k] === 'string' || typeof fm[k] === 'number' ? String(fm[k]) : '');
    const subject = isKoMedia(lang, board) ? mediaSubject(category, title, str('capacity'), str('program')) : title;
    let thumb = str('thumbnail').trim();
    if (thumb) thumb = sitePath(thumb) ?? '';
    if (!thumb && Array.isArray(fm.files)) {
      const f = (fm.files as Record<string, unknown>[])
        .filter((x) => x && typeof x === 'object' && IMG_EXT.test(String(x.stored ?? '')))
        .sort((a, b) => Number(a.no ?? 0) - Number(b.no ?? 0))[0];
      if (f) thumb = String(f.stored);
    }
    if (!thumb) thumb = firstImg(md.body);
    return {
      name,
      sha,
      title,
      subject,
      category,
      date: normDate(typeof fm.date === 'string' ? fm.date : '') ?? '',
      draft: fm.draft === true,
      featured: fm.featured === true,
      featuredOrder: Number.isInteger(fm.featured_order) ? (fm.featured_order as number) : null,
      thumb,
    };
  } catch (e) {
    return {
      name, sha, title: name, subject: name, category: [], date: '', draft: false, featured: false, featuredOrder: null, thumb: '',
      error: e instanceof FormatError ? e.message : '읽지 못한 글',
    };
  }
}

interface TreeQ {
  repository: {
    folder: { oid: string } | null;
    renames: { text: string | null } | null;
  };
}

interface EntriesQ {
  repository: {
    folder: { oid: string; entries: { name: string; type: string; oid: string; object: { text: string | null; isTruncated: boolean } | null }[] } | null;
  };
}

/** 게시판 폴더 색인(정렬됨). 같은 폴더 oid 면 캐시를 쓴다. */
export async function boardIndex(env: Env, lang: Lang, board: Board): Promise<BoardIndex & { branch: string }> {
  const branch = contentBranch(env);
  const dir = boardDir(lang, board);
  const q1 = await graphql<TreeQ>(
    env,
    `query($o:String!,$n:String!,$e:String!,$r:String!){repository(owner:$o,name:$n){
      folder:object(expression:$e){oid}
      renames:object(expression:$r){... on Blob{text}}}}`,
    { o: OWNER, n: NAME, e: `${branch}:${dir}`, r: `${branch}:content/renames.json` },
  );
  const folder = q1.repository.folder;
  if (!folder) throw new ContentError(404, `저장소(${branch})에 게시판 폴더 ${dir}/ 가 없습니다.`);
  let renames: Record<string, string> = {};
  try {
    renames = JSON.parse(q1.repository.renames?.text ?? '{}') as Record<string, string>;
  } catch {
    renames = {};
  }
  const key = `${dir}|${folder.oid}`;
  const hit = memory.get(key);
  if (hit) return { ...hit, renames, branch };

  const q2 = await graphql<EntriesQ>(
    env,
    `query($o:String!,$n:String!,$e:String!){repository(owner:$o,name:$n){
      folder:object(expression:$e){... on Tree{oid entries{name type oid object{... on Blob{text isTruncated}}}}}}}`,
    { o: OWNER, n: NAME, e: `${branch}:${dir}` },
  );
  const entries = q2.repository.folder?.entries ?? [];
  const rows: PostRow[] = [];
  for (const e of entries) {
    if (e.type !== 'blob' || !e.name.toLowerCase().endsWith('.md')) continue;
    const name = e.name.slice(0, -3);
    const t = e.object?.text;
    if (t == null) {
      rows.push({ name, sha: e.oid, title: name, subject: name, category: [], date: '', draft: false, featured: false, featuredOrder: null, thumb: '', error: '파일 내용을 읽지 못했습니다.' });
      continue;
    }
    rows.push(rowOf(name, e.oid, t, lang, board));
  }
  rows.sort(comparePosts);
  const idx = { oid: folder.oid, rows, renames };
  memory.set(key, idx);
  if (memory.size > 30) memory.delete(memory.keys().next().value as string);
  return { ...idx, branch };
}
