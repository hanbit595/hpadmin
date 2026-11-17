// 저장 후 반영 상태 알림: 홈페이지 Actions 를 30초마다 확인(최대 10분). 실패하면 [빌드 실패] 줄을 남긴다.
// 시험 저장소(admin-dev 등 main 이 아닌 브랜치)에 저장하면 반영되지 않는다는 표시만 한다.
import { useEffect, useRef, useState } from 'react';
import { api } from './api';

type State = { kind: 'test' | 'wait' | 'run' | 'ok' | 'fail' | 'unknown'; text: string; commit: string } | null;

export default function DeployToast() {
  const [st, setSt] = useState<State>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onSaved = (e: Event) => {
      const { commit, branch } = (e as CustomEvent<{ commit: string; branch?: string }>).detail;
      window.clearInterval(timer.current);
      const short = commit.slice(0, 7);
      if (branch && branch !== 'main') {
        setSt({ kind: 'test', commit: short, text: `시험 저장소(${branch})에 저장했습니다 · 홈페이지에는 반영되지 않습니다.` });
        return;
      }
      setSt({ kind: 'wait', commit: short, text: '저장했습니다 · 홈페이지 반영을 기다리는 중(1~2분)' });
      let tries = 0;
      const check = async () => {
        tries++;
        const r = await api.deployStatus();
        const d = r.data?.deploy;
        if (!r.ok || !d || d.state === 'error') {
          if (tries >= 20) window.clearInterval(timer.current);
          return setSt((s) => s && { ...s, kind: 'unknown', text: `반영 상태를 확인하지 못했습니다${d?.reason ? `: ${d.reason}` : ''}` });
        }
        if (d.commit !== short) {
          if (tries >= 20) {
            window.clearInterval(timer.current);
            setSt((s) => s && { ...s, kind: 'unknown', text: '반영 작업이 아직 시작되지 않았습니다. 대시보드에서 다시 확인해 주세요.' });
          }
          return;
        }
        if (d.state === 'running') return setSt((s) => s && { ...s, kind: 'run', text: '홈페이지에 반영 중…' });
        window.clearInterval(timer.current);
        if (d.state === 'success') setSt((s) => s && { ...s, kind: 'ok', text: '홈페이지에 반영되었습니다.' });
        else setSt((s) => s && { ...s, kind: 'fail', text: `[빌드 실패] ${d.reason || '홈페이지 빌드에 실패했습니다'} — 홈페이지는 이전 상태 그대로입니다.` });
      };
      timer.current = window.setInterval(check, 30000);
    };
    window.addEventListener('hb-saved', onSaved);
    return () => {
      window.removeEventListener('hb-saved', onSaved);
      window.clearInterval(timer.current);
    };
  }, []);

  // 완료·시험 표시는 잠시 뒤 닫는다(실패는 남김)
  useEffect(() => {
    if (st?.kind !== 'ok' && st?.kind !== 'test') return;
    const t = window.setTimeout(() => setSt(null), 12000);
    return () => window.clearTimeout(t);
  }, [st]);

  if (!st) return null;
  return (
    <div className={`deploy-toast dt-${st.kind}`} role={st.kind === 'fail' ? 'alert' : 'status'}>
      <span>{st.text}</span>
      <small>커밋 {st.commit}</small>
      <button type="button" aria-label="알림 닫기" onClick={() => setSt(null)}>
        ×
      </button>
    </div>
  );
}
