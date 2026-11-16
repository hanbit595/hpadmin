// 서버 API 호출 (명세 6절). 쿠키는 같은 주소에서만 자동 전송된다.
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

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
  health: () => request<{ message: string; repo: string; branch: string; commit: string; checkedAt: number }>('GET', '/api/health'),
};
