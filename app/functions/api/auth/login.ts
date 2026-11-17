// POST /api/auth/login (명세 3·6절)
import { DUMMY_HASH, DUMMY_SALT, verifyPassword } from '../../../server/crypto';
import { clientIp, fail, json, readJson, str, type Env } from '../../../server/http';
import { audit, auditStmt, createSession, sessionCookie } from '../../../server/session';

const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const BAD_LOGIN = '아이디 또는 비밀번호가 올바르지 않습니다.';

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'editor';
  password_hash: string;
  password_salt: string;
  active: number;
  failed_count: number;
  locked_until: number | null;
  must_change: number;
}

function lockMessage(remainMs: number, justLocked: boolean): string {
  const min = Math.max(1, Math.ceil(remainMs / 60000));
  return justLocked
    ? `비밀번호를 ${MAX_FAILS}회 잘못 입력하여 로그인이 10분 동안 잠겼습니다. 약 ${min}분 후에 다시 시도해 주세요.`
    : `로그인이 잠겨 있습니다. 약 ${min}분 후에 다시 시도해 주세요.`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson(request);
  if (!body) return fail(400, '요청 형식이 올바르지 않습니다.');
  const username = str(body.username).trim();
  const password = str(body.password);
  const remember = body.remember === true;
  if (!username || !password) return fail(400, '아이디와 비밀번호를 입력해 주세요.');
  if (username.length > 64 || password.length > 256) return fail(400, BAD_LOGIN);

  const ip = clientIp(request);
  const now = Date.now();
  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<UserRow>();

  if (!user) {
    await verifyPassword(password, DUMMY_SALT, DUMMY_HASH); // 응답 시간 맞춤
    await audit(env, null, 'login_fail', username, { reason: 'no_user', ip });
    return fail(401, BAD_LOGIN);
  }

  if (user.locked_until && user.locked_until > now) {
    await audit(env, user.id, 'login_blocked', user.username, { ip });
    return fail(423, lockMessage(user.locked_until - now, false), { lockedUntil: user.locked_until });
  }

  const ok = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!ok) {
    const row = await env.DB.prepare('UPDATE users SET failed_count = failed_count + 1 WHERE id = ? RETURNING failed_count')
      .bind(user.id)
      .first<{ failed_count: number }>();
    const count = row?.failed_count ?? MAX_FAILS;
    if (count >= MAX_FAILS) {
      const lockedUntil = now + LOCK_MS;
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = ? WHERE id = ?').bind(lockedUntil, user.id),
        auditStmt(env, user.id, 'login_locked', user.username, { reason: 'bad_password', count, ip }),
      ]);
      return fail(423, lockMessage(LOCK_MS, true), { lockedUntil });
    }
    await audit(env, user.id, 'login_fail', user.username, { reason: 'bad_password', count, ip });
    return fail(401, BAD_LOGIN);
  }

  if (!user.active) {
    await audit(env, user.id, 'login_fail', user.username, { reason: 'inactive', ip });
    return fail(403, '사용이 중지된 계정입니다. 관리자에게 문의해 주세요.');
  }

  const session = await createSession(env, user.id, remember, request.headers.get('User-Agent') ?? '');
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = NULL WHERE id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    session.stmt,
    auditStmt(env, user.id, 'login_success', user.username, { remember, ip }),
  ]);

  return json(
    { ok: true, user: { username: user.username, displayName: user.display_name, role: user.role, mustChange: user.must_change === 1 } },
    200,
    { 'Set-Cookie': sessionCookie(session.token, session.maxAgeSec) },
  );
};
