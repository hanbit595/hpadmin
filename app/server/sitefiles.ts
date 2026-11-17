// 사이트 파일 확인·목록 (명세 6-3절)
// - 존재 확인: 빌드가 만드는 페이지(content/pages/meta.json 의 out, 게시판 목록) + static/(renames.json 반영) + uploads/(D1 기록 우선)
// - 사진 보관함: uploads/·static/ 의 이미지(thumb- 축소본 제외), 폴더 oid 로 캐시
import { NAME, OWNER, contentBranch, getFile, graphql } from './content';
import type { Env } from './http';

const IMAGE = /\.(jpe?g|png|gif|webp|svg)$/i;
const VIDEO = /\.(mp4|mov|webm)$/i;
const PDF = /\.pdf$/i;

export interface SiteMeta {
  renames: Record<string, string>;
  pages: { path: string; title: string; lang: string }[];
}

export async function siteMeta(env: Env): Promise<SiteMeta> {
  const [rn, meta] = await Promise.all([getFile(env, 'content/renames.json'), getFile(env, 'content/pages/meta.json')]);
  let renames: Record<string, string> = {};
  let pages: SiteMeta['pages'] = [];
  try {
    renames = rn ? (JSON.parse(rn.text) as Record<string, string>) : {};
  } catch {
    renames = {};
  }
  try {
    const m = meta ? (JSON.parse(meta.text) as Record<string, { out: string; title: string; lang: string }>) : {};
    pages = Object.values(m).map((p) => ({ path: `/${p.out}`, title: String(p.title ?? '').replace(/\s*\|\s*HANBIT Innotech\s*$/, ''), lang: p.lang }));
  } catch {
    pages = [];
  }
  for (const [lang, pre] of [
    ['ko', ''],
    ['en', 'en/'],
  ] as const) {
    for (const [b, t] of [
      ['notice', lang === 'en' ? 'News' : '회사소식'],
      ['media', lang === 'en' ? 'Project Cases' : '시공사례'],
      ['library', 'E-Catalog'],
    ])
      pages.push({ path: `/${pre}board/${b}/index.html`, title: `${t} (게시판 목록)`, lang });
  }
  return { renames, pages };
}

/** 사이트 주소들 중 public/ 에 없을 것들을 돌려준다 */
export async function missingPaths(env: Env, paths: string[], meta: SiteMeta): Promise<Set<string>> {
  const branch = contentBranch(env);
  const generated = new Set(meta.pages.map((p) => p.path.toLowerCase()));
  const todo: { p: string; repo: string[] }[] = [];
  for (const p of [...new Set(paths)]) {
    const rel = decodeSafe(p.replace(/^\//, '').split(/[?#]/)[0]);
    if (generated.has(`/${rel}`.toLowerCase())) continue;
    if (/^uploads\//i.test(rel)) {
      const known = await env.DB.prepare('SELECT 1 FROM uploads WHERE path = ?').bind(rel).first();
      if (known) continue;
      todo.push({ p, repo: [rel] });
    } else todo.push({ p, repo: [`static/${meta.renames[rel] ?? rel}`] });
  }
  const missing = new Set<string>();
  for (let i = 0; i < todo.length; i += 40) {
    const part = todo.slice(i, i + 40);
    const vars: Record<string, unknown> = { o: OWNER, n: NAME };
    const q = part
      .map((t, k) => {
        vars[`e${k}`] = `${branch}:${t.repo[0]}`;
        return `f${k}:object(expression:$e${k}){oid}`;
      })
      .join(' ');
    const decl = part.map((_, k) => `$e${k}:String!`).join(',');
    const data = await graphql<{ repository: Record<string, { oid: string } | null> }>(
      env,
      `query($o:String!,$n:String!,${decl}){repository(owner:$o,name:$n){${q}}}`,
      vars,
    );
    part.forEach((t, k) => {
      if (!data.repository[`f${k}`]) missing.add(t.p);
    });
  }
  return missing;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ───── 사진 보관함 ─────
interface TreeQ {
  repository: { st: { oid: string } | null; up: { oid: string; entries: { name: string; type: string }[] } | null };
}
const treeCache = new Map<string, string[]>();

async function staticFiles(env: Env, oid: string): Promise<string[]> {
  const hit = treeCache.get(oid);
  if (hit) return hit;
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${NAME}/git/trees/${oid}?recursive=1`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'hanbit-admin',
      ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!res.ok) return [];
  const j = (await res.json()) as { tree: { path: string; type: string }[] };
  const files = j.tree.filter((e) => e.type === 'blob').map((e) => e.path);
  treeCache.set(oid, files);
  if (treeCache.size > 10) treeCache.delete(treeCache.keys().next().value as string);
  return files;
}

export async function mediaList(env: Env, opts: { q: string; kind: string; page: number }) {
  const branch = contentBranch(env);
  const data = await graphql<TreeQ>(
    env,
    `query($o:String!,$n:String!,$s:String!,$u:String!){repository(owner:$o,name:$n){
      st:object(expression:$s){oid} up:object(expression:$u){... on Tree{oid entries{name type}}}}}`,
    { o: OWNER, n: NAME, s: `${branch}:static`, u: `${branch}:uploads` },
  );
  const test = opts.kind === 'video' ? VIDEO : opts.kind === 'pdf' ? PDF : IMAGE;
  const uploads = (data.repository.up?.entries ?? [])
    .filter((e) => e.type === 'blob' && test.test(e.name))
    .map((e) => `/uploads/${e.name}`)
    .sort()
    .reverse();
  const st = data.repository.st ? await staticFiles(env, data.repository.st.oid) : [];
  const stat = st
    .filter((p) => test.test(p) && !/(^|\/)thumb-/.test(p))
    .map((p) => `/${p}`)
    .sort();
  const q = opts.q.trim().toLowerCase();
  const all = [...uploads, ...stat].filter((p) => !q || p.toLowerCase().includes(q));
  const per = 60;
  const pages = Math.max(1, Math.ceil(all.length / per));
  const page = Math.min(pages, Math.max(1, opts.page));
  return { branch, total: all.length, page, pages, items: all.slice((page - 1) * per, page * per) };
}
