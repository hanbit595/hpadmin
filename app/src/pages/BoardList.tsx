// 게시판 목록 (시안 "2. 게시판 목록"): 썸네일·제목·분류·날짜·숨김·메인 노출, 검색·필터·쪽 넘김(20건), 숨기기/공개로 전환
import { useCallback, useEffect, useState } from 'react';
import { CATEGORIES, boardTitle, isKoMedia, type Board, type Lang } from '../../shared/boards';
import { api, type PostList, type PostRow } from '../api';
import { displayUrl } from '../assets';
import { pathOf } from '../nav';
import { linkClick } from '../router';

const SITE_LIST: Record<Lang, (b: Board) => string> = {
  ko: (b) => `https://hanbitinnotech.com/board/${b}/index.html`,
  en: (b) => `https://hanbitinnotech.com/en/board/${b}/index.html`,
};

function newLabel(lang: Lang, board: Board) {
  if (board === 'media') return lang === 'en' ? '새 시공사례 (Project)' : '새 시공사례';
  if (board === 'library') return '새 E-Catalog';
  return lang === 'en' ? '새 소식 (News)' : '새 소식';
}

type Filter = { label: string; category?: string; hidden?: '1' };

export default function BoardList({ lang, board, onExpired }: { lang: Lang; board: Board; onExpired: () => void }) {
  const koMedia = isKoMedia(lang, board);
  const filters: Filter[] = [
    { label: '전체' },
    ...(koMedia ? CATEGORIES.map((c) => ({ label: c, category: c })) : []),
    { label: '숨김만 보기', hidden: '1' as const },
  ];
  const [filter, setFilter] = useState(0);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PostList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  // 게시판이 바뀌면 Shell 이 key 로 화면을 새로 만든다(검색·필터·쪽 처음 상태)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const f = filters[filter] ?? filters[0];
    const params: Record<string, string> = { lang, board, page: String(page) };
    if (query) params.q = query;
    if (f.category) params.category = f.category;
    if (f.hidden) params.hidden = f.hidden;
    api.posts(params).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (r.status === 401) return onExpired();
      if (r.ok && r.data) {
        setData(r.data);
        setError('');
      } else setError(r.error ?? '목록을 읽지 못했습니다.');
    });
    return () => {
      alive = false;
    };
    // filters 는 lang·board 로 정해진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, board, page, query, filter, reload, onExpired]);

  const toggle = useCallback(
    async (row: PostRow) => {
      setBusy(row.name);
      setMessage(null);
      const r = await api.savePost(lang, board, row.name, { sha: row.sha, fields: { draft: !row.draft } });
      setBusy('');
      if (r.status === 401) return onExpired();
      if (r.ok) {
        setMessage({
          kind: 'ok',
          text: `"${row.title}" 을(를) ${row.draft ? '공개로 전환' : '숨김으로 저장'}했습니다. 1~2분 뒤 홈페이지에 반영됩니다.`,
        });
        setReload((n) => n + 1);
      } else setMessage({ kind: 'error', text: r.error ?? '저장하지 못했습니다.' });
    },
    [lang, board, onExpired],
  );

  const newPath = pathOf(lang, `${board}/new`);
  const ctx = data ? { branch: data.branch } : null;

  return (
    <>
      <div className="list-head">
        <div className="list-head-text">
          <h1 className="page-title">{boardTitle(lang, board)}</h1>
          <p className="page-desc">
            전체 {data?.total ?? '·'}건{data && data.hiddenCount > 0 ? ` (숨김 ${data.hiddenCount}건)` : ''} · 숨김 글은 홈페이지에 보이지 않습니다
            {data && data.branch !== 'main' && <span className="branch-tag">시험 저장소: {data.branch}</span>}
          </p>
        </div>
        <a className="topbar-link list-site" href={SITE_LIST[lang](board)} target="_blank" rel="noopener noreferrer">
          홈페이지에서 보기 ↗
        </a>
        <a className="btn-new" href={newPath} onClick={linkClick(newPath)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {newLabel(lang, board)}
        </a>
      </div>

      <div className="list-tools">
        <form
          className="search-box"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(q.trim());
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6270" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <label className="sr-only" htmlFor="post-search">
            검색
          </label>
          <input
            id="post-search"
            type="search"
            placeholder={koMedia ? '현장명으로 검색' : '제목으로 검색'}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (!e.target.value) {
                setPage(1);
                setQuery('');
              }
            }}
          />
          <button type="submit" className="search-btn">
            검색
          </button>
        </form>
        <div className="chips" role="group" aria-label="필터">
          {filters.map((f, i) => (
            <button
              key={f.label}
              type="button"
              className={`chip${filter === i ? ' on' : ''}`}
              aria-pressed={filter === i}
              onClick={() => {
                setFilter(i);
                setPage(1);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {message && <div className={`notice ${message.kind === 'ok' ? 'notice-ok' : 'notice-error'}`}>{message.text}</div>}
      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-box">
        <table className="post-table">
          <thead>
            <tr>
              <th className="col-thumb">사진</th>
              <th>{koMedia ? '현장명' : '제목'}</th>
              {koMedia && <th>분류</th>}
              <th>게시일</th>
              <th>상태</th>
              {koMedia && <th>메인 노출</th>}
              <th className="col-act">관리</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={7} className="empty">
                  불러오는 중…
                </td>
              </tr>
            )}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  {query || filter ? '조건에 맞는 글이 없습니다.' : '아직 글이 없습니다.'}
                </td>
              </tr>
            )}
            {data?.items.map((r) => {
              const edit = pathOf(lang, `${board}/${r.name}`);
              const sub = koMedia ? r.subject.replace(/^\[[^\]]*\]\s*/, '').slice(r.title.length).trim() : '';
              return (
                <tr key={r.name} className={loading ? 'dim' : ''}>
                  <td>
                    <div className="thumb">
                      {r.thumb ? (
                        <img src={displayUrl(r.thumb, ctx)} alt="" loading="lazy" onError={(e) => e.currentTarget.classList.add('broken')} />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A93A3" strokeWidth="2" aria-hidden="true">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="M21 17l-5-5-9 7" />
                        </svg>
                      )}
                    </div>
                  </td>
                  <td className="col-title">
                    <a href={edit} onClick={linkClick(edit)}>
                      {r.title || '(제목 없음)'}
                    </a>
                    {sub && <div className="sub">{sub}</div>}
                    {r.error && <div className="row-error">{r.error}</div>}
                  </td>
                  {koMedia && <td className="col-cat">{r.category.join(', ')}</td>}
                  <td className="col-date">{r.date.slice(0, 16)}</td>
                  <td>
                    <span className={`state ${r.draft ? 'state-hidden' : 'state-public'}`}>{r.draft ? '숨김' : '공개'}</span>
                  </td>
                  {koMedia && <td className="col-cat">{r.featured ? `★ 메인${r.featuredOrder != null ? ` ${r.featuredOrder}` : ''}` : '—'}</td>}
                  <td className="col-act">
                    <a className="act-link" href={edit} onClick={linkClick(edit)}>
                      수정
                    </a>
                    <button type="button" className="btn-row" disabled={!!busy || !!r.error} onClick={() => toggle(r)}>
                      {busy === r.name ? '저장 중…' : r.draft ? '공개로 전환' : '숨기기'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <nav className="pager" aria-label="쪽 이동">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            이전
          </button>
          {pageNumbers(page, data.pages).map((n) => (
            <button key={n} type="button" className={n === page ? 'on' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => setPage(n)}>
              {n}
            </button>
          ))}
          <button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            다음
          </button>
        </nav>
      )}
    </>
  );
}

function pageNumbers(cur: number, total: number): number[] {
  const start = Math.max(1, Math.min(cur - 2, total - 4));
  const out: number[] = [];
  for (let n = start; n <= Math.min(total, start + 4); n++) out.push(n);
  return out;
}
