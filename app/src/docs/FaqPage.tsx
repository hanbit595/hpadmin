// FAQ(국문·영문, 편집자 가능): cms/faq.yml · cms/en/faq.yml — items[{category, question, answer(HTML), order, visible}]
// 분류 필터, 끌어서 순서(파일 순서와 order 를 1부터 다시 매김), 노출 스위치, 답변은 TipTap 간단 편집기(펼친 질문만)
import { useState } from 'react';
import RichEditor, { type BodyMode } from '../editor/RichEditor';
import { Card, DocLayout, SortList, Switch, Text, useConfirmDelete } from './ui';
import { moveItem, setIn, useDoc } from './useDoc';

interface Item {
  category: string;
  question: string;
  answer: string;
  order?: number;
  visible?: boolean;
  [k: string]: unknown;
}

const renumber = (items: Item[]) => items.map((it, i) => (it.order === i + 1 ? it : { ...it, order: i + 1 }));

export default function FaqPage({ lang, onExpired }: { lang: 'ko' | 'en'; onExpired: () => void }) {
  const doc = useDoc<{ items: Item[]; [k: string]: unknown }>('pages', lang, 'faq', onExpired);
  const del = useConfirmDelete();
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [mode, setMode] = useState<BodyMode>('editor');
  const d = doc.data;
  if (doc.error) return <p className="msg-error">{doc.error}</p>;
  if (!d) return <div className="loading">불러오는 중…</div>;
  const items = d.items ?? [];
  const cats = [...new Set(items.map((i) => i.category).filter(Boolean))];
  const shown = items.map((it, i) => ({ it, i })).filter((x) => !filter || x.it.category === filter);
  const set = (p: (string | number)[], v: unknown) => doc.setData(setIn(d, p, v));

  return (
    <DocLayout
      title={`FAQ${lang === 'en' ? ' (영문)' : ''}`}
      group="회사 페이지"
      dirty={doc.dirty}
      saving={doc.saving}
      onSave={doc.save}
      msg={doc.msg}
      siteUrl={lang === 'en' ? 'https://hanbitinnotech.com/en/index.html' : 'https://hanbitinnotech.com/'}
      note="자주 묻는 질문입니다. 위에서부터 이 순서로 나옵니다. 노출을 끄면 홈페이지에서만 숨겨집니다."
    >
      <Card>
        <div className="card-row wrap">
          <div className="chips" role="group" aria-label="분류 필터">
            {['', ...cats].map((c) => (
              <button key={c || 'all'} type="button" className={`chip${filter === c ? ' on' : ''}`} aria-pressed={filter === c} onClick={() => setFilter(c)}>
                {c || '전체'} <small>{c ? items.filter((i) => i.category === c).length : items.length}</small>
              </button>
            ))}
          </div>
          <span className="ed-gap" />
          <button
            type="button"
            className="btn-new"
            onClick={() => {
              const next = renumber([...items, { category: filter || cats[0] || (lang === 'en' ? 'General' : '일반'), question: '', answer: '', order: 0, visible: true }]);
              doc.setData({ ...d, items: next });
              setOpen(next.length - 1);
            }}
          >
            + 질문 추가
          </button>
        </div>
      </Card>
      {!items.length && <p className="muted">아직 질문이 없습니다. [+ 질문 추가]를 눌러 주세요.</p>}
      <SortList
        items={shown}
        keyOf={(x) => String(x.i)}
        onMove={(f, t) => doc.setData({ ...d, items: renumber(moveItem(items, shown[f].i, shown[t].i)) })}
        render={({ it, i }, _n, handle) => (
          <div className={`ed-card faq-card${it.visible === false ? ' off' : ''}`}>
            <div className="card-row wrap">
              {handle}
              <button type="button" className="menu-title" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                {open === i ? '▼' : '▶'} <small>[{it.category}]</small> {it.question || '(질문 없음)'}
              </button>
              <span className="ed-gap" />
              <Switch label="노출" checked={it.visible !== false} onChange={(v) => set(['items', i, 'visible'], v)} />
              <button
                type="button"
                className="btn-row danger"
                onClick={() =>
                  del.ask(it.question || '새 질문', () => {
                    doc.setData({ ...d, items: renumber(items.filter((_, k) => k !== i)) });
                    setOpen(null);
                  })
                }
              >
                삭제
              </button>
            </div>
            {open === i && (
              <>
                <div className="f-grid2">
                  <label className="f">
                    <span>분류 *</span>
                    <input list="faq-cats" value={it.category} onChange={(e) => set(['items', i, 'category'], e.target.value)} />
                    <datalist id="faq-cats">
                      {cats.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </label>
                  <Text label="질문" required value={it.question} onChange={(v) => set(['items', i, 'question'], v)} />
                </div>
                <div className="f">
                  <span>답변 *</span>
                  <div className="ed-card-flush faq-answer">
                    <RichEditor key={i} html={it.answer ?? ''} mode={mode} onModeChange={setMode} onChange={(h) => set(['items', i, 'answer'], h)} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      />
      {del.modal}
    </DocLayout>
  );
}
