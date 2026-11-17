// TipTap 확장 구성(편집기·HTML 왕복 검사 공통). 저장 형식은 HTML(body_format: html)
import { generateHTML, generateJSON, type Extensions } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { displayUrl, type AssetCtx } from '../assets';

/** 사진 표시 주소를 정할 때 쓰는 현재 글 정보(편집기 화면에서만 바꿔 보여 주고, 저장되는 src 는 그대로) */
export const assetRef: { current: AssetCtx | null } = { current: null };

const LinkX = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      download: { default: null },
    };
  },
});

const ImageX = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement('img');
      const sync = (n: typeof node) => {
        img.src = displayUrl(String(n.attrs.src ?? ''), assetRef.current);
        if (n.attrs.alt) img.alt = String(n.attrs.alt);
        else img.removeAttribute('alt');
      };
      sync(node);
      return {
        dom: img,
        update: (n) => {
          if (n.type !== node.type) return false;
          sync(n);
          return true;
        },
      };
    };
  },
});

export function extensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: false,
      underline: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      trailingNode: false, // 본문 끝에 빈 문단을 붙이지 않음(기존 HTML 보존)
    }),
    LinkX.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { target: null, rel: null, class: null },
    }),
    ImageX.configure({ inline: true, allowBase64: false }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ];
}

/** HTML 비교용 정규화: 속성 정렬, 공백 묶기, 공백뿐인 글자 무시 */
function canon(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.textContent ?? '').replace(/\s+/g, ' ');
      return t.trim() ? t : '';
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return '';
    const el = n as Element;
    const attrs = [...el.attributes]
      .map((a) => `${a.name}="${a.value.trim()}"`)
      .sort()
      .join(' ');
    return `<${el.tagName.toLowerCase()}${attrs ? ' ' + attrs : ''}>${[...el.childNodes].map(walk).join('')}</${el.tagName.toLowerCase()}>`;
  };
  return [...doc.body.childNodes].map(walk).join('');
}

/** 편집기가 이 HTML 을 손상 없이 담을 수 있는지. 아니면 이유(바뀌는 태그 예시)를 돌려준다 */
export function editorLoss(html: string): string | null {
  if (!html.trim()) return null;
  const ext = extensions();
  let out: string;
  try {
    out = generateHTML(generateJSON(html, ext), ext);
  } catch {
    return '편집기가 읽지 못하는 HTML';
  }
  const a = canon(html);
  const b = canon(out);
  if (a === b) return null;
  // 처음 다른 곳 근처의 태그 이름을 알려 준다
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const tag = /<([a-z0-9]+)[^>]*>?[^<]*$/i.exec(a.slice(0, i + 1))?.[1] ?? '';
  const attr = /\s(style|class|id|align|width|height|title|color|face|size)="/i.exec(a.slice(Math.max(0, i - 200), i + 200))?.[1];
  return [tag && `<${tag}>`, attr && `${attr} 속성`].filter(Boolean).join(', ') || '일부 서식';
}
