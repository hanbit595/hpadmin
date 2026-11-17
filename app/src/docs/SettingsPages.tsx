// 사이트 설정(관리자만): 메뉴·회사정보·팝업 (국문·영문)
import { useEffect, useId, useState } from 'react';
import { request } from '../api';
import { Area, Card, DocLayout, MediaField, SortList, Switch, Text, useConfirmDelete } from './ui';
import { moveItem, setIn, useDoc } from './useDoc';

type L = 'ko' | 'en';
type Props = { lang: L; onExpired: () => void };
const HOME = { ko: 'https://hanbitinnotech.com/', en: 'https://hanbitinnotech.com/en/index.html' };

// ───── 링크 입력: 내부 페이지 목록에서 고르기 + 직접 입력 ─────
function useLinks(lang: L) {
  const [items, setItems] = useState<{ path: string; title: string }[]>([]);
  useEffect(() => {
    request<{ items: { path: string; title: string }[] }>('GET', `/api/links?lang=${lang}`).then((r) => r.ok && r.data && setItems(r.data.items));
  }, [lang]);
  return items;
}

function LinkInput({ label, value, onChange, links, help }: { label: string; value: unknown; onChange: (v: string) => void; links: { path: string; title: string }[]; help?: string }) {
  const id = useId();
  const v = value == null ? '' : String(value);
  const known = links.find((l) => l.path === v);
  return (
    <label className="f">
      <span>{label}</span>
      <input list={id} value={v} placeholder="/page/… 를 고르거나 https:// 주소를 직접 입력" onChange={(e) => onChange(e.target.value.trim())} />
      <datalist id={id}>
        {links.map((l) => (
          <option key={l.path} value={l.path}>
            {l.title}
          </option>
        ))}
      </datalist>
      <small>{known ? `사이트 안: ${known.title}` : v.startsWith('http') ? '바깥 주소' : v ? '목록에 없는 주소(저장할 때 확인합니다)' : help ?? ''}</small>
    </label>
  );
}

// ───── 메뉴 ─────
interface Sub {
  label: string;
  link: string;
  new_window?: boolean;
  visible?: boolean;
  [k: string]: unknown; // class 등은 화면에 숨기고 그대로 둔다
}
interface Top {
  label: string;
  link?: string;
  visible?: boolean;
  items?: Sub[];
  [k: string]: unknown;
}

export function MenuSettings({ lang, onExpired }: Props) {
  const doc = useDoc<{ menu: Top[]; [k: string]: unknown }>('settings', lang, 'menu', onExpired);
  const links = useLinks(lang);
  const del = useConfirmDelete();
  const [open, setOpen] = useState<number | null>(0);
  const d = doc.data;
  if (doc.error) return <p className="msg-error">{doc.error}</p>;
  if (!d) return <div className="loading">불러오는 중…</div>;
  const set = (p: (string | number)[], v: unknown) => doc.setData(setIn(d, p, v));
  return (
    <DocLayout
      title={`메뉴${lang === 'en' ? ' (Menu)' : ''}`}
      group="사이트 설정"
      dirty={doc.dirty}
      saving={doc.saving}
      onSave={doc.save}
      msg={doc.msg}
      siteUrl={HOME[lang]}
      note="상단 메뉴·모바일 메뉴·경로 드롭다운·하위 탭에 함께 쓰입니다. 대메뉴 링크를 비우면 첫 번째로 보이는 소메뉴로 이동합니다. 사이트 안 링크는 실제 페이지가 있어야 저장됩니다."
    >
      <SortList
        items={d.menu}
        keyOf={(_, i) => String(i)}
        onMove={(f, t) => {
          doc.setData({ ...d, menu: moveItem(d.menu, f, t) });
          setOpen(null);
        }}
        render={(m, i, handle) => (
          <div className={`ed-card menu-card${m.visible === false ? ' off' : ''}`}>
            <div className="card-row wrap">
              {handle}
              <button type="button" className="menu-title" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                {open === i ? '▼' : '▶'} {m.label || '(이름 없음)'} <small>소메뉴 {(m.items ?? []).length}</small>
              </button>
              <span className="ed-gap" />
              <Switch label="보이기" checked={m.visible !== false} onChange={(v) => set(['menu', i, 'visible'], v)} />
            </div>
            {open === i && (
              <>
                <div className="f-grid2">
                  <Text label="대메뉴 이름" required value={m.label} onChange={(v) => set(['menu', i, 'label'], v)} />
                  <LinkInput label="대메뉴 링크" value={m.link} links={links} help="비우면 첫 번째로 보이는 소메뉴로 이동" onChange={(v) => set(['menu', i, 'link'], v)} />
                </div>
                <SortList
                  items={m.items ?? []}
                  keyOf={(_, j) => String(j)}
                  onMove={(f, t) => set(['menu', i, 'items'], moveItem(m.items ?? [], f, t))}
                  render={(s, j, h) => (
                    <div className={`sub-menu${s.visible === false ? ' off' : ''}`}>
                      <div className="card-row wrap">
                        {h}
                        <b className="sub-name">{s.label || '(이름 없음)'}</b>
                        <span className="ed-gap" />
                        <Switch label="보이기" checked={s.visible !== false} onChange={(v) => set(['menu', i, 'items', j, 'visible'], v)} />
                        <button
                          type="button"
                          className="btn-row danger"
                          onClick={() => del.ask(s.label || '새 소메뉴', () => set(['menu', i, 'items'], (m.items ?? []).filter((_, k) => k !== j)))}
                        >
                          삭제
                        </button>
                      </div>
                      <div className="f-grid2">
                        <Text label="소메뉴 이름" required value={s.label} onChange={(v) => set(['menu', i, 'items', j, 'label'], v)} />
                        <LinkInput label="링크" value={s.link} links={links} onChange={(v) => set(['menu', i, 'items', j, 'link'], v)} />
                      </div>
                      <label className="check">
                        <input type="checkbox" checked={s.new_window === true} onChange={(e) => set(['menu', i, 'items', j, 'new_window'], e.target.checked)} />새 창으로 열기
                      </label>
                    </div>
                  )}
                />
                <div className="card-row">
                  <button
                    type="button"
                    className="btn-row"
                    onClick={() => set(['menu', i, 'items'], [...(m.items ?? []), { label: '', link: '', new_window: false, visible: true }])}
                  >
                    + 소메뉴
                  </button>
                  <span className="ed-gap" />
                  <button type="button" className="btn-row danger" onClick={() => del.ask(`대메뉴 '${m.label}' 전체`, () => doc.setData({ ...d, menu: d.menu.filter((_, k) => k !== i) }))}>
                    대메뉴 삭제
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      />
      <button
        type="button"
        className="btn-row add-row"
        onClick={() => {
          doc.setData({ ...d, menu: [...d.menu, { label: '', link: '', visible: true, items: [{ label: '', link: '', new_window: false, visible: true }] }] });
          setOpen(d.menu.length);
        }}
      >
        + 대메뉴
      </button>
      {del.modal}
    </DocLayout>
  );
}

// ───── 회사정보 ─────
interface Site {
  offices: { name: string; address: string; [k: string]: unknown }[];
  tel: string;
  email: string;
  brochure?: string;
  per_page?: number;
  seo_description?: string;
  [k: string]: unknown;
}

export function SiteSettings({ lang, onExpired }: Props) {
  const doc = useDoc<Site>('settings', lang, 'site', onExpired);
  const del = useConfirmDelete();
  const d = doc.data;
  if (doc.error) return <p className="msg-error">{doc.error}</p>;
  if (!d) return <div className="loading">불러오는 중…</div>;
  const set = (p: (string | number)[], v: unknown) => doc.setData(setIn(d, p, v));
  const err = (m: string) => doc.setMsg({ kind: 'error', text: m });
  return (
    <DocLayout
      title={`회사정보${lang === 'en' ? ' (Company Info)' : ''}`}
      group="사이트 설정"
      dirty={doc.dirty}
      saving={doc.saving}
      onSave={doc.save}
      msg={doc.msg}
      siteUrl={HOME[lang]}
      note="모든 페이지 하단 정보와 Contact 페이지의 주소·전화·이메일 원본입니다. 사업장 이름은 Contact 페이지 연결에 쓰이므로, 바꾸려면 새 이름을 추가 → Contact 에서 연결 바꾸기 → 옛 이름 삭제 순서로 해 주세요."
    >
      <Card title="사업장">
        <SortList
          items={d.offices}
          keyOf={(_, i) => String(i)}
          onMove={(f, t) => set(['offices'], moveItem(d.offices, f, t))}
          render={(o, i, handle) => (
            <div className="sub-menu">
              <div className="card-row">
                {handle}
                <span className="ed-gap" />
                {d.offices.length > 1 && (
                  <button type="button" className="btn-row danger" onClick={() => del.ask(o.name, () => set(['offices'], d.offices.filter((_, k) => k !== i)))}>
                    삭제
                  </button>
                )}
              </div>
              <div className="f-grid2">
                <Text label="사업장 이름" required value={o.name} onChange={(v) => set(['offices', i, 'name'], v)} />
                <Text label="주소" required value={o.address} onChange={(v) => set(['offices', i, 'address'], v)} />
              </div>
            </div>
          )}
        />
        <button type="button" className="btn-row add-row" onClick={() => set(['offices'], [...d.offices, { name: '', address: '' }])}>
          + 사업장
        </button>
      </Card>
      <Card title="연락처">
        <div className="f-grid2">
          <Text label="대표 전화" required value={d.tel} help="국제 표기(+82-51-…). Contact 화면에는 051-… 로 바뀌어 나옵니다." onChange={(v) => set(['tel'], v)} />
          <Text label="대표 이메일" required value={d.email} onChange={(v) => set(['email'], v)} />
        </div>
        <MediaField
          label={`회사소개서 PDF${lang === 'en' ? ' (선택: 비우면 Company Profile 버튼은 링크 없음)' : ''}`}
          kind="pdf"
          required={lang === 'ko'}
          clearable={lang === 'en'}
          value={d.brochure}
          onChange={(v) => set(['brochure'], v)}
          ctx={doc.ctx}
          onError={err}
        />
      </Card>
      {lang === 'ko' && (
        <Card title="기본 설정">
          <label className="f">
            <span>게시판 쪽당 글 수 *</span>
            <input
              type="number"
              min={1}
              max={50}
              value={d.per_page ?? ''}
              onChange={(e) => set(['per_page'], e.target.value === '' ? '' : Number(e.target.value))}
            />
            <small>회사소식·시공사례·E-Catalog 목록 한 쪽에 나오는 글 수</small>
          </label>
          <Area label="검색 설명 (메인·게시판 meta description)" required rows={4} value={d.seo_description} onChange={(v) => set(['seo_description'], v)} />
        </Card>
      )}
      {del.modal}
    </DocLayout>
  );
}

// ───── 팝업 ─────
interface Popup {
  title: string;
  image: string;
  link?: string;
  start: string;
  end: string;
  active?: boolean;
  id?: number;
  width?: number;
  height?: number;
  top?: number;
  left?: number;
  [k: string]: unknown;
}

function kstToday() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}
function plusDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
}

function status(p: Popup): { label: string; cls: string } {
  if (p.active === false) return { label: '사용 안 함', cls: 'badge-wait' };
  const t = kstToday();
  if (t < String(p.start)) return { label: '예정', cls: 'badge-run' };
  if (t > String(p.end)) return { label: '종료', cls: 'badge-wait' };
  return { label: '현재 노출 중', cls: 'badge-ok' };
}

export function PopupsSettings({ lang, onExpired }: Props) {
  const doc = useDoc<{ popups: Popup[]; [k: string]: unknown }>('settings', lang, 'popups', onExpired);
  const links = useLinks(lang);
  const del = useConfirmDelete();
  const d = doc.data;
  if (doc.error) return <p className="msg-error">{doc.error}</p>;
  if (!d) return <div className="loading">불러오는 중…</div>;
  const list = d.popups ?? [];
  const set = (p: (string | number)[], v: unknown) => doc.setData(setIn(d, p, v));
  const err = (m: string) => doc.setMsg({ kind: 'error', text: m });
  const num = (v: string) => (v === '' ? '' : Number(v));
  return (
    <DocLayout
      title={`팝업${lang === 'en' ? ' (Popup)' : ''}`}
      group="사이트 설정"
      dirty={doc.dirty}
      saving={doc.saving}
      onSave={doc.save}
      msg={doc.msg}
      siteUrl={HOME[lang]}
      note={`메인 화면 팝업입니다. 방문자 브라우저가 한국 시간으로 시작일 0시부터 종료일 23:59까지 보여 줍니다. 오늘: ${kstToday()}`}
    >
      {list.map((p, i) => {
        const st = status(p);
        return (
          <Card
            key={i}
            title={p.title || `새 팝업 ${i + 1}`}
            actions={
              <>
                <span className={`badge ${st.cls}`}>{st.label}</span>
                <button type="button" className="btn-row danger" onClick={() => del.ask(p.title || '새 팝업', () => set(['popups'], list.filter((_, k) => k !== i)))}>
                  삭제
                </button>
              </>
            }
          >
            <Switch label="사용" checked={p.active !== false} onChange={(v) => set(['popups', i, 'active'], v)} />
            <Text label="제목 (관리용·이미지 설명)" value={p.title} onChange={(v) => set(['popups', i, 'title'], v)} />
            <MediaField label="팝업 이미지" required={p.active !== false} value={p.image} onChange={(v) => set(['popups', i, 'image'], v)} ctx={doc.ctx} onError={err} />
            <LinkInput label="누르면 갈 주소 (선택)" value={p.link} links={links} help="비우면 링크 없음" onChange={(v) => set(['popups', i, 'link'], v)} />
            <div className="f-grid2">
              <label className="f">
                <span>시작일 *</span>
                <input type="date" value={String(p.start ?? '')} onChange={(e) => set(['popups', i, 'start'], e.target.value)} />
                <small>이날 0시부터</small>
              </label>
              <label className="f">
                <span>종료일 *</span>
                <input type="date" value={String(p.end ?? '')} onChange={(e) => set(['popups', i, 'end'], e.target.value)} />
                <small>종료일 23:59까지 보입니다</small>
              </label>
            </div>
            <details className="fold">
              <summary>크기·위치 (px)</summary>
              <div className="f-grid2">
                {(['width', 'height', 'top', 'left'] as const).map((k) => (
                  <label key={k} className="f">
                    <span>{{ width: '너비', height: '높이', top: '위에서', left: '왼쪽에서' }[k]}</span>
                    <input type="number" min={0} value={p[k] ?? ''} onChange={(e) => set(['popups', i, k], num(e.target.value))} />
                  </label>
                ))}
              </div>
            </details>
          </Card>
        );
      })}
      <button
        type="button"
        className="btn-row add-row"
        onClick={() => {
          const t = kstToday();
          const id = Math.max(0, ...list.map((p, i) => (typeof p.id === 'number' ? p.id : i + 1))) + 1;
          set(['popups'], [{ title: '', image: '', link: '', start: t, end: plusDays(t, 30), active: true, id, width: 450, height: 660, top: 150, left: 10 }, ...list]);
        }}
      >
        + 팝업 추가
      </button>
      {del.modal}
    </DocLayout>
  );
}
