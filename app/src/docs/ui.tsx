// 회사 페이지·사이트 설정 화면 공통 부품
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { request } from '../api';
import { displayUrl, pending, type AssetCtx } from '../assets';
import { linkClick } from '../router';
import { addFile, addImages } from '../upload';
import type { Msg } from './useDoc';

// ───── 화면 틀: 저장 막대 + 알림 + (미리보기) ─────
export function DocLayout({
  title,
  group,
  note,
  dirty,
  saving,
  onSave,
  msg,
  siteUrl,
  preview,
  children,
}: {
  title: string;
  group: string;
  note?: ReactNode;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  msg: Msg;
  siteUrl: string;
  preview?: ReactNode;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<'input' | 'preview'>('input');
  return (
    <div className="editor-page">
      <div className="ed-bar">
        <span className="crumb-inline">{group}</span>
        <span className="ed-title">{title}</span>
        {dirty && <span className="ed-dirty">저장 안 된 변경 있음</span>}
        <span className="ed-gap" />
        <a className="list-site" href={siteUrl} target="_blank" rel="noopener noreferrer">
          홈페이지에서 보기 ↗
        </a>
        <button type="button" className="btn-save" disabled={saving || !dirty} onClick={onSave}>
          {saving ? '저장 중…' : '저장하고 홈페이지에 반영'}
        </button>
      </div>
      {note && <div className="doc-note">{note}</div>}
      {msg && (
        <div className={`notice ${msg.kind === 'ok' ? 'notice-ok' : 'notice-error'}`} role={msg.kind === 'error' ? 'alert' : 'status'}>
          {msg.text}
        </div>
      )}
      {preview && (
        <div className="ed-tabs" role="tablist" aria-label="화면 선택">
          <button type="button" role="tab" aria-selected={tab === 'input'} className={tab === 'input' ? 'on' : ''} onClick={() => setTab('input')}>
            입력
          </button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>
            미리보기
          </button>
        </div>
      )}
      <div className="ed-cols">
        <section aria-label="입력" className={`ed-main${!preview || tab === 'input' ? ' show' : ''}`}>
          {children}
        </section>
        {preview && (
          <section aria-label="미리보기" className={`ed-side${tab === 'preview' ? ' show' : ''}`}>
            {preview}
          </section>
        )}
      </div>
    </div>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ed-card">
      {(title || actions) && (
        <div className="card-row">
          {title && <h2 className="doc-card-title">{title}</h2>}
          <span className="ed-gap" />
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Text({
  label,
  value,
  onChange,
  required,
  placeholder,
  help,
}: {
  label: string;
  value: unknown;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  help?: string;
}) {
  return (
    <label className="f">
      <span>
        {label} {required && <em>*</em>}
      </span>
      <input value={value == null ? '' : String(value)} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {help && <small>{help}</small>}
    </label>
  );
}

export function Area({
  label,
  value,
  onChange,
  required,
  rows = 3,
  help,
}: {
  label: string;
  value: unknown;
  onChange: (v: string) => void;
  required?: boolean;
  rows?: number;
  help?: string;
}) {
  return (
    <label className="f">
      <span>
        {label} {required && <em>*</em>}
      </span>
      <textarea rows={rows} value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} />
      {help && <small>{help}</small>}
    </label>
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

// ───── 끌어서 순서 바꾸기 목록(위·아래 버튼도 함께) ─────
export function SortList<T>({
  items,
  onMove,
  render,
  keyOf,
  className = 'sort-list',
}: {
  items: T[];
  onMove: (from: number, to: number) => void;
  render: (item: T, i: number, handle: ReactNode) => ReactNode;
  keyOf: (item: T, i: number) => string;
  className?: string;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return (
    <ul className={className}>
      {items.map((it, i) => (
        <li
          key={keyOf(it, i)}
          className={`${drag === i ? 'dragging' : ''}${over === i && drag !== i ? ' drop-here' : ''}`}
          onDragOver={(e) => {
            if (drag === null) return;
            e.preventDefault();
            setOver(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag !== null && drag !== i) onMove(drag, i);
            setDrag(null);
            setOver(null);
          }}
        >
          {render(
            it,
            i,
            <span className="handle-wrap">
              <span
                className="handle"
                draggable
                title="끌어서 순서 바꾸기"
                aria-hidden="true"
                onDragStart={(e) => {
                  setDrag(i);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(i));
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
              >
                ⋮⋮
              </span>
              <button type="button" className="btn-mini" disabled={i === 0} aria-label="위로" onClick={() => onMove(i, i - 1)}>
                ↑
              </button>
              <button type="button" className="btn-mini" disabled={i === items.length - 1} aria-label="아래로" onClick={() => onMove(i, i + 1)}>
                ↓
              </button>
            </span>,
          )}
        </li>
      ))}
    </ul>
  );
}

// ───── 2단계 삭제 확인 ─────
export function useConfirmDelete() {
  const [state, setState] = useState<{ label: string; step: number; run: () => void } | null>(null);
  const ask = (label: string, run: () => void) => setState({ label, step: 1, run });
  const modal = state && (
    <div className="modal-back" role="presentation">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="cd-title">
        <h2 id="cd-title">{state.step === 1 ? '삭제할까요?' : '정말 삭제할까요?'}</h2>
        <p>
          {state.step === 1 ? `"${state.label}"` : '삭제한 뒤 [저장하고 홈페이지에 반영]을 누르면 홈페이지에서 사라집니다. 저장 전에는 되돌릴 수 있습니다(화면 새로 고침).'}
        </p>
        <div className="modal-btns">
          <button type="button" className="btn-outline" onClick={() => setState(null)} autoFocus>
            취소
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              if (state.step === 1) setState({ ...state, step: 2 });
              else {
                state.run();
                setState(null);
              }
            }}
          >
            {state.step === 1 ? '삭제' : '삭제합니다'}
          </button>
        </div>
      </div>
    </div>
  );
  return { ask, modal };
}

// ───── 사진·동영상·PDF 고르기 ─────
type Kind = 'image' | 'video' | 'pdf';

export function MediaField({
  label,
  value,
  onChange,
  ctx,
  kind = 'image',
  required,
  portrait,
  onError,
  clearable,
}: {
  label: string;
  value: unknown;
  onChange: (v: string) => void;
  ctx: AssetCtx | null;
  kind?: Kind;
  required?: boolean;
  portrait?: boolean;
  onError: (m: string) => void;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const v = value == null ? '' : String(value);
  const p = pending.get(v);
  return (
    <div className="f">
      <span>
        {label} {required && <em>*</em>}
      </span>
      <div className="img-field">
        <div className={`img-box${portrait ? ' portrait' : ''}`}>
          {v && kind === 'image' ? (
            <img src={displayUrl(v, ctx)} alt="" />
          ) : (
            <small>{v ? (kind === 'video' ? '동영상' : 'PDF') : '없음'}</small>
          )}
        </div>
        <div className="img-side">
          <small className="img-path">{p ? `${p.name} (저장할 때 올림)` : v || '선택하지 않음'}</small>
          <button type="button" className="btn-row" onClick={() => setOpen(true)}>
            {v ? '바꾸기' : kind === 'image' ? '사진 고르기' : '파일 고르기'}
          </button>
          {v && (clearable ?? !required) && (
            <button type="button" className="btn-row" onClick={() => onChange('')}>
              지우기
            </button>
          )}
        </div>
      </div>
      {open && (
        <MediaPicker
          kind={kind}
          ctx={ctx}
          onClose={() => setOpen(false)}
          onPick={(path) => {
            onChange(path);
            setOpen(false);
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

interface MediaList {
  branch: string;
  total: number;
  page: number;
  pages: number;
  items: string[];
}

export function MediaPicker({
  kind,
  ctx,
  onClose,
  onPick,
  onError,
}: {
  kind: Kind;
  ctx: AssetCtx | null;
  onClose: () => void;
  onPick: (path: string) => void;
  onError: (m: string) => void;
}) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<MediaList | null>(null);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    request<MediaList>('GET', `/api/media?${new URLSearchParams({ q: query, kind, page: String(page) })}`).then((r) => {
      if (!alive) return;
      if (r.ok && r.data) {
        setList(r.data);
        setErr('');
      } else setErr(r.error ?? '목록을 읽지 못했습니다.');
    });
    return () => {
      alive = false;
    };
  }, [query, kind, page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    if (kind === 'image') {
      const { paths, errors } = await addImages(files.slice(0, 1));
      if (errors.length) onError(errors.join(' '));
      if (paths[0]) onPick(paths[0]);
    } else if (kind === 'pdf') {
      try {
        onPick(addFile(files[0], ['pdf']));
      } catch (e) {
        onError(e instanceof Error ? e.message : 'PDF 를 넣지 못했습니다.');
      }
    }
  };

  const listCtx: AssetCtx = { branch: list?.branch ?? ctx?.branch ?? 'main', resolved: ctx?.resolved };
  return (
    <div className="modal-back" role="presentation" onClick={onClose}>
      <div className="modal media-modal" role="dialog" aria-modal="true" aria-labelledby="mp-title" onClick={(e) => e.stopPropagation()}>
        <div className="card-row">
          <h2 id="mp-title">{kind === 'image' ? '사진 고르기' : kind === 'video' ? '동영상 고르기' : 'PDF 고르기'}</h2>
          <span className="ed-gap" />
          <button type="button" className="btn-outline" onClick={onClose}>
            닫기
          </button>
        </div>
        {kind !== 'video' && (
          <div
            className="drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void upload([...e.dataTransfer.files]);
            }}
          >
            <div className="drop-text">
              새로 올리기: 끌어다 놓거나{' '}
              <button type="button" className="link-btn" onClick={() => input.current?.click()}>
                파일 선택
              </button>
              <br />
              <small>{kind === 'image' ? '긴 변 1920px 로 자동 축소 · 10MB 이하 · 저장할 때 올립니다' : '20MB 이하 · 저장할 때 올립니다'}</small>
            </div>
            <input
              ref={input}
              type="file"
              hidden
              accept={kind === 'image' ? 'image/jpeg,image/png,image/gif,image/webp' : 'application/pdf,.pdf'}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                void upload(files);
              }}
            />
          </div>
        )}
        <form
          className="search-box"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(q.trim());
          }}
        >
          <label className="sr-only" htmlFor="mp-q">
            파일 이름 검색
          </label>
          <input id="mp-q" type="search" placeholder="이미 올린 파일 이름으로 검색 (예: cert, his_)" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="search-btn">
            검색
          </button>
        </form>
        {err && <p className="msg-error">{err}</p>}
        <p className="muted">
          {list ? `${list.total}개` : '불러오는 중…'} · 국문·영문이 같은 사진 파일을 함께 쓸 수 있습니다.
        </p>
        <ul className={kind === 'image' ? 'media-grid' : 'media-files'}>
          {list?.items.map((p) => (
            <li key={p}>
              <button type="button" onClick={() => onPick(p)} title={p}>
                {kind === 'image' && <img src={displayUrl(p, listCtx)} alt="" loading="lazy" />}
                <span>{p.split('/').pop()}</span>
              </button>
            </li>
          ))}
        </ul>
        {list && list.pages > 1 && (
          <nav className="pager" aria-label="쪽 이동">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              이전
            </button>
            <span className="muted">
              {page} / {list.pages}
            </span>
            <button type="button" disabled={page >= list.pages} onClick={() => setPage(page + 1)}>
              다음
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}

export function LinkTo({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a href={to} onClick={linkClick(to)}>
      {children}
    </a>
  );
}
