// 문의함(관리자·편집자): 목록(신규/확인/완료), 상세, 상태 변경, 메모, CSV 내려받기, 1년 지난 완료 건 삭제(관리자). 3-2f
import { useEffect, useState } from 'react';
import { kst, request } from '../api';
import { pathOf, type Lang } from '../nav';
import { linkClick } from '../router';

const STATUS: Record<string, string> = { new: '신규', read: '확인', done: '완료' };
const CUSTOMER: Record<string, string> = { personal: '개인', company: '기업', public: '공공' };
const PLACE: Record<string, string> = { house: '주택지붕', building: '건물', factory: '공장', parking: '주차장', land: '토지', etc: '기타' };
const BADGE: Record<string, string> = { new: 'state-hidden', read: 'state-public', done: 'badge-wait' };

interface Row {
  id: number;
  lang: string;
  customer_type: string;
  place: string;
  region: string;
  name: string;
  phone: string;
  status: string;
  created_at: number;
  [k: string]: unknown;
}

export default function Inquiries({ lang, id, isAdmin, onExpired }: { lang: Lang; id?: string; isAdmin: boolean; onExpired: () => void }) {
  return id ? <Detail lang={lang} id={id} onExpired={onExpired} /> : <List lang={lang} isAdmin={isAdmin} onExpired={onExpired} />;
}

function List({ lang, isAdmin, onExpired }: { lang: Lang; isAdmin: boolean; onExpired: () => void }) {
  const [status, setStatus] = useState('new');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; page: number; pages: number; items: Row[]; counts: Record<string, number> } | null>(null);
  const [msg, setMsg] = useState('');
  const [reload, setReload] = useState(0);
  const [purgeStep, setPurgeStep] = useState(0);
  useEffect(() => {
    let alive = true;
    request<NonNullable<typeof data>>('GET', `/api/inquiries?${new URLSearchParams({ status, q: query, page: String(page) })}`).then((r) => {
      if (!alive) return;
      if (r.status === 401) return onExpired();
      if (r.ok && r.data) setData(r.data);
      else setMsg(r.error ?? '목록을 읽지 못했습니다.');
    });
    return () => {
      alive = false;
    };
  }, [status, query, page, reload, onExpired]);

  const purge = async () => {
    setPurgeStep(0);
    const r = await request<{ deleted: number }>('POST', '/api/inquiries/purge', {});
    setMsg(r.ok ? `1년 지난 완료 문의 ${r.data?.deleted ?? 0}건을 삭제했습니다.` : r.error ?? '삭제하지 못했습니다.');
    setReload((n) => n + 1);
  };
  const c = data?.counts ?? {};
  return (
    <>
      <div className="list-head">
        <div className="list-head-text">
          <h1 className="page-title">문의함</h1>
          <p className="page-desc">홈페이지 견적문의입니다(관리자 화면 데이터베이스에만 보관, 홈페이지 저장소에는 올라가지 않음).</p>
        </div>
        <a className="btn-outline" href={`/api/inquiries/export?${new URLSearchParams({ status, q: query })}`}>
          엑셀(CSV) 내려받기
        </a>
        {isAdmin && (
          <button type="button" className="btn-danger-outline" onClick={() => setPurgeStep(1)}>
            1년 지난 완료 건 삭제
          </button>
        )}
      </div>
      <div className="list-tools">
        <div className="chips" role="group" aria-label="상태">
          {[
            ['new', `신규 ${c.new ?? 0}`],
            ['read', `확인 ${c.read ?? 0}`],
            ['done', `완료 ${c.done ?? 0}`],
            ['', '전체'],
          ].map(([k, l]) => (
            <button key={k || 'all'} type="button" className={`chip${status === k ? ' on' : ''}`} aria-pressed={status === k} onClick={() => (setStatus(k), setPage(1))}>
              {l}
            </button>
          ))}
        </div>
        <form
          className="search-box"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(q.trim());
          }}
        >
          <label className="sr-only" htmlFor="iq">
            검색
          </label>
          <input id="iq" type="search" placeholder="이름·연락처·지역·내용 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="search-btn">
            검색
          </button>
        </form>
      </div>
      {msg && <div className="notice notice-ok">{msg}</div>}
      <div className="table-box">
        <table className="post-table">
          <thead>
            <tr>
              <th>번호</th>
              <th>접수</th>
              <th>이름</th>
              <th>연락처</th>
              <th>구분·장소</th>
              <th>지역</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  문의가 없습니다.
                </td>
              </tr>
            )}
            {data?.items.map((r) => {
              const to = pathOf(lang, `inquiries/${r.id}`);
              return (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td className="col-date">{kst(r.created_at)}</td>
                  <td className="col-title">
                    <a href={to} onClick={linkClick(to)}>
                      {r.name}
                    </a>
                    {r.lang === 'en' && <small className="muted"> 영문</small>}
                  </td>
                  <td>{r.phone}</td>
                  <td className="col-cat">
                    {CUSTOMER[r.customer_type] ?? r.customer_type} · {PLACE[r.place] ?? r.place}
                  </td>
                  <td className="col-cat">{r.region}</td>
                  <td>
                    <span className={`state ${BADGE[r.status]}`}>{STATUS[r.status]}</span>
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
          <span className="muted">
            {page} / {data.pages}
          </span>
          <button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            다음
          </button>
        </nav>
      )}
      {purgeStep > 0 && (
        <div className="modal-back" role="presentation">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="pg-title">
            <h2 id="pg-title">{purgeStep === 1 ? '1년 지난 완료 문의를 삭제할까요?' : '정말 삭제할까요?'}</h2>
            <p>{purgeStep === 1 ? '접수한 지 1년이 지난 "완료" 문의만 지웁니다. 신규·확인 문의는 남습니다.' : '삭제하면 되돌릴 수 없습니다. 필요하면 먼저 엑셀로 내려받아 두세요.'}</p>
            <div className="modal-btns">
              <button type="button" className="btn-outline" onClick={() => setPurgeStep(0)} autoFocus>
                취소
              </button>
              <button type="button" className="btn-danger" onClick={() => (purgeStep === 1 ? setPurgeStep(2) : void purge())}>
                {purgeStep === 1 ? '삭제' : '삭제합니다'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Detail({ lang, id, onExpired }: { lang: Lang; id: string; onExpired: () => void }) {
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [memo, setMemo] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    request<{ item: Record<string, unknown> }>('GET', `/api/inquiries/${id}`).then((r) => {
      if (r.status === 401) return onExpired();
      if (r.ok && r.data) {
        setItem(r.data.item);
        setMemo(String(r.data.item.memo ?? ''));
      } else setMsg({ ok: false, text: r.error ?? '읽지 못했습니다.' });
    });
  }, [id, onExpired]);
  const save = async (patch: Record<string, unknown>) => {
    const r = await request<object>('PATCH', `/api/inquiries/${id}`, patch);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? '저장하지 못했습니다.' });
    setItem((it) => (it ? { ...it, ...patch } : it));
    setMsg({ ok: true, text: '저장했습니다.' });
  };
  const back = pathOf(lang, 'inquiries');
  if (!item) return msg ? <p className="msg-error">{msg.text}</p> : <div className="loading">불러오는 중…</div>;
  const rows: [string, unknown][] = [
    ['접수', kst(Number(item.created_at))],
    ['홈페이지', item.lang === 'en' ? '영문' : '국문'],
    ['고객구분', CUSTOMER[String(item.customer_type)] ?? item.customer_type],
    ['설치장소', PLACE[String(item.place)] ?? item.place],
    ['지역', item.region],
    ['면적·월 전기요금', item.scale],
    ['관심사업', item.interest],
    ['이름', item.name],
    ['연락처', item.phone],
    ['이메일', item.email],
    ['개인정보 동의', kst(Number(item.agree_at))],
  ];
  return (
    <>
      <div className="page-head">
        <a className="ed-back" href={back} onClick={linkClick(back)}>
          ‹ 문의함
        </a>
        <h1 className="page-title">
          문의 #{String(item.id)} · {String(item.name)}
        </h1>
      </div>
      {msg && <div className={`notice ${msg.ok ? 'notice-ok' : 'notice-error'}`}>{msg.text}</div>}
      <div className="grid">
        <section className="card">
          <table className="count-table inq-table">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{String(v ?? '') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="card-title inq-msg-title">문의내용</h2>
          <p className="inq-msg">{String(item.message)}</p>
        </section>
        <section className="card">
          <h2 className="card-title">처리</h2>
          <div className="chips" role="group" aria-label="상태">
            {Object.entries(STATUS).map(([k, l]) => (
              <button key={k} type="button" className={`chip${item.status === k ? ' on' : ''}`} aria-pressed={item.status === k} onClick={() => void save({ status: k })}>
                {l}
              </button>
            ))}
          </div>
          <label className="f inq-memo">
            <span>메모 (직원끼리만 봄)</span>
            <textarea rows={6} value={memo} maxLength={2000} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <button type="button" className="btn-outline" disabled={memo === String(item.memo ?? '')} onClick={() => void save({ memo })}>
            메모 저장
          </button>
          {item.handler ? <p className="card-note">마지막 처리: {String(item.handler)}</p> : null}
        </section>
      </div>
    </>
  );
}
