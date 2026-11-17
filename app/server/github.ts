// hopage 읽기 전용 GitHub 호출 + 60초 캐시 (명세 6절)
// 캐시: ① Cloudflare Cache API(caches.default) ② 같은 실행 인스턴스 메모리. pages.dev 주소에서는 ①이 동작하지 않을 수 있어 ②를 함께 쓴다.
import type { Env } from './http';

export const REPO = 'hanbit595/hopage';
const API = 'https://api.github.com';
const CACHE_HOST = 'https://github-cache.hanbit-admin.internal';

export class GitHubError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const memory = new Map<string, { expires: number; body: string }>();

function errorMessage(res: Response, kind: string): string {
  if (res.status === 401) return 'GitHub 토큰이 올바르지 않거나 만료되었습니다.';
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0')
    return 'GitHub 호출 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.';
  if (res.status === 403)
    return kind === 'actions'
      ? 'GitHub 토큰에 Actions 읽기 권한이 없습니다. 토큰 권한에 Actions(Read)를 추가해 주세요.'
      : '홈페이지 저장소를 읽을 권한이 없습니다. 토큰 권한을 확인해 주세요.';
  if (res.status === 404) return '홈페이지 저장소에서 요청한 내용을 찾지 못했습니다.';
  return `GitHub 응답 오류(${res.status})입니다. 잠시 후 다시 시도해 주세요.`;
}

/** GitHub API GET. 결과 문자열을 ttl 초 동안 캐시한다. */
export async function ghGet(env: Env, path: string, opts: { ttl?: number; raw?: boolean; kind?: string } = {}): Promise<string> {
  const ttl = opts.ttl ?? 60;
  const key = `${path}|${opts.raw ? 'raw' : 'json'}`;
  const now = Date.now();

  const hit = memory.get(key);
  if (hit && hit.expires > now) return hit.body;

  const cacheKey = new Request(`${CACHE_HOST}/${encodeURIComponent(key)}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cached = cache ? await cache.match(cacheKey).catch(() => undefined) : undefined;
  if (cached) {
    const body = await cached.text();
    memory.set(key, { expires: now + ttl * 1000, body });
    return body;
  }

  const headers: Record<string, string> = {
    Accept: opts.raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
    'User-Agent': 'hanbit-admin',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  // 로컬 개발에서 토큰이 없으면 공개 저장소를 토큰 없이 읽는다(호출 한도 낮음).
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers });
  } catch {
    throw new GitHubError('GitHub 에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!res.ok) throw new GitHubError(errorMessage(res, opts.kind ?? 'contents'));

  const body = await res.text();
  memory.set(key, { expires: now + ttl * 1000, body });
  if (memory.size > 200) memory.delete(memory.keys().next().value as string);
  if (cache) {
    await cache
      .put(cacheKey, new Response(body, { headers: { 'Cache-Control': `max-age=${ttl}` } }))
      .catch(() => undefined);
  }
  return body;
}

export async function ghJson<T>(env: Env, path: string, opts: { ttl?: number; kind?: string } = {}): Promise<T> {
  return JSON.parse(await ghGet(env, path, opts)) as T;
}
