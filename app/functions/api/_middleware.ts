// /api/* 공통: POST 등 출처 확인, 오류 처리, 보안 헤더 (명세 3절)
import { SECURITY_HEADERS, fail, type Env } from '../../server/http';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request } = ctx;
  let res: Response;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== new URL(request.url).origin) {
      res = fail(403, '허용되지 않은 주소에서 보낸 요청입니다.');
      return withHeaders(res);
    }
  }

  try {
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
