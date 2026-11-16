import { useEffect, useState, type FormEvent } from 'react';
import { api, type User } from './api';

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  // 잠금 중이면 남은 시간을 1초마다 다시 계산
  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const lockRemain = lockedUntil ? lockedUntil - now : 0;
  const locked = lockRemain > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) {
      setError('아이디와 비밀번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    const r = await api.login(username.trim(), password, remember);
    setBusy(false);
    if (r.ok && r.data) {
      setPassword('');
      onLogin(r.data.user);
      return;
    }
    setPassword('');
    setLockedUntil(r.lockedUntil ?? null);
    setNow(Date.now());
    setError(r.error ?? '로그인하지 못했습니다.');
  }

  const mm = Math.floor(lockRemain / 60000);
  const ss = Math.floor((lockRemain % 60000) / 1000);

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="login-brand">HANBIT Innotech</div>
        <h1 className="login-title">홈페이지 관리자</h1>

        <label className="field">
          <span>아이디</span>
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={64}
            autoFocus
          />
        </label>
        <label className="field">
          <span>비밀번호</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={256} />
        </label>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>로그인 유지 (30일)</span>
        </label>

        {locked ? (
          <div className="notice notice-lock" role="alert">
            <strong>로그인이 잠겨 있습니다.</strong>
            <br />
            비밀번호를 5회 잘못 입력하여 10분 동안 로그인할 수 없습니다.
            <br />
            남은 시간: {mm}분 {String(ss).padStart(2, '0')}초
          </div>
        ) : (
          error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )
        )}

        <button className="btn-primary" type="submit" disabled={busy || locked}>
          {busy ? '확인 중...' : '로그인'}
        </button>
        <p className="login-help">공용 컴퓨터에서는 "로그인 유지"를 체크하지 마세요.</p>
      </form>
    </main>
  );
}
