import { useCallback, useEffect, useState } from 'react';
import { api, type User } from './api';
import Login from './Login';
import { ForcePassword } from './pages/AccountPages';
import Shell from './Shell';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(() => {
    api.me().then((r) => {
      setUser(r.ok && r.data ? r.data.user : null);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    refresh();
    // 서버가 "임시 비밀번호, 먼저 변경" 으로 막으면 사용자 정보를 다시 읽어 변경 화면으로
    window.addEventListener('hb-must-change', refresh);
    return () => window.removeEventListener('hb-must-change', refresh);
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  // 세션이 끝난 경우(다른 곳에서 401): 서버 호출 없이 로그인 화면으로
  const expired = useCallback(() => setUser(null), []);

  if (checking) return <div className="loading">불러오는 중...</div>;
  if (!user) return <Login onLogin={setUser} />;
  if (user.mustChange) return <ForcePassword user={user} onDone={refresh} onLogout={logout} />;
  return <Shell user={user} onLogout={logout} onExpired={expired} onUserChange={setUser} />;
}
