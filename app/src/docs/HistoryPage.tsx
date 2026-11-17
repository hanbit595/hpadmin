// 연혁: 기간 → 연도 → 월 → 내용 접이식 편집. 새 연도·월 추가, 월은 01~12 선택, 한 달 2칸 안내.
// 홈페이지는 큰 연도·큰 달이 위로 자동 정렬된다(파일 안 순서와 무관). 화면도 같은 순서로 보여 준다.
import PagePreview, { esc } from './PagePreview';
import { displayUrl } from '../assets';
import { Area, Card, DocLayout, MediaField, Text, useConfirmDelete } from './ui';
import { setIn, useDoc } from './useDoc';

interface Month {
  month: string;
  items: string[];
  [k: string]: unknown;
}
interface Year {
  year: number;
  months: Month[];
  [k: string]: unknown;
}
interface Period {
  title: string;
  anchor?: string;
  image: string;
  years: Year[];
  [k: string]: unknown;
}
interface History {
  periods: Period[];
  [k: string]: unknown;
}

const SITE_PAGE = { ko: 'https://hanbitinnotech.com/page/history.html', en: 'https://hanbitinnotech.com/en/page/history.html' };
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const byDesc = <T,>(arr: T[], key: (x: T) => number) => arr.map((x, i) => ({ x, i })).sort((a, b) => key(b.x) - key(a.x));

function kstNow() {
  const d = new Date(Date.now() + 9 * 3600e3);
  return { year: d.getUTCFullYear(), month: String(d.getUTCMonth() + 1).padStart(2, '0') };
}

export default function HistoryPage({ lang, onExpired }: { lang: 'ko' | 'en'; onExpired: () => void }) {
  const doc = useDoc<History>('pages', lang, 'history', onExpired);
  const del = useConfirmDelete();
  const d = doc.data;
  if (doc.error) return <p className="msg-error">{doc.error}</p>;
  if (!d) return <div className="loading">불러오는 중…</div>;
  const set = (path: (string | number)[], v: unknown) => doc.setData(setIn(d, path, v));
  const err = (m: string) => doc.setMsg({ kind: 'error', text: m });

  const addYear = (pi: number) => {
    const years = d.periods[pi].years;
    const now = kstNow();
    // 올해가 없으면 올해, 있으면 가장 큰 연도 + 1
    const y = years.some((x) => Number(x.year) === now.year) ? Math.max(...years.map((x) => Number(x.year))) + 1 : now.year;
    set(['periods', pi, 'years'], [{ year: y, months: [{ month: now.month, items: [''] }] }, ...years]);
  };
  const addMonth = (pi: number, yi: number) => {
    const months = d.periods[pi].years[yi].months;
    const free = MONTHS.slice().reverse().find((m) => !months.some((x) => String(x.month).padStart(2, '0') === m)) ?? '01';
    set(['periods', pi, 'years', yi, 'months'], [{ month: free, items: [''] }, ...months]);
  };

  // 미리보기(content/pages/*/page/history.html 과 같은 마크업)
  const list = (p: Period) =>
    `<div class="history_con_list">${byDesc(p.years, (y) => Number(y.year))
      .map(
        ({ x: y }) =>
          `<li class="history_con"><div class="his_year">${esc(y.year)}</div><div class="ssgap"></div><table class="his_info">${byDesc(y.months, (m) => Number(m.month))
            .map(({ x: m }) => `<tr><th>${esc(String(m.month).padStart(2, '0'))}</th>${m.items.map((t) => `<td>${String(t)}</td>`).join('')}</tr>`)
            .join('')}</table></li>`,
      )
      .join('')}</div>`;
  const img = (p: Period) => `<ul class="history_con_tit_wrap"><span class="his_tit">${esc(p.title)}</span><img src="${esc(displayUrl(p.image, doc.ctx))}" alt=""></ul>`;
  const inner = `<div class="history_con_all_wrap sct short"><div class="history_con_all_wrap_in">${d.periods
    .map((p, i) =>
      i % 2 === 0
        ? `<div class="history_con_box pdt_box_wrap"><div class="history_con_01 history_con_left history_con_img">${img(p)}</div><div class="history_con_01 history_con_right ">${list(p)}</div></div>`
        : `<div class="history_con_box pdt_box_wrap"><div class="history_con_02 history_con_left ">${list(p)}</div><div class="history_con_02 history_con_right history_con_img">${img(p)}</div></div>`,
    )
    .join('')}</div></div>`;

  return (
    <DocLayout
      title={`연혁${lang === 'en' ? ' (History)' : ''}`}
      group="회사 페이지"
      dirty={doc.dirty}
      saving={doc.saving}
      onSave={doc.save}
      msg={doc.msg}
      siteUrl={SITE_PAGE[lang]}
      note="연도·월은 큰 것이 위로 자동 정렬됩니다. 한 달에 내용을 2개 적으면 홈페이지에서 한 줄에 2칸으로 나옵니다. <br> 로 줄을 나눌 수 있습니다."
      preview={<PagePreview lang={lang} title="연혁" bodyClass={` pc sub sub_05 sub_05_02 sub file_history page lang_${lang === 'en' ? 'en_US' : 'ko_KR'} b_tp`} inner={inner} />}
    >
      {d.periods.map((p, pi) => (
        <Card key={pi} title={`기간 ${pi + 1}: ${p.title}`}>
          <details className="fold">
            <summary>기간 제목·사진</summary>
            <Text label="기간 제목" required value={p.title} onChange={(v) => set(['periods', pi, 'title'], v)} />
            <MediaField label="기간 사진" required value={p.image} onChange={(v) => set(['periods', pi, 'image'], v)} ctx={doc.ctx} onError={err} />
          </details>
          <button type="button" className="btn-row add-row" onClick={() => addYear(pi)}>
            + 새 연도 추가
          </button>
          {byDesc(p.years, (y) => Number(y.year)).map(({ x: y, i: yi }) => (
            <details key={yi} className="fold year" open={yi === 0 && pi === 0}>
              <summary>
                <b>{y.year}년</b> <small>{y.months.length}개월</small>
              </summary>
              <div className="card-row wrap">
                <label className="f year-input">
                  <span>연도</span>
                  <input
                    inputMode="numeric"
                    value={String(y.year)}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                      set(['periods', pi, 'years', yi, 'year'], v.length === 4 ? Number(v) : v);
                    }}
                  />
                </label>
                <span className="ed-gap" />
                <button type="button" className="btn-row" onClick={() => addMonth(pi, yi)}>
                  + 새 월
                </button>
                <button
                  type="button"
                  className="btn-row danger"
                  onClick={() => del.ask(`${y.year}년 전체`, () => set(['periods', pi, 'years'], p.years.filter((_, j) => j !== yi)))}
                >
                  연도 삭제
                </button>
              </div>
              {byDesc(y.months, (m) => Number(m.month)).map(({ x: m, i: mi }) => (
                <div key={mi} className="month-row">
                  <label className="f month-sel">
                    <span>월</span>
                    <select
                      value={String(m.month).padStart(2, '0')}
                      onChange={(e) => set(['periods', pi, 'years', yi, 'months', mi, 'month'], e.target.value)}
                    >
                      {MONTHS.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <div className="month-items">
                    {m.items.map((t, ti) => (
                      <div key={ti} className="item-row">
                        <Area
                          label={`내용 ${ti + 1}`}
                          rows={2}
                          value={t}
                          onChange={(v) => set(['periods', pi, 'years', yi, 'months', mi, 'items', ti], v)}
                        />
                        {m.items.length > 1 && (
                          <button
                            type="button"
                            className="btn-row"
                            onClick={() => set(['periods', pi, 'years', yi, 'months', mi, 'items'], m.items.filter((_, j) => j !== ti))}
                          >
                            칸 빼기
                          </button>
                        )}
                      </div>
                    ))}
                    {m.items.length > 2 && <small className="warn">한 줄에 2칸까지 보기 좋습니다(지금 {m.items.length}칸).</small>}
                    <div className="card-row">
                      {m.items.length < 2 && (
                        <button type="button" className="btn-row" onClick={() => set(['periods', pi, 'years', yi, 'months', mi, 'items'], [...m.items, ''])}>
                          + 같은 달 둘째 칸
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-row danger"
                        onClick={() =>
                          del.ask(`${y.year}년 ${m.month}월`, () => set(['periods', pi, 'years', yi, 'months'], y.months.filter((_, j) => j !== mi)))
                        }
                      >
                        월 삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </details>
          ))}
        </Card>
      ))}
      {del.modal}
    </DocLayout>
  );
}
