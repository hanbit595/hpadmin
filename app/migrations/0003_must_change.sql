-- 3-2e: 임시 비밀번호로 만든·초기화한 계정은 첫 로그인 때 비밀번호 변경을 강제한다(1 = 변경 필요)
ALTER TABLE users ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0;
