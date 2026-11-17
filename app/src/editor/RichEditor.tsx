// 본문 편집기(시안 3): 굵게·기울임·소제목·목록·표·링크·사진·첨부, [편집기 ↔ HTML] 전환
// 원칙: 사용자가 실제로 고친 경우에만 onChange 를 부른다(열기만 하고 저장하면 본문 HTML 이 글자 그대로 유지됨)
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { editorLoss, extensions } from './extensions';

export type BodyMode = 'editor' | 'html';

interface Props {
  html: string;
  mode: BodyMode;
  onModeChange: (m: BodyMode) => void;
  onChange: (html: string) => void;
  /** 사진 파일 → 넣을 사이트 경로들(저장 때 올림). 없으면 사진 버튼 숨김 */
  onImages?: (files: File[]) => Promise<string[]>;
  /** 첨부 파일 → 본문에 넣을 링크들 */
  onFiles?: (files: File[]) => Promise<{ href: string; name: string; label: string }[]>;
  /** 바깥에서 본문을 바꿨을 때(첨부 삭제 등) 올리는 번호: 편집기 내용을 html 로 다시 맞춘다 */
  syncKey?: number;
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function RichEditor({ html, mode, onModeChange, onChange, onImages, onFiles, syncKey }: Props) {
  const imgInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const onImagesRef = useRef(onImages);
  useEffect(() => {
    onChangeRef.current = onChange;
    onImagesRef.current = onImages;
  });

  const editor = useEditor({
    extensions: extensions(),
    content: mode === 'editor' ? html : '',
    immediatelyRender: true,
    editorProps: {
      attributes: { class: 'rte-content', 'aria-label': '본문' },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length || !onImagesRef.current) return false;
        event.preventDefault();
        void insertImages(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length || !onImagesRef.current) return false;
        event.preventDefault();
        void insertImages(files);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => onChangeRef.current(ed.getHTML()),
  });

  const htmlRef = useRef(html);
  useEffect(() => {
    htmlRef.current = html;
  });
  useEffect(() => {
    if (editor && syncKey && mode === 'editor') editor.commands.setContent(htmlRef.current, { emitUpdate: false });
  }, [editor, syncKey, mode]);

  async function insertImages(files: File[]) {
    if (!editor || !onImagesRef.current) return;
    const paths = await onImagesRef.current(files);
    if (!paths.length) return;
    editor
      .chain()
      .focus()
      .insertContent(paths.map((src) => ({ type: 'image', attrs: { src, alt: '' } })))
      .run();
  }

  async function insertFiles(files: File[]) {
    if (!editor || !onFiles) return;
    const links = await onFiles(files);
    if (!links.length) return;
    editor
      .chain()
      .focus()
      .insertContent(
        links.map((l) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: l.label, marks: [{ type: 'link', attrs: { href: l.href, download: l.name } }] }],
        })),
      )
      .run();
  }

  const st = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            h3: e.isActive('heading', { level: 3 }),
            ul: e.isActive('bulletList'),
            ol: e.isActive('orderedList'),
            link: e.isActive('link'),
            table: e.isActive('table'),
          }
        : null,
  });

  function switchTo(next: BodyMode) {
    if (next === mode || !editor) return;
    if (next === 'editor') {
      const loss = editorLoss(html);
      if (
        loss &&
        !window.confirm(
          `이 본문에는 편집기가 그대로 담지 못하는 서식(${loss})이 있습니다.\n편집기로 바꾼 뒤 고쳐 저장하면 그 서식이 사라질 수 있습니다. 바꿀까요?\n(HTML 모드에서 고치면 원래 서식이 그대로 유지됩니다.)`,
        )
      )
        return;
      editor.commands.setContent(html, { emitUpdate: false });
    }
    onModeChange(next);
  }

  function setLink() {
    if (!editor) return;
    const prev = (editor.getAttributes('link').href as string | undefined) ?? '';
    const url = window.prompt('연결할 주소를 넣어 주세요(비우면 링크 삭제).', prev || 'https://');
    if (url === null) return;
    const u = url.trim();
    if (!u || u === 'https://') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else if (!/^(https?:\/\/|\/|mailto:|tel:)/i.test(u)) window.alert('주소는 https:// 또는 / 로 시작해야 합니다.');
    else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: u }).run();
      // 링크 글자 선택을 풀고 커서를 링크 끝으로(다음 입력이 링크 글자를 덮어쓰지 않게)
      editor.chain().focus().setTextSelection(editor.state.selection.to).unsetMark('link').run();
    }
  }

  const isEditor = mode === 'editor';
  const b = (on: boolean | undefined) => `tb-btn${on ? ' on' : ''}`;

  return (
    <div className="rte">
      <div
        className="rte-toolbar"
        role="toolbar"
        aria-label="본문 서식"
        // 버튼을 눌러도 편집기의 커서·선택 영역이 그대로 남게(포커스를 뺏지 않음)
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('button') && mode === 'editor') e.preventDefault();
        }}
      >
        {isEditor && editor && (
          <>
            <button type="button" className={b(st?.bold)} aria-label="굵게" aria-pressed={!!st?.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
              <b>B</b>
            </button>
            <button type="button" className={b(st?.italic)} aria-label="기울임" aria-pressed={!!st?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <i>I</i>
            </button>
            <button type="button" className={`${b(st?.h3)} tb-text`} aria-pressed={!!st?.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              소제목
            </button>
            <button type="button" className={b(st?.ul)} aria-label="목록" aria-pressed={!!st?.ul} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <Icon d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
            </button>
            <button type="button" className={b(st?.ol)} aria-label="번호 목록" aria-pressed={!!st?.ol} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <Icon d="M10 6h10M10 12h10M10 18h10M4 5h1v4M4 9h2M4 15h2l-2 3h2" />
            </button>
            <button
              type="button"
              className={b(st?.table)}
              aria-label="표 넣기"
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            >
              <Icon d="M3 4h18v16H3zM3 10h18M9 4v16" />
            </button>
            <button type="button" className={b(st?.link)} aria-label="링크" aria-pressed={!!st?.link} onClick={setLink}>
              <Icon d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
            </button>
            {onImages && (
              <button type="button" className="tb-btn" aria-label="사진 넣기" onClick={() => imgInput.current?.click()}>
                <Icon d="M3 5h18v14H3zM21 17l-5-5-9 7M9 11a2 2 0 100-.01" />
              </button>
            )}
            {onFiles && (
              <button type="button" className="tb-btn" aria-label="파일 첨부" onClick={() => fileInput.current?.click()}>
                <Icon d="M21 11.5l-8.5 8.5a5 5 0 01-7-7L14 4.5a3.5 3.5 0 015 5L10.5 18a2 2 0 01-3-3L15 7.5" />
              </button>
            )}
            {st?.table && (
              <span className="tb-table">
                <button type="button" className="tb-btn tb-text" onClick={() => editor.chain().focus().addRowAfter().run()}>
                  행 추가
                </button>
                <button type="button" className="tb-btn tb-text" onClick={() => editor.chain().focus().addColumnAfter().run()}>
                  열 추가
                </button>
                <button type="button" className="tb-btn tb-text" onClick={() => editor.chain().focus().deleteRow().run()}>
                  행 삭제
                </button>
                <button type="button" className="tb-btn tb-text" onClick={() => editor.chain().focus().deleteTable().run()}>
                  표 삭제
                </button>
              </span>
            )}
          </>
        )}
        {!isEditor && <span className="tb-note">HTML 을 직접 고칩니다. 저장하면 이 내용이 그대로 저장됩니다.</span>}
        <span className="tb-gap" />
        <div className="mode-switch" role="group" aria-label="편집 방식">
          <button type="button" className={isEditor ? 'on' : ''} aria-pressed={isEditor} onClick={() => switchTo('editor')}>
            편집기
          </button>
          <button type="button" className={!isEditor ? 'on' : ''} aria-pressed={!isEditor} onClick={() => switchTo('html')}>
            HTML
          </button>
        </div>
      </div>
      <div hidden={!isEditor}>
        <EditorContent editor={editor} />
      </div>
      {!isEditor && (
        <textarea
          className="rte-html"
          aria-label="본문 HTML"
          spellCheck={false}
          value={html}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <input
        ref={imgInput}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void insertImages(files);
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.hwp,.hwpx,.docx,.xlsx,.zip"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void insertFiles(files);
        }}
      />
    </div>
  );
}
