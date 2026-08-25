import React, { useRef, useState, useMemo, useEffect } from 'react';
import { cn } from '../../../../lib/utils';
import { Button } from '../../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/Card';
import {
  Copy,
  Check,
  Edit2,
  Trash2,
  ChevronLeft,
  Calendar,
  Clock,
  ShieldCheck,
  ChevronUp,
  FileText,
  Globe,
  Tag,
  Plus,
  X,
  Image,
  Loader2,
  Download,
  Paperclip,
  AlignLeft,
  BookOpen,
  Folder,
  Pin,
  Code,
  Link,
  CheckSquare,
  HardDrive,
  List,
} from 'lucide-react';
import { useVaultStore } from '../../../../store/vaultStore';
import { getVaultItemPreviewUrl } from '../../../../lib/filePreview';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { GlobalNavigator } from '../../../../components/vault/GlobalNavigator';
import { NoteEditor } from '../../../../components/vault/NoteEditor';
import { ScrollButton } from '../../../../components/vault/ScrollButton';
import { getStringContent } from '../../../../lib/vaultItemContent';
import { DecryptedMarkdown } from '../../../../components/vault/DecryptedMarkdown';
import { TagManager } from '../../../../components/vault/TagManager';
import { useScrollRestoration } from '../../../../hooks/useScrollRestoration';
import { ForensicWatermark } from '../../../../components/security/ForensicWatermark';

const AttachmentCard: React.FC<{
  item: any;
  masterKey?: string | CryptoKey | null;
  onUnlink: (id: string) => void;
  onPreview: (item: any) => void;
}> = ({ item, masterKey, onUnlink, onPreview }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item.type !== 'photo') return;
    let active = true;
    const getThumb = async () => {
      setLoading(true);
      try {
        const url = await getVaultItemPreviewUrl(item, masterKey, 'image/jpeg');
        if (active) setThumbUrl(url);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    };
    getThumb();
    return () => {
      active = false;
      if (thumbUrl && thumbUrl.startsWith('blob:')) {
        URL.revokeObjectURL(thumbUrl);
      }
    };
  }, [item, masterKey]);

  return (
    <div className="flex items-center justify-between p-2 rounded-xl border border-card-border bg-card-bg/40 hover:bg-card-bg/80 transition-all duration-300 hover:border-text/10 group shadow-sm">
      <button
        onClick={() => onPreview(item)}
        className="flex items-center gap-2.5 text-left min-w-0 flex-1"
      >
        {item.type === 'photo' ? (
          <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 overflow-hidden">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
            ) : thumbUrl ? (
              <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Image className="h-4.5 w-4.5 text-blue-400" />
            )}
          </div>
        ) : (
          <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <FileText className="h-4.5 w-4.5 text-indigo-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-text truncate group-hover:text-yellow-400 transition-colors">
            {item.title}
          </p>
          <p className="text-[9px] text-text/40 capitalize">{item.type}</p>
        </div>
      </button>
      <button
        onClick={() => onUnlink(item.id)}
        className="text-text/30 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-400/10 transition-all shrink-0 ml-1"
        title="Unlink attachment"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export interface NoteViewerProps {
  selectedNoteId: string | null;
  selectedNote: any;
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
  setSelectedNoteId: (id: string | null) => void;
  editTitle: string;
  editContent: string;
  handleSave: (title: string, content: string) => Promise<void>;
  hasPreviousNote: boolean;
  hasNextNote: boolean;
  goToPreviousNote: () => void;
  goToNextNote: () => void;
  handleCopy: () => void;
  copiedId: string | null;
  startEditing: () => void;
  handleDelete: (id: string, title: string) => void;
  masterKey: string | CryptoKey | null;
}

export const NoteViewer: React.FC<NoteViewerProps> = ({
  selectedNoteId,
  selectedNote,
  isEditing,
  setIsEditing,
  setSelectedNoteId,
  editTitle,
  editContent,
  handleSave,
  hasPreviousNote,
  hasNextNote,
  goToPreviousNote,
  goToNextNote,
  handleCopy,
  copiedId,
  startEditing,
  handleDelete,
  masterKey,
}) => {
  const [showViewScrollTop, setShowViewScrollTop] = useState(false);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [isIdCopied, setIsIdCopied] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  useScrollRestoration(`note_viewer_${selectedNoteId || 'default'}`, viewRef);

  // Tags & Attachments state
  const { items, updateItem } = useVaultStore();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [previewAttachmentItem, setPreviewAttachmentItem] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Safe tags list
  const noteTags = useMemo<string[]>(() => {
    return Array.isArray(selectedNote?.metadata?.tags) ? selectedNote.metadata.tags : [];
  }, [selectedNote]);

  // Safe attachments list
  const attachmentIds = useMemo<string[]>(() => {
    return Array.isArray(selectedNote?.metadata?.attachments)
      ? selectedNote.metadata.attachments
      : [];
  }, [selectedNote]);

  const attachedItems = useMemo(() => {
    return items.filter((item) => attachmentIds.includes(item.id));
  }, [items, attachmentIds]);

  // Content statistics (words, chars, lines, read time, size, code blocks, links, checklists)
  const contentStats = useMemo(() => {
    const text = getStringContent(selectedNote?.content) || '';
    const charCount = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    const lines = text ? text.split('\n').length : 0;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 200));

    const byteSize = new Blob([text]).size;
    const formattedSize = byteSize < 1024 ? `${byteSize} B` : `${(byteSize / 1024).toFixed(1)} KB`;

    const codeBlockMatches = text.match(/```[a-z]*[\s\S]*?```/gi);
    const codeBlockCount = codeBlockMatches ? codeBlockMatches.length : 0;

    const linkMatches = text.match(/https?:\/\/[^\s<)]+/gi);
    const linkCount = linkMatches ? linkMatches.length : 0;

    const totalCheckboxes = (text.match(/- \[[ xX]\]/g) || []).length;
    const completedCheckboxes = (text.match(/- \[[xX]\]/g) || []).length;

    return {
      charCount,
      words,
      lines,
      readTimeMinutes,
      formattedSize,
      codeBlockCount,
      linkCount,
      totalCheckboxes,
      completedCheckboxes,
    };
  }, [selectedNote?.content]);

  // All files that can be attached
  const attachableFiles = useMemo(() => {
    const queryLower = pickerSearch.toLowerCase().trim();
    return items
      .filter(
        (item) =>
          (item.type === 'photo' || item.type === 'document') && !attachmentIds.includes(item.id)
      )
      .filter((item) => item.title.toLowerCase().includes(queryLower));
  }, [items, attachmentIds, pickerSearch]);

  // Handlers

  const handleLinkAttachment = async (itemId: string) => {
    const updatedAttachments = [...attachmentIds, itemId];
    const updatedMetadata = {
      ...(selectedNote.metadata || {}),
      attachments: updatedAttachments,
    };

    try {
      await updateItem(selectedNote.id, { metadata: updatedMetadata });
      toast.success('File attached to note');
    } catch {
      toast.error('Failed to attach file');
    }
  };

  const handleUnlinkAttachment = async (itemId: string) => {
    const updatedAttachments = attachmentIds.filter((id) => id !== itemId);
    const updatedMetadata = {
      ...(selectedNote.metadata || {}),
      attachments: updatedAttachments,
    };

    try {
      await updateItem(selectedNote.id, { metadata: updatedMetadata });
      toast.success('Attachment unlinked');
    } catch {
      toast.error('Failed to unlink attachment');
    }
  };

  const handlePreviewAttachment = async (item: any) => {
    setPreviewAttachmentItem(item);
    setIsPreviewLoading(true);
    setPreviewUrl(null);

    try {
      const mime = item.type === 'photo' ? 'image/jpeg' : 'text/plain';
      const url = await getVaultItemPreviewUrl(item, masterKey, mime);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Error generating preview', err);
      toast.error('Failed to generate preview');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewAttachmentItem(null);
    setPreviewUrl(null);
  };

  // Keep editor outside animated note viewer tree to avoid remounts during
  // store updates (e.g. autosave updating note metadata).
  if (selectedNote && isEditing) {
    return (
      <div className={cn('flex-1 min-w-0 h-full', !selectedNoteId ? 'hidden md:block' : 'block')}>
        <div className="h-full w-full self-start">
          <NoteEditor
            noteId={selectedNote.id}
            initialTitle={editTitle}
            initialContent={editContent}
            onSave={handleSave}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex-1 min-w-0 h-full', !selectedNoteId ? 'hidden md:block' : 'block')}>
      <AnimatePresence mode="wait">
        {selectedNote ? (
          <motion.div
            key={selectedNote.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="h-full flex flex-col justify-start"
          >
            {!isEditing ? (
              <Card className="flex h-full flex-col border-none bg-card-bg/30 shadow-none overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between border-b border-card-border py-3 md:py-4 px-4 xl:px-6 transition-colors gap-2">
                  <div className="flex-1 min-w-0 mr-2 md:mr-4 flex items-center gap-2 md:gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedNoteId(null)}
                      className="md:hidden h-8 w-8 -ml-2 shrink-0 text-text/60 hover:text-white"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <CardTitle className="text-lg md:text-2xl text-text truncate transition-colors font-bold tracking-tight">
                      {selectedNote.title}
                    </CardTitle>
                  </div>

                  <div className="flex items-center gap-1 md:gap-2 shrink-0">
                    <GlobalNavigator
                      canPrevious={hasPreviousNote}
                      canNext={hasNextNote}
                      onPrevious={goToPreviousNote}
                      onNext={goToNextNote}
                      layout="inline"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCopy}
                      className="h-9 w-9"
                      title="Copy Content"
                    >
                      {copiedId === selectedNote.id ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant={showHtmlPreview ? 'secondary' : 'ghost'}
                      size="icon"
                      onClick={() => setShowHtmlPreview(!showHtmlPreview)}
                      className="h-9 w-9"
                      title="Toggle HTML View"
                    >
                      <Globe className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={startEditing}
                      className="h-8 w-8 md:h-9 md:w-9"
                      title="Edit Note"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(selectedNote.id, selectedNote.title)}
                      className="h-9 w-9 text-text/40 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 relative p-0 overflow-hidden">
                  <div
                    ref={viewRef}
                    className="h-full overflow-y-auto custom-scrollbar flex flex-col justify-between"
                    onScroll={(e) => setShowViewScrollTop(e.currentTarget.scrollTop > 100)}
                  >
                    <div>
                      {/* Tags Section */}
                      <div className="px-4 md:px-6 xl:px-8 pt-4">
                        <TagManager item={selectedNote} showLabel size="sm" />
                      </div>

                      {/* Attachments Section */}
                      <div className="px-4 md:px-6 xl:px-8 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5 text-text/45 text-xs font-semibold">
                            <Paperclip className="h-3.5 w-3.5" />
                            <span>Attachments ({attachedItems.length})</span>
                          </div>
                          <button
                            onClick={() => setIsPickerOpen(true)}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-text/5 border border-text/10 hover:bg-text/10 text-text/60 hover:text-text transition-colors"
                          >
                            <Plus className="h-3 w-3" /> Attach File
                          </button>
                        </div>
                        {attachedItems.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                            {attachedItems.map((item) => (
                              <AttachmentCard
                                key={item.id}
                                item={item}
                                masterKey={masterKey}
                                onUnlink={handleUnlinkAttachment}
                                onPreview={handlePreviewAttachment}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Note Content */}
                      <div
                        className={cn(
                          'p-4 md:p-6 xl:p-8 prose prose-invert max-w-none transition-colors prose-pre:bg-bg/50 prose-pre:border prose-pre:border-card-border',
                          showHtmlPreview ? 'p-0' : ''
                        )}
                      >
                        <DecryptedMarkdown
                          content={getStringContent(selectedNote.content) || ''}
                          masterKey={masterKey}
                          showHtmlPreview={showHtmlPreview}
                        />
                      </div>
                    </div>

                    <motion.div
                      className="flex items-center justify-between gap-4 px-4 xl:px-6 py-3 border-t border-card-border bg-white/[0.01] mt-auto w-full overflow-x-auto custom-scrollbar whitespace-nowrap"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                      <div className="flex items-center gap-4 md:gap-5 shrink-0">
                        <div
                          className="flex items-center gap-2 text-[11px] text-text/40 font-medium shrink-0"
                          title="Date Created"
                        >
                          <Calendar className="h-3.5 w-3.5 text-yellow-400/50 shrink-0" />
                          <span>
                            <span className="text-text/60">
                              {new Date(selectedNote.createdAt).toLocaleDateString()}
                            </span>
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-2 text-[11px] text-text/40 font-medium shrink-0"
                          title="Last Updated"
                        >
                          <Clock className="h-3.5 w-3.5 text-yellow-400/50 shrink-0" />
                          <span>
                            <span className="text-text/60">
                              {new Date(selectedNote.updatedAt).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </span>
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-2 text-[11px] text-text/40 font-medium shrink-0"
                          title="Word & character count"
                        >
                          <AlignLeft className="h-3.5 w-3.5 text-yellow-400/50 shrink-0" />
                          <span>
                            <span className="text-text/60">{contentStats.words}</span> words (
                            {contentStats.charCount} chars)
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-2 text-[11px] text-text/40 font-medium shrink-0"
                          title="Line count"
                        >
                          <List className="h-3.5 w-3.5 text-yellow-400/50 shrink-0" />
                          <span>
                            <span className="text-text/60">{contentStats.lines}</span> lines
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-2 text-[11px] text-text/40 font-medium shrink-0"
                          title="Estimated reading time"
                        >
                          <BookOpen className="h-3.5 w-3.5 text-yellow-400/50 shrink-0" />
                          <span>
                            <span className="text-text/60">
                              ~{contentStats.readTimeMinutes} min
                            </span>{' '}
                            read
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-2 text-[11px] text-text/40 font-medium shrink-0"
                          title="Unencrypted text size"
                        >
                          <HardDrive className="h-3.5 w-3.5 text-yellow-400/50 shrink-0" />
                          <span>
                            <span className="text-text/60">{contentStats.formattedSize}</span>
                          </span>
                        </div>
                        {contentStats.totalCheckboxes > 0 && (
                          <div
                            className="flex items-center gap-1.5 text-[11px] text-text/40 font-medium shrink-0"
                            title="Checklist progress"
                          >
                            <CheckSquare className="h-3.5 w-3.5 text-yellow-400/50 shrink-0" />
                            <span>
                              <span className="text-text/60">
                                {contentStats.completedCheckboxes}/{contentStats.totalCheckboxes}
                              </span>{' '}
                              tasks (
                              {Math.round(
                                (contentStats.completedCheckboxes / contentStats.totalCheckboxes) *
                                  100
                              )}
                              %)
                            </span>
                          </div>
                        )}
                        {contentStats.codeBlockCount > 0 && (
                          <div
                            className="flex items-center gap-1.5 text-[11px] text-text/40 font-medium shrink-0"
                            title="Code blocks"
                          >
                            <Code className="h-3.5 w-3.5 text-yellow-400/50 shrink-0" />
                            <span>
                              <span className="text-text/60">{contentStats.codeBlockCount}</span>{' '}
                              code block{contentStats.codeBlockCount > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        {contentStats.linkCount > 0 && (
                          <div
                            className="flex items-center gap-1.5 text-[11px] text-text/40 font-medium shrink-0"
                            title="Embedded links"
                          >
                            <Link className="h-3.5 w-3.5 text-yellow-400/50 shrink-0" />
                            <span>
                              <span className="text-text/60">{contentStats.linkCount}</span> link
                              {contentStats.linkCount > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        {selectedNote.folder && (
                          <div
                            className="flex items-center gap-1.5 text-[11px] text-text/40 font-medium shrink-0"
                            title="Folder"
                          >
                            <Folder className="h-3.5 w-3.5 text-yellow-400/50 shrink-0" />
                            <span className="text-yellow-400/80 font-semibold uppercase tracking-wider text-[10px]">
                              {selectedNote.folder}
                            </span>
                          </div>
                        )}
                        {noteTags.length > 0 && (
                          <div
                            className="flex items-center gap-1.5 text-[11px] text-text/40 font-medium shrink-0"
                            title="Tags count"
                          >
                            <Tag className="h-3.5 w-3.5 text-yellow-400/50 shrink-0" />
                            <span>
                              <span className="text-text/60">{noteTags.length}</span> tag
                              {noteTags.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        {attachedItems.length > 0 && (
                          <div
                            className="flex items-center gap-1.5 text-[11px] text-text/40 font-medium shrink-0"
                            title="Attachments count"
                          >
                            <Paperclip className="h-3.5 w-3.5 text-yellow-400/50 shrink-0" />
                            <span>
                              <span className="text-text/60">{attachedItems.length}</span>{' '}
                              attachment
                              {attachedItems.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {selectedNote.isPinned && (
                          <div
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold shrink-0"
                            title="Pinned Note"
                          >
                            <Pin className="h-3 w-3 fill-current" />
                            <span className="leading-none text-[9px] uppercase tracking-wider">
                              Pinned
                            </span>
                          </div>
                        )}
                        <div
                          className="group flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/5 border border-yellow-500/10 shadow-inner max-w-[200px] shrink-0"
                          title={selectedNote.id}
                        >
                          <span className="text-[10px] text-yellow-400/70 font-bold uppercase tracking-[0.2em] block max-w-[120px] truncate">
                            ID: {selectedNote.id}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(selectedNote.id);
                              setIsIdCopied(true);
                              toast.success('Note ID copied to clipboard');
                              setTimeout(() => setIsIdCopied(false), 2000);
                            }}
                            className="shrink-0 opacity-100 group-hover:opacity-100 transition-opacity text-yellow-400/70 hover:text-yellow-400 focus:outline-none focus:opacity-100"
                            title="Copy Note ID"
                          >
                            {isIdCopied ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                        <motion.div
                          initial={{ opacity: 0.7 }}
                          animate={{ opacity: 1 }}
                          transition={{
                            repeat: Infinity,
                            duration: 2,
                            repeatType: 'reverse',
                          }}
                          title="End-to-end encrypted with AES-256-GCM"
                          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-bold cursor-help shadow-lg shadow-yellow-500/10 shrink-0"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          <span className="leading-none text-[9px] uppercase tracking-wider">
                            Secure 256
                          </span>
                        </motion.div>
                      </div>
                    </motion.div>
                  </div>

                  <ScrollButton
                    icon={ChevronUp}
                    visible={showViewScrollTop}
                    ariaLabel="Scroll to top"
                    onClick={() => viewRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="bottom-6 right-8"
                  />
                </CardContent>
              </Card>
            ) : null}
          </motion.div>
        ) : (
          <div className="h-full overflow-y-auto custom-scrollbar rounded-3xl border border-card-border bg-card-bg/20 transition-colors">
            <div className="flex min-h-full items-center justify-center pt-40 pb-40">
              <div className="text-center group">
                <div className="mb-6 relative">
                  <FileText className="mx-auto h-16 w-16 text-text/5 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />
                  <div className="absolute inset-0 bg-yellow-400/5 blur-3xl rounded-full" />
                </div>
                <p className="text-text/30 font-medium transition-colors">
                  Select a note to view or edit
                </p>
                <p className="mt-2 text-[10px] text-text/20 uppercase tracking-widest transition-colors">
                  Vault Secure Editor
                </p>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
      {/* Attachment Picker Modal */}
      {isPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-card-border pb-3">
              <h3 className="text-base font-bold text-text">Attach File from Vault</h3>
              <button
                onClick={() => setIsPickerOpen(false)}
                className="text-text/40 hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <input
              type="text"
              placeholder="Search files..."
              className="w-full h-10 rounded-md border border-card-border bg-card-bg/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-text/25"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
            />

            <div className="max-h-[250px] overflow-y-auto custom-scrollbar space-y-1">
              {attachableFiles.length > 0 ? (
                attachableFiles.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => {
                      handleLinkAttachment(file.id);
                      setIsPickerOpen(false);
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 text-left transition-colors"
                  >
                    {file.type === 'photo' ? (
                      <Image className="h-4 w-4 text-blue-400 shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-text truncate">{file.title}</span>
                  </button>
                ))
              ) : (
                <p className="text-xs text-text/30 italic text-center py-4">
                  No attachable documents or photos found.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attachment Preview Modal */}
      {previewAttachmentItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-3xl bg-card-bg border border-card-border rounded-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-4 border-b border-card-border shrink-0">
              <h3 className="text-sm font-bold text-text truncate">
                {previewAttachmentItem.title}
              </h3>
              <div className="flex items-center gap-2">
                {previewUrl && (
                  <a
                    href={previewUrl}
                    download={previewAttachmentItem.title}
                    className="p-2 rounded-lg bg-text/5 hover:bg-text/10 text-text/75 hover:text-text transition-colors"
                    title="Download File"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                <button
                  onClick={closePreview}
                  className="p-2 rounded-lg text-text/40 hover:text-text transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="relative flex-1 overflow-auto flex items-center justify-center p-6 bg-black/10 vault-print-protected">
              {isPreviewLoading ? (
                <div className="flex flex-col items-center gap-2 text-text/45">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span className="text-xs">Decrypting attachment...</span>
                </div>
              ) : previewUrl ? (
                previewAttachmentItem.type === 'photo' ? (
                  <div className="relative max-h-[60vh] max-w-full flex items-center justify-center overflow-hidden rounded-lg">
                    <img
                      src={previewUrl}
                      alt={previewAttachmentItem.title || 'Attachment preview'}
                      className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-lg vault-print-protected"
                    />
                    <ForensicWatermark
                      opacity={0.14}
                      angle={-25}
                      density="standard"
                      classification="VAULT ATTACHMENT // CONFIDENTIAL"
                    />
                  </div>
                ) : (
                  <iframe
                    src={previewUrl}
                    title="Document Preview"
                    className="w-full h-[55vh] border-none bg-white rounded-lg vault-print-protected"
                  />
                )
              ) : (
                <p className="text-xs text-red-400">Failed to load preview for this file type.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
