// 사진·PDF 입력 칸: 끌어다 놓기·파일 선택(시안 3 의 점선 상자). 고른 파일은 저장할 때 올린다.
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { displayUrl, pending, type AssetCtx } from '../assets';
import { addFile, addImages, sizeLabel } from '../upload';

type OnError = (msg: string) => void;

function DropZone({
  accept,
  multiple,
  onFiles,
  children,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <div
      className={`drop${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1B3C8C" strokeWidth="2" aria-hidden="true">
        <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
      </svg>
      <div className="drop-text">
        {children}{' '}
        <button type="button" className="link-btn" onClick={() => input.current?.click()}>
          파일 선택
        </button>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}

const IMG_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
const IMG_NOTE = '긴 변 1920px 로 자동 축소 · 파일 이름은 자동으로 영문 변환 · 10MB 이하';

export function ImageField({
  label,
  value,
  onChange,
  ctx,
  onError,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ctx: AssetCtx;
  onError: OnError;
}) {
  const pick = async (files: File[]) => {
    const { paths, errors } = await addImages(files.slice(0, 1));
    if (errors.length) onError(errors.join(' '));
    if (paths[0]) onChange(paths[0]);
  };
  return (
    <div className="f">
      <span>{label}</span>
      {value ? (
        <div className="img-field">
          <div className="img-box">
            <img src={displayUrl(value, ctx)} alt="" />
          </div>
          <div className="img-side">
            <small className="img-path">{pending.has(value) ? `${pending.get(value)!.name} (저장할 때 올림)` : value}</small>
            <DropZoneButton accept={IMG_ACCEPT} label="바꾸기" onFiles={pick} />
            <button type="button" className="btn-row" onClick={() => onChange('')}>
              지우기
            </button>
          </div>
        </div>
      ) : (
        <DropZone accept={IMG_ACCEPT} onFiles={pick}>
          사진을 끌어다 놓거나
          <br />
          <small>{IMG_NOTE}</small>
        </DropZone>
      )}
    </div>
  );
}

function DropZoneButton({ accept, label, onFiles }: { accept: string; label: string; onFiles: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn-row" onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

export function GalleryField({ value, onChange, ctx, onError }: { value: string[]; onChange: (v: string[]) => void; ctx: AssetCtx; onError: OnError }) {
  const pick = async (files: File[]) => {
    const { paths, errors } = await addImages(files);
    if (errors.length) onError(errors.join(' '));
    if (paths.length) onChange([...value, ...paths]);
  };
  return (
    <div className="f">
      <span>현장 사진 여러 장 (본문 아래에 차례로 표시)</span>
      {value.length > 0 && (
        <ul className="gallery">
          {value.map((g, i) => (
            <li key={`${g}-${i}`}>
              <img src={displayUrl(g, ctx)} alt="" />
              <div className="gallery-btns">
                <button type="button" className="btn-row" disabled={i === 0} aria-label={`${i + 1}번째 사진 앞으로`} onClick={() => onChange(move(value, i, -1))}>
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-row"
                  disabled={i === value.length - 1}
                  aria-label={`${i + 1}번째 사진 뒤로`}
                  onClick={() => onChange(move(value, i, 1))}
                >
                  ↓
                </button>
                <button type="button" className="btn-row" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  빼기
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <DropZone accept={IMG_ACCEPT} multiple onFiles={pick}>
        현장 사진을 여러 장 끌어다 놓거나
        <br />
        <small>{IMG_NOTE}</small>
      </DropZone>
    </div>
  );
}

export function PdfField({
  label,
  value,
  onChange,
  required,
  onError,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  onError: OnError;
}) {
  const pick = (files: File[]) => {
    try {
      onChange(addFile(files[0], ['pdf']));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'PDF 를 넣지 못했습니다.');
    }
  };
  const p = value ? pending.get(value) : undefined;
  return (
    <div className="f">
      <span>
        {label} {required && <em>*</em>}
      </span>
      {value ? (
        <div className="attach-row">
          <FileIcon />
          <span className="attach-name">{p ? `${p.name} (${sizeLabel(p.blob.size)}, 저장할 때 올림)` : value}</span>
          <DropZoneButton accept="application/pdf,.pdf" label="바꾸기" onFiles={pick} />
        </div>
      ) : (
        <DropZone accept="application/pdf,.pdf" onFiles={pick}>
          PDF 파일을 끌어다 놓거나
          <br />
          <small>20MB 이하</small>
        </DropZone>
      )}
    </div>
  );
}

export function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B3C8C" strokeWidth="2" aria-hidden="true">
      <path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8zM14 3v5h5" />
    </svg>
  );
}

function move<T>(arr: T[], i: number, d: number): T[] {
  const out = [...arr];
  const [x] = out.splice(i, 1);
  out.splice(i + d, 0, x);
  return out;
}
