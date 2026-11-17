// POST /api/auth/profile {displayName} : 내 표시 이름 변경 (3-2e)
import { fail, json, readJson, str, type Env } from '../../../server/http';
import { auditStmt, getSession } from '../../../server/session';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');
  const body = await readJson(request);
  const name = str(body?.displayName).trim();
  if (!name || name.length > 40) return fail(400, '표시 이름을 1~40자로 입력해 주세요.');
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').bind(name, Date.now(), user.id),
    auditStmt(env, user.id, 'profile_change', user.username, { displayName: name }),
  ]);
  return json({ ok: true, displayName: name });
};
