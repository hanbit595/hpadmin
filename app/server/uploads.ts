// 업로드 파일: 검사·커밋·기록, 글이 쓰는 업로드 기록, 글 삭제 때 그 글에서만 쓰던 업로드 지우기 (명세 6-2절)
import { FILE_EXT, FILE_MAX, IMAGE_EXT, IMAGE_MAX, UPLOAD_RE } from '../shared/boards';
import { ContentError, deleteFile, fileSha, putFile } from './content';
import type { Env } from './http';
import type { SessionUser } from './session';

const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8,
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  gif: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  pdf: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  zip: (b) => b[0] === 0x50 && b[1] === 0x4b,
  docx: (b) => b[0] === 0x50 && b[1] === 0x4b,
  xlsx: (b) => b[0] === 0x50 && b[1] === 0x4b,
  hwpx: (b) => b[0] === 0x50 && b[1] === 0x4b,
  hwp: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
};

export function kindOf(path: string): 'image' | 'file' | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if ((IMAGE_EXT as readonly string[]).includes(ext)) return 'image';
  if ((FILE_EXT as readonly string[]).includes(ext)) return 'file';
  return null;
}

export async function saveUpload(env: Env, user: SessionUser, path: string, bytes: Uint8Array, originalName: string) {
  if (!UPLOAD_RE.test(path)) throw new ContentError(400, '업로드 파일 이름 형식이 올바르지 않습니다.');
  const kind = kindOf(path);
  if (!kind) throw new ContentError(400, '올릴 수 없는 파일 형식입니다.');
  const ext = path.split('.').pop()!.toLowerCase();
  if (!bytes.length) throw new ContentError(400, '빈 파일입니다.');
  if (kind === 'image' && bytes.length > IMAGE_MAX) throw new ContentError(413, '사진 한 장은 10MB 이하여야 합니다.');
  if (kind === 'file' && bytes.length > FILE_MAX) throw new ContentError(413, '첨부 파일은 20MB 이하여야 합니다.');
  if (!MAGIC[ext]?.(bytes)) throw new ContentError(400, `파일 내용이 .${ext} 형식이 아닙니다.`);
  if (await fileSha(env, path)) throw new ContentError(409, '같은 이름의 파일이 이미 있습니다. 다시 시도해 주세요.');
  const res = await putFile(env, path, bytes, `[관리자] 업로드: ${path} (${user.displayName})`);
  const name = originalName.replace(/[\r\n]/g, ' ').slice(0, 200);
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO uploads (path, kind, size, original_name, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      path,
      kind,
      bytes.length,
      name,
      user.id,
      Date.now(),
    ),
    env.DB.prepare('INSERT INTO audit_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(
      user.id,
      'upload',
      path,
      JSON.stringify({ name, size: bytes.length, commit: res.commit.slice(0, 7) }),
      Date.now(),
    ),
  ]);
  return { path, size: bytes.length, commit: res.commit };
}

/** 글 파일 글자에서 /uploads/… 경로(관리자 업로드 형식) 찾기 */
export function uploadRefs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\/uploads\/(\d{8}-\d{6}-[a-z0-9]{6}\.[a-z0-9]+)/gi)) out.add(`uploads/${m[1]}`);
  return [...out];
}

/** 저장한 글이 쓰는 업로드 기록을 새로 맞춘다 */
export async function setPostRefs(env: Env, postPath: string, text: string) {
  const refs = uploadRefs(text);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM post_uploads WHERE post_path = ?').bind(postPath),
    ...refs.map((u) => env.DB.prepare('INSERT OR IGNORE INTO post_uploads (post_path, upload_path) VALUES (?, ?)').bind(postPath, u)),
  ]);
}

/** 글 삭제 뒤: 그 글에서만 쓰던(관리자 화면으로 올린) 업로드를 지운다. 지운 경로 목록을 돌려준다. */
export async function removePostUploads(env: Env, user: SessionUser, postPath: string, text: string): Promise<string[]> {
  const refs = uploadRefs(text);
  await env.DB.prepare('DELETE FROM post_uploads WHERE post_path = ?').bind(postPath).run();
  const removed: string[] = [];
  for (const u of refs) {
    const own = await env.DB.prepare('SELECT path FROM uploads WHERE path = ?').bind(u).first();
    if (!own) continue; // 관리자 화면으로 올린 파일이 아니면 두기
    const other = await env.DB.prepare('SELECT post_path FROM post_uploads WHERE upload_path = ? LIMIT 1').bind(u).first();
    if (other) continue; // 다른 글도 씀
    const sha = await fileSha(env, u);
    if (sha) await deleteFile(env, u, sha, `[관리자] 업로드 삭제: ${u} (${user.displayName})`);
    await env.DB.prepare('DELETE FROM uploads WHERE path = ?').bind(u).run();
    removed.push(u);
  }
  return removed;
}
