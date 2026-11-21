'use client';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Italic, List, ListOrdered, Quote, Redo2, Strikethrough, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

const extensions = [StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false })];

/** Essay editor (SUB-07). Stores Tiptap JSON; the server re-sanitizes against an allow-list. */
export function RichTextEditor({ value, onChange, disabled, placeholder = 'Nhập bài làm…' }: { value?: JSONContent | null; onChange: (doc: JSONContent, text: string) => void; disabled?: boolean; placeholder?: string }) {
  const editor = useEditor({
    extensions,
    content: value ?? '',
    editable: !disabled,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'prose-answer px-4 py-3 text-[15px] leading-relaxed', 'aria-label': placeholder, 'data-placeholder': placeholder } },
    onUpdate: ({ editor: e }) => onChange(e.getJSON(), e.getText()),
  });
  useEffect(() => { editor?.setEditable(!disabled); }, [disabled, editor]);
  const btn = (active: boolean, onClick: () => void, label: string, Icon: typeof Bold) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={active}
      className={cn('rounded-lg p-1.5 text-ink-muted hover:bg-slate-100 disabled:opacity-40', active && 'bg-primary-soft text-primary')}><Icon className="h-4 w-4" /></button>
  );
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-ring', disabled && 'bg-slate-50')}>
      <div className="flex flex-wrap gap-0.5 border-b border-line px-2 py-1.5">
        {editor && <>
          {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'In đậm', Bold)}
          {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'In nghiêng', Italic)}
          {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'Gạch ngang', Strikethrough)}
          {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Tiêu đề', Heading2)}
          {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Danh sách', List)}
          {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Danh sách số', ListOrdered)}
          {btn(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), 'Trích dẫn', Quote)}
          <span className="mx-1 w-px bg-line" />
          {btn(false, () => editor.chain().focus().undo().run(), 'Hoàn tác', Undo2)}
          {btn(false, () => editor.chain().focus().redo().run(), 'Làm lại', Redo2)}
        </>}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

/** Read-only renderer for a sanitized Tiptap document (no HTML strings involved). */
export function RichTextView({ doc, text }: { doc?: JSONContent | null; text?: string | null }) {
  const editor = useEditor({ extensions, content: doc ?? text ?? '', editable: false, immediatelyRender: false, editorProps: { attributes: { class: 'prose-answer text-[15px] leading-relaxed' } } }, [doc, text]);
  if (!doc && !text) return <span className="text-ink-faint">(Không trả lời)</span>;
  return <EditorContent editor={editor} />;
}
