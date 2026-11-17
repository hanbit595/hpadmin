// POST /api/inquiry : 홈페이지 견적문의 받기(공개, 로그인 불필요). 3-2f
// - https://hanbitinnotech.com 에서만(CORS). 숨김 칸(website)에 값이 있으면 스팸으로 보고 저장하지 않음(성공처럼 응답)
// - 같은 IP 10분에 3건까지, 필수값·이메일·전화 형식·개인정보 동의 검사. D1 inquiries 에만 저장(GitHub 저장 안 함)
// - RESEND_API_KEY 가 있으면 NOTIFY_EMAIL(기본 hkele@hanmail.net)로 알림 메일
import { sha256Hex } from '../../server/crypto';
import type { Env } from '../../server/http';

const ORIGINS = ['https://hanbitinnotech.com', 'https://www.hanbitinnotech.com'];
const CUSTOMER: Record<string, string> = { personal: '개인', company: '기업', public: '공공' };
const PLACE: Record<string, string> = { house: '주택지붕', building: '건물', factory: '공장', parking: '주차장', land: '토지', etc: '기타' };
const LIMIT = 3;
const WINDOW_MS = 10 * 60 * 1000;

type InqEnv = Env & { RESEND_API_KEY?: string; NOTIFY_EMAIL?: string; NOTIFY_FROM?: string; ADMIN_URL?: string };

function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin', 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };
  if (origin && ORIGINS.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function reply(origin: string | null, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

/** 값 → 키 코드(한국어 표시값도 받음) */
function code(v: unknown, map: Record<string, string>): string {
  const s = String(v ?? '').trim();
  if (s in map) return s;
  return Object.keys(map).find((k) => map[k] === s) ?? '';
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

export const onRequestOptions: PagesFunction<InqEnv> = async ({ request }) => {
  const origin = request.headers.get('Origin');
  return new Response(null, { status: origin && ORIGINS.includes(origin) ? 204 : 403, headers: cors(origin) });
};

export const onRequestPost: PagesFunction<InqEnv> = async ({ request, env, waitUntil }) => {
  const origin = request.headers.get('Origin');
  if (!origin || !ORIGINS.includes(origin)) return reply(origin, 403, { ok: false, error: '허용되지 않은 주소에서 보낸 요청입니다.' });
  let b: Record<string, unknown> = {};
  try {
    const ct = request.headers.get('Content-Type') ?? '';
    if (ct.includes('application/json')) b = (await request.json()) as Record<string, unknown>;
    else b = Object.fromEntries((await request.formData()).entries()) as Record<string, unknown>;
  } catch {
    return reply(origin, 400, { ok: false, error: '요청 형식이 올바르지 않습니다.' });
  }
  const en = b.lang === 'en';
  const t = (ko: string, eng: string) => (en ? eng : ko);
  // 스팸: 사람에게 보이지 않는 칸이 채워짐 → 저장하지 않고 성공처럼
  if (clean(b.website, 200)) return reply(origin, 200, { ok: true });

  const d = {
    customer_type: code(b.customer_type, CUSTOMER),
    place: code(b.place, PLACE),
    region: clean(b.region, 100),
    scale: clean(b.scale, 100),
    interest: clean(b.interest, 200),
    name: clean(b.name, 50),
    phone: clean(b.phone, 30),
    email: clean(b.email, 120),
    message: clean(b.message, 3000),
  };
  if (!d.customer_type) return reply(origin, 400, { ok: false, field: 'customer_type', error: t('고객구분을 선택해 주세요.', 'Please select a customer type.') });
  if (!d.place) return reply(origin, 400, { ok: false, field: 'place', error: t('설치장소를 선택해 주세요.', 'Please select an installation site.') });
  if (!d.region) return reply(origin, 400, { ok: false, field: 'region', error: t('지역을 입력해 주세요.', 'Please enter the region.') });
  if (!d.name) return reply(origin, 400, { ok: false, field: 'name', error: t('이름을 입력해 주세요.', 'Please enter your name.') });
  if (!/^[0-9+()\-\s]{8,20}$/.test(d.phone) || (d.phone.match(/\d/g) ?? []).length < 8)
    return reply(origin, 400, { ok: false, field: 'phone', error: t('연락처를 숫자로 정확히 입력해 주세요.', 'Please enter a valid phone number.') });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return reply(origin, 400, { ok: false, field: 'email', error: t('이메일 형식이 올바르지 않습니다.', 'Please enter a valid email.') });
  if (!d.message) return reply(origin, 400, { ok: false, field: 'message', error: t('문의내용을 입력해 주세요.', 'Please enter your message.') });
  const agree = b.agree === true || b.agree === 'true' || b.agree === 'on' || b.agree === '1' || b.agree === 'yes';
  if (!agree) return reply(origin, 400, { ok: false, field: 'agree', error: t('개인정보 수집·이용에 동의해 주세요.', 'Please agree to the collection and use of personal information.') });

  const now = Date.now();
  const ipHash = await sha256Hex(`inq:${request.headers.get('CF-Connecting-IP') ?? ''}`);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM inquiries WHERE ip_hash = ? AND created_at > ?').bind(ipHash, now - WINDOW_MS).first<{ n: number }>();
  if ((recent?.n ?? 0) >= LIMIT)
    return reply(origin, 429, { ok: false, error: t('잠시 후 다시 보내 주세요(10분에 3건까지 접수됩니다).', 'Too many requests. Please try again in 10 minutes.') });

  const row = await env.DB.prepare(
    `INSERT INTO inquiries (lang, customer_type, place, region, scale, interest, name, phone, email, message, agree_at, ip_hash, user_agent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(en ? 'en' : 'ko', d.customer_type, d.place, d.region, d.scale, d.interest, d.name, d.phone, d.email, d.message, now, ipHash, (request.headers.get('User-Agent') ?? '').slice(0, 300), now, now)
    .first<{ id: number }>();

  if (env.RESEND_API_KEY && row) waitUntil(notify(env, row.id, d, en).catch(() => undefined));
  return reply(origin, 200, { ok: true, message: t('문의가 접수되었습니다. 담당자가 확인 후 연락드리겠습니다.', 'Thank you. We will contact you soon.') });
};

async function notify(env: InqEnv, id: number, d: Record<string, string>, en: boolean) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const admin = env.ADMIN_URL ?? 'https://admin.hanbitinnotech.com';
  const rows: [string, string][] = [
    ['구분', `${CUSTOMER[d.customer_type]} · ${PLACE[d.place]}${en ? ' (영문 홈페이지)' : ''}`],
    ['지역', d.region],
    ['면적/전기요금', d.scale],
    ['관심사업', d.interest],
    ['이름', d.name],
    ['연락처', d.phone],
    ['이메일', d.email],
    ['내용', d.message.slice(0, 500)],
  ];
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.NOTIFY_FROM ?? 'HANBIT 홈페이지 <onboarding@resend.dev>',
      to: [env.NOTIFY_EMAIL ?? 'hkele@hanmail.net'],
      reply_to: d.email,
      subject: `[새 견적문의] ${d.name} · ${d.region}`,
      html: `<h2>새 견적문의 #${id}</h2><table>${rows
        .filter(([, v]) => v)
        .map(([k, v]) => `<tr><th align="left" style="padding:4px 12px 4px 0">${k}</th><td style="white-space:pre-wrap">${esc(v)}</td></tr>`)
        .join('')}</table><p><a href="${admin}/ko/inquiries/${id}">관리자 문의함에서 보기</a></p>`,
    }),
  });
}
