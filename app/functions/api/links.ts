// GET /api/links?lang=ko|en : 메뉴 링크로 고를 수 있는 사이트 안 페이지 목록(content/pages/meta.json + 게시판 목록). 로그인 필요.
import { ContentError } from '../../server/content';
import { fail, json, type Env } from '../../server/http';
import { getSession } from '../../server/session';
import { siteMeta } from '../../server/sitefiles';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');
  const lang = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'ko';
  try {
    const meta = await siteMeta(env);
    return json({ ok: true, items: meta.pages.filter((p) => p.lang === lang).sort((a, b) => a.path.localeCompare(b.path)) });
  } catch (e) {
    if (e instanceof ContentError) return fail(e.status, e.message);
    throw e;
  }
};
