# 자체 관리자(admin2) 명세

작성: 2026-11-16 (3-2a). 기존 Sveltia 관리자(D:\hpadmin 루트, docs/spec.md)는 그대로 두고, 이 명세는 admin2 브랜치의 app/ 폴더에만 적용한다.
기존 docs/spec.md 1절 "인증 서버는 두지 않는다"와 달리, admin2 는 자체 로그인 서버를 둔다(대표 지시, 3-2a).
3-2f(주소 전환) 전까지 운영 관리자는 기존 Sveltia(admin.hanbitinnotech.com)다.

## 1. 구조
- 호스팅: Cloudflare Pages, 프로젝트명 `hanbit-admin` (임시 주소 https://hanbit-admin.pages.dev)
- 서버: Pages Functions (`app/functions/api/*`), 공통 코드는 `app/server/*`
- 데이터베이스: Cloudflare D1, 이름 `hanbit-admin-db`, 바인딩 이름 `DB` (`app/wrangler.toml`)
- 마이그레이션: `app/migrations/*.sql` (로컬 먼저 적용·확인 → 원격 적용)
- 화면: Vite + React + TypeScript (`app/src/*`), 빌드 결과 `app/dist/`
- 홈페이지 저장소 hanbit595/hopage 연결: 서버 환경변수(비밀) `GITHUB_TOKEN`. 화면(브라우저)에는 토큰을 절대 보내지 않는다.
- 배포: 3-2f 전까지 `npx wrangler pages deploy` 수동 배포(대표 승인 후).

## 2. 디자인 (확정 시안 기준)
- 주 색 남색 `#1B3C8C`, 밝은 배경 `#F5F6F8`, 글꼴 Noto Sans KR(Google Fonts).
- 상단바(남색, 왼쪽 HANBIT Innotech / 오른쪽 사용자 이름·로그아웃) + 왼쪽 메뉴 + 본문.
- 모든 문구는 한국어. 375px 폭에서 가로 스크롤이 없어야 한다(좁은 화면에서는 왼쪽 메뉴를 상단 가로 메뉴로 바꾼다).
- 로그인 화면: 가운데 카드, "HANBIT Innotech" / "홈페이지 관리자", 아이디·비밀번호·로그인 유지·로그인 버튼, 오류·잠금 안내.

## 3. 보안 규칙
- 비밀번호·토큰은 어떤 파일·커밋·출력·로그에도 쓰지 않는다. `.dev.vars`, `.wrangler/` 는 git 제외.
- 비밀번호 저장: WebCrypto PBKDF2-SHA256, 100,000회, 사용자별 16바이트 무작위 salt, 결과 32바이트. hash·salt 는 16진 문자열로 저장.
  비교는 시간차 공격 방지 비교(길이 고정, 바이트 XOR 누적). 없는 아이디도 같은 계산을 한 번 해서 응답 시간을 맞춘다.
- 로그인 실패 오류는 "아이디 또는 비밀번호가 올바르지 않습니다." 하나로 통일(아이디 존재 여부를 알려주지 않음).
- 잠금: 같은 계정 5회 연속 실패 → 10분 잠금(locked_until). 잠금 중에는 비밀번호가 맞아도 거부하고 남은 시간을 "약 N분" 으로 안내.
  잠금이 걸릴 때 failed_count 는 0으로 되돌린다. 로그인 성공 시 failed_count=0, locked_until=NULL.
- 세션: 32바이트 무작위 토큰(base64url)을 쿠키로만 전달, D1 에는 SHA-256 해시만 저장.
  쿠키 이름 `__Host-hb_sess`, HttpOnly, Secure, SameSite=Strict, Path=/. 기본 12시간, "로그인 유지" 체크 시 30일.
  로그아웃 시 D1 세션 행 삭제 + 쿠키 삭제. 만료 세션은 로그인 때 정리한다. 비밀번호 변경 시 현재 세션 외 모든 세션 삭제.
- GET·HEAD 외 모든 요청(POST 등)은 Origin 헤더가 자기 주소(요청 URL 의 origin)와 같아야 한다. 없거나 다르면 403.
- 오류 메시지는 한국어. 서버 내부 오류는 내용 없이 "서버 오류가 발생했습니다." 만 반환.
- 기록(audit_log): 로그인 성공·실패·잠금·잠금 중 시도·로그아웃·비밀번호 변경(성공·실패).
- 응답 헤더(API·정적 파일 공통): `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Strict-Transport-Security`, `Permissions-Policy`, `Content-Security-Policy`(자기 주소 + Google Fonts).
  API 응답은 `Cache-Control: no-store`. 화면 HTML 에 `<meta name="robots" content="noindex, nofollow">`, robots.txt 전체 차단.
- GitHub 토큰은 Pages 비밀(secret)로만 등록한다(`npx wrangler pages secret put GITHUB_TOKEN --project-name hanbit-admin`,
  대표가 직접 연 PowerShell 창에서 실행). 3-2a 에서는 읽기 전용 호출만 한다.

## 4. 단계표
| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 3-2a | 자체 관리자 기반: 로그인 서버(D1·세션·잠금·기록), 로그인 화면, 임시 대시보드, GitHub 연결 확인(/api/health), 대표 계정 생성 스크립트 | 로컬 시험 통과, pages.dev 배포 후 로그인·연결 정상 |
| 3-2b | 화면 틀: 상단바·왼쪽 메뉴(국문·영문, 게시판 → 회사 페이지 → 사이트 관리, docs/spec.md 7절 순서), 공통 목록·폼·알림 부품, 모바일 메뉴 | 모든 메뉴 빈 화면까지 이동, 375px 가로 스크롤 없음 |
| 3-2c | 게시판·에디터: 회사소식·시공사례·E-Catalog(국문·영문) 목록·작성·수정·숨김·삭제, 이미지 업로드(uploads/), hopage 에 서버가 커밋 | docs/spec.md 2·3절 필드·파일 규칙과 같은 결과물, hopage 빌드 성공 |
| 3-2d | 회사 페이지(인증 및 수상·연혁·회사소개·ESG·Contact)·사이트 관리(메뉴·회사정보·팝업, 국문·영문) 편집 | Sveltia 와 같은 yml 결과, 빌드 성공 |
| 3-2e | 반영 상태(hopage Actions 빌드·배포 상태 표시), 작업 기록 화면(audit_log), 직원 계정(editor) 추가·중지·비밀번호 초기화(admin 만) | 권한별 접근 시험 통과 |
| 3-2f | 전체 점검(보안·권한·모바일·실패 복구) 후 주소 전환(admin.hanbitinnotech.com → Cloudflare Pages), Sveltia 는 예비로 보관 | 대표 확인 후 전환 |

권한(3-2e 부터 적용): admin = 모든 기능 + 계정 관리, editor = 콘텐츠 편집만.

## 5. D1 테이블 (시각은 모두 1970-01-01 UTC 기준 밀리초 정수)
### users
| 칸 | 형식 | 설명 |
|---|---|---|
| id | INTEGER PK | 자동 증가 |
| username | TEXT UNIQUE (대소문자 무시) | 로그인 아이디 |
| display_name | TEXT | 화면 표시 이름 |
| role | TEXT | `admin` 또는 `editor` |
| password_hash | TEXT | PBKDF2 결과 16진(64자) |
| password_salt | TEXT | 16바이트 salt 16진(32자) |
| active | INTEGER | 1 사용, 0 중지 |
| failed_count | INTEGER | 연속 실패 횟수 |
| locked_until | INTEGER NULL | 잠금 해제 시각 |
| created_at, updated_at | INTEGER | 생성·수정 시각 |

### sessions
| 칸 | 형식 | 설명 |
|---|---|---|
| id | TEXT PK | 무작위 UUID |
| user_id | INTEGER FK → users.id (삭제 시 함께 삭제) | |
| token_hash | TEXT UNIQUE | 세션 토큰의 SHA-256 16진 |
| expires_at | INTEGER | 만료 시각 |
| created_at | INTEGER | |
| user_agent | TEXT | 최대 300자 |

### audit_log
| 칸 | 형식 | 설명 |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER NULL FK → users.id | 없는 아이디 시도는 NULL |
| action | TEXT | login_success, login_fail, login_locked, login_blocked, logout, password_change, password_change_fail (이후 단계에서 추가) |
| target | TEXT | 대상(로그인은 시도한 아이디) |
| detail | TEXT | JSON(이유, IP 등. 비밀번호·토큰은 넣지 않음) |
| created_at | INTEGER | |

## 6. API (3-2a)
모든 응답은 JSON `{ ok: true, ... }` 또는 `{ ok: false, error: "한국어 메시지" }`.
| 메서드·경로 | 로그인 | 설명 | 주요 응답 |
|---|---|---|---|
| POST /api/auth/login | 아니오 | `{username, password, remember}` 확인 후 세션 쿠키 발급 | 200 `{user}` / 400 입력 누락 / 401 불일치 / 403 중지 계정 / 423 잠금(`lockedUntil`) |
| POST /api/auth/logout | 선택 | 세션 삭제, 쿠키 삭제 | 200 |
| GET /api/auth/me | 예 | 현재 사용자 | 200 `{user: {username, displayName, role}}` / 401 |
| POST /api/auth/password | 예 | `{currentPassword, newPassword}`, 새 비밀번호 8자 이상 | 200 / 400 |
| GET /api/health | 예 | GITHUB_TOKEN 으로 hanbit595/hopage main 최신 커밋 번호만 읽음(읽기 전용) | 200 `{message:"연결 정상", commit}` / 401 / 502 |
| GET /api/site/summary?lang=ko\|en | 예 | (3-2b) 글 수(국문·영문)·인증 건수·현재 팝업(요청 언어). git trees(main, recursive) 1회 + cert.yml(국문·영문)·popups.yml 만 읽음 | 200 `{counts:{ko,en}, popups, today}` / 502 |
| GET /api/deploy/status | 예 | (3-2b) hopage 최근 Actions 실행 1건(반영 완료/반영 중/반영 실패+이유) + main 최근 커밋 5건 | 200 `{deploy, commits}` |
| /api/settings/* | 관리자 | (3-2b 자리만, 501) 사이트 설정. 3-2d 에서 구현 | 편집자 403 |
| /api/users/* | 관리자 | (3-2b 자리만, 501) 직원 계정. 3-2e 에서 구현 | 편집자 403 |
| 그 밖의 /api/* | - | | 404 |
3-2c 이후 추가 예정: 게시판·페이지·설정 읽기/저장(서버가 hopage 에 커밋), 업로드, 기록, 계정 관리.

- 관리자 전용 경로(/api/settings, /api/users)는 api/_middleware.ts 한 곳에서 권한을 확인한다(로그인 없음 401, 편집자 403).
- 글 수: cms/{notice,media,library}/*.md(영문 cms/en/...) 파일 수. 인증 건수: cert.yml items 개수(숨김 포함).
  현재 팝업: popups.yml 에서 active 이고 오늘(한국 날짜)이 start~end 안인 것.
- GitHub 응답은 60초 캐시(Cloudflare Cache API + 실행 인스턴스 메모리). 파일 내용(blob)은 sha 기준이라 1시간 캐시.
  pages.dev 주소에서는 Cache API 가 동작하지 않을 수 있어 메모리 캐시를 함께 쓴다.
- Actions 상태를 읽으려면 GitHub 토큰에 Actions(Read) 권한이 필요하다. 없으면 "Actions 읽기 권한이 없습니다" 로 안내.
- 로컬에서 GITHUB_TOKEN 이 없으면 공개 저장소를 토큰 없이 읽는다(시험용, 호출 한도 낮음).

## 6-1. 화면 (3-2b)
- 주소: `/{lang}` 대시보드, `/{lang}/{메뉴}` (lang = ko|en). 메뉴 키: notice·media·library / cert·history·hanbit·esg·location /
  menu·site·popups(관리자) / users(관리자). 언어 없는 주소는 기억한 언어(브라우저 localStorage)의 대시보드로 이동.
- 상단바: HANBIT Innotech 홈페이지 관리자, [국문 관리 | 영문 관리](선택 기억), 홈페이지 보기(국문 https://hanbitinnotech.com,
  영문 /en/index.html, 새 창), 표시 이름·권한(관리자/편집자), 로그아웃.
- 왼쪽 메뉴: 대시보드 / 게시판(글 수 표시) / 회사 페이지 / 사이트 설정(관리자) / 직원 계정(관리자).
  영문 모드는 "회사소식 (News)" 처럼 영문 병기. 편집자는 관리자 메뉴가 보이지 않고, 주소로 들어오면 "관리자만 사용할 수 있는 화면" 안내.
- 900px 이하: 메뉴를 접고 ☰ 로 여는 서랍(언어 전환·홈페이지 보기·사용자 정보 포함). 375px 가로 스크롤 없음.
- 대시보드: 인사말 + "저장하면 1~2분 뒤 홈페이지에 반영됩니다", 바로 쓰기 3개(새 소식 쓰기·새 시공사례·인증서 추가),
  글 수 표(국문·영문), 홈페이지 반영 상태(한국 시간), 최근 수정 5건(커밋 메시지·시각, "누가"는 3-2c 이후), 현재 팝업(선택 언어).
- 아직 만들지 않은 메뉴는 제목과 "3-2c/3-2d/3-2e 단계에서 만들 화면" 안내만 있는 자리 화면.

## 6-2. 게시판 저장 규칙 (3-2c, hopage build/cms_posts.py·boards.py·build.py·docs/spec.md 조사 결과, 2026-11-17)
### 저장 위치·브랜치
- 저장 대상 브랜치 = 서버 환경변수 `CONTENT_BRANCH`(지금 `admin-dev`, 3-2f 에서 `main`). 설정이 없으면 게시판 읽기·저장을 하지 않고 안내한다.
  admin-dev 에 저장한 글은 홈페이지에 반영되지 않는다(hopage Actions 는 main push 에서만 빌드·배포).
- 3-2c 시작 시 admin-dev 가 main 보다 8커밋 뒤처져 있어 대표 승인 후 main(7005a65)으로 fast-forward 했다(새 커밋 없음).
- 게시판 폴더: 국문 `cms/notice|media|library/`, 영문 `cms/en/notice|media|library/`. 파일 = `<파일명>.md`(머리말 YAML + 본문).
- 파일명: 기존 글 = 글번호(`99.md`, 0 으로 시작 안 함), 새 글 = `YYYYMMDD-HHMMSS.md`(저장 시각, 한국 시간). 대소문자 무시 중복 금지.
  새 글 이름이 이미 있으면 1초씩 늘려 다시 시도한다.
- 업로드: `uploads/YYYYMMDD-HHMMSS-난수6.확장자`(난수 = 소문자·숫자 6자), 사이트 주소 `/uploads/…`.
  빌드는 cms·content·templates 어디에도 주소가 없는 업로드를 배포본에 넣지 않는다(원본은 남음).

### 머리말 칸 (YAML 1.2 처럼 true/false 만 불리언. 빌드 CmsLoader)
| 칸 | 게시판 | 필수 | 형식·규칙 |
|---|---|---|---|
| title | 전부 | 예 | 글자(비면 실패). 국문 시공사례는 현장명, 영문은 통째 제목 |
| date | 전부 | 예 | "YYYY-MM-DD HH:MM:SS" 또는 "YYYY-MM-DD"(→ 00:00:00). 없는 날짜·시각이면 실패 |
| draft | 전부 | | true/false(기본 false). true 면 목록·상세·메인·sitemap 에서 빠짐(검사는 똑같이 함) |
| thumbnail | 전부 | | /로 시작하는 사이트 주소. 목록·메인 썸네일 1순위 |
| summary | 전부 | | 메인 News 요약·상세 meta description 1순위 |
| body_format | 전부 | | html 이면 본문 HTML 그대로, 없으면 markdown→HTML. html·markdown 외 값은 실패. 관리자 새 글은 html |
| category | 국문 시공사례 | 예 | 목록(글자 1개도 허용), 허용값 태양광발전장치·BIPV·주차장태양광·기타, 1개 이상 |
| capacity, program | 국문 시공사례 | | 글자. 표시 제목 "[분류,분류] 현장명 용량 ㅣ 사업구분" |
| gallery | 국문 시공사례 | | 이미지 주소 목록(글자 또는 {image}) |
| featured, featured_order, featured_image | 국문 시공사례 | | 불리언 / 정수(불리언 금지) / 주소 |
| featured_label, featured_text | 국문 시공사례 | | 기존 글 전용. 관리자 화면에 없음, 그대로 보존 |
| file | E-Catalog(국문·영문) | 예 | /로 시작(//금지) PDF 주소, public/ 에 실제 파일이 있어야 함 |
| link1, link2 | 전부 | | 기존 글 전용 글자(관련 링크·YouTube). 그대로 보존 |
| files | 전부 | | 기존 글 전용 [{no(정수), source, stored(필수), size(정수)}]. 그대로 보존 |

- 빌드 실패 조건(한국어 메시지 + 종료코드 1): 머리말 없음·형식 오류, 파일명 형식·중복, title·date 누락, date 형식,
  draft·featured 가 불리언 아님, body_format 값, category 누락·목록 아님·허용값 밖, featured_order 숫자 아님,
  files 형식(stored 없음, no·size 숫자 아님), gallery 형식, E-Catalog file 누락·/로 시작 안 함·public/ 에 없음.
- 관리자 서버는 저장 전에 위 조건을 같은 규칙으로 검사해 한국어로 막는다(E-Catalog file 은 .pdf 이고 저장소에 있는 파일인지까지).

### 저장 방식 (기존 글 보존)
- 머리말은 바뀐 칸만 그 칸의 줄을 바꾼다. 나머지 칸(모르는 칸 포함)·순서·따옴표·본문은 글자 그대로 둔다.
  값이 같은 칸(예: "2026-03-17" 과 "2026-03-17 00:00:00")은 바꾸지 않는다. 없던 칸은 값이 있을 때만 끝에 붙인다.
- 본문은 화면에서 고쳤을 때만 바꾼다. 기존 글은 HTML 그대로 열고, 편집기(TipTap)가 그대로 담지 못하는 서식이 있으면 HTML 모드로 연다.
- GitHub contents API 로 CONTENT_BRANCH 에 커밋. 수정·삭제는 연 때의 sha 를 보내 다르면 409("다른 사람이 먼저 고쳤습니다").
  커밋 메시지 "[관리자] {게시판} {저장|삭제}: {제목} ({표시 이름})", 업로드는 "[관리자] 업로드: {경로} ({표시 이름})".
- 첨부(PDF·HWP·HWPX·DOCX·XLSX·ZIP, 20MB 이하): 빌드는 files 칸의 이미지가 아닌 첨부를 기존 글 전용 주소
  files/{게시판}/{글번호}-{no}.확장자 로 연결하므로 새 글 첨부를 files 에 넣으면 링크가 깨진다.
  → 대표 결정(2026-11-17): 첨부는 uploads/ 에 올리고 본문에 `<a href="/uploads/…" download="원래이름">원래이름 (크기)</a>` 링크로 넣는다.
- 사진: 브라우저에서 긴 변 1920px 이하·JPEG 품질 85(투명 PNG 는 PNG), 원본 10MB 초과 거부. 저장 버튼을 누를 때 실제로 쓰인 것만 올린다.
- 글 삭제 시 그 글에서만 쓰는 업로드(관리자 화면으로 올린 것, D1 uploads·post_uploads 기록 기준)도 함께 지운다.

### 사진·첨부·미리보기 (3-2c 단계 3)
- D1 `uploads`(path PK, kind image|file, size, original_name, user_id, created_at), `post_uploads`(post_path, upload_path) — migrations/0002_uploads.sql.
  글 저장 때 그 글이 쓰는 /uploads/… 를 post_uploads 에 다시 기록, 글 삭제 때 uploads 에 있고 다른 글이 안 쓰는 파일만 함께 삭제.
- 업로드 검사(서버): 이름 형식, 확장자, 크기(사진 10MB·첨부 20MB), 파일 첫 바이트(JPG·PNG·GIF·PDF·ZIP계열·HWP), 같은 이름 있으면 409.
  글 저장 때 새로 적힌 /uploads/… 가 저장소에 없으면(올리기 실패) 저장을 막는다.
- 편집기: 사진 붙여넣기(Ctrl+V)·끌어다 놓기·버튼, 첨부 버튼 → 본문 링크. 첨부파일 칸은 본문의 첨부 링크 목록(삭제 = 본문에서 링크 제거).
- 미리보기: templates/board_view.html 과 같은 마크업·클래스(게시판 감싸는 div·body class 포함)에 홈페이지 CSS(default·font-awesome·base·xeicon·
  layout·board·res(+영문 layout_en)·게시판 skin style.css)를 https://hanbitinnotech.com 에서 불러와 sandbox iframe 으로 그림(스크립트 없음,
  상단 메뉴·푸터 제외). PC 1280px 축소 / 모바일 375px. 1100px 이하 화면은 [입력 | 미리보기] 탭.
- CSP 변경: style-src 에 'unsafe-inline'·https://hanbitinnotech.com, font-src 에 https://hanbitinnotech.com (미리보기의 홈페이지 CSS·본문 style 속성 때문).
- 화면 시험: Playwright(개발 의존성)로 로컬 `wrangler pages dev` 에서 진행, 스크린샷은 app/test-results/(git 제외).

### API (3-2c)
| 메서드·경로 | 설명 |
|---|---|
| GET /api/posts?lang&board&page&q&category&hidden | 목록 20건씩(제목·분류·날짜·숨김·메인 노출·썸네일), 검색(제목), 분류·숨김 필터 |
| GET /api/posts/{lang}/{board}/{name} | 글 1건(머리말·본문·sha) |
| POST /api/posts/{lang}/{board} | 새 글 |
| PUT /api/posts/{lang}/{board}/{name} | 수정(바뀐 칸만, sha 필수). 숨기기/공개 전환도 이것(draft 만) |
| DELETE /api/posts/{lang}/{board}/{name}?sha= | 삭제 |
| POST /api/uploads?path=uploads/…&kind=image\|file | 파일 1개 커밋(본문 = 파일 바이트) |
- 사진 표시: 기존 사진(/data/…)은 배포본에 원본 대신 large-{이름}.jpg·thumb-{이름}_가로x세로 만 있는 경우가 많아,
  서버가 저장소 static/ 폴더 목록(GraphQL, 1시간 캐시)으로 실제 파일을 골라(원본·renames.json → 목록은 420x280·900x600 축소본 → large- → thumb-)
  https://hanbitinnotech.com 에 붙여 보여 준다. /uploads/… 는 저장소 원본(raw.githubusercontent.com, 저장 대상 브랜치).
- 편집자(editor)도 게시판은 쓸 수 있다. audit_log action: post_create, post_save, post_delete, upload.
- 목록 읽기: GraphQL 1~2회(폴더 tree oid 로 캐시). 글 1건·저장은 contents API(캐시 없음).

## 6-3. 회사 페이지·사이트 설정 저장 규칙 (3-2d, hopage build/cms_pages.py·build.py 조사 결과, 2026-11-17)
### 파일
| 화면 | 국문 | 영문 | 읽는 방식 |
|---|---|---|---|
| 인증 및 수상 | cms/pages/cert.yml | cms/en/pages/cert.yml | CmsLoader(true/false 만 불리언) |
| 연혁 | cms/pages/history.yml | cms/en/pages/history.yml | 〃 |
| 회사소개 | cms/pages/hanbit.yml | cms/en/pages/hanbit.yml | 〃 |
| ESG 경영 | cms/pages/esg.yml | cms/en/pages/esg.yml | 〃 |
| Contact | cms/pages/location.yml | cms/en/pages/location.yml | 〃 (+ 같은 언어 site.yml) |
| 메뉴 | cms/settings/menu.yml | cms/en/settings/menu.yml | yaml.safe_load(YAML 1.1: yes·no·on·off 도 불리언) |
| 회사정보 | cms/settings/site.yml | cms/en/settings/site.yml | 〃 |
| 팝업 | cms/settings/popups.yml | cms/en/settings/popups.yml | 〃 |
- 파일마다 맨 위 설명 주석과 칸 옆 주석이 있다 → 저장할 때 보존한다.

### 칸과 빌드 실패 조건
- 공통 이미지 칸: /로 시작(//금지)하는 사이트 주소이고 public/ 에 파일이 있어야 함(static/ 또는 uploads/, renames.json 으로 바뀐 이름 인정).
- 인증(cert): categories[글자, 1개 이상, 중복 금지], items[1개 이상]{category(필수, categories 중 하나), name(필수), issuer(선택),
  date(선택, YYYY-MM-DD 또는 YYYY-MM), image(필수), visible(불리언, 기본 true), order(숫자, 기본 0)}.
  화면: 구분 안에서 order → 파일 순서. 노출 항목이 없는 구분은 숨김.
- 연혁(history): periods[1개 이상]{title(필수), anchor(선택, 영문·숫자·-·_, 기간끼리 중복 금지, 비우면 his-N), image(필수),
  years[1개 이상]{year(필수, 19xx·20xx, 같은 기간 안 중복 금지), months[1개 이상]{month("01"~"12"), items[글자 1개 이상]}}}.
  화면은 큰 연도·큰 달이 위(적은 순서 무관). 한 달 2칸까지 한 줄에 나옴. 영문은 | 로 적은 끝 줄바꿈을 보존(keep_end).
- 회사소개(hanbit): hero{title, image(국문)|video(영문, .mov 는 빌드가 .mp4 로 바꾼 것 인정)}, intro_texts 꼭 3개, photos 꼭 6개(이미지),
  energy_text, sun_texts 꼭 2개, ending_text — 모두 필수. 개수 고정(화면 움직임 스크립트와 맞물림).
- ESG(esg): intro{title, text}, flow_text, pillars[1개 이상]{title, icon(이미지), text}, details[1개 이상]{title, items[1개 이상]} — 모두 필수.
- Contact(location): locations[1개 이상]{office(필수, 같은 언어 site.yml offices 의 name 과 똑같이), label, title(필수),
  map(필수, https://www.google.com/maps/embed 로 시작), map_indent(선택, 0~40 숫자, 국문 기록용)}. 주소·전화·메일은 site.yml.
- 메뉴(menu): menu[]{label(필수), link, visible(false 면 숨김), class(마크업 유지용, 화면에 숨김·보존), items[]{label(필수), link(/ 또는 http),
  new_window, visible, class}}. 대메뉴 link 를 비우면 첫 노출 소메뉴로(노출 소메뉴도 없으면 실패). 노출된 내부 link 는 public/ 에 있어야 함.
- 회사정보(site): offices[1개 이상]{name, address 둘 다 필수}, tel·email 필수, brochure(국문 필수·영문 선택, / 또는 http, 내부면 public/ 에 있어야 함),
  per_page(국문, 1 이상 숫자), seo_description(국문, 필수). offices 이름을 바꾸면 Contact office 연결이 깨져 실패.
- 팝업(popups): popups[]{title, image, link(선택, / 또는 http), start·end(YYYY-MM-DD, start ≤ end), active(false 면 HTML 에 안 넣음),
  id(1 이상 숫자, 중복 금지, 비우면 순서 번호), width·height·top·left(0 이상 숫자, 기본 450·660·150·10)}. active 팝업은 image 필수·존재.
  노출 기간은 방문자 브라우저가 start 0시 ~ end 23:59:59(한국 시간)로 판단.

### 저장 방식(보존)
- 원문 YAML 을 그대로 두고 바뀐 값의 자리만 고친다(server/yamlpatch.ts). 글자 칸은 원래 따옴표 방식(따옴표 없음·"…"·'…'·|-)을 따르고,
  따옴표 없이 쓰면 뜻이 바뀌는 값(yes·no·숫자·날짜 모양 등)은 작은따옴표로. 목록은 바뀌지 않은 항목의 원문을 그대로 재사용
  (추가·삭제·순서 변경 후 되돌리면 원문과 같아짐). 주석·모르는 칸은 그대로. 값이 모두 같으면 커밋하지 않는다.
- 커밋 메시지 "[관리자] {페이지} 저장 ({표시 이름})"(예: 인증 및 수상(국문)), sha 다르면 409. audit_log page_save·settings_save.
- 저장 전 위 빌드 실패 조건을 서버에서 검사(이미지·내부 링크 존재는 저장소 static/·uploads/·D1 업로드 기록·생성 페이지 목록으로).
- API: GET/PUT /api/pages/{lang}/{cert|history|hanbit|esg|location}(편집자 가능), GET/PUT /api/settings/{lang}/{menu|site|popups}(관리자만),
  GET /api/media?q=&page=(사진 고르기: uploads/·static/ 이미지, thumb- 축소본 제외), GET /api/links?lang=(메뉴 링크용 내부 페이지 목록).

## 7. 대표 계정
- `app/scripts/create-admin.mjs` : 아이디·표시 이름·비밀번호(화면 표시 없이 2번 입력)를 묻고 같은 PBKDF2 방식으로 해시를 만든 뒤
  `npx wrangler d1 execute hanbit-admin-db --remote` 로 users 에 role=admin 1건을 넣는다. 비밀번호 원문은 파일·출력에 남기지 않는다
  (임시 SQL 파일에는 해시·salt 만 쓰고 실행 직후 삭제).
- 대표가 직접 실행한다: `cd D:\hpadmin\app` → `node scripts/create-admin.mjs`

## 8. 로컬 개발
- `npm run build` → `npx wrangler pages dev dist` (http://localhost:8788, 로컬 D1 은 `.wrangler/` 안)
- 로컬 DB 마이그레이션: `npx wrangler d1 migrations apply hanbit-admin-db --local`
- 로컬에서 GitHub 연결 확인이 필요하면 `.dev.vars` 에 GITHUB_TOKEN 을 대표가 직접 넣는다(git 제외 파일).
