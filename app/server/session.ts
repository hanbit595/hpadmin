// 세션·쿠키·기록 (명세 3·5절)
import { randomBytes, sha256Hex, toBase64Url } from './crypto';
import type { Env } from './http';

export const COOKIE_NAME = '__Host-hb_sess';
export const SESSION_HOURS_DEFAULT = 12;
export const SESSION_DAYS_REMEMBER = 30;

export interface SessionUser {
  sessionId: string;
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'editor';
  mustChange: boolean;
}

export function publicUser(u: SessionUser) {
  return { username: u.username, displayName: u.displayName, role: u.role, mustChange: u.mustChange };
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSec: number): string {
  return `${COOKIE_NAME}=${token}; Max-Age=${maxAgeSec}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export async function createSession(env: Env, userId: number, remember: boolean, userAgent: string) {
  const token = toBase64Url(randomBytes(32));
  const maxAgeSec = remember ? SESSION_DAYS_REMEMBER * 86400 : SESSION_HOURS_DEFAULT * 3600;
  const now = Date.now();
  const stmt = env.DB.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), userId, await sha256Hex(token), now + maxAgeSec * 1000, now, userAgent.slice(0, 300));
  return { token, maxAgeSec, stmt };
}

export async function getSession(env: Env, request: Request): Promise<SessionUser | null> {
  const token = getCookie(request, COOKIE_NAME);
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, u.id, u.username, u.display_name, u.role, u.must_change
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
  )
    .bind(await sha256Hex(token), Date.now())
    .first<{ session_id: string; id: number; username: string; display_name: string; role: 'admin' | 'editor'; must_change: number }>();
  if (!row) return null;
  return {
    sessionId: row.session_id,
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    mustChange: row.must_change === 1,
  };
}

export function auditStmt(env: Env, userId: number | null, action: string, target: string, detail: Record<string, unknown> = {}) {
  return env.DB.prepare('INSERT INTO audit_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(
    userId,
    action,
    target.slice(0, 200),
    JSON.stringify(detail),
    Date.now(),
  );
}

export async function audit(env: Env, userId: number | null, action: string, target: string, detail: Record<string, unknown> = {}) {
  await auditStmt(env, userId, action, target, detail).run();
}
