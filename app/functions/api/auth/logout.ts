// POST /api/auth/logout
import { sha256Hex } from '../../../server/crypto';
import { clientIp, json, type Env } from '../../../server/http';
import { COOKIE_NAME, auditStmt, clearCookie, getCookie, getSession } from '../../../server/session';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(env, request);
  const token = getCookie(request, COOKIE_NAME);
  if (token && token.length <= 100) {
    const stmts = [env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token))];
    if (user) stmts.push(auditStmt(env, user.id, 'logout', user.username, { ip: clientIp(request) }));
    await env.DB.batch(stmts);
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
};
