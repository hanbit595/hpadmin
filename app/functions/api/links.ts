// GET /api/links?lang=ko|en : 메뉴·팝업 링크로 고를 수 있는 사이트 안 페이지 목록(content/pages/meta.json + 게시판 목록). 로그인 필요.
// 페이지 이름은 같은 언어 menu.yml 의 이름표(없으면 주소의 파일 이름)
import { ContentError, getFile } from '../../server/content';
import { fail, json, type Env } from '../../server/http';
import { getSession } from '../../server/session';
import { siteMeta } from '../../server/sitefiles';
import { readYaml } from '../../server/yamlpatch';

function menuLabels(data: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const menu = (data as { menu?: unknown } | null)?.menu;
  if (!Array.isArray(menu)) return out;
  for (const m of menu as { label?: unknown; link?: unknown; items?: unknown }[]) {
    for (const s of Array.isArray(m.items) ? (m.items as { label?: unknown; link?: unknown }[]) : []) {
      if (typeof s.link === 'string' && !out.has(s.link)) out.set(s.link, `${String(m.label ?? '')} › ${String(s.label ?? '')}`);
    }
    if (typeof m.link === 'string' && m.link && !out.has(m.link)) out.set(m.link, String(m.label ?? ''));
  }
  return out;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');
  const lang = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'ko';
  try {
    const [meta, menuFile] = await Promise.all([siteMeta(env), getFile(env, `cms/${lang === 'en' ? 'en/' : ''}settings/menu.yml`)]);
    let labels = new Map<string, string>();
    try {
      labels = menuFile ? menuLabels(readYaml(menuFile.text)) : labels;
    } catch {
      // 메뉴 파일을 못 읽어도 목록은 준다
    }
    const items = meta.pages
      .filter((p) => p.lang === lang)
      .map((p) => ({ path: p.path, title: labels.get(p.path) ?? (p.title.includes('게시판') ? p.title : p.path.split('/').pop()!.replace(/\.html$/, '')) }))
      .sort((a, b) => a.path.localeCompare(b.path));
    return json({ ok: true, items });
  } catch (e) {
    if (e instanceof ContentError) return fail(e.status, e.message);
    throw e;
  }
};
