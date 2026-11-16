// GET /api/health: 로그인 필요. hopage main 최신 커밋 번호만 읽는다(읽기 전용).
import { fail, json, type Env } from '../../server/http';
import { getSession } from '../../server/session';

const REPO = 'hanbit595/hopage';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSession(env, request);
  if (!user) return fail(401, '로그인이 필요합니다.');
  if (!env.GITHUB_TOKEN) return fail(503, 'GitHub 토큰이 서버에 등록되지 않았습니다.');

  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.sha',
        'User-Agent': 'hanbit-admin',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch {
    return fail(502, 'GitHub 에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }

  if (res.status === 401) return fail(502, 'GitHub 토큰이 올바르지 않거나 만료되었습니다.');
  if (res.status === 403 || res.status === 404) return fail(502, '홈페이지 저장소를 읽을 권한이 없습니다. 토큰 권한을 확인해 주세요.');
  if (!res.ok) return fail(502, `GitHub 응답 오류(${res.status})입니다.`);

  const sha = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) return fail(502, 'GitHub 응답 형식이 예상과 다릅니다.');
  return json({ ok: true, message: '연결 정상', repo: REPO, branch: 'main', commit: sha.slice(0, 7), checkedAt: Date.now() });
};
