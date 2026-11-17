// 문의함(관리자·편집자). 3-2f
// GET /api/inquiries?status&q&page   목록(20건) + 상태별 건수
// GET /api/inquiries/{id}            상세
// PATCH /api/inquiries/{id}          {status?, memo?}
// GET /api/inquiries/export          CSV(엑셀용, UTF-8 BOM). status·q 필터 같음
// POST /api/inquiries/purge          1년 지난 완료 건 삭제(관리자만)
import { fail, json, readJson, str, type Env } from '../../../server/http';
import { auditStmt, getSession } from '../../../server/session';

const STATUS = ['new', 'read', 'done'];
const CUSTOMER: Record<string, string> = { personal: '개인', company: '기업', public: '공공' };
const PLACE: Record<string, string> = { house: '주택지붕', building: '건물', factory: '공장', parking: '주차장', land: '토지', etc: '기타' };
const STATUS_KO: Record<string, string> = { new: '신규', read: '확인', done: '완료' };
const YEAR_MS = 365 * 86400e3;

function filters(sp: URLSearchParams) {
  const where: string[] = [];
  const args: unknown[] = [];
  const st = sp.get('status') ?? '';
  if (STATUS.includes(st)) {
    where.push('status = ?');
    args.push(st);
  }
  const q = (sp.get('q') ?? '').trim();
  if (q) {
    where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ? OR region LIKE ? OR message LIKE ?)');
    args.push(...Array(5).fill(`%${q}%`));
  }
  return { w: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function kst(ms: number) {
  return new Date(ms + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const me = await getSession(env, request);
  if (!me) return fail(401, '로그인이 필요합니다.');
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const sp = new URL(request.url).searchParams;

  if (!parts.length && request.method === 'GET') {
    const { w, args } = filters(sp);
    const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM inquiries ${w}`).bind(...args).first<{ n: number }>())?.n ?? 0;
    const pages = Math.max(1, Math.ceil(total / 20));
    const page = Math.min(pages, Math.max(1, Number(sp.get('page')) || 1));
    const { results } = await env.DB.prepare(
      `SELECT id, lang, customer_type, place, region, name, phone, status, created_at FROM inquiries ${w} ORDER BY id DESC LIMIT 20 OFFSET ?`,
    )
      .bind(...args, (page - 1) * 20)
      .all();
    const counts = Object.fromEntries(
      (await env.DB.prepare('SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status').all<{ status: string; n: number }>()).results.map((r) => [r.status, r.n]),
    );
    return json({ ok: true, total, page, pages, items: results, counts });
  }

  if (parts[0] === 'export' && request.method === 'GET') {
    const { w, args } = filters(sp);
    const { results } = await env.DB.prepare(`SELECT * FROM inquiries ${w} ORDER BY id DESC`).bind(...args).all<Record<string, unknown>>();
    const head = ['번호', '접수 시각', '언어', '고객구분', '설치장소', '지역', '면적/전기요금', '관심사업', '이름', '연락처', '이메일', '문의내용', '상태', '메모'];
    const lines = results.map((r) =>
      [
        r.id,
        kst(Number(r.created_at)),
        r.lang === 'en' ? '영문' : '국문',
        CUSTOMER[String(r.customer_type)] ?? r.customer_type,
        PLACE[String(r.place)] ?? r.place,
        r.region,
        r.scale,
        r.interest,
        r.name,
        r.phone,
        r.email,
        r.message,
        STATUS_KO[String(r.status)],
        r.memo,
      ]
        .map(csvCell)
        .join(','),
    );
    await env.DB.prepare('INSERT INTO audit_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(me.id, 'inquiry_export', 'inquiries', JSON.stringify({ count: results.length }), Date.now())
      .run();
    return new Response(`﻿${[head.join(','), ...lines].join('\r\n')}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="inquiries-${kst(Date.now()).slice(0, 10)}.csv"`,
      },
    });
  }

  if (parts[0] === 'purge' && request.method === 'POST') {
    if (me.role !== 'admin') return fail(403, '관리자만 사용할 수 있는 기능입니다.');
    const r = await env.DB.prepare("DELETE FROM inquiries WHERE status = 'done' AND created_at < ?").bind(Date.now() - YEAR_MS).run();
    const n = r.meta.changes ?? 0;
    await env.DB.prepare('INSERT INTO audit_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(me.id, 'inquiry_purge', 'inquiries', JSON.stringify({ deleted: n }), Date.now())
      .run();
    return json({ ok: true, deleted: n });
  }

  const id = Number(parts[0]);
  if (!Number.isInteger(id) || parts.length > 1) return fail(404, '주소가 올바르지 않습니다.');
  const row = await env.DB.prepare('SELECT i.*, u.display_name AS handler FROM inquiries i LEFT JOIN users u ON u.id = i.handled_by WHERE i.id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return fail(404, '문의를 찾지 못했습니다.');
  if (request.method === 'GET') {
    // 처음 열면 신규 → 확인
    if (row.status === 'new') {
      await env.DB.prepare("UPDATE inquiries SET status = 'read', handled_by = ?, updated_at = ? WHERE id = ?").bind(me.id, Date.now(), id).run();
      row.status = 'read';
    }
    delete row.ip_hash;
    return json({ ok: true, item: row });
  }
  if (request.method === 'PATCH') {
    const b = await readJson(request);
    if (!b) return fail(400, '입력 값이 올바르지 않습니다.');
    const status = b.status === undefined ? String(row.status) : str(b.status);
    if (!STATUS.includes(status)) return fail(400, '상태 값이 올바르지 않습니다.');
    const memo = b.memo === undefined ? String(row.memo ?? '') : str(b.memo).slice(0, 2000);
    await env.DB.batch([
      env.DB.prepare('UPDATE inquiries SET status = ?, memo = ?, handled_by = ?, updated_at = ? WHERE id = ?').bind(status, memo, me.id, Date.now(), id),
      auditStmt(env, me.id, 'inquiry_update', `inquiry #${id}`, { status }),
    ]);
    return json({ ok: true });
  }
  return fail(405, '지원하지 않는 요청입니다.');
};
