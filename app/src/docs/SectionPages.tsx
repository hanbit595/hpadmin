// 회사소개·ESG·Contact: 섹션별 입력. 개수 고정 항목은 추가·삭제 없이 수정만.
import { Area, Card, DocLayout, LinkTo, MediaField, Text, useConfirmDelete } from './ui';
import { setIn, useDoc } from './useDoc';

type L = 'ko' | 'en';
type Props = { lang: L; onExpired: () => void };
const site = (lang: L, page: string) => `https://hanbitinnotech.com/${lang === 'en' ? 'en/' : ''}page/${page}.html`;
const HTML_HELP = '<br>(줄바꿈)·<b>(굵게) 같은 HTML 을 쓸 수 있습니다.';

// ───── 회사소개 ─────
interface Hanbit {
  hero: { title: string; image?: string; video?: string; [k: string]: unknown };
  intro_texts: string[];
  photos: string[];
  energy_text: string;
  sun_texts: string[];
  ending_text: string;
  [k: string]: unknown;
}

export function HanbitPage({ lang, onExpired }: Props) {
  const doc = useDoc<Hanbit>('pages', lang, 'hanbit', onExpired);
  const d = doc.data;
  if (doc.error) return <p className="msg-error">{doc.error}</p>;
  if (!d) return <div className="loading">불러오는 중…</div>;
  const set = (p: (string | number)[], v: unknown) => doc.setData(setIn(d, p, v));
  const err = (m: string) => doc.setMsg({ kind: 'error', text: m });
  return (
    <DocLayout
      title={`회사소개${lang === 'en' ? ' (About Us)' : ''}`}
      group="회사 페이지"
      dirty={doc.dirty}
      saving={doc.saving}
      onSave={doc.save}
      msg={doc.msg}
      siteUrl={site(lang, 'hanbit')}
      note="화면 움직임과 맞물려 문단 3개·사진 6장·뒤쪽 문단 2개로 개수가 고정되어 있습니다(수정만 가능). 저장 후 [홈페이지에서 보기]로 확인해 주세요."
    >
      <Card title="1) 맨 위 큰 화면">
        <Text label="큰 제목" required value={d.hero.title} onChange={(v) => set(['hero', 'title'], v)} />
        {lang === 'en' ? (
          <MediaField label="배경 동영상" kind="video" required value={d.hero.video} onChange={(v) => set(['hero', 'video'], v)} ctx={doc.ctx} onError={err} />
        ) : (
          <MediaField label="배경 사진" required value={d.hero.image} onChange={(v) => set(['hero', 'image'], v)} ctx={doc.ctx} onError={err} />
        )}
      </Card>
      <Card title="2) 검은 화면에 차례로 나오는 문단 (3개)">
        {d.intro_texts.map((t, i) => (
          <Area key={i} label={`문단 ${i + 1}`} required rows={3} value={t} help={i === 0 ? HTML_HELP : undefined} onChange={(v) => set(['intro_texts', i], v)} />
        ))}
      </Card>
      <Card title="3) 문단과 함께 올라오는 사진 (6장, 2장씩 3단)">
        <div className="photo-grid">
          {d.photos.map((p, i) => (
            <MediaField key={i} label={`사진 ${i + 1}`} required value={p} onChange={(v) => set(['photos', i], v)} ctx={doc.ctx} onError={err} />
          ))}
        </div>
      </Card>
      <Card title="4) 넓은 배경 사진 위 문단">
        <Area label="문단" required value={d.energy_text} onChange={(v) => set(['energy_text'], v)} />
      </Card>
      <Card title="5) 해 사진 옆 문단 (2개)">
        {d.sun_texts.map((t, i) => (
          <Area key={i} label={`문단 ${i + 1}`} required rows={4} value={t} onChange={(v) => set(['sun_texts', i], v)} />
        ))}
      </Card>
      <Card title="6) 마지막 문장">
        <Area label="문장" required value={d.ending_text} onChange={(v) => set(['ending_text'], v)} />
      </Card>
    </DocLayout>
  );
}

// ───── ESG ─────
interface Esg {
  intro: { title: string; text: string; [k: string]: unknown };
  flow_text: string;
  pillars: { title: string; icon: string; text: string; [k: string]: unknown }[];
  details: { title: string; items: string[]; [k: string]: unknown }[];
  [k: string]: unknown;
}

export function EsgPage({ lang, onExpired }: Props) {
  const doc = useDoc<Esg>('pages', lang, 'esg', onExpired);
  const del = useConfirmDelete();
  const d = doc.data;
  if (doc.error) return <p className="msg-error">{doc.error}</p>;
  if (!d) return <div className="loading">불러오는 중…</div>;
  const set = (p: (string | number)[], v: unknown) => doc.setData(setIn(d, p, v));
  const err = (m: string) => doc.setMsg({ kind: 'error', text: m });
  return (
    <DocLayout
      title={`ESG 경영${lang === 'en' ? ' (ESG)' : ''}`}
      group="회사 페이지"
      dirty={doc.dirty}
      saving={doc.saving}
      onSave={doc.save}
      msg={doc.msg}
      siteUrl={site(lang, 'esg')}
      note="원 3개(E·S·G)와 상세 상자 개수는 디자인에 맞춰 고정입니다. 상자 안 항목은 더하거나 뺄 수 있습니다. 저장 후 [홈페이지에서 보기]로 확인해 주세요."
    >
      <Card title="1) 소개">
        <Text label="소개 제목" required value={d.intro.title} onChange={(v) => set(['intro', 'title'], v)} />
        <Area label="소개 문단" required value={d.intro.text} help={HTML_HELP} onChange={(v) => set(['intro', 'text'], v)} />
      </Card>
      <Card title="2) 원 위로 흐르는 글자">
        <Text label="글자" required value={d.flow_text} onChange={(v) => set(['flow_text'], v)} />
      </Card>
      <Card title="3) 원 3개">
        {d.pillars.map((p, i) => (
          <div key={i} className="sub-block">
            <Text label={`원 ${i + 1} 제목`} required value={p.title} onChange={(v) => set(['pillars', i, 'title'], v)} />
            <MediaField label={`원 ${i + 1} 아이콘`} required value={p.icon} onChange={(v) => set(['pillars', i, 'icon'], v)} ctx={doc.ctx} onError={err} />
            <Area label={`원 ${i + 1} 설명`} required value={p.text} onChange={(v) => set(['pillars', i, 'text'], v)} />
          </div>
        ))}
      </Card>
      <Card title="4) 상세 상자">
        {d.details.map((b, i) => (
          <div key={i} className="sub-block">
            <Text label={`상자 ${i + 1} 제목`} required value={b.title} onChange={(v) => set(['details', i, 'title'], v)} />
            {b.items.map((t, j) => (
              <div key={j} className="item-row">
                <Text label={`항목 ${j + 1}`} required value={t} onChange={(v) => set(['details', i, 'items', j], v)} />
                {b.items.length > 1 && (
                  <button type="button" className="btn-row danger" onClick={() => del.ask(t, () => set(['details', i, 'items'], b.items.filter((_, k) => k !== j)))}>
                    빼기
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-row add-row" onClick={() => set(['details', i, 'items'], [...b.items, ''])}>
              + 항목
            </button>
          </div>
        ))}
      </Card>
      {del.modal}
    </DocLayout>
  );
}

// ───── Contact ─────
interface Loc {
  office: string;
  label: string;
  title: string;
  map: string;
  [k: string]: unknown;
}

export function LocationPage({ lang, onExpired, isAdmin }: Props & { isAdmin: boolean }) {
  const doc = useDoc<{ locations: Loc[]; [k: string]: unknown }>('pages', lang, 'location', onExpired);
  const del = useConfirmDelete();
  const d = doc.data;
  if (doc.error) return <p className="msg-error">{doc.error}</p>;
  if (!d) return <div className="loading">불러오는 중…</div>;
  const set = (p: (string | number)[], v: unknown) => doc.setData(setIn(d, p, v));
  const names = doc.loaded?.officeNames ?? [];
  const sitePath = `/${lang}/site`;
  return (
    <DocLayout
      title="Contact"
      group="회사 페이지"
      dirty={doc.dirty}
      saving={doc.saving}
      onSave={doc.save}
      msg={doc.msg}
      siteUrl={site(lang, 'location')}
      note={
        <>
          주소·전화·이메일은 <b>사이트 설정 › 회사정보</b>에서 고칩니다(하단 정보와 같은 원본).{' '}
          {isAdmin ? <LinkTo to={sitePath}>회사정보로 가기 →</LinkTo> : '(관리자만 고칠 수 있습니다)'}
        </>
      }
    >
      {d.locations.map((L, i) => (
        <Card
          key={i}
          title={`사업장 ${i + 1}`}
          actions={
            d.locations.length > 1 && (
              <button type="button" className="btn-row danger" onClick={() => del.ask(L.title, () => set(['locations'], d.locations.filter((_, j) => j !== i)))}>
                삭제
              </button>
            )
          }
        >
          <label className="f">
            <span>회사정보 연결 이름 *</span>
            <select value={L.office} onChange={(e) => set(['locations', i, 'office'], e.target.value)}>
              {!names.includes(L.office) && <option value={L.office}>{L.office} (회사정보에 없음)</option>}
              {names.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <small>이 이름의 주소가 Contact 화면에 나옵니다.</small>
          </label>
          <Text label="사업장 이름" required value={L.title} onChange={(v) => set(['locations', i, 'title'], v)} />
          <Text label="작은 영문 제목" required value={L.label} onChange={(v) => set(['locations', i, 'label'], v)} />
          <Area
            label="구글 지도 주소"
            required
            rows={3}
            value={L.map}
            help={'구글 지도 › 공유 › 지도 퍼가기 의 src="…" 안의 주소(https://www.google.com/maps/embed 로 시작)'}
            onChange={(v) => set(['locations', i, 'map'], v.trim())}
          />
          {L.map.startsWith('https://www.google.com/maps/embed') && (
            <a className="list-site" href={L.map} target="_blank" rel="noopener noreferrer">
              지도 열어 보기 ↗
            </a>
          )}
        </Card>
      ))}
      <button
        type="button"
        className="btn-row add-row"
        onClick={() => set(['locations'], [...d.locations, { office: names[0] ?? '', label: '', title: '', map: '' }])}
      >
        + 사업장 추가
      </button>
      {del.modal}
    </DocLayout>
  );
}
