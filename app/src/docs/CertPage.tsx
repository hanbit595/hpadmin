// 인증 및 수상: 카드 목록(세로형 인증서 이미지·명칭·구분), 구분 필터, 끌어서 순서(구분 안), 노출 켜기/끄기, 추가·삭제(2단계 확인)
// 순서: 홈페이지는 구분 안에서 order 작은 순 → 파일 순. 끌어서 바꾸면 그 구분 항목의 order 를 1부터 다시 매긴다(파일 안 자리는 그대로)
import { useState } from 'react';
import { displayUrl } from '../assets';
import PagePreview, { esc } from './PagePreview';
import { Card, DocLayout, MediaField, SortList, Switch, Text, useConfirmDelete } from './ui';
import { setIn, useDoc } from './useDoc';

interface Item {
  category: string;
  name: string;
  issuer?: string;
  date?: string;
  image: string;
  visible?: boolean;
  order?: number;
  [k: string]: unknown;
}
interface Cert {
  categories: string[];
  items: Item[];
  [k: string]: unknown;
}

const SITE_PAGE = { ko: 'https://hanbitinnotech.com/page/cert.html', en: 'https://hanbitinnotech.com/en/page/cert.html' };

/** 구분 안 화면 순서(빌드와 같음): order → 파일 순 */
function sorted(items: Item[], cat: string): number[] {
  return items
    .map((it, i) => ({ it, i }))
    .filter((x) => x.it.category === cat)
    .sort((a, b) => (Number(a.it.order ?? 0) - Number(b.it.order ?? 0)) || a.i - b.i)
    .map((x) => x.i);
}

export default function CertPage({ lang, onExpired }: { lang: 'ko' | 'en'; onExpired: () => void }) {
  const doc = useDoc<Cert>('pages', lang, 'cert', onExpired);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const del = useConfirmDelete();
  const d = doc.data;
  const err = (m: string) => doc.setMsg({ kind: 'error', text: m });

  if (doc.error) return <p className="msg-error">{doc.error}</p>;
  if (!d) return <div className="loading">불러오는 중…</div>;

  const set = (path: (string | number)[], v: unknown) => doc.setData(setIn(d, path, v));
  const cats = filter ? [filter] : d.categories;

  const reorder = (cat: string, from: number, to: number) => {
    const idx = sorted(d.items, cat);
    const [x] = idx.splice(from, 1);
    idx.splice(to, 0, x);
    let items = d.items;
    idx.forEach((i, n) => {
      if (items[i].order !== n + 1) items = setIn(items, [i, 'order'], n + 1);
    });
    doc.setData({ ...d, items });
  };

  const add = () => {
    const cat = filter || d.categories[0];
    const max = Math.max(0, ...d.items.filter((i) => i.category === cat).map((i) => Number(i.order ?? 0)));
    const items = [...d.items, { category: cat, name: '', issuer: '', date: '', image: '', visible: true, order: max + 1 }];
    doc.setData({ ...d, items });
    setEditing(items.length - 1);
  };

  // 미리보기(content/pages/*/page/cert.html 과 같은 마크업)
  const groups = d.categories
    .map((t, n) => ({ id: `cert${String(n + 1).padStart(2, '0')}`, title: t, rows: sorted(d.items, t).map((i) => d.items[i]).filter((it) => it.visible !== false) }))
    .filter((g) => g.rows.length);
  const inner = `<div class="cert_info_wrap tab_info_wrap grid-btm">${groups
    .map(
      (g) => `<div id="${g.id}" class="cert_info_con"><div class="cert_tit">${esc(g.title)}</div><div class="sgap"></div><ul class="cert_list">${g.rows
        .map((c) => `<li class="cert_img_wrap"><div class="cert_img"><img src="${esc(displayUrl(c.image, doc.ctx))}" alt=""></div><div class="tit">${esc(c.name)}</div></li>`)
        .join('')}</ul></div>`,
    )
    .join('')}</div>`;

  return (
    <DocLayout
      title={`인증 및 수상${lang === 'en' ? ' (Certifications)' : ''}`}
      group="회사 페이지"
      dirty={doc.dirty}
      saving={doc.saving}
      onSave={doc.save}
      msg={doc.msg}
      siteUrl={SITE_PAGE[lang]}
      preview={<PagePreview lang={lang} title="인증 및 수상" bodyClass={` pc sub sub_05 sub_05_03 sub file_cert page lang_${lang === 'en' ? 'en_US' : 'ko_KR'} b_tp`} inner={inner} />}
    >
      <Card>
        <div className="card-row wrap">
          <div className="chips" role="group" aria-label="구분 필터">
            {['', ...d.categories].map((c) => (
              <button key={c || 'all'} type="button" className={`chip${filter === c ? ' on' : ''}`} aria-pressed={filter === c} onClick={() => setFilter(c)}>
                {c || '전체'} <small>{c ? d.items.filter((i) => i.category === c).length : d.items.length}</small>
              </button>
            ))}
          </div>
          <span className="ed-gap" />
          <button type="button" className="btn-new" onClick={add}>
            + 인증 추가
          </button>
        </div>
        <small className="f-help-plain">카드를 끌거나 ↑↓ 로 같은 구분 안의 순서를 바꿉니다. 노출을 끄면 홈페이지에서만 숨겨지고 목록에는 남습니다.</small>
      </Card>

      {cats.map((cat) => {
        const idx = sorted(d.items, cat);
        return (
          <Card key={cat} title={`${cat} (${idx.length})`}>
            <SortList
              className="cert-grid"
              items={idx}
              keyOf={(i) => String(i)}
              onMove={(f, t) => reorder(cat, f, t)}
              render={(i, _n, handle) => {
                const it = d.items[i];
                const open = editing === i;
                return (
                  <div className={`cert-card${it.visible === false ? ' off' : ''}`}>
                    <div className="cert-img">{it.image ? <img src={displayUrl(it.image, doc.ctx)} alt="" /> : <small>이미지 없음</small>}</div>
                    <div className="cert-name">{it.name || '(명칭 없음)'}</div>
                    <div className="cert-row">
                      {handle}
                      <span className="ed-gap" />
                      <Switch label="노출" checked={it.visible !== false} onChange={(v) => set(['items', i, 'visible'], v)} />
                    </div>
                    <div className="cert-row">
                      <button type="button" className="btn-row" aria-expanded={open} onClick={() => setEditing(open ? null : i)}>
                        {open ? '닫기' : '수정'}
                      </button>
                      <button
                        type="button"
                        className="btn-row danger"
                        onClick={() =>
                          del.ask(it.name || '새 인증', () => {
                            doc.setData({ ...d, items: d.items.filter((_, j) => j !== i) });
                            setEditing(null);
                          })
                        }
                      >
                        삭제
                      </button>
                    </div>
                    {open && (
                      <div className="cert-edit">
                        <Text label="명칭" required value={it.name} onChange={(v) => set(['items', i, 'name'], v)} />
                        <label className="f">
                          <span>구분 *</span>
                          <select value={it.category} onChange={(e) => set(['items', i, 'category'], e.target.value)}>
                            {d.categories.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </label>
                        <MediaField label="인증서 이미지" required portrait value={it.image} onChange={(v) => set(['items', i, 'image'], v)} ctx={doc.ctx} onError={err} />
                        <Text label="발급기관 (기록용)" value={it.issuer} onChange={(v) => set(['items', i, 'issuer'], v)} />
                        <Text label="날짜 (기록용)" value={it.date} placeholder="YYYY-MM-DD 또는 YYYY-MM" onChange={(v) => set(['items', i, 'date'], v.trim())} />
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </Card>
        );
      })}
      {del.modal}
    </DocLayout>
  );
}
