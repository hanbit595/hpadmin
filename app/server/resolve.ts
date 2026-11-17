// 기존 사진 주소(/data/editor/… 등) → 홈페이지에 실제로 있는 파일 경로 (hopage boards.Site 규칙)
// 배포본에는 원본 대신 빌드가 만든 large-{이름}.jpg(확대본)·thumb-{이름}_가로x세로.*(축소본)만 있는 경우가 많다.
// 순서: 원본(이름 바뀜 renames.json 반영) → (목록) thumb_420x280·900x600 → large-{이름}.jpg → thumb-{이름}_1400x* → 아무 thumb
import { NAME, OWNER, contentBranch, graphql } from './content';
import type { Env } from './http';

const folders = new Map<string, { expires: number; names: Map<string, string> }>();
const TTL = 3600e3;

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function listFolders(env: Env, branch: string, dirs: string[]): Promise<void> {
  const now = Date.now();
  const need = dirs.filter((d) => (folders.get(`${branch}:${d}`)?.expires ?? 0) <= now).slice(0, 40);
  if (!need.length) return;
  const vars: Record<string, unknown> = { o: OWNER, n: NAME };
  const decl = need.map((_, i) => `$e${i}:String!`).join(',');
  const body = need
    .map((d, i) => {
      vars[`e${i}`] = `${branch}:static/${d}`;
      return `f${i}:object(expression:$e${i}){... on Tree{entries{name}}}`;
    })
    .join(' ');
  const data = await graphql<{ repository: Record<string, { entries: { name: string }[] } | null> }>(
    env,
    `query($o:String!,$n:String!,${decl}){repository(owner:$o,name:$n){${body}}}`,
    vars,
  );
  need.forEach((d, i) => {
    const names = new Map<string, string>();
    for (const e of data.repository[`f${i}`]?.entries ?? []) names.set(e.name.toLowerCase(), e.name);
    folders.set(`${branch}:${d}`, { expires: now + TTL, names });
  });
  if (folders.size > 500) folders.delete(folders.keys().next().value as string);
}

/** 사이트 경로 목록 → { 원래 경로: 실제 경로 }. /uploads/ 와 바깥 주소는 넣지 않는다(화면이 따로 처리). */
export async function resolvePaths(
  env: Env,
  paths: string[],
  renames: Record<string, string>,
  mode: 'list' | 'view',
): Promise<Record<string, string>> {
  const branch = contentBranch(env);
  const lowerRenames = new Map(Object.entries(renames).map(([k, v]) => [k.toLowerCase(), v]));
  const items = [...new Set(paths)]
    .filter((p) => p.startsWith('/') && !/^\/uploads\//i.test(p))
    .map((p) => {
      let rel = decode(p.replace(/^\//, '').split(/[?#]/)[0]);
      rel = lowerRenames.get(rel.toLowerCase()) ?? rel;
      const i = rel.lastIndexOf('/');
      return { p, rel, dir: i < 0 ? '' : rel.slice(0, i), name: i < 0 ? rel : rel.slice(i + 1) };
    });
  if (!items.length) return {};
  await listFolders(env, branch, [...new Set(items.map((x) => x.dir))]);
  const out: Record<string, string> = {};
  for (const x of items) {
    const names = folders.get(`${branch}:${x.dir}`)?.names;
    if (!names) continue;
    const stem = x.name.replace(/\.[^.]+$/, '').toLowerCase();
    const pick = (n: string | undefined) => (n ? `/${x.dir ? `${x.dir}/` : ''}${n}` : undefined);
    const thumbs = [...names.keys()].filter((n) => n.startsWith(`thumb-${stem}_`));
    const found =
      (mode === 'view' ? pick(names.get(x.name.toLowerCase())) : undefined) ??
      (mode === 'list'
        ? pick(names.get(thumbs.find((n) => /_420x280\./.test(n)) ?? '')) ??
          pick(names.get(thumbs.find((n) => /_900x600\./.test(n)) ?? '')) ??
          pick(names.get(x.name.toLowerCase()))
        : undefined) ??
      pick(names.get(`large-${stem}.jpg`)) ??
      pick(names.get(thumbs.find((n) => /_1400x\d+\./.test(n)) ?? '')) ??
      pick(names.get(thumbs[0] ?? ''));
    if (found) out[x.p] = found;
  }
  return out;
}
