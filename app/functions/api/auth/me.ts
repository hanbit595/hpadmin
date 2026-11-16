// GET /api/auth/me
import { fail, json, type Env } from '../../../server/http';
import { getSession, publicUser } from '../../../server/session';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');
  return json({ ok: true, user: publicUser(user) });
};
