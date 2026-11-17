// GET /api/audit?page&kind&user&q : 수정 기록(audit_log). 관리자는 전체, 편집자는 본인 것만. 30건씩. (3-2e)
import { fail, json, type Env } from '../../server/http';
import { getSession } from '../../server/session';

const KINDS: Record<string, string[]> = {
  content: ['post_create', 'post_save', 'post_delete', 'page_save', 'settings_save', 'upload'],
  login: ['login_success', 'login_fail', 'login_locked', 'login_blocked', 'logout'],
  account: ['password_change', 'password_change_fail', 'profile_change', 'user_create', 'user_reset', 'user_unlock', 'user_update'],
};
const PER = 30;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const me = await getSession(env, request);
  if (!me) return fail(401, '로그인이 필요합니다.');
  const sp = new URL(request.url).searchParams;
  const where: string[] = [];
  const args: unknown[] = [];
  if (me.role !== 'admin') {
    where.push('a.user_id = ?');
    args.push(me.id);
  } else if (sp.get('user')) {
    where.push('a.user_id = ?');
    args.push(Number(sp.get('user')));
  }
  const kind = KINDS[sp.get('kind') ?? ''];
  if (kind) {
    where.push(`a.action IN (${kind.map(() => '?').join(',')})`);
    args.push(...kind);
  }
  const q = (sp.get('q') ?? '').trim();
  if (q) {
    where.push('(a.target LIKE ? OR a.detail LIKE ?)');
    args.push(`%${q}%`, `%${q}%`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log a ${w}`).bind(...args).first<{ n: number }>())?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER));
  const page = Math.min(pages, Math.max(1, Number(sp.get('page')) || 1));
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.action, a.target, a.detail, a.created_at, u.display_name AS name, u.username
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ${w}
      ORDER BY a.id DESC LIMIT ? OFFSET ?`,
  )
    .bind(...args, PER, (page - 1) * PER)
    .all<{ id: number; action: string; target: string; detail: string; created_at: number; name: string | null; username: string | null }>();
  const users =
    me.role === 'admin' ? (await env.DB.prepare('SELECT id, display_name AS name FROM users ORDER BY display_name').all<{ id: number; name: string }>()).results : [];
  return json({ ok: true, total, page, pages, items: results, users, all: me.role === 'admin' });
};
