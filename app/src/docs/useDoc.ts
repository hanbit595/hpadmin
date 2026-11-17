// 회사 페이지·사이트 설정 파일 1개 읽기·저장 (명세 6-3절)
// - 서버가 준 data(JSON)를 고쳐 통째로 돌려보낸다. 모르는 칸도 data 안에 그대로 남아 보존된다.
// - 저장 전에 화면에서 고른 새 사진·PDF(브라우저에만 있는 것)를 올린다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../api';
import type { AssetCtx } from '../assets';
import { setLeaveGuard } from '../router';
import { uploadUsed } from '../upload';

export type Msg = { kind: 'ok' | 'error'; text: string } | null;

interface Loaded<T> {
  path: string;
  sha: string;
  data: T;
  branch: string;
  resolved: Record<string, string>;
  officeNames?: string[];
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function useDoc<T>(base: 'pages' | 'settings', lang: string, name: string, onExpired: () => void) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [saving, setSaving] = useState(false);
  const url = `/api/${base}/${lang}/${name}`;

  const load = useCallback(async () => {
    const r = await request<Loaded<T>>('GET', url);
    if (r.status === 401) return onExpired();
    if (!r.ok || !r.data) return setError(r.error ?? '읽지 못했습니다.');
    setLoaded(r.data);
    setData(clone(r.data.data));
    setError('');
  }, [url, onExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = !!loaded && !!data && JSON.stringify(data) !== JSON.stringify(loaded.data);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  });
  useEffect(() => {
    setLeaveGuard(() => dirtyRef.current);
    return () => setLeaveGuard(null);
  }, []);

  const save = useCallback(async () => {
    if (!loaded || !data) return;
    setSaving(true);
    setMsg(null);
    const upErr = await uploadUsed(JSON.stringify(data));
    if (upErr) {
      setSaving(false);
      return setMsg({ kind: 'error', text: `${upErr} 저장하지 않았습니다. 다시 저장해 주세요.` });
    }
    const r = await request<{ sha: string; unchanged?: boolean; branch?: string }>('PUT', url, { sha: loaded.sha, data });
    setSaving(false);
    if (r.status === 401) return onExpired();
    if (!r.ok || !r.data) return setMsg({ kind: 'error', text: r.error ?? '저장하지 못했습니다.' });
    const branch = r.data.branch ?? loaded.branch;
    setLoaded({ ...loaded, sha: r.data.sha, data: clone(data) });
    setMsg({
      kind: 'ok',
      text: r.data.unchanged
        ? '바뀐 내용이 없어 저장하지 않았습니다.'
        : `저장했습니다. 1~2분 뒤 홈페이지에 반영됩니다.${branch !== 'main' ? ` (지금은 시험 저장소 ${branch} 에 저장되어 실제 홈페이지에는 반영되지 않습니다.)` : ''}`,
    });
  }, [loaded, data, url, onExpired]);

  const ctx: AssetCtx | null = loaded ? { branch: loaded.branch, resolved: loaded.resolved } : null;
  return { loaded, data, setData, error, msg, setMsg, saving, save, dirty, ctx, reload: load };
}

/** 깊은 경로의 값 바꾸기(불변 갱신) */
export function setIn<T>(obj: T, path: (string | number)[], value: unknown): T {
  if (!path.length) return value as T;
  const [k, ...rest] = path;
  const src = obj as unknown as Record<string | number, unknown>;
  const copy = (Array.isArray(obj) ? [...(obj as unknown[])] : { ...(obj as object) }) as Record<string | number, unknown>;
  copy[k] = setIn(src[k], rest, value);
  return copy as unknown as T;
}

/** 목록 순서 바꾸기 */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const out = [...arr];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}
