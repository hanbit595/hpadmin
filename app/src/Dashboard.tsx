import { useCallback, useEffect, useState } from 'react';
import { api, type User } from './api';

type Health = { state: 'loading' } | { state: 'ok'; commit: string; checkedAt: number } | { state: 'error'; message: string };

export default function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [health, setHealth] = useState<Health>({ state: 'loading' });

  const check = useCallback(async () => {
    setHealth({ state: 'loading' });
    const r = await api.health();
    if (r.ok && r.data) setHealth({ state: 'ok', commit: r.data.commit, checkedAt: r.data.checkedAt });
    else if (r.status === 401) onLogout();
    else setHealth({ state: 'error', message: r.error ?? '확인하지 못했습니다.' });
  }, [onLogout]);

  useEffect(() => {
    check();
  }, [check]);

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-brand">
          HANBIT Innotech <span>홈페이지 관리자</span>
        </div>
        <div className="topbar-user">
          <span className="topbar-name">{user.displayName}님</span>
          <button className="btn-ghost" type="button" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </header>

      <div className="body">
        <nav className="sidebar" aria-label="관리 메뉴">
          <a className="nav-item active" href="/">
            대시보드
          </a>
          <span className="nav-soon">게시판·회사 페이지·사이트 관리 메뉴는 다음 단계(3-2b)에서 추가됩니다.</span>
        </nav>

        <main className="content">
          <h1 className="page-title">안녕하세요, {user.displayName}님</h1>
          <p className="page-desc">한빛이노텍 홈페이지 관리자입니다.</p>

          <section className="card">
            <h2 className="card-title">GitHub 연결 상태</h2>
            <div className="status-row">
              {health.state === 'loading' && <span className="badge badge-wait">확인 중...</span>}
              {health.state === 'ok' && (
                <>
                  <span className="badge badge-ok">연결 정상</span>
                  <span className="status-text">
                    홈페이지 저장소 최신 반영 번호 <code>{health.commit}</code> ({new Date(health.checkedAt).toLocaleString('ko-KR')} 확인)
                  </span>
                </>
              )}
              {health.state === 'error' && (
                <>
                  <span className="badge badge-err">연결 오류</span>
                  <span className="status-text">{health.message}</span>
                </>
              )}
            </div>
            <button className="btn-outline" type="button" onClick={check} disabled={health.state === 'loading'}>
              다시 확인
            </button>
          </section>
        </main>
      </div>
    </div>
  );
}
