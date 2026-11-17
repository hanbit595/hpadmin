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

## 7. 대표 계정
- `app/scripts/create-admin.mjs` : 아이디·표시 이름·비밀번호(화면 표시 없이 2번 입력)를 묻고 같은 PBKDF2 방식으로 해시를 만든 뒤
  `npx wrangler d1 execute hanbit-admin-db --remote` 로 users 에 role=admin 1건을 넣는다. 비밀번호 원문은 파일·출력에 남기지 않는다
  (임시 SQL 파일에는 해시·salt 만 쓰고 실행 직후 삭제).
- 대표가 직접 실행한다: `cd D:\hpadmin\app` → `node scripts/create-admin.mjs`

## 8. 로컬 개발
- `npm run build` → `npx wrangler pages dev dist` (http://localhost:8788, 로컬 D1 은 `.wrangler/` 안)
- 로컬 DB 마이그레이션: `npx wrangler d1 migrations apply hanbit-admin-db --local`
- 로컬에서 GitHub 연결 확인이 필요하면 `.dev.vars` 에 GITHUB_TOKEN 을 대표가 직접 넣는다(git 제외 파일).
