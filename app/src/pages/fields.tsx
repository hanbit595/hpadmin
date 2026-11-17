// 사진·PDF 입력 칸 (단계 2: 사이트 경로 입력 + 미리 보기. 단계 3 에서 올리기·끌어다 놓기 추가)
import { useState } from 'react';
import { displayUrl, type AssetCtx } from '../assets';

export function ImageField({ label, value, onChange, ctx }: { label: string; value: string; onChange: (v: string) => void; ctx: AssetCtx }) {
  return (
    <div className="f">
      <span>{label}</span>
      <div className="img-field">
        <div className="img-box">{value ? <img src={displayUrl(value, ctx)} alt="" /> : <small>사진 없음</small>}</div>
        <div className="img-side">
          <input value={value} placeholder="/uploads/… 사이트 경로" onChange={(e) => onChange(e.target.value.trim())} aria-label={`${label} 경로`} />
          {value && (
            <button type="button" className="btn-row" onClick={() => onChange('')}>
              지우기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function GalleryField({ value, onChange, ctx }: { value: string[]; onChange: (v: string[]) => void; ctx: AssetCtx }) {
  const [add, setAdd] = useState('');
  return (
    <div className="f">
      <span>현장 사진 (본문 아래에 차례로 표시)</span>
      <ul className="gallery">
        {value.map((g, i) => (
          <li key={`${g}-${i}`}>
            <img src={displayUrl(g, ctx)} alt="" />
            <div className="gallery-btns">
              <button type="button" className="btn-row" disabled={i === 0} aria-label="앞으로" onClick={() => onChange(move(value, i, -1))}>
                ↑
              </button>
              <button type="button" className="btn-row" disabled={i === value.length - 1} aria-label="뒤로" onClick={() => onChange(move(value, i, 1))}>
                ↓
              </button>
              <button type="button" className="btn-row" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                빼기
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="img-side">
        <input value={add} placeholder="/uploads/… 경로 추가" onChange={(e) => setAdd(e.target.value)} aria-label="현장 사진 경로 추가" />
        <button
          type="button"
          className="btn-row"
          disabled={!add.trim()}
          onClick={() => {
            onChange([...value, add.trim()]);
            setAdd('');
          }}
        >
          추가
        </button>
      </div>
    </div>
  );
}

export function PdfField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ctx: AssetCtx;
  required?: boolean;
}) {
  return (
    <label className="f">
      <span>
        {label} {required && <em>*</em>}
      </span>
      <input value={value} placeholder="/uploads/….pdf" onChange={(e) => onChange(e.target.value.trim())} />
    </label>
  );
}

function move<T>(arr: T[], i: number, d: number): T[] {
  const out = [...arr];
  const [x] = out.splice(i, 1);
  out.splice(i + d, 0, x);
  return out;
}
