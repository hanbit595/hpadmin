-- 3-2f: 홈페이지 견적문의(GitHub 에 저장하지 않고 D1 에만). 상태 new(신규)·read(확인)·done(완료)
CREATE TABLE inquiries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  lang          TEXT    NOT NULL DEFAULT 'ko' CHECK (lang IN ('ko', 'en')),
  customer_type TEXT    NOT NULL,            -- personal·company·public
  place         TEXT    NOT NULL,            -- house·building·factory·parking·land·etc
  region        TEXT    NOT NULL,
  scale         TEXT,                        -- 설치면적 또는 월 전기요금(선택, 글자 그대로)
  interest      TEXT,                        -- 관심사업(선택)
  name          TEXT    NOT NULL,
  phone         TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  message       TEXT    NOT NULL,
  agree_at      INTEGER NOT NULL,            -- 개인정보 수집·이용 동의 시각
  ip_hash       TEXT,                        -- 횟수 제한용(IP 원문은 저장하지 않음)
  user_agent    TEXT,
  status        TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'done')),
  memo          TEXT    NOT NULL DEFAULT '',
  handled_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX idx_inquiries_status ON inquiries(status, created_at);
CREATE INDEX idx_inquiries_ip ON inquiries(ip_hash, created_at);
