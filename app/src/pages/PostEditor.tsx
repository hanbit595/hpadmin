// 글쓰기·수정 (시안 "3. 글쓰기 + 실제 모양 미리보기")
// - 게시판별 입력 칸, 본문 편집기(TipTap ↔ HTML), 저장(바뀐 칸만)·삭제(확인 2단계)·저장 안 하고 나가기 경고
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, boardTitle, isKoMedia, kstNow, mediaSubject, normDate, type Board, type Lang } from '../../shared/boards';
import { api, request, type SaveResult } from '../api';
import type { AssetCtx } from '../assets';
import { assetRef, editorLoss } from '../editor/extensions';
import RichEditor, { type BodyMode } from '../editor/RichEditor';
import { pathOf } from '../nav';
import { linkClick, navigate, setLeaveGuard } from '../router';
import { ImageField, GalleryField, PdfField } from './fields';
import Preview from './Preview';

export interface Form {
  title: string;
  category: string[];
  capacity: string;
  program: string;
  date: string;
  thumbnail: string;
  summary: string;
  gallery: string[];
  featured: boolean;
  featuredOrder: string;
  featuredImage: string;
  file: string;
  draft: boolean;
}

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

function formFromFm(fm: Record<string, unknown>): Form {
  let cats = fm.category;
  if (typeof cats === 'string') cats = [cats];
  const gallery = Array.isArray(fm.gallery)
    ? fm.gallery.map((g) => (g && typeof g === 'object' ? str((g as Record<string, unknown>).image ?? (g as Record<string, unknown>).src) : str(g)))
    : [];
  return {
    title: str(fm.title),
    category: Array.isArray(cats) ? cats.map(String) : [],
    capacity: str(fm.capacity),
    program: str(fm.program),
    date: normDate(str(fm.date)) ?? str(fm.date),
    thumbnail: str(fm.thumbnail),
    summary: str(fm.summary),
    gallery,
    featured: fm.featured === true,
    featuredOrder: Number.isInteger(fm.featured_order) ? String(fm.featured_order) : '',
    featuredImage: str(fm.featured_image),
    file: str(fm.file),
    draft: fm.draft === true,
  };
}

function emptyForm(): Form {
  return {
    title: '', category: [], capacity: '', program: '', date: kstNow(), thumbnail: '', summary: '', gallery: [],
    featured: false, featuredOrder: '', featuredImage: '', file: '', draft: false,
  };
}

/** 화면 칸 → 머리말 칸(게시판별) */
function fieldsOf(f: Form, lang: Lang, board: Board): Record<string, unknown> {
  const out: Record<string, unknown> = { title: f.title.trim(), date: f.date, thumbnail: f.thumbnail, summary: f.summary, draft: f.draft };
  if (isKoMedia(lang, board)) {
    Object.assign(out, {
      category: f.category,
      capacity: f.capacity.trim(),
      program: f.program.trim(),
      gallery: f.gallery,
      featured: f.featured,
      featured_order: f.featuredOrder.trim() === '' ? '' : Number(f.featuredOrder),
      featured_image: f.featuredImage,
    });
  }
  if (board === 'library') out.file = f.file;
  return out;
}

/** 화면을 옮긴 뒤 보여 줄 알림(브라우저 저장소가 막혀 있으면 생략) */
function flash(key: string, text: string) {
  try {
    sessionStorage.setItem(key, text);
  } catch {
    // 알림만 빠진다
  }
}

const toInput = (d: string) => (normDate(d) ?? '').replace(' ', 'T');
const fromInput = (v: string) => normDate(v.replace('T', ' ')) ?? v.replace('T', ' ');

interface Loaded {
  sha: string;
  path: string;
  branch: string;
  resolved: Record<string, string>;
}

export default function PostEditor({ lang, board, name, onExpired }: { lang: Lang; board: Board; name: string; onExpired: () => void }) {
  const isNew = name === 'new';
  const koMedia = isKoMedia(lang, board);
  const listPath = pathOf(lang, board);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<Form>(emptyForm);
  const [initial, setInitial] = useState<Form>(() => form);
  const [body, setBody] = useState('');
  const [bodyDirty, setBodyDirty] = useState(false);
  const [mode, setMode] = useState<BodyMode>('editor');
  const [lossNote, setLossNote] = useState('');
  const [ready, setReady] = useState(isNew);
  const [saving, setSaving] = useState(false);
  // 새 글 저장 뒤 수정 화면으로 넘어왔을 때 알림
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(() => {
    try {
      const f = sessionStorage.getItem('hb-flash');
      if (f) {
        sessionStorage.removeItem('hb-flash');
        return { kind: 'ok', text: f };
      }
    } catch {
      // 저장소를 쓸 수 없는 브라우저
    }
    return null;
  });
  const [delStep, setDelStep] = useState(0);
  const [tab, setTab] = useState<'input' | 'preview'>('input');

  // 글 읽기
  useEffect(() => {
    if (isNew) {
      assetRef.current = { branch: 'main' };
      return;
    }
    let alive = true;
    api.post(lang, board, name).then((r) => {
      if (!alive) return;
      if (r.status === 401) return onExpired();
      if (!r.ok || !r.data) return setLoadError(r.error ?? '글을 읽지 못했습니다.');
      const d = r.data;
      const f = formFromFm(d.fm);
      assetRef.current = { branch: d.branch, resolved: d.resolved };
      setLoaded({ sha: d.sha, path: d.path, branch: d.branch, resolved: d.resolved });
      setForm(f);
      setInitial(f);
      setBody(d.body);
      const isHtml = String(d.fm.body_format ?? '').toLowerCase() === 'html';
      const loss = isHtml ? editorLoss(d.body) : '본문이 markdown 형식';
      if (loss) {
        setMode('html');
        setLossNote(
          `이 글에는 편집기가 그대로 담지 못하는 서식(${loss})이 있어 HTML 모드로 열었습니다. 원래 서식을 지키려면 HTML 모드에서 고쳐 주세요.` +
            (isHtml ? '' : ' 본문을 고쳐 저장하면 HTML 형식(body_format: html)으로 저장됩니다.'),
        );
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [isNew, lang, board, name, onExpired]);

  // 바뀐 칸만 보낸다(기존 글의 손대지 않은 칸은 서버로 가지 않음). 새 글은 전부
  const { changedFields, formChanged } = useMemo(() => {
    const now = fieldsOf(form, lang, board);
    const before = fieldsOf(initial, lang, board);
    const out: Record<string, unknown> = {};
    let changed = false;
    for (const [k, v] of Object.entries(now)) {
      const diff = JSON.stringify(v) !== JSON.stringify(before[k]);
      if (diff) changed = true;
      if (isNew || diff) out[k] = v;
    }
    return { changedFields: out, formChanged: changed };
  }, [form, initial, lang, board, isNew]);

  const dirty = bodyDirty || formChanged;
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  });
  useEffect(() => {
    setLeaveGuard(() => dirtyRef.current);
    return () => setLeaveGuard(null);
  }, []);

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v })), []);
  const ctx: AssetCtx = loaded ? { branch: loaded.branch, resolved: loaded.resolved } : { branch: 'main' };

  function check(): string | null {
    if (!form.title.trim()) return koMedia ? '현장명을 입력해 주세요.' : '제목을 입력해 주세요.';
    if (!normDate(form.date)) return '게시일을 바르게 입력해 주세요.';
    if (koMedia && form.category.length === 0) return '분류를 1개 이상 선택해 주세요.';
    if (board === 'library' && !form.file.trim()) return 'E-Catalog PDF 파일을 올려 주세요(필수).';
    if (koMedia && form.featuredOrder.trim() && !/^\d{1,3}$/.test(form.featuredOrder.trim())) return '메인 노출 순서는 숫자로 넣어 주세요.';
    return null;
  }

  async function save() {
    const err = check();
    if (err) return setMessage({ kind: 'error', text: err });
    setSaving(true);
    setMessage(null);
    let r;
    if (isNew) r = await request<SaveResult>('POST', `/api/posts/${lang}/${board}`, { fields: changedFields, body });
    else
      r = await api.savePost(lang, board, name, {
        sha: loaded!.sha,
        fields: changedFields,
        ...(bodyDirty ? { body } : {}),
      });
    setSaving(false);
    if (r.status === 401) return onExpired();
    if (!r.ok || !r.data) return setMessage({ kind: 'error', text: r.error ?? '저장하지 못했습니다.' });
    const branch = r.data.branch ?? ctx.branch;
    const test = branch !== 'main';
    const note = r.data.unchanged
      ? '바뀐 내용이 없어 저장하지 않았습니다.'
      : `저장했습니다. 1~2분 뒤 홈페이지에 반영됩니다.${test ? ` (지금은 시험 저장소 ${branch} 에 저장되어 실제 홈페이지에는 반영되지 않습니다.)` : ''}`;
    if (isNew && r.data.name) {
      dirtyRef.current = false;
      flash('hb-flash', note);
      navigate(pathOf(lang, `${board}/${r.data.name}`), true, true);
      return;
    }
    setLoaded((l) => (l ? { ...l, sha: r.data!.sha } : l));
    setInitial(form);
    setBodyDirty(false);
    setMessage({ kind: 'ok', text: note });
  }

  async function remove() {
    setDelStep(0);
    setSaving(true);
    const r = await request<{ path: string }>('DELETE', `/api/posts/${lang}/${board}/${name}?sha=${loaded!.sha}`);
    setSaving(false);
    if (r.status === 401) return onExpired();
    if (!r.ok) return setMessage({ kind: 'error', text: r.error ?? '삭제하지 못했습니다.' });
    dirtyRef.current = false;
    flash('hb-flash-list', `"${form.title}" 을(를) 삭제했습니다. 1~2분 뒤 홈페이지에서 사라집니다.`);
    navigate(listPath, false, true);
  }

  if (loadError)
    return (
      <section className="card placeholder denied">
        <p>{loadError}</p>
        <a className="btn-outline" href={listPath} onClick={linkClick(listPath)}>
          목록으로
        </a>
      </section>
    );
  if (!ready) return <div className="loading">글을 불러오는 중…</div>;

  const subject = koMedia ? mediaSubject(form.category, form.title.trim(), form.capacity.trim(), form.program.trim()) : form.title.trim();
  const saveLabel = form.draft ? '숨김으로 저장' : '저장하고 홈페이지에 반영';

  return (
    <div className="editor-page">
      <div className="ed-bar">
        <a className="ed-back" href={listPath} onClick={linkClick(listPath)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {boardTitle(lang, board)} 목록
        </a>
        <span className="ed-title">{isNew ? `새 ${boardTitle(lang, board)}` : '글 수정'}</span>
        {dirty && <span className="ed-dirty">저장 안 된 변경 있음</span>}
        <span className="ed-gap" />
        {!isNew && (
          <button type="button" className="btn-danger-outline" disabled={saving} onClick={() => setDelStep(1)}>
            삭제
          </button>
        )}
        <button type="button" className="btn-save" disabled={saving} onClick={save}>
          {saving ? '저장 중…' : saveLabel}
        </button>
      </div>

      {koMedia || board === 'media' ? (
        <div className="ed-warn" role="note">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
          </svg>
          <span>
            <b>규정상 비공개 현장은 등록 금지.</b> 숨김으로 저장해도 홈페이지 저장소(공개)에 남습니다.
          </span>
        </div>
      ) : null}

      {message && (
        <div className={`notice ${message.kind === 'ok' ? 'notice-ok' : 'notice-error'}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </div>
      )}

      <div className="ed-tabs" role="tablist" aria-label="화면 선택">
        <button type="button" role="tab" aria-selected={tab === 'input'} className={tab === 'input' ? 'on' : ''} onClick={() => setTab('input')}>
          입력
        </button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>
          미리보기
        </button>
      </div>

      <div className="ed-cols">
        <section aria-label="입력" className={`ed-main${tab === 'input' ? ' show' : ''}`}>
          <div className="ed-card">
            <label className="f">
              <span>
                {koMedia ? '현장명' : '제목'} <em>*</em>
              </span>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
            </label>

            {koMedia && (
              <div className="f">
                <span>
                  분류 (여러 개 선택 가능) <em>*</em>
                </span>
                <div className="chips">
                  {CATEGORIES.map((c) => {
                    const on = form.category.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        className={`chip${on ? ' on' : ''}`}
                        aria-pressed={on}
                        onClick={() => set('category', on ? form.category.filter((x) => x !== c) : [...form.category, c])}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
                {form.category.length > 1 && <small>표시 순서: 누른 순서대로 [{form.category.join(',')}]</small>}
              </div>
            )}

            <div className={koMedia ? 'f-grid3' : 'f-grid1'}>
              {koMedia && (
                <label className="f">
                  <span>설비용량</span>
                  <input value={form.capacity} placeholder="예: 138.24kW" onChange={(e) => set('capacity', e.target.value)} />
                </label>
              )}
              {koMedia && (
                <label className="f">
                  <span>사업구분</span>
                  <input value={form.program} placeholder="예: 건물지원사업" onChange={(e) => set('program', e.target.value)} />
                </label>
              )}
              <label className="f">
                <span>
                  게시일 <em>*</em>
                </span>
                <input type="datetime-local" step={1} value={toInput(form.date)} onChange={(e) => set('date', fromInput(e.target.value))} />
              </label>
            </div>
            {koMedia && <small className="f-help">홈페이지 표시 제목: {subject}</small>}

            {board === 'library' && (
              <PdfField label="E-Catalog PDF" required value={form.file} onChange={(v) => set('file', v)} ctx={ctx} />
            )}

            <ImageField label="대표 사진 (목록 썸네일)" value={form.thumbnail} onChange={(v) => set('thumbnail', v)} ctx={ctx} />

            <label className="f">
              <span>요약</span>
              <textarea
                rows={3}
                value={form.summary}
                placeholder="메인 화면 소식 요약·검색 결과 설명에 쓰입니다(비우면 본문 앞부분)."
                onChange={(e) => set('summary', e.target.value)}
              />
            </label>

            {koMedia && <GalleryField value={form.gallery} onChange={(v) => set('gallery', v)} ctx={ctx} />}
          </div>

          <div className="ed-card ed-card-flush">
            {lossNote && <div className="notice notice-lock ed-loss">{lossNote}</div>}
            <RichEditor
              html={body}
              mode={mode}
              onModeChange={setMode}
              onChange={(h) => {
                setBody(h);
                setBodyDirty(true);
              }}
            />
          </div>

          <div className="ed-card">
            <div className="checks">
              {koMedia && (
                <label className="check">
                  <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} />
                  메인 Our Project 에 노출
                </label>
              )}
              <label className="check">
                <input type="checkbox" checked={form.draft} onChange={(e) => set('draft', e.target.checked)} />
                숨김 (홈페이지 비공개)
              </label>
            </div>
            {koMedia && form.featured && (
              <div className="f-grid2">
                <label className="f">
                  <span>메인 노출 순서</span>
                  <input
                    inputMode="numeric"
                    value={form.featuredOrder}
                    placeholder="작은 숫자 먼저(비우면 최신순)"
                    onChange={(e) => set('featuredOrder', e.target.value.replace(/[^\d]/g, ''))}
                  />
                </label>
                <ImageField label="메인 사진 (비우면 대표 사진)" value={form.featuredImage} onChange={(v) => set('featuredImage', v)} ctx={ctx} />
              </div>
            )}
          </div>
        </section>

        <section aria-label="미리보기" className={`ed-side${tab === 'preview' ? ' show' : ''}`}>
          <Preview lang={lang} board={board} subject={subject} form={form} body={body} ctx={ctx} />
        </section>
      </div>

      {delStep > 0 && (
        <div className="modal-back" role="presentation">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
            <h2 id="del-title">{delStep === 1 ? '이 글을 삭제할까요?' : '정말 삭제할까요?'}</h2>
            <p>
              {delStep === 1 ? (
                <>
                  "{form.title}"
                  <br />
                  삭제하면 홈페이지에서 사라집니다.
                </>
              ) : (
                <>
                  삭제하면 홈페이지에서 사라집니다. 되돌리려면 관리자에게 복구를 요청해야 합니다.
                  <br />이 글에서만 쓰던 사진·첨부도 함께 지워집니다.
                </>
              )}
            </p>
            <div className="modal-btns">
              <button type="button" className="btn-outline" onClick={() => setDelStep(0)} autoFocus>
                취소
              </button>
              <button type="button" className="btn-danger" onClick={() => (delStep === 1 ? setDelStep(2) : remove())}>
                {delStep === 1 ? '삭제' : '삭제합니다'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
