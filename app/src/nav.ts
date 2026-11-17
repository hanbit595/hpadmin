// 왼쪽 메뉴 구성(국문·영문 같음)과 주소 규칙: /{lang}/{key}, 대시보드는 /{lang}
export type Lang = 'ko' | 'en';
export type CountKey = 'notice' | 'media' | 'library' | 'cert';

export interface MenuItem {
  key: string;
  ko: string;
  en?: string; // 영문 모드에서 괄호로 병기
  count?: CountKey;
  stage?: string; // 만들 단계
}

export interface MenuGroup {
  title: string;
  adminOnly?: boolean;
  items: MenuItem[];
}

export const MENU: MenuGroup[] = [
  { title: '', items: [{ key: '', ko: '대시보드', en: 'Dashboard' }] },
  {
    title: '게시판',
    items: [
      { key: 'notice', ko: '회사소식', en: 'News', count: 'notice', stage: '3-2c' },
      { key: 'media', ko: '시공사례', en: 'Projects', count: 'media', stage: '3-2c' },
      { key: 'library', ko: 'E-Catalog', count: 'library', stage: '3-2c' },
    ],
  },
  {
    title: '회사 페이지',
    items: [
      { key: 'cert', ko: '인증 및 수상', en: 'Certifications', count: 'cert', stage: '3-2d' },
      { key: 'history', ko: '연혁', en: 'History', stage: '3-2d' },
      { key: 'hanbit', ko: '회사소개', en: 'About Us', stage: '3-2d' },
      { key: 'esg', ko: 'ESG 경영', en: 'ESG', stage: '3-2d' },
      { key: 'location', ko: 'Contact', stage: '3-2d' },
      { key: 'faq', ko: 'FAQ' },
    ],
  },
  { title: '문의', items: [{ key: 'inquiries', ko: '문의함' }] },
  {
    title: '사이트 설정',
    adminOnly: true,
    items: [
      { key: 'menu', ko: '메뉴', en: 'Menu', stage: '3-2d' },
      { key: 'site', ko: '회사정보', en: 'Company Info', stage: '3-2d' },
      { key: 'popups', ko: '팝업', en: 'Popup', stage: '3-2d' },
    ],
  },
  { title: '기록·계정', items: [{ key: 'audit', ko: '수정 기록' }, { key: 'account', ko: '내 계정' }] },
  { title: '', adminOnly: true, items: [{ key: 'users', ko: '직원 계정' }] },
];

export function label(item: MenuItem, lang: Lang): string {
  return lang === 'en' && item.en ? `${item.ko} (${item.en})` : item.ko;
}

export function findItem(key: string): { item: MenuItem; group: MenuGroup } | null {
  for (const group of MENU) {
    const item = group.items.find((i) => i.key === key);
    if (item) return { item, group };
  }
  return null;
}

export function pathOf(lang: Lang, key: string): string {
  return key ? `/${lang}/${key}` : `/${lang}`;
}

/** 주소 해석. 언어가 없거나 틀리면 null */
export function parsePath(pathname: string): { lang: Lang; key: string } | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'ko' && parts[0] !== 'en') return null;
  return { lang: parts[0], key: parts.slice(1).join('/') };
}

export const SITE_URL: Record<Lang, string> = {
  ko: 'https://hanbitinnotech.com',
  en: 'https://hanbitinnotech.com/en/index.html',
};

const LANG_KEY = 'hb-admin-lang';

export function savedLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ko';
  } catch {
    return 'ko';
  }
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // 저장이 막힌 브라우저에서는 기억하지 않는다
  }
}
