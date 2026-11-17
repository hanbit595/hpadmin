// GET /api/media?q=&kind=image|video|pdf&page= : 사진 보관함(uploads/·static/ 의 파일, thumb- 축소본 제외). 로그인 필요.
import { ContentError } from '../../server/content';
import { fail, json, type Env } from '../../server/http';
import { getSession } from '../../server/session';
import { mediaList } from '../../server/sitefiles';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');
  const sp = new URL(request.url).searchParams;
  try {
    const r = await mediaList(env, { q: sp.get('q') ?? '', kind: sp.get('kind') ?? 'image', page: Number(sp.get('page') ?? '1') || 1 });
    return json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ContentError) return fail(e.status, e.message);
    throw e;
  }
};
