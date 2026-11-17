// GET·PUT /api/settings/{ko|en}/{menu|site|popups} : 사이트 설정 읽기·저장 (명세 6-3절).
// 관리자 전용: 권한 확인은 api/_middleware.ts(로그인 없음 401, 편집자 403).
import { SETTING_NAMES, docRoute } from '../../../server/docsave';
import { fail, type Env } from '../../../server/http';
import { getSession } from '../../../server/session';

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');
  if (user.role !== 'admin') return fail(403, '관리자만 사용할 수 있는 기능입니다.');
  return docRoute(env, request, user, params, SETTING_NAMES);
};
