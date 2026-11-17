// 관리자 틀: 상단바 + 왼쪽 메뉴(좁은 화면에서는 ☰ 로 여는 서랍) + 본문
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { api, type Summary, type User } from './api';
import { MENU, SITE_URL, findItem, label, parsePath, pathOf, saveLang, savedLang, type Lang } from './nav';
import { NAME_RE, isBoard } from '../shared/boards';
import BoardList from './pages/BoardList';
// 글쓰기 화면(편집기 포함)은 열 때 따로 불러온다
const PostEditor = lazy(() => import('./pages/PostEditor'));
const CertPage = lazy(() => import('./docs/CertPage'));
const HistoryPage = lazy(() => import('./docs/HistoryPage'));
const HanbitPage = lazy(() => import('./docs/SectionPages').then((m) => ({ default: m.HanbitPage })));
const EsgPage = lazy(() => import('./docs/SectionPages').then((m) => ({ default: m.EsgPage })));
const LocationPage = lazy(() => import('./docs/SectionPages').then((m) => ({ default: m.LocationPage })));
const MenuSettings = lazy(() => import('./docs/SettingsPages').then((m) => ({ default: m.MenuSettings })));
const SiteSettings = lazy(() => import('./docs/SettingsPages').then((m) => ({ default: m.SiteSettings })));
const PopupsSettings = lazy(() => import('./docs/SettingsPages').then((m) => ({ default: m.PopupsSettings })));

type DocProps = { lang: Lang; onExpired: () => void; isAdmin: boolean };
/** 회사 페이지·사이트 설정 화면(메뉴 키 → 화면). key 로 언어가 바뀌면 새로 읽는다 */
const DOC_PAGES: Record<string, (p: DocProps) => ReactNode> = {
  cert: (p) => <CertPage key={p.lang} lang={p.lang} onExpired={p.onExpired} />,
  history: (p) => <HistoryPage key={p.lang} lang={p.lang} onExpired={p.onExpired} />,
  hanbit: (p) => <HanbitPage key={p.lang} lang={p.lang} onExpired={p.onExpired} />,
  esg: (p) => <EsgPage key={p.lang} lang={p.lang} onExpired={p.onExpired} />,
  location: (p) => <LocationPage key={p.lang} lang={p.lang} onExpired={p.onExpired} isAdmin={p.isAdmin} />,
  // 사이트 설정(관리자만: 편집자는 위에서 "관리자만" 안내로 막힘)
  menu: (p) => <MenuSettings key={p.lang} lang={p.lang} onExpired={p.onExpired} />,
  site: (p) => <SiteSettings key={p.lang} lang={p.lang} onExpired={p.onExpired} />,
  popups: (p) => <PopupsSettings key={p.lang} lang={p.lang} onExpired={p.onExpired} />,
};
import DeployToast from './DeployToast';
import { Account, AuditLog, Users } from './pages/AccountPages';
import Dashboard from './pages/Dashboard';
import Placeholder from './pages/Placeholder';
import { linkClick, navigate, usePathname } from './router';

const ROLE_KO = { admin: '관리자', editor: '편집자' } as const;

export type SummaryState = { loading: boolean; data?: Summary; error?: string };

function LangSwitch({ lang, current }: { lang: Lang; current: string }) {
  return (
    <div className="lang-switch" role="group" aria-label="관리 언어">
      {(['ko', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          className={l === lang ? 'on' : ''}
          aria-pressed={l === lang}
          onClick={() => navigate(pathOf(l, current))}
        >
          {l === 'ko' ? '국문 관리' : '영문 관리'}
        </button>
      ))}
    </div>
  );
}

export default function Shell({
  user,
  onLogout,
  onExpired,
  onUserChange,
}: {
  user: User;
  onLogout: () => void;
  onExpired: () => void;
  onUserChange: (u: User) => void;
}) {
  const pathname = usePathname();
  const parsed = parsePath(pathname);
  const [drawer, setDrawer] = useState(false);
  const [summary, setSummary] = useState<SummaryState>({ loading: true });

  // 언어 없는 주소(/ 등)는 기억한 언어의 대시보드로
  const lang: Lang = parsed?.lang ?? savedLang();
  const fullKey = parsed?.key ?? '';
  // 게시판은 /{lang}/{게시판}/{글} 처럼 아래 주소가 있다
  const [key, sub] = fullKey.split(/\/(.*)/s) as [string, string | undefined];
  const valid = parsed !== null;

  useEffect(() => {
    if (!valid) navigate(pathOf(savedLang(), ''), true);
    else saveLang(lang);
  }, [valid, lang]);

  useEffect(() => {
    let alive = true;
    setSummary((s) => ({ ...s, loading: true, error: undefined }));
    api.summary(lang).then((r) => {
      if (!alive) return;
      if (r.status === 401) return onExpired();
      setSummary(r.ok && r.data ? { loading: false, data: r.data } : { loading: false, error: r.error });
    });
    return () => {
      alive = false;
    };
  }, [lang, onExpired]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const isAdmin = user.role === 'admin';
  const found = findItem(key);
  const counts = summary.data?.counts[lang];

  useEffect(() => {
    const name = key === '' ? '대시보드' : found ? found.item.ko : '없는 화면';
    document.title = `${name} · ${lang === 'en' ? '영문' : '국문'} | 한빛이노텍 관리자`;
  }, [key, found, lang]);

  let page;
  if (key === '') page = <Dashboard user={user} lang={lang} summary={summary} onExpired={onExpired} />;
  else if (!found || (sub && !isBoard(key)))
    page = <Placeholder title="없는 화면" message="주소가 올바르지 않습니다. 왼쪽 메뉴에서 선택해 주세요." lang={lang} />;
  else if (found.group.adminOnly && !isAdmin)
    page = <Placeholder title={label(found.item, lang)} message="관리자만 사용할 수 있는 화면입니다." lang={lang} denied />;
  else if (isBoard(key) && !sub) page = <BoardList key={`${lang}/${key}`} lang={lang} board={key} onExpired={onExpired} />;
  else if (isBoard(key) && sub && (sub === 'new' || NAME_RE.test(sub)))
    page = (
      <Suspense fallback={<div className="loading">편집기를 불러오는 중…</div>}>
        <PostEditor key={`${lang}/${key}/${sub}`} lang={lang} board={key} name={sub} onExpired={onExpired} />
      </Suspense>
    );
  else if (isBoard(key))
    page = <Placeholder title="없는 글" message="글 주소가 올바르지 않습니다. 목록에서 선택해 주세요." lang={lang} />;
  else if (key === 'users' && !sub) page = <Users onExpired={onExpired} />;
  else if (key === 'audit' && !sub) page = <AuditLog onExpired={onExpired} />;
  else if (key === 'account' && !sub) page = <Account user={user} onRenamed={(n) => onUserChange({ ...user, displayName: n })} />;
  else if (DOC_PAGES[key] && !sub)
    page = (
      <Suspense fallback={<div className="loading">불러오는 중…</div>}>
        {DOC_PAGES[key]({ lang, onExpired, isAdmin })}
      </Suspense>
    );
  else
    page = (
      <Placeholder
        title={label(found.item, lang)}
        group={found.group.title}
        message={`${found.item.stage} 단계에서 만들 화면입니다. 지금은 준비 중입니다.`}
        lang={lang}
      />
    );

  return (
    <div className="layout">
      <header className="topbar">
        <button className="menu-btn" type="button" aria-label="메뉴 열기" aria-expanded={drawer} onClick={() => setDrawer(true)}>
          ☰
        </button>
        <a className="topbar-brand" href={pathOf(lang, '')} onClick={linkClick(pathOf(lang, ''))}>
          HANBIT Innotech <span>홈페이지 관리자</span>
        </a>
        <div className="topbar-wide">
          <LangSwitch lang={lang} current={key} />
        </div>
        <div className="topbar-right">
          <a className="topbar-link topbar-wide" href={SITE_URL[lang]} target="_blank" rel="noopener noreferrer">
            홈페이지 보기 ↗
          </a>
          <span className="topbar-user topbar-wide">
            <span className="topbar-name">{user.displayName}</span>
            <span className="role">{ROLE_KO[user.role]}</span>
          </span>
          <button className="btn-ghost" type="button" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </header>

      <div className="body">
        {drawer && <div className="backdrop" onClick={() => setDrawer(false)} />}
        <nav className={`sidebar${drawer ? ' open' : ''}`} aria-label="관리 메뉴">
          <div className="drawer-head">
            <div className="drawer-user">
              <strong>{user.displayName}</strong> <span className="role role-light">{ROLE_KO[user.role]}</span>
            </div>
            <LangSwitch lang={lang} current={key} />
            <a className="drawer-link" href={SITE_URL[lang]} target="_blank" rel="noopener noreferrer">
              홈페이지 보기 ↗
            </a>
          </div>
          {MENU.filter((g) => !g.adminOnly || isAdmin).map((g, gi) => (
            <div className="nav-group" key={gi}>
              {g.title && <div className="nav-title">{g.title}</div>}
              {g.items.map((item) => {
                const to = pathOf(lang, item.key);
                const n = item.count ? counts?.[item.count] : undefined;
                return (
                  <a
                    key={item.key}
                    className={`nav-item${key === item.key ? ' active' : ''}`}
                    href={to}
                    aria-current={key === item.key ? 'page' : undefined}
                    onClick={linkClick(to, () => setDrawer(false))}
                  >
                    <span>{label(item, lang)}</span>
                    {item.count && item.count !== 'cert' && <span className="count">{n ?? '·'}</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <main className="content">{page}</main>
        <DeployToast />
      </div>
    </div>
  );
}
