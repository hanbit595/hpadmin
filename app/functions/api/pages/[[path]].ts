// GET·PUT /api/pages/{ko|en}/{cert|history|hanbit|esg|location} : 회사 페이지 읽기·저장 (명세 6-3절). 편집자도 가능.
import { PAGE_NAMES, docRoute } from '../../../server/docsave';
import { fail, type Env } from '../../../server/http';
import { getSession } from '../../../server/session';

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');
  return docRoute(env, request, user, params, PAGE_NAMES);
};
