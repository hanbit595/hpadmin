// POST /api/uploads?path=uploads/…&name=원래이름 : 사진·첨부 1개를 저장 대상 브랜치에 커밋 (명세 6-2절). 로그인 필요(편집자 가능).
// 본문 = 파일 바이트(사진은 브라우저에서 1920px·JPEG 85 로 줄여 보냄)
import { FILE_MAX } from '../../shared/boards';
import { ContentError } from '../../server/content';
import { fail, json, type Env } from '../../server/http';
import { getSession } from '../../server/session';
import { saveUpload } from '../../server/uploads';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');
  const sp = new URL(request.url).searchParams;
  const path = sp.get('path') ?? '';
  const name = sp.get('name') ?? '';
  const len = Number(request.headers.get('Content-Length') ?? '0');
  if (len > FILE_MAX + 1024) return fail(413, '파일이 너무 큽니다(사진 10MB, 첨부 20MB 이하).');
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const r = await saveUpload(env, user, path, bytes, name);
    return json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ContentError) return fail(e.status, e.message);
    throw e;
  }
};
