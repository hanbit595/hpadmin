// 작은 주소 이동 도우미(history API)
import { useEffect, useState, type MouseEvent } from 'react';

export function navigate(to: string, replace = false) {
  if (to === location.pathname) return;
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePathname(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

/** <a href> 클릭을 화면 안 이동으로 처리(새 탭 열기 등 보조 키는 그대로 둠) */
export function linkClick(to: string, after?: () => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
    after?.();
  };
}
