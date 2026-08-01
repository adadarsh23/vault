export interface NoteEditorProps {
  initialTitle: string;
  initialContent: string;
  onSave: (title: string, content: string) => Promise<void>;
  onCancel: () => void;
}

export interface HistoryState {
  title: string;
  content: string;
}

export interface MatchRange {
  start: number;
  end: number;
}

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export type TextAlign = 'left' | 'center' | 'right';
