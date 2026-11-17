// 서버 API 호출 (명세 6절). 쿠키는 같은 주소에서만 자동 전송된다.
import type { Lang } from './nav';

export interface User {
  username: string;
  displayName: string;
  role: 'admin' | 'editor';
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  lockedUntil?: number;
}

export interface Counts {
  notice: number;
  media: number;
  library: number;
  cert: number;
}

export interface Summary {
  lang: Lang;
  counts: Record<Lang, Counts>;
  popups: { title: string; start: string; end: string; link: string }[];
  today: string;
}

export interface DeployStatus {
  deploy: {
    state: 'success' | 'running' | 'failure' | 'none' | 'error';
    label: string;
    reason?: string;
    startedAt?: string;
    updatedAt?: string;
    commit?: string;
    url?: string;
  };
  commits: { ok: boolean; error?: string; items: { sha: string; message: string; date: string }[] };
}

export interface PostRow {
  name: string;
  sha: string;
  title: string;
  subject: string;
  category: string[];
  date: string;
  draft: boolean;
  featured: boolean;
  featuredOrder: number | null;
  thumb: string;
  error?: string;
}

export interface PostList {
  branch: string;
  total: number;
  hiddenCount: number;
  found: number;
  page: number;
  pages: number;
  perPage: number;
  items: PostRow[];
}

export interface PostData {
  path: string;
  sha: string;
  fm: Record<string, unknown>;
  body: string;
  branch: string;
  resolved: Record<string, string>;
}

export interface SaveResult {
  path: string;
  branch?: string;
  sha: string;
  commit?: string;
  name?: string;
  unchanged?: boolean;
  changed?: string[];
  bodyChanged?: boolean;
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const raw = body instanceof Blob;
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined && !raw ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : raw ? (body as Blob) : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && json.ok) return { ok: true, status: res.status, data: json as T };
    return {
      ok: false,
      status: res.status,
      error: typeof json.error === 'string' ? json.error : `요청을 처리하지 못했습니다(${res.status}).`,
      lockedUntil: typeof json.lockedUntil === 'number' ? json.lockedUntil : undefined,
    };
  } catch {
    return { ok: false, status: 0, error: '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.' };
  }
}

export const api = {
  me: () => request<{ user: User }>('GET', '/api/auth/me'),
  login: (username: string, password: string, remember: boolean) =>
    request<{ user: User }>('POST', '/api/auth/login', { username, password, remember }),
  logout: () => request<object>('POST', '/api/auth/logout', {}),
  summary: (lang: Lang) => request<Summary>('GET', `/api/site/summary?lang=${lang}`),
  deployStatus: () => request<DeployStatus>('GET', '/api/deploy/status'),
  posts: (params: Record<string, string>) => request<PostList>('GET', `/api/posts?${new URLSearchParams(params)}`),
  post: (lang: Lang, board: string, name: string) => request<PostData>('GET', `/api/posts/${lang}/${board}/${name}`),
  savePost: (lang: Lang, board: string, name: string, data: { sha: string; fields: Record<string, unknown>; body?: string }) =>
    request<SaveResult>('PUT', `/api/posts/${lang}/${board}/${name}`, data),
};

/** 한국 시간 표시: 2026. 11. 17. 오후 3:05 */
export function kst(iso: string | number | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
