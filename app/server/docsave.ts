// 회사 페이지·사이트 설정 파일 읽기·저장 공통 (명세 6-3절)
import { ContentError, contentBranch, getFile, putFile } from './content';
import { CheckError, checkData, officeNames, type PageName, type SettingName } from './pagecheck';
import { fail, json, readJson, type Env } from './http';
import { resolvePaths } from './resolve';
import { audit, type SessionUser } from './session';
import { missingPaths, siteMeta } from './sitefiles';
import { setPostRefs } from './uploads';
import { YamlPatchError, patchYaml, readYaml } from './yamlpatch';

export type DocName = PageName | SettingName;
export const PAGE_NAMES: PageName[] = ['cert', 'history', 'hanbit', 'esg', 'location', 'faq'];
export const SETTING_NAMES: SettingName[] = ['menu', 'site', 'popups'];
const LABEL: Record<DocName, string> = {
  cert: '인증 및 수상',
  history: '연혁',
  hanbit: '회사소개',
  esg: 'ESG 경영',
  location: 'Contact',
  faq: 'FAQ',
  menu: '메뉴',
  site: '회사정보',
  popups: '팝업',
};

/** 파일이 아직 없을 때 새로 만드는 내용(FAQ) */
const NEW_FILE: Partial<Record<DocName, (lang: string) => string>> = {
  faq: (lang) =>
    `# ${lang === 'en' ? '영문 ' : ''}FAQ(자주 묻는 질문). 관리자 화면(admin2)에서 고친다.\n` +
    '# items: category(분류), question(질문), answer(답변, HTML), order(순서, 작은 수 먼저), visible(노출)\n' +
    'items: []\n',
};

export function docPath(lang: string, name: DocName): string {
  if (name === 'faq') return `cms/${lang === 'en' ? 'en/' : ''}faq.yml`;
  const kind = (PAGE_NAMES as string[]).includes(name) ? 'pages' : 'settings';
  return `cms/${lang === 'en' ? 'en/' : ''}${kind}/${name}.yml`;
}

function imagesIn(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') {
    if (/^\/[^/].*\.(jpe?g|png|gif|webp|svg)$/i.test(v.trim())) out.push(v.trim());
  } else if (Array.isArray(v)) v.forEach((x) => imagesIn(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => imagesIn(x, out));
  return out;
}

export async function getDoc(env: Env, lang: string, name: DocName): Promise<Response> {
  const path = docPath(lang, name);
  const found = await getFile(env, path);
  const make = NEW_FILE[name];
  if (!found && !make) return fail(404, `저장소에 ${path} 파일이 없습니다.`);
  // 없는 파일(FAQ 처음): 빈 내용으로 열고 저장할 때 만든다(sha '')
  const file = found ?? { path, sha: '', text: make!(lang) };
  let data: unknown;
  try {
    data = readYaml(file.text);
  } catch (e) {
    return fail(422, e instanceof Error ? e.message : '파일을 읽지 못했습니다.');
  }
  const meta = await siteMeta(env);
  const resolved = await resolvePaths(env, imagesIn(data), meta.renames, 'view').catch(() => ({}) as Record<string, string>);
  const extra: Record<string, unknown> = {};
  if (name === 'location') {
    const site = await getFile(env, docPath(lang, 'site'));
    extra.officeNames = site ? officeNames(readYaml(site.text)) : [];
  }
  return json({ ok: true, path, sha: file.sha, data, branch: contentBranch(env), resolved, ...extra });
}

export async function putDoc(env: Env, request: Request, user: SessionUser, lang: string, name: DocName): Promise<Response> {
  const input = await readJson(request);
  const make = NEW_FILE[name];
  if (!input || typeof input.sha !== 'string' || (!input.sha && !make) || input.data === undefined)
    return fail(400, '입력 값이 올바르지 않습니다. 화면을 새로 고친 뒤 다시 저장해 주세요.');
  const path = docPath(lang, name);
  const found = await getFile(env, path);
  if (!found && !make) return fail(404, `저장소에 ${path} 파일이 없습니다.`);
  const file = found ?? { path, sha: '', text: make!(lang) };
  if (file.sha !== input.sha)
    return fail(409, '다른 사람이 먼저 이 화면을 고쳐 저장했습니다. 내 변경 내용을 따로 적어 두고, 화면을 새로 고친 뒤 다시 저장해 주세요.');

  let patched: { text: string; changed: boolean };
  try {
    patched = patchYaml(file.text, input.data);
  } catch (e) {
    if (e instanceof YamlPatchError) return fail(400, e.message);
    throw e;
  }
  if (!patched.changed) return json({ ok: true, unchanged: true, sha: file.sha, path, branch: contentBranch(env) });

  // 빌드 실패 조건 검사
  try {
    const extra: { officeNames?: string[] } = {};
    if (name === 'location') {
      const site = await getFile(env, docPath(lang, 'site'));
      extra.officeNames = site ? officeNames(readYaml(site.text)) : [];
    }
    const refs = checkData(name, lang, input.data, extra);
    if (name === 'site') {
      // 사업장 이름을 바꾸면 Contact 연결이 깨진다
      const loc = await getFile(env, docPath(lang, 'location'));
      try {
        if (loc) checkData('location', lang, readYaml(loc.text), { officeNames: officeNames(input.data) });
      } catch (e) {
        if (e instanceof CheckError)
          throw new CheckError(`사업장 이름을 바꾸면 Contact 페이지 연결이 끊깁니다. Contact 화면에서 연결 이름을 먼저 맞춰 주세요. (${e.message})`);
        throw e;
      }
    }
    const meta = await siteMeta(env);
    const all = [...refs.images, ...refs.links];
    const missing = await missingPaths(env, all.map((r) => r.path), meta);
    const bad = all.filter((r) => missing.has(r.path));
    if (bad.length)
      return fail(400, `홈페이지에 없는 파일·페이지가 있습니다: ${bad.slice(0, 3).map((b) => `${b.where} (${b.path})`).join(', ')}${bad.length > 3 ? ` 외 ${bad.length - 3}건` : ''}`);
  } catch (e) {
    if (e instanceof CheckError) return fail(400, e.message);
    throw e;
  }

  const label = `${LABEL[name]}(${lang === 'en' ? '영문' : '국문'})`;
  const res = await putFile(env, path, patched.text, `[관리자] ${label} 저장 (${user.displayName})`, file.sha || undefined);
  const isPage = (PAGE_NAMES as string[]).includes(name);
  await audit(env, user.id, isPage ? 'page_save' : 'settings_save', path, { label, commit: res.commit.slice(0, 7) });
  await setPostRefs(env, path, patched.text);
  return json({ ok: true, path, sha: res.sha, commit: res.commit, branch: contentBranch(env) });
}

export async function docRoute(
  env: Env,
  request: Request,
  user: SessionUser,
  params: Record<string, string | string[]>,
  names: DocName[],
): Promise<Response> {
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const [lang, name, ...rest] = parts;
  if ((lang !== 'ko' && lang !== 'en') || !names.includes(name as DocName) || rest.length) return fail(404, '화면 주소가 올바르지 않습니다.');
  try {
    if (request.method === 'GET') return await getDoc(env, lang, name as DocName);
    if (request.method === 'PUT') return await putDoc(env, request, user, lang, name as DocName);
    return fail(405, '지원하지 않는 요청입니다.');
  } catch (e) {
    if (e instanceof ContentError) return fail(e.status, e.message);
    if (e instanceof CheckError) return fail(400, e.message);
    throw e;
  }
}
