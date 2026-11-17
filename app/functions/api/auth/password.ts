// POST /api/auth/password: 현재 비밀번호 확인 후 변경 (8자 이상)
import { hashPassword, verifyPassword } from '../../../server/crypto';
import { clientIp, fail, json, readJson, str, type Env } from '../../../server/http';
import { audit, auditStmt, getSession } from '../../../server/session';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');

  const body = await readJson(request);
  if (!body) return fail(400, '요청 형식이 올바르지 않습니다.');
  const current = str(body.currentPassword);
  const next = str(body.newPassword);
  if (!current || !next) return fail(400, '현재 비밀번호와 새 비밀번호를 입력해 주세요.');
  if (next.length < 8) return fail(400, '새 비밀번호는 8자 이상이어야 합니다.');
  if (next.length > 256) return fail(400, '새 비밀번호가 너무 깁니다(256자 이하).');
  if (next === current) return fail(400, '새 비밀번호가 현재 비밀번호와 같습니다.');

  const ip = clientIp(request);
  const row = await env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ password_hash: string; password_salt: string }>();
  if (!row || !(await verifyPassword(current, row.password_salt, row.password_hash))) {
    await audit(env, user.id, 'password_change_fail', user.username, { reason: 'bad_current', ip });
    return fail(400, '현재 비밀번호가 올바르지 않습니다.');
  }

  const { hash, salt } = await hashPassword(next);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, must_change = 0, updated_at = ? WHERE id = ?').bind(
      hash,
      salt,
      Date.now(),
      user.id,
    ),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').bind(user.id, user.sessionId),
    auditStmt(env, user.id, 'password_change', user.username, { ip }),
  ]);
  return json({ ok: true, message: '비밀번호를 변경했습니다. 다른 기기의 로그인은 모두 해제되었습니다.' });
};
