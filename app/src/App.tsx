import { useCallback, useEffect, useState } from 'react';
import { api, type User } from './api';
import Login from './Login';
import Shell from './Shell';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api.me().then((r) => {
      if (r.ok && r.data) setUser(r.data.user);
      setChecking(false);
    });
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  // 세션이 끝난 경우(다른 곳에서 401): 서버 호출 없이 로그인 화면으로
  const expired = useCallback(() => setUser(null), []);

  if (checking) return <div className="loading">불러오는 중...</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <Shell user={user} onLogout={logout} onExpired={expired} />;
}
