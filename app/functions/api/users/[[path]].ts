// /api/users (직원 계정, 관리자 전용 — 권한 확인은 api/_middleware.ts). 3-2e
// GET /api/users                     목록
// POST /api/users                    추가 {username, displayName, role} → 임시 비밀번호(1회 표시), 첫 로그인 때 변경 강제
// POST /api/users/{id}/reset         비밀번호 초기화(임시 비밀번호, 그 사람 세션 모두 종료)
// POST /api/users/{id}/unlock        잠금 해제
// PATCH /api/users/{id}              {displayName?, role?, active?} (마지막 관리자 강등·중지 금지, 본인 중지·강등 금지)
import { hashPassword, randomBytes } from '../../../server/crypto';
import { fail, json, readJson, str, type Env } from '../../../server/http';
import { auditStmt, getSession, type SessionUser } from '../../../server/session';

interface Row {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'editor';
  active: number;
  failed_count: number;
  locked_until: number | null;
  must_change: number;
  created_at: number;
}

/** 헷갈리는 글자(0·O·1·l·I) 없는 12자 임시 비밀번호 */
function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(12), (b) => chars[b % chars.length]).join('');
}

function view(r: Row) {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    active: r.active === 1,
    locked: !!r.locked_until && r.locked_until > Date.now(),
    mustChange: r.must_change === 1,
    createdAt: r.created_at,
  };
}

async function activeAdmins(env: Env): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").first<{ n: number }>();
  return r?.n ?? 0;
}

async function create(env: Env, me: SessionUser, body: Record<string, unknown>) {
  const username = str(body.username).trim();
  const displayName = str(body.displayName).trim();
  const role = body.role === 'admin' ? 'admin' : 'editor';
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) return fail(400, '아이디는 영문·숫자·._- 3~32자로 정해 주세요.');
  if (!displayName || displayName.length > 40) return fail(400, '표시 이름을 1~40자로 입력해 주세요.');
  const dup = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (dup) return fail(409, '이미 있는 아이디입니다.');
  const temp = tempPassword();
  const { hash, salt } = await hashPassword(temp);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO users (username, display_name, role, password_hash, password_salt, must_change, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
    ).bind(username, displayName, role, hash, salt, now, now),
    auditStmt(env, me.id, 'user_create', username, { role }),
  ]);
  return json({ ok: true, username, tempPassword: temp });
}

async function act(env: Env, me: SessionUser, id: number, action: string, body: Record<string, unknown> | null, method: string) {
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<Row>();
  if (!u) return fail(404, '계정을 찾지 못했습니다.');
  const now = Date.now();
  if (method === 'POST' && action === 'reset') {
    const temp = tempPassword();
    const { hash, salt } = await hashPassword(temp);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, must_change = 1, failed_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?').bind(
        hash,
        salt,
        now,
        id,
      ),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
      auditStmt(env, me.id, 'user_reset', u.username, {}),
    ]);
    return json({ ok: true, username: u.username, tempPassword: temp });
  }
  if (method === 'POST' && action === 'unlock') {
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?').bind(now, id),
      auditStmt(env, me.id, 'user_unlock', u.username, {}),
    ]);
    return json({ ok: true });
  }
  if (method === 'PATCH' && !action && body) {
    const role = body.role === undefined ? u.role : body.role === 'admin' ? 'admin' : 'editor';
    const active = body.active === undefined ? u.active === 1 : body.active === true;
    const displayName = body.displayName === undefined ? u.display_name : str(body.displayName).trim();
    if (!displayName || displayName.length > 40) return fail(400, '표시 이름을 1~40자로 입력해 주세요.');
    const losesAdmin = u.role === 'admin' && u.active === 1 && (role !== 'admin' || !active);
    if (losesAdmin && (await activeAdmins(env)) <= 1) return fail(400, '마지막 관리자는 편집자로 바꾸거나 중지할 수 없습니다. 먼저 다른 관리자를 지정해 주세요.');
    if (losesAdmin && id === me.id) return fail(400, '내 계정의 관리자 권한을 내리거나 중지할 수 없습니다. 다른 관리자에게 요청해 주세요.');
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET display_name = ?, role = ?, active = ?, updated_at = ? WHERE id = ?').bind(displayName, role, active ? 1 : 0, now, id),
      // 중지하면 바로 로그아웃
      ...(active ? [] : [env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id)]),
      auditStmt(env, me.id, 'user_update', u.username, { role, active, displayName }),
    ]);
    return json({ ok: true });
  }
  return fail(405, '지원하지 않는 요청입니다.');
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const me = await getSession(env, request);
  if (!me) return fail(401, '로그인이 필요합니다.');
  if (me.role !== 'admin') return fail(403, '관리자만 사용할 수 있는 기능입니다.');
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  if (!parts.length) {
    if (request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY active DESC, role, username').all<Row>();
      return json({ ok: true, users: results.map(view), me: me.id });
    }
    if (request.method === 'POST') {
      const body = await readJson(request);
      if (!body) return fail(400, '입력 값이 올바르지 않습니다.');
      return create(env, me, body);
    }
    return fail(405, '지원하지 않는 요청입니다.');
  }
  const id = Number(parts[0]);
  if (!Number.isInteger(id) || parts.length > 2) return fail(404, '주소가 올바르지 않습니다.');
  const body = request.method === 'PATCH' ? await readJson(request) : null;
  return act(env, me, id, parts[1] ?? '', body, request.method);
};
