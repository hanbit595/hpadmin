// 작은 주소 이동 도우미(history API) + 저장하지 않은 변경이 있을 때 이동 확인
import { useEffect, useState, type MouseEvent } from 'react';

const LEAVE_MSG = '저장하지 않은 변경 내용이 있습니다. 저장하지 않고 나가시겠습니까?';
let dirtyCheck: (() => boolean) | null = null;
let current = typeof location !== 'undefined' ? location.pathname : '/';

/** 글쓰기 화면이 "저장 안 된 변경 있음" 여부를 알려 준다(null 이면 해제) */
export function setLeaveGuard(fn: (() => boolean) | null) {
  dirtyCheck = fn;
}

function confirmLeave(): boolean {
  if (!dirtyCheck || !dirtyCheck()) return true;
  if (!window.confirm(LEAVE_MSG)) return false;
  dirtyCheck = null;
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (dirtyCheck?.()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

export function navigate(to: string, replace = false, force = false) {
  if (to === location.pathname) return;
  if (!force && !confirmLeave()) return;
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  current = to;
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePathname(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => {
      if (location.pathname !== current) {
        // 브라우저 뒤로 가기: 저장 안 한 변경이 있으면 확인, 취소하면 제자리로
        if (!confirmLeave()) {
          history.pushState(null, '', current);
          return;
        }
        current = location.pathname;
      }
      setPath(location.pathname);
    };
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
