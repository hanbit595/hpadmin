-- 3-2c: 관리자 화면으로 올린 업로드 파일과, 어느 글이 그 파일을 쓰는지(글 삭제 때 그 글에서만 쓰던 업로드를 함께 지우기 위함)
CREATE TABLE uploads (
  path          TEXT    PRIMARY KEY,           -- uploads/YYYYMMDD-HHMMSS-난수6.확장자
  kind          TEXT    NOT NULL CHECK (kind IN ('image', 'file')),
  size          INTEGER NOT NULL,
  original_name TEXT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE post_uploads (
  post_path   TEXT NOT NULL,                   -- cms/…/<파일명>.md
  upload_path TEXT NOT NULL,                   -- uploads/…
  PRIMARY KEY (post_path, upload_path)
);
CREATE INDEX idx_post_uploads_upload ON post_uploads(upload_path);
