// /api/posts/{lang}/{board}/{name} : 글 1건 읽기(GET)·수정(PUT) (명세 6-2절). 로그인 필요(편집자 가능).
import { isBoard, isKoMedia, isLang, kstNow, NAME_RE, sitePath, type Board, type Lang } from '../../../shared/boards';
import { resolvePaths } from '../../../server/resolve';
import { ContentError, contentBranch, deleteFile, fileSha, getFile, putFile } from '../../../server/content';
import { FormatError, editFrontMatter, newMd, parseMd, rebuild } from '../../../server/frontmatter';
import { fail, json, readJson, type Env } from '../../../server/http';
import { listPosts } from '../../../server/list';
import { removePostUploads, setPostRefs, uploadRefs } from '../../../server/uploads';
import { checkPost, cleanFields, commitMessage, postPath } from '../../../server/save';
import { audit, getSession, type SessionUser } from '../../../server/session';

interface Target {
  lang: Lang;
  board: Board;
  name?: string;
}

function target(params: Record<string, string | string[]>): Target | null {
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const [lang, board, name, ...rest] = parts;
  if (!isLang(lang) || !isBoard(board) || rest.length) return null;
  if (name !== undefined && !NAME_RE.test(name)) return null;
  return { lang, board, name };
}

async function readPost(env: Env, t: Required<Target>) {
  const path = postPath(t.lang, t.board, t.name);
  const file = await getFile(env, path);
  if (!file) throw new ContentError(404, '글을 찾지 못했습니다. 이미 삭제되었을 수 있습니다.');
  try {
    return { path, file, md: parseMd(file.text, path) };
  } catch (e) {
    if (e instanceof FormatError) throw new ContentError(422, `이 글의 파일 형식을 읽지 못했습니다. ${e.message}`);
    throw e;
  }
}

/** 글 안의 사진 경로(사이트 안): 대표 사진·메인 사진·현장 사진·첨부 사진·본문 img */
function imagePaths(fm: Record<string, unknown>, body: string): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    const p = typeof v === 'string' ? sitePath(v.trim()) : null;
    if (p) out.push(p);
  };
  add(fm.thumbnail);
  add(fm.featured_image);
  if (Array.isArray(fm.gallery)) fm.gallery.forEach((g) => add(g && typeof g === 'object' ? (g as Record<string, unknown>).image : g));
  if (Array.isArray(fm.files)) fm.files.forEach((f) => add(f && typeof f === 'object' ? (f as Record<string, unknown>).stored : ''));
  for (const m of body.matchAll(/<img\b[^>]*?\ssrc\s*=\s*"([^"]*)"/gi)) add(m[1]);
  return out;
}

async function onGet(env: Env, t: Required<Target>) {
  const [{ path, file, md }, rn] = await Promise.all([readPost(env, t), getFile(env, 'content/renames.json').catch(() => null)]);
  let renames: Record<string, string> = {};
  try {
    renames = rn ? (JSON.parse(rn.text) as Record<string, string>) : {};
  } catch {
    renames = {};
  }
  const resolved = await resolvePaths(env, imagePaths(md.fm, md.body), renames, 'view').catch(() => ({}) as Record<string, string>);
  return json({ ok: true, path, sha: file.sha, fm: md.fm, body: md.body, branch: contentBranch(env), resolved });
}

async function onPut(env: Env, request: Request, user: SessionUser, t: Required<Target>) {
  const input = await readJson(request);
  if (!input) return fail(400, '입력 값이 올바르지 않습니다.');
  const sha = typeof input.sha === 'string' ? input.sha : '';
  if (!sha) return fail(400, '글을 연 때의 버전 정보(sha)가 없습니다. 글을 다시 열어 주세요.');
  const fields = cleanFields(t.lang, t.board, input.fields ?? {});
  const body = typeof input.body === 'string' ? input.body : undefined;

  const { path, file, md } = await readPost(env, t);
  if (file.sha !== sha) {
    return fail(409, '다른 사람이 먼저 이 글을 고쳤습니다. 내 변경 내용을 따로 복사해 두고, 글을 다시 연 뒤 저장해 주세요.');
  }
  const bodyChanged = body !== undefined && body.replace(/^[\r\n]+|[\r\n]+$/g, '') !== md.body;
  // 본문을 HTML 로 고쳐 저장하는데 markdown 글이었으면 형식 칸을 html 로
  if (bodyChanged && String(md.fm.body_format ?? '').toLowerCase() !== 'html') fields.body_format = 'html';
  const ed = editFrontMatter(md.fmText, md.fm, fields);
  if (!ed.changed.length && !bodyChanged) return json({ ok: true, unchanged: true, sha: file.sha, path, branch: contentBranch(env) });

  const text = rebuild(md, ed.fmText, bodyChanged ? body : undefined);
  const next = parseMd(text, path);
  await checkPost(env, next.fm, t.lang, t.board, path, ed.changed.includes('file'));
  const title = String(next.fm.title ?? t.name);
  await checkUploadsExist(env, text, md.fmText + md.body);
  const res = await putFile(env, path, text, commitMessage(t.lang, t.board, '저장', title, user), file.sha);
  await audit(env, user.id, 'post_save', path, { title, changed: ed.changed, body: bodyChanged, commit: res.commit.slice(0, 7) });
  await setPostRefs(env, path, text);
  return json({ ok: true, sha: res.sha, commit: res.commit, path, changed: ed.changed, bodyChanged, branch: contentBranch(env) });
}

/** 새로 적힌 /uploads/… 파일이 저장소에 실제로 있는지(올리기 실패한 사진을 가리키는 글을 막음) */
async function checkUploadsExist(env: Env, text: string, before: string) {
  const old = new Set(uploadRefs(before));
  const added = uploadRefs(text).filter((u) => !old.has(u));
  for (const u of added.slice(0, 30)) {
    // 관리자 화면으로 올린 파일은 D1 기록(커밋 성공 뒤 남김)으로 확인, 아니면 저장소에 물어봄
    const known = await env.DB.prepare('SELECT 1 FROM uploads WHERE path = ?').bind(u).first();
    if (!known && !(await fileSha(env, u))) throw new ContentError(400, `글에 넣은 파일이 저장소에 없습니다(올리기 실패): /${u}. 그 사진·첨부를 다시 넣어 주세요.`);
  }
}

/** 새 글: 파일명 = 저장 시각(한국) YYYYMMDD-HHMMSS, 이미 있으면 1초씩 늘림 */
async function onPost(env: Env, request: Request, user: SessionUser, t: Target) {
  const input = await readJson(request);
  if (!input) return fail(400, '입력 값이 올바르지 않습니다.');
  const f = cleanFields(t.lang, t.board, input.fields ?? {});
  const body = typeof input.body === 'string' ? input.body : '';
  const koMedia = isKoMedia(t.lang, t.board);
  const fields: [string, unknown][] = [
    ['title', f.title ?? ''],
    ...(koMedia ? ([['category', f.category ?? []], ['capacity', f.capacity ?? ''], ['program', f.program ?? '']] as [string, unknown][]) : []),
    ['date', f.date || kstNow()],
    ['thumbnail', f.thumbnail ?? ''],
    ['summary', f.summary ?? ''],
    ...(koMedia
      ? ([
          ['gallery', f.gallery ?? []],
          ['featured', f.featured ?? false],
          ...(f.featured_order !== undefined && f.featured_order !== '' ? [['featured_order', f.featured_order]] : []),
          ['featured_image', f.featured_image ?? ''],
        ] as [string, unknown][])
      : []),
    ...(t.board === 'library' ? ([['file', f.file ?? '']] as [string, unknown][]) : []),
    ['draft', f.draft ?? false],
    ['body_format', 'html'],
  ];
  const text = newMd(fields, body);
  const where = postPath(t.lang, t.board, 'new');
  await checkPost(env, parseMd(text, where).fm, t.lang, t.board, where, true);
  const title = String(f.title);
  await checkUploadsExist(env, text, '');
  let now = Date.now();
  for (let i = 0; i < 5; i++, now += 1000) {
    const name = kstNow(now).replace(/[-:]/g, '').replace(' ', '-');
    const path = postPath(t.lang, t.board, name);
    if (await fileSha(env, path)) continue;
    try {
      const res = await putFile(env, path, text, commitMessage(t.lang, t.board, '저장', title, user));
      await audit(env, user.id, 'post_create', path, { title, commit: res.commit.slice(0, 7) });
      await setPostRefs(env, path, text);
      return json({ ok: true, name, path, sha: res.sha, commit: res.commit, branch: contentBranch(env) });
    } catch (e) {
      if (e instanceof ContentError && e.status === 422) continue; // 그 사이 같은 이름이 생김
      throw e;
    }
  }
  return fail(409, '새 글 이름을 정하지 못했습니다. 잠시 후 다시 저장해 주세요.');
}

async function onDelete(env: Env, request: Request, user: SessionUser, t: Required<Target>) {
  const sha = new URL(request.url).searchParams.get('sha') ?? '';
  if (!sha) return fail(400, '글을 연 때의 버전 정보(sha)가 없습니다. 글을 다시 열어 주세요.');
  const { path, file, md } = await readPost(env, t);
  if (file.sha !== sha) return fail(409, '다른 사람이 먼저 이 글을 고쳤습니다. 글을 다시 열어 확인한 뒤 삭제해 주세요.');
  const title = String(md.fm.title ?? t.name);
  const commit = await deleteFile(env, path, file.sha, commitMessage(t.lang, t.board, '삭제', title, user));
  // 그 글에서만 쓰던(관리자 화면으로 올린) 사진·첨부도 지운다
  const removed = await removePostUploads(env, user, path, file.text);
  await audit(env, user.id, 'post_delete', path, { title, commit: commit.slice(0, 7), uploadsRemoved: removed });
  return json({ ok: true, path, commit, removed, branch: contentBranch(env) });
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');
  try {
    if (!params.path || (Array.isArray(params.path) && params.path.length === 0)) {
      if (request.method === 'GET') return await listPosts(env, new URL(request.url));
      return fail(405, '지원하지 않는 요청입니다.');
    }
    const t = target(params);
    if (!t) return fail(404, '게시판 또는 글 주소가 올바르지 않습니다.');
    if (t.name) {
      const tt = t as Required<Target>;
      if (request.method === 'GET') return await onGet(env, tt);
      if (request.method === 'PUT') return await onPut(env, request, user, tt);
      if (request.method === 'DELETE') return await onDelete(env, request, user, tt);
    } else if (request.method === 'POST') return await onPost(env, request, user, t);
    return fail(405, '지원하지 않는 요청입니다.');
  } catch (e) {
    if (e instanceof ContentError) return fail(e.status, e.message);
    throw e;
  }
};
