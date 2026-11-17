// 대시보드 (명세 3-2b)
import { useCallback, useEffect, useState } from 'react';
import { api, kst, type DeployStatus, type User } from '../api';
import { pathOf, type CountKey, type Lang } from '../nav';
import { linkClick } from '../router';
import type { SummaryState } from '../Shell';

const COUNT_ROWS: { key: CountKey; name: string; to: string }[] = [
  { key: 'notice', name: '회사소식', to: 'notice' },
  { key: 'media', name: '시공사례', to: 'media' },
  { key: 'library', name: 'E-Catalog', to: 'library' },
  { key: 'cert', name: '인증 및 수상', to: 'cert' },
];

const QUICK = [
  { label: '새 소식 쓰기', to: 'notice' },
  { label: '새 시공사례', to: 'media' },
  { label: '인증서 추가', to: 'cert' },
];

type DeployState = { loading: boolean; data?: DeployStatus; error?: string };

export default function Dashboard({
  user,
  lang,
  summary,
  onExpired,
}: {
  user: User;
  lang: Lang;
  summary: SummaryState;
  onExpired: () => void;
}) {
  const [deploy, setDeploy] = useState<DeployState>({ loading: true });

  const loadDeploy = useCallback(async () => {
    setDeploy((d) => ({ ...d, loading: true }));
    const r = await api.deployStatus();
    if (r.status === 401) return onExpired();
    setDeploy(r.ok && r.data ? { loading: false, data: r.data } : { loading: false, error: r.error });
  }, [onExpired]);

  useEffect(() => {
    loadDeploy();
  }, [loadDeploy]);

  const counts = summary.data?.counts;
  const d = deploy.data?.deploy;
  const badge =
    d?.state === 'success' ? 'badge-ok' : d?.state === 'running' ? 'badge-run' : d?.state === 'failure' || d?.state === 'error' ? 'badge-err' : 'badge-wait';

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">안녕하세요, {user.displayName}님</h1>
        <p className="page-desc">저장하면 1~2분 뒤 홈페이지에 반영됩니다.</p>
      </div>

      <div className="quick">
        {QUICK.map((q) => {
          const to = pathOf(lang, q.to);
          return (
            <a key={q.to} className="btn-quick" href={to} onClick={linkClick(to)}>
              + {q.label}
            </a>
          );
        })}
      </div>

      <div className="grid">
        <section className="card">
          <h2 className="card-title">게시판·페이지 글 수</h2>
          {summary.error ? (
            <p className="msg-error">{summary.error}</p>
          ) : (
            <table className="count-table">
              <thead>
                <tr>
                  <th scope="col">구분</th>
                  <th scope="col">국문</th>
                  <th scope="col">영문</th>
                </tr>
              </thead>
              <tbody>
                {COUNT_ROWS.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.name}</th>
                    {(['ko', 'en'] as const).map((l) => {
                      const to = pathOf(l, row.to);
                      return (
                        <td key={l}>
                          {counts ? (
                            <a href={to} onClick={linkClick(to)}>
                              {counts[l][row.key]}건
                            </a>
                          ) : (
                            '…'
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="card-note">인증 및 수상은 숨김 항목을 포함한 전체 건수입니다.</p>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">홈페이지 반영 상태</h2>
            <button className="btn-small" type="button" onClick={loadDeploy} disabled={deploy.loading}>
              새로 고침
            </button>
          </div>
          {deploy.error ? (
            <p className="msg-error">{deploy.error}</p>
          ) : !d ? (
            <span className="badge badge-wait">확인 중...</span>
          ) : (
            <div className="deploy">
              <span className={`badge ${badge}`}>{d.label}</span>
              {d.reason && <p className="deploy-reason">{d.reason}</p>}
              {d.startedAt && (
                <p className="muted">
                  시작 {kst(d.startedAt)}
                  {d.state !== 'running' && d.updatedAt ? ` · 끝 ${kst(d.updatedAt)}` : ''} (한국 시간)
                </p>
              )}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">최근 수정 5건</h2>
          {deploy.data && !deploy.data.commits.ok ? (
            <p className="msg-error">{deploy.data.commits.error}</p>
          ) : deploy.data ? (
            <ul className="commits">
              {deploy.data.commits.items.map((c) => (
                <li key={c.sha}>
                  <span className="commit-msg">{c.message}</span>
                  <span className="muted">{kst(c.date)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{deploy.error ? '' : '불러오는 중...'}</p>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">현재 팝업 ({lang === 'ko' ? '국문' : '영문'})</h2>
          {summary.error ? (
            <p className="msg-error">{summary.error}</p>
          ) : !summary.data ? (
            <p className="muted">불러오는 중...</p>
          ) : summary.data.popups.length === 0 ? (
            <p className="muted">오늘({summary.data.today}) 보이는 팝업이 없습니다.</p>
          ) : (
            <ul className="popups">
              {summary.data.popups.map((p, i) => (
                <li key={i}>
                  <span className="commit-msg">{p.title || '(제목 없음)'}</span>
                  <span className="muted">
                    {p.start || '시작일 없음'} ~ {p.end || '종료일 없음'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
