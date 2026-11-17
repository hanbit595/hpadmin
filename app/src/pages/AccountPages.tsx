// 3-2e: 직원 계정(관리자만)·수정 기록·내 계정·첫 로그인 비밀번호 변경
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { kst, request, type User } from '../api';

const ROLE = { admin: '관리자', editor: '편집자' } as const;
type Msg = { kind: 'ok' | 'error'; text: string } | null;

function Notice({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div className={`notice ${msg.kind === 'ok' ? 'notice-ok' : 'notice-error'}`} role={msg.kind === 'error' ? 'alert' : 'status'}>
      {msg.text}
    </div>
  );
}

// ───── 비밀번호 변경(내 계정·첫 로그인 공통) ─────
function PasswordForm({ onDone, temp }: { onDone?: () => void; temp?: boolean }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== again) return setMsg({ kind: 'error', text: '새 비밀번호 두 칸이 서로 다릅니다.' });
    setBusy(true);
    const r = await request<{ message: string }>('POST', '/api/auth/password', { currentPassword: cur, newPassword: next });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: 'error', text: r.error ?? '바꾸지 못했습니다.' });
    setCur('');
    setNext('');
    setAgain('');
    setMsg({ kind: 'ok', text: r.data?.message ?? '비밀번호를 변경했습니다.' });
    onDone?.();
  };
  return (
    <form onSubmit={submit}>
      <Notice msg={msg} />
      <label className="field">
        <span>{temp ? '임시 비밀번호' : '현재 비밀번호'}</span>
        <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
      </label>
      <label className="field">
        <span>새 비밀번호 (8자 이상)</span>
        <input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
      </label>
      <label className="field">
        <span>새 비밀번호 확인</span>
        <input type="password" autoComplete="new-password" minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} required />
      </label>
      <button className="btn-primary" type="submit" disabled={busy}>
        {busy ? '바꾸는 중…' : '비밀번호 변경'}
      </button>
    </form>
  );
}

export function ForcePassword({ user, onDone, onLogout }: { user: User; onDone: () => void; onLogout: () => void }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">HANBIT Innotech</div>
        <h1 className="login-title">{user.displayName} 님, 비밀번호를 바꿔 주세요</h1>
        <p className="notice notice-lock">임시 비밀번호로 로그인했습니다. 새 비밀번호로 바꾼 뒤에 관리자 화면을 쓸 수 있습니다.</p>
        <PasswordForm temp onDone={onDone} />
        <p className="login-help">
          <button type="button" className="link-btn" onClick={onLogout}>
            로그아웃
          </button>
        </p>
      </div>
    </div>
  );
}

export function Account({ user, onRenamed }: { user: User; onRenamed: (name: string) => void }) {
  const [name, setName] = useState(user.displayName);
  const [msg, setMsg] = useState<Msg>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const r = await request<{ displayName: string }>('POST', '/api/auth/profile', { displayName: name });
    if (!r.ok || !r.data) return setMsg({ kind: 'error', text: r.error ?? '바꾸지 못했습니다.' });
    onRenamed(r.data.displayName);
    setMsg({ kind: 'ok', text: '표시 이름을 바꿨습니다. 이후 저장 기록·커밋에 이 이름이 쓰입니다.' });
  };
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">내 계정</h1>
        <p className="page-desc">
          아이디 {user.username} · {ROLE[user.role]}
        </p>
      </div>
      <div className="grid">
        <section className="card">
          <h2 className="card-title">표시 이름</h2>
          <form onSubmit={save}>
            <Notice msg={msg} />
            <label className="field">
              <span>표시 이름</span>
              <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
            </label>
            <button className="btn-primary" type="submit" disabled={!name.trim() || name === user.displayName}>
              이름 저장
            </button>
          </form>
        </section>
        <section className="card">
          <h2 className="card-title">비밀번호 변경</h2>
          <PasswordForm />
          <p className="card-note">바꾸면 다른 기기의 로그인은 모두 해제됩니다.</p>
        </section>
      </div>
    </>
  );
}

// ───── 수정 기록 ─────
const ACTION: Record<string, string> = {
  post_create: '글 새로 저장',
  post_save: '글 저장',
  post_delete: '글 삭제',
  page_save: '회사 페이지 저장',
  settings_save: '사이트 설정 저장',
  upload: '파일 올림',
  login_success: '로그인',
  login_fail: '로그인 실패',
  login_locked: '로그인 잠김',
  login_blocked: '잠긴 계정 시도',
  logout: '로그아웃',
  password_change: '비밀번호 변경',
  password_change_fail: '비밀번호 변경 실패',
  profile_change: '표시 이름 변경',
  user_create: '직원 계정 추가',
  user_reset: '비밀번호 초기화',
  user_unlock: '잠금 해제',
  user_update: '직원 계정 변경',
};

interface AuditItem {
  id: number;
  action: string;
  target: string;
  detail: string;
  created_at: number;
  name: string | null;
  username: string | null;
}

function detailText(a: AuditItem): string {
  try {
    const d = JSON.parse(a.detail || '{}') as Record<string, unknown>;
    return [d.title ?? d.label, d.commit ? `커밋 ${String(d.commit)}` : '', d.reason ? `이유 ${String(d.reason)}` : ''].filter(Boolean).join(' · ');
  } catch {
    return '';
  }
}

export function AuditLog({ onExpired }: { onExpired: () => void }) {
  const [kind, setKind] = useState('content');
  const [who, setWho] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; page: number; pages: number; items: AuditItem[]; users: { id: number; name: string }[]; all: boolean } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    request<NonNullable<typeof data>>('GET', `/api/audit?${new URLSearchParams({ kind, user: who, q: query, page: String(page) })}`).then((r) => {
      if (!alive) return;
      if (r.status === 401) return onExpired();
      if (r.ok && r.data) {
        setData(r.data);
        setErr('');
      } else setErr(r.error ?? '기록을 읽지 못했습니다.');
    });
    return () => {
      alive = false;
    };
  }, [kind, who, query, page, onExpired]);
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">수정 기록</h1>
        <p className="page-desc">{data?.all ? '모든 직원의 기록입니다.' : '내가 한 일의 기록입니다.'} 시각은 한국 시간입니다.</p>
      </div>
      <div className="list-tools">
        <div className="chips" role="group" aria-label="종류">
          {[
            ['content', '내용 수정'],
            ['account', '계정'],
            ['login', '로그인'],
            ['', '전체'],
          ].map(([k, l]) => (
            <button key={k || 'all'} type="button" className={`chip${kind === k ? ' on' : ''}`} aria-pressed={kind === k} onClick={() => (setKind(k), setPage(1))}>
              {l}
            </button>
          ))}
        </div>
        {data?.all && (
          <select className="sel" aria-label="직원" value={who} onChange={(e) => (setWho(e.target.value), setPage(1))}>
            <option value="">모든 직원</option>
            {data.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <form
          className="search-box"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(q.trim());
          }}
        >
          <label className="sr-only" htmlFor="aq">
            검색
          </label>
          <input id="aq" type="search" placeholder="파일·제목으로 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="search-btn">
            검색
          </button>
        </form>
      </div>
      {err && <div className="notice notice-error">{err}</div>}
      <div className="table-box">
        <table className="post-table">
          <thead>
            <tr>
              <th>시각</th>
              <th>누가</th>
              <th>무엇을</th>
              <th>대상</th>
              <th>내용</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  기록이 없습니다.
                </td>
              </tr>
            )}
            {data?.items.map((a) => (
              <tr key={a.id}>
                <td className="col-date">{kst(a.created_at)}</td>
                <td>{a.name ?? '(없는 아이디)'}</td>
                <td>{ACTION[a.action] ?? a.action}</td>
                <td className="col-cat">{a.target}</td>
                <td className="col-cat">{detailText(a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.pages > 1 && (
        <nav className="pager" aria-label="쪽 이동">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            이전
          </button>
          <span className="muted">
            {page} / {data.pages} (총 {data.total}건)
          </span>
          <button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            다음
          </button>
        </nav>
      )}
    </>
  );
}

// ───── 직원 계정(관리자만) ─────
interface Staff {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'editor';
  active: boolean;
  locked: boolean;
  mustChange: boolean;
}

export function Users({ onExpired }: { onExpired: () => void }) {
  const [list, setList] = useState<Staff[]>([]);
  const [me, setMe] = useState(0);
  const [msg, setMsg] = useState<Msg>(null);
  const [temp, setTemp] = useState<{ username: string; tempPassword: string } | null>(null);
  const [form, setForm] = useState({ username: '', displayName: '', role: 'editor' });
  const load = useCallback(async () => {
    const r = await request<{ users: Staff[]; me: number }>('GET', '/api/users');
    if (r.status === 401) return onExpired();
    if (r.ok && r.data) {
      setList(r.data.users);
      setMe(r.data.me);
    } else setMsg({ kind: 'error', text: r.error ?? '목록을 읽지 못했습니다.' });
  }, [onExpired]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (method: 'POST' | 'PATCH', path: string, body: unknown, ok: string) => {
    setMsg(null);
    const r = await request<{ username: string; tempPassword?: string }>(method, path, body);
    if (!r.ok) return setMsg({ kind: 'error', text: r.error ?? '처리하지 못했습니다.' });
    if (r.data?.tempPassword) setTemp({ username: r.data.username, tempPassword: r.data.tempPassword });
    setMsg({ kind: 'ok', text: ok });
    void load();
  };

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">직원 계정</h1>
        <p className="page-desc">관리자 = 모든 기능 + 계정 관리, 편집자 = 게시판·회사 페이지 편집만.</p>
      </div>
      <Notice msg={msg} />
      {temp && (
        <div className="notice notice-lock temp-pw" role="alert">
          <b>{temp.username}</b> 의 임시 비밀번호: <code>{temp.tempPassword}</code>
          <br />
          지금 한 번만 보입니다. 본인에게 직접 전달해 주세요. 첫 로그인 때 새 비밀번호로 바꾸게 됩니다.{' '}
          <button type="button" className="link-btn" onClick={() => setTemp(null)}>
            닫기
          </button>
        </div>
      )}
      <section className="card">
        <h2 className="card-title">직원 추가</h2>
        <form
          className="f-grid3"
          onSubmit={(e) => {
            e.preventDefault();
            void run('POST', '/api/users', form, `${form.displayName} 계정을 만들었습니다.`).then(() => setForm({ username: '', displayName: '', role: 'editor' }));
          }}
        >
          <label className="f">
            <span>아이디 (영문·숫자 3~32자)</span>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.trim() })} required pattern="[A-Za-z0-9._\-]{3,32}" />
          </label>
          <label className="f">
            <span>표시 이름</span>
            <input value={form.displayName} maxLength={40} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
          </label>
          <label className="f">
            <span>권한</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="editor">편집자</option>
              <option value="admin">관리자</option>
            </select>
          </label>
          <button className="btn-new" type="submit">
            + 계정 추가(임시 비밀번호 발급)
          </button>
        </form>
      </section>
      <div className="table-box users-box">
        <table className="post-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>아이디</th>
              <th>권한</th>
              <th>상태</th>
              <th className="col-act">관리</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'dim'}>
                <td>
                  {u.displayName}
                  {u.id === me && <small className="muted"> (나)</small>}
                </td>
                <td>{u.username}</td>
                <td>
                  <select
                    className="sel"
                    aria-label={`${u.displayName} 권한`}
                    value={u.role}
                    onChange={(e) => void run('PATCH', `/api/users/${u.id}`, { role: e.target.value }, `${u.displayName} 권한을 바꿨습니다.`)}
                  >
                    <option value="editor">편집자</option>
                    <option value="admin">관리자</option>
                  </select>
                </td>
                <td>
                  {!u.active ? <span className="state state-hidden">중지</span> : <span className="state state-public">사용</span>}
                  {u.locked && <span className="state state-hidden"> 잠김</span>}
                  {u.mustChange && <small className="muted"> 비밀번호 변경 전</small>}
                </td>
                <td className="col-act">
                  {u.locked && (
                    <button type="button" className="btn-row" onClick={() => void run('POST', `/api/users/${u.id}/unlock`, {}, '잠금을 풀었습니다.')}>
                      잠금 해제
                    </button>
                  )}{' '}
                  <button
                    type="button"
                    className="btn-row"
                    onClick={() =>
                      window.confirm(`${u.displayName} 의 비밀번호를 초기화할까요? 지금 로그인된 곳은 모두 로그아웃됩니다.`) &&
                      void run('POST', `/api/users/${u.id}/reset`, {}, '비밀번호를 초기화했습니다.')
                    }
                  >
                    비밀번호 초기화
                  </button>{' '}
                  <button
                    type="button"
                    className={`btn-row${u.active ? ' danger' : ''}`}
                    onClick={() =>
                      (!u.active || window.confirm(`${u.displayName} 계정을 중지할까요? 바로 로그아웃되고 로그인할 수 없습니다.`)) &&
                      void run('PATCH', `/api/users/${u.id}`, { active: !u.active }, u.active ? '계정을 중지했습니다.' : '계정을 다시 사용하게 했습니다.')
                    }
                  >
                    {u.active ? '중지' : '다시 사용'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
