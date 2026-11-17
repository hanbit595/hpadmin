// 사진·첨부 준비와 올리기 (명세 6-2절)
// - 사진: 긴 변 1920px 이하, JPEG 품질 85(투명 PNG 는 PNG, GIF 는 움직임 보존 위해 그대로). 원본 10MB 초과 거부
// - 첨부: PDF·HWP·HWPX·DOCX·XLSX·ZIP, 20MB 이하
// - 이름: uploads/YYYYMMDD-HHMMSS-난수6.확장자. 고를 때는 브라우저에만 두고, 저장 버튼을 누를 때 글에 실제로 쓰인 것만 올린다
import { FILE_EXT, FILE_MAX, IMAGE_MAX, kstNow } from '../shared/boards';
import { request } from './api';
import { pending } from './assets';

const MAX_SIDE = 1920;
const JPEG_Q = 0.85;

export class UploadError extends Error {}

function rand6(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
}

/** 사이트 경로 /uploads/YYYYMMDD-HHMMSS-난수6.확장자 */
export function newUploadPath(ext: string): string {
  const t = kstNow().replace(/[-:]/g, '').replace(' ', '-');
  return `/uploads/${t}-${rand6()}.${ext}`;
}

export function sizeLabel(n: number): string {
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}

function toBlob(canvas: HTMLCanvasElement, type: string, q?: number): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new UploadError('사진을 변환하지 못했습니다.'))), type, q));
}

/** 사진 1장 → 줄인 파일 */
export async function prepareImage(file: File): Promise<{ blob: Blob; ext: 'jpg' | 'png' | 'gif' }> {
  if (file.size > IMAGE_MAX) throw new UploadError(`"${file.name}" 은(는) ${sizeLabel(file.size)} 입니다. 사진 한 장은 10MB 이하만 올릴 수 있습니다.`);
  if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) throw new UploadError(`"${file.name}" 은(는) 올릴 수 없는 사진 형식입니다(JPG·PNG·GIF·WEBP).`);
  if (file.type === 'image/gif') return { blob: file, ext: 'gif' };
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new UploadError(`"${file.name}" 사진을 읽지 못했습니다.`);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  // 투명한 곳이 있는 PNG·WEBP 는 PNG 로(투명 유지)
  if (file.type !== 'image/jpeg') {
    const data = g.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) {
        const blob = await toBlob(canvas, 'image/png');
        if (blob.size > IMAGE_MAX) throw new UploadError(`"${file.name}" 은(는) 줄여도 10MB 를 넘습니다.`);
        return { blob, ext: 'png' };
      }
    }
    // 불투명이면 흰 바탕 위 JPEG
  }
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g2 = out.getContext('2d')!;
  g2.fillStyle = '#fff';
  g2.fillRect(0, 0, w, h);
  g2.drawImage(canvas, 0, 0);
  const blob = await toBlob(out, 'image/jpeg', JPEG_Q);
  return { blob, ext: 'jpg' };
}

/** 사진들을 준비해 임시 경로를 돌려준다(오류는 모아서 throw) */
export async function addImages(files: File[]): Promise<{ paths: string[]; errors: string[] }> {
  const paths: string[] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      const { blob, ext } = await prepareImage(f);
      const path = newUploadPath(ext);
      pending.set(path, { blob, url: URL.createObjectURL(blob), name: f.name || `사진.${ext}`, kind: 'image' });
      paths.push(path);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : '사진을 넣지 못했습니다.');
    }
  }
  return { paths, errors };
}

/** 첨부 파일 준비 */
export function addFile(file: File, allowed: readonly string[] = FILE_EXT): string {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!allowed.includes(ext)) throw new UploadError(`"${file.name}" 은(는) 올릴 수 없는 형식입니다(${allowed.map((e) => e.toUpperCase()).join('·')}).`);
  if (file.size > FILE_MAX) throw new UploadError(`"${file.name}" 은(는) ${sizeLabel(file.size)} 입니다. 첨부는 20MB 이하만 올릴 수 있습니다.`);
  if (!file.size) throw new UploadError(`"${file.name}" 은(는) 빈 파일입니다.`);
  const path = newUploadPath(ext);
  pending.set(path, { blob: file, url: URL.createObjectURL(file), name: file.name, kind: 'file' });
  return path;
}

const uploaded = new Set<string>();

/** 저장 직전: 글(머리말 값·본문)에 쓰인 임시 파일만 올린다. 실패하면 오류 문구 */
export async function uploadUsed(text: string, onProgress?: (done: number, total: number) => void): Promise<string | null> {
  const todo = [...pending.keys()].filter((p) => !uploaded.has(p) && text.includes(p));
  let done = 0;
  for (const p of todo) {
    onProgress?.(done, todo.length);
    const item = pending.get(p)!;
    const r = await request<{ path: string }>('POST', `/api/uploads?${new URLSearchParams({ path: p.slice(1), name: item.name })}`, item.blob);
    if (!r.ok) return `"${item.name}" 을(를) 올리지 못했습니다: ${r.error ?? ''}`;
    uploaded.add(p);
    done++;
  }
  onProgress?.(done, todo.length);
  return null;
}

/** 본문 안 첨부 링크(관리자 업로드) 목록 */
export function attachmentsIn(html: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b[^>]*?\shref="(\/uploads\/[^"]+\.(?:pdf|hwp|hwpx|docx|xlsx|zip))"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) out.push({ href: m[1], text: m[2].replace(/<[^>]+>/g, '') });
  return out;
}

/** 본문에서 첨부 링크 하나 빼기(링크만 있던 문단은 문단째) */
export function removeAttachment(html: string, href: string): string {
  const esc = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = `<a\\b[^>]*?\\shref="${esc}"[^>]*>[\\s\\S]*?<\\/a>`;
  const para = new RegExp(`<p>\\s*${a}\\s*</p>`, 'i');
  if (para.test(html)) return html.replace(para, '');
  return html.replace(new RegExp(a, 'i'), '');
}
