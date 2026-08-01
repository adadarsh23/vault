import React from 'react'
import { EditorContent, Editor } from '@tiptap/react'
import { cn } from '../../../lib/utils'

interface NoteEditorTiptapProps {
  editor: Editor | null
  lineWrap: boolean
  textAlign: 'left' | 'center' | 'right'
}

export const NoteEditorTiptap: React.FC<NoteEditorTiptapProps> = ({
  editor,
  lineWrap,
  textAlign,
}) => {
  if (!editor) return null

  return (
    <div
      className={cn(
        'relative flex-1 overflow-y-auto bg-text/[0.02] p-8 focus:outline-none min-h-[400px]',
        lineWrap ? 'whitespace-pre-wrap' : 'whitespace-pre',
        textAlign === 'center' ? 'text-center' : textAlign === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <EditorContent
        editor={editor}
        className="prose prose-invert max-w-none min-h-[300px] focus:outline-none focus-visible:outline-none prose-p:text-text/80 prose-headings:text-text prose-strong:text-emerald-400 prose-code:text-emerald-300 prose-ul:list-disc prose-ol:list-decimal"
      />
    </div>
  )
}
