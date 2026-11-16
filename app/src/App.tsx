import { useEffect, useState } from 'react';
import { api, type User } from './api';
import Dashboard from './Dashboard';
import Login from './Login';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api.me().then((r) => {
      if (r.ok && r.data) setUser(r.data.user);
      setChecking(false);
    });
  }, []);

  if (checking) return <div className="loading">불러오는 중...</div>;
  if (!user) return <Login onLogin={setUser} />;
  return (
    <Dashboard
      user={user}
      onLogout={async () => {
        await api.logout();
        setUser(null);
      }}
    />
  );
}
