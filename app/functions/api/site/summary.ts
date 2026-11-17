// GET /api/site/summary?lang=ko|en : 글 수(국문·영문)·인증 건수·현재 팝업(요청 언어). 로그인 필요, 읽기 전용.
import { parse } from 'yaml';
import { GitHubError, REPO, ghGet, ghJson } from '../../../server/github';
import { fail, json, type Env } from '../../../server/http';
import { getSession } from '../../../server/session';

interface TreeEntry {
  path: string;
  type: string;
  sha: string;
}

type Lang = 'ko' | 'en';
const BOARDS = ['notice', 'media', 'library'] as const;

function base(lang: Lang) {
  return lang === 'ko' ? 'cms/' : 'cms/en/';
}

function countMd(tree: TreeEntry[], dir: string): number {
  return tree.filter((e) => e.type === 'blob' && e.path.startsWith(dir) && e.path.endsWith('.md') && !e.path.slice(dir.length).includes('/'))
    .length;
}

async function readYaml(env: Env, tree: TreeEntry[], path: string): Promise<unknown> {
  const entry = tree.find((e) => e.path === path && e.type === 'blob');
  if (!entry) return null;
  // 파일 내용은 sha 로 고정되므로 1시간 캐시
  const text = await ghGet(env, `/repos/${REPO}/git/blobs/${entry.sha}`, { raw: true, ttl: 3600 });
  try {
    return parse(text);
  } catch {
    throw new GitHubError(`${path} 파일 형식을 읽지 못했습니다.`);
  }
}

function certCount(doc: unknown): number {
  const items = (doc as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items.length : 0;
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function dateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v == null ? '' : String(v).trim();
}

function currentPopups(doc: unknown) {
  const list = (doc as { popups?: unknown } | null)?.popups;
  if (!Array.isArray(list)) return [];
  const today = kstToday();
  return list
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .filter((p) => p.active === true || p.active === 'true')
    .map((p) => ({ title: String(p.title ?? ''), start: dateStr(p.start), end: dateStr(p.end), link: String(p.link ?? '') }))
    .filter((p) => (!p.start || p.start <= today) && (!p.end || today <= p.end));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');
  const lang: Lang = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'ko';

  try {
    // 글 수는 게시판 저장 대상 브랜치 기준(3-2c). 설정이 없으면 main
    const branch = (env.CONTENT_BRANCH ?? '').trim() || 'main';
    const treeRes = await ghJson<{ sha: string; truncated: boolean; tree: TreeEntry[] }>(
      env,
      `/repos/${REPO}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    );
    const tree = treeRes.tree;
    const [certKo, certEn, popups] = await Promise.all([
      readYaml(env, tree, 'cms/pages/cert.yml'),
      readYaml(env, tree, 'cms/en/pages/cert.yml'),
      readYaml(env, tree, `${base(lang)}settings/popups.yml`),
    ]);
    const counts = (l: Lang, cert: unknown) => ({
      ...Object.fromEntries(BOARDS.map((b) => [b, countMd(tree, `${base(l)}${b}/`)])),
      cert: certCount(cert),
    });
    return json({
      ok: true,
      lang,
      counts: { ko: counts('ko', certKo), en: counts('en', certEn) },
      popups: currentPopups(popups),
      today: kstToday(),
      truncated: treeRes.truncated,
    });
  } catch (e) {
    if (e instanceof GitHubError) return fail(502, e.message);
    throw e;
  }
};
