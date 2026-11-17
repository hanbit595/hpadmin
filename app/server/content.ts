// hopage 콘텐츠 읽기·쓰기 (3-2c, 명세 6-2절). 저장 대상 브랜치 = 환경변수 CONTENT_BRANCH.
// 읽기: GraphQL(폴더 단위, tree oid 로 캐시) / 글 1건·쓰기: contents API(캐시 없음, sha 로 충돌 확인)
import { REPO } from './github';
import type { Env } from './http';

const API = 'https://api.github.com';

export class ContentError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function contentBranch(env: Env): string {
  const b = (env.CONTENT_BRANCH ?? '').trim();
  if (!/^[A-Za-z0-9._/-]{1,100}$/.test(b)) {
    throw new ContentError(503, `저장 대상 브랜치(CONTENT_BRANCH)가 설정되지 않았습니다. 관리자에게 알려 주세요.`);
  }
  return b;
}

function headers(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'hanbit-admin',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  };
  if (env.GITHUB_TOKEN) h.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return h;
}

function writeError(res: Response): ContentError {
  if (res.status === 401) return new ContentError(502, 'GitHub 토큰이 올바르지 않거나 만료되었습니다.');
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0')
    return new ContentError(502, 'GitHub 호출 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.');
  if (res.status === 403)
    return new ContentError(502, '홈페이지 저장소에 쓸 권한이 없습니다. 토큰 권한(Contents: Read and write)을 확인해 주세요.');
  if (res.status === 404) return new ContentError(404, '홈페이지 저장소에서 파일을 찾지 못했습니다. 이미 삭제되었을 수 있습니다.');
  if (res.status === 409)
    return new ContentError(409, '다른 사람이 먼저 이 글을 고쳤습니다. 내 변경 내용을 따로 복사해 두고, 글을 다시 연 뒤 저장해 주세요.');
  if (res.status === 422) return new ContentError(422, '같은 이름의 파일이 이미 있거나 저장 형식이 맞지 않습니다.');
  return new ContentError(502, `GitHub 응답 오류(${res.status})입니다. 잠시 후 다시 시도해 주세요.`);
}

async function call(env: Env, method: string, path: string, body?: unknown): Promise<Response> {
  try {
    return await fetch(`${API}${path}`, {
      method,
      headers: headers(env, body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ContentError(502, 'GitHub 에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

const enc = encodeURIComponent;
const contentsPath = (path: string) => `/repos/${REPO}/contents/${path.split('/').map(enc).join('/')}`;

export interface FileData {
  path: string;
  sha: string;
  text: string;
}

/** 파일 1건(문자). 없으면 null */
export async function getFile(env: Env, path: string): Promise<FileData | null> {
  const branch = contentBranch(env);
  const res = await call(env, 'GET', `${contentsPath(path)}?ref=${enc(branch)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw writeError(res);
  const j = (await res.json()) as { sha: string; content?: string; encoding?: string; type: string; size: number };
  if (j.type !== 'file') throw new ContentError(400, '파일이 아닙니다.');
  let text: string;
  if (j.encoding === 'base64' && j.content) text = new TextDecoder().decode(fromBase64(j.content));
  else {
    // 1MB 넘는 파일은 content 가 비어 온다 → blob 으로 다시 읽음
    const r2 = await call(env, 'GET', `/repos/${REPO}/git/blobs/${j.sha}`);
    if (!r2.ok) throw writeError(r2);
    const b = (await r2.json()) as { content: string };
    text = new TextDecoder().decode(fromBase64(b.content));
  }
  return { path, sha: j.sha, text };
}

/** 파일이 있으면 sha, 없으면 null */
export async function fileSha(env: Env, path: string): Promise<string | null> {
  const branch = contentBranch(env);
  const res = await call(env, 'GET', `${contentsPath(path)}?ref=${enc(branch)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw writeError(res);
  const j = (await res.json()) as { sha: string };
  return j.sha;
}

/** 파일 저장(새 파일은 sha 없이, 수정은 연 때의 sha). 커밋 번호를 돌려준다. */
export async function putFile(
  env: Env,
  path: string,
  content: Uint8Array | string,
  message: string,
  sha?: string,
): Promise<{ sha: string; commit: string }> {
  const branch = contentBranch(env);
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const res = await call(env, 'PUT', contentsPath(path), {
    message,
    content: toBase64(bytes),
    branch,
    ...(sha ? { sha } : {}),
  });
  if (!res.ok) throw writeError(res);
  const j = (await res.json()) as { content: { sha: string }; commit: { sha: string } };
  return { sha: j.content.sha, commit: j.commit.sha };
}

export async function deleteFile(env: Env, path: string, sha: string, message: string): Promise<string> {
  const branch = contentBranch(env);
  const res = await call(env, 'DELETE', contentsPath(path), { message, sha, branch });
  if (!res.ok) throw writeError(res);
  const j = (await res.json()) as { commit: { sha: string } };
  return j.commit.sha;
}

/** GraphQL (토큰 필요) */
export async function graphql<T>(env: Env, query: string, variables: Record<string, unknown>): Promise<T> {
  if (!env.GITHUB_TOKEN) throw new ContentError(502, 'GitHub 토큰(GITHUB_TOKEN)이 설정되지 않았습니다.');
  let res: Response;
  try {
    res = await fetch(`${API}/graphql`, {
      method: 'POST',
      headers: headers(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new ContentError(502, 'GitHub 에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!res.ok) throw writeError(res);
  const j = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (j.errors?.length || !j.data) throw new ContentError(502, '홈페이지 저장소를 읽지 못했습니다(GitHub 응답 오류).');
  return j.data;
}

export const [OWNER, NAME] = REPO.split('/');

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
