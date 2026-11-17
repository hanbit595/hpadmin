// /api/* 공통: POST 등 출처 확인, 관리자 전용 경로 권한 확인, 오류 처리, 보안 헤더 (명세 3절)
import { SECURITY_HEADERS, fail, type Env } from '../../server/http';
import { getSession } from '../../server/session';

/** 관리자(admin)만 쓸 수 있는 API 경로. 편집자(editor)는 403. */
const ADMIN_ONLY = ['/api/settings', '/api/users'];

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  let res: Response;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== new URL(request.url).origin) {
      return withHeaders(fail(403, '허용되지 않은 주소에서 보낸 요청입니다.'));
    }
  }

  try {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/auth/')) {
      const user = await getSession(env, request);
      // 임시 비밀번호 계정: 비밀번호를 바꾸기 전에는 다른 기능을 쓰지 못한다(3-2e)
      if (user?.mustChange) return withHeaders(fail(403, '임시 비밀번호입니다. 먼저 비밀번호를 변경해 주세요.', { mustChange: true }));
      if (ADMIN_ONLY.some((p) => path === p || path.startsWith(`${p}/`))) {
        if (!user) return withHeaders(fail(401, '로그인이 필요합니다.'));
        if (user.role !== 'admin') return withHeaders(fail(403, '관리자만 사용할 수 있는 기능입니다.'));
      }
    }
    res = await ctx.next();
  } catch (e) {
    console.error('API 오류', e instanceof Error ? e.message : e);
    res = fail(500, '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  }
  return withHeaders(res);
};

function withHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}
