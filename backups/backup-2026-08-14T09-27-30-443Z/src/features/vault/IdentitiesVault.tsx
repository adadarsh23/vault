import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { SearchInput } from '../../components/ui/SearchInput';
import {
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Search,
  Check,
  Edit2,
  Save,
  X,
  Fingerprint,
  AlertTriangle,
  Menu,
  Folder,
  Loader2,
  Pin,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { useVaultStore } from '../../store/vaultStore';
import { VaultItem } from '../../lib/storage';
import { encryptData, decryptData } from '../../lib/cryptoPrimitives';
import { useClipboard } from '../../hooks/useClipboard';
import { motion, AnimatePresence } from 'framer-motion';
import { getStringContent, parseJsonSafely } from '../../lib/vaultItemContent';
import { logActivity } from '../../lib/activity';
import { setDraggedVaultItem } from '../../lib/vaultDragDrop';

import { FolderSidebar } from '../../components/vault/FolderSidebar';
import { MobileFolderMenu } from '../../components/vault/MobileFolderMenu';
import { useVaultFolders } from '../../hooks/useVaultFolders';

interface IdentityPayload {
  fullName: string;
  documentType: 'Passport' | 'Driver License' | 'National ID' | 'Social Security' | 'Other';
  number: string;
  issueDate: string;
  expiryDate: string;
  issuingCountry: string;
  notes: string;
}

const emptyPayload = (): IdentityPayload => ({
  fullName: '',
  documentType: 'Passport',
  number: '',
  issueDate: '',
  expiryDate: '',
  issuingCountry: '',
  notes: '',
});

const DecryptedIdentityItem: React.FC<{
  item: VaultItem;
  masterKey: string | CryptoKey;
  onUpdate: (id: string, name: string, payload: IdentityPayload) => Promise<void>;
  onDelete: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  isPinning: boolean;
}> = React.memo(({ item, masterKey, onUpdate, onDelete, onTogglePin, isPinning }) => {
  const [data, setData] = useState<IdentityPayload | null>(null);
  const [error, setError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.title);
  const [editPayload, setEditPayload] = useState<IdentityPayload>(emptyPayload());
  const { copy, copiedId } = useClipboard();

  const updateItem = useVaultStore((state) => state.updateItem);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  const tags = useMemo<string[]>(() => {
    return Array.isArray(item.metadata?.tags) ? item.metadata.tags : [];
  }, [item]);

  const handleAddTag = async () => {
    const cleaned = newTagInput
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '');
    if (!cleaned) {
      setIsAddingTag(false);
      setNewTagInput('');
      return;
    }
    if (tags.includes(cleaned)) {
      toast.error('Tag already exists');
      setIsAddingTag(false);
      setNewTagInput('');
      return;
    }
    const updated = [...tags, cleaned];
    try {
      await updateItem(item.id, {
        metadata: { ...(item.metadata || {}), tags: updated },
      });
      toast.success(`Tag #${cleaned} added`);
    } catch {
      toast.error('Failed to add tag');
    } finally {
      setIsAddingTag(false);
      setNewTagInput('');
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const updated = tags.filter((t) => t !== tagToRemove);
    try {
      await updateItem(item.id, {
        metadata: { ...(item.metadata || {}), tags: updated },
      });
      toast.success(`Tag #${tagToRemove} removed`);
    } catch {
      toast.error('Failed to remove tag');
    }
  };

  useEffect(() => {
    let isMounted = true;
    const decrypt = async () => {
      try {
        const encryptedContent = getStringContent(item.content);
        if (!encryptedContent) {
          if (isMounted) setError(true);
          return;
        }

        const decrypted = await decryptData(encryptedContent, masterKey);
        if (!decrypted || !isMounted) {
          if (isMounted) setError(true);
          return;
        }

        const parsed = parseJsonSafely<IdentityPayload>(decrypted);
        if (!parsed) {
          if (isMounted) setError(true);
          return;
        }

        setData(parsed);
        setEditPayload(parsed);
      } catch (err) {
        console.error('Identity Decryption Error:', err);
        if (isMounted) setError(true);
      }
    };

    decrypt();
    return () => {
      isMounted = false;
    };
  }, [item.content, masterKey]);

  const handleCopy = (text: string, id: string, label: string) => {
    copy(text, id);
    toast.success(`${label} copied to clipboard`);
    logActivity({
      actionType: 'copy_value',
      itemName: item.title,
      description: `${label} copied`,
      status: 'success',
    });
  };

  const handleSave = async () => {
    try {
      await onUpdate(item.id, editName, editPayload);
      setIsEditing(false);
      logActivity({
        actionType: 'item_update',
        itemName: editName,
        description: 'Identity details updated',
        status: 'success',
      });
    } catch (err) {
      logActivity({
        actionType: 'item_update',
        itemName: editName,
        description: 'Identity details update failed',
        status: 'failure',
      });
    }
  };

  if (error) {
    return (
      <Card className="border-red-500/20 bg-red-400/5 p-4 flex flex-col items-center gap-2">
        <AlertTriangle className="h-6 w-6 text-red-400" />
        <p className="text-xs text-red-300">Decryption Error</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(item.id, item.title)}
          className="text-red-400/60 hover:text-red-400"
        >
          Delete
        </Button>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="border-white/5 bg-white/[0.02] p-6 animate-pulse flex flex-col gap-4">
        <div className="h-32 w-full bg-white/5 rounded-xl" />
        <div className="h-10 w-full bg-white/5 rounded-xl" />
      </Card>
    );
  }

  const getDocColor = (type: string) => {
    switch (type) {
      case 'Passport':
        return 'from-blue-600 to-indigo-900 border-blue-500/30';
      case 'Driver License':
        return 'from-emerald-600 to-teal-900 border-emerald-500/30';
      case 'National ID':
        return 'from-violet-600 to-purple-900 border-violet-500/30';
      case 'Social Security':
        return 'from-amber-600 to-orange-900 border-amber-500/30';
      default:
        return 'from-slate-600 to-slate-800 border-slate-500/30';
    }
  };

  return (
    <motion.div whileHover={{ y: -5 }} className="h-full">
      <Card className="group relative h-full overflow-hidden border-white/5 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-md transition-all hover:border-white/20 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl transition-opacity group-hover:opacity-30" />

        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 relative z-10 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 transition-transform group-hover:scale-110 group-hover:rotate-3">
              <Fingerprint className="h-5 w-5 text-indigo-400" />
            </div>
            {isEditing ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 py-0 px-2 text-sm bg-white/5 border-white/10"
                autoFocus
              />
            ) : (
              <div className="flex flex-col">
                <CardTitle className="text-base font-bold text-text truncate max-w-[150px]">
                  {item.title}
                </CardTitle>
                <span className="text-[9px] font-bold text-indigo-400/60 uppercase tracking-wider">
                  {data.documentType}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-1 relative z-20 sm:opacity-0 group-hover:opacity-100 transition-opacity">
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-white/10"
                  onClick={() => setIsEditing(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-indigo-400/20 text-indigo-400"
                  onClick={handleSave}
                >
                  <Save className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-white/10 text-text/20 hover:text-text/60 transition-colors"
                  onClick={() => {
                    setEditPayload(data);
                    setIsEditing(true);
                  }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isPinning}
                  className={`h-8 w-8 rounded-full ${item.isPinned ? 'text-indigo-400 hover:bg-indigo-400/20' : 'text-text/20 hover:text-text/60 hover:bg-white/10'} transition-colors`}
                  onClick={() => onTogglePin(item.id)}
                >
                  {isPinning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Pin className={`h-3.5 w-3.5 ${item.isPinned ? 'fill-current' : ''}`} />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-red-400/20 text-text/20 hover:text-red-400 transition-colors"
                  onClick={() => onDelete(item.id, item.title)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-4 pt-4 relative z-10">
          {item.folder && (
            <div className="inline-flex max-w-full items-center rounded-full border border-indigo-400/15 bg-indigo-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300/80">
              <Folder className="h-3 w-3 mr-1.5 text-indigo-400/80" />
              <span className="truncate">{item.folder}</span>
            </div>
          )}

          {isEditing ? (
            <div className="space-y-3">
              <select
                value={editPayload.documentType}
                onChange={(e: any) =>
                  setEditPayload({
                    ...editPayload,
                    documentType: e.target.value,
                  })
                }
                className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-text focus:outline-none focus:border-white/20 appearance-none"
              >
                <option value="Passport" className="bg-bg text-text">
                  Passport
                </option>
                <option value="Driver License" className="bg-bg text-text">
                  Driver's License
                </option>
                <option value="National ID" className="bg-bg text-text">
                  National ID Card
                </option>
                <option value="Social Security" className="bg-bg text-text">
                  Social Security Number
                </option>
                <option value="Other" className="bg-bg text-text">
                  Other ID
                </option>
              </select>
              <Input
                placeholder="Full Name"
                value={editPayload.fullName}
                onChange={(e) => setEditPayload({ ...editPayload, fullName: e.target.value })}
              />
              <Input
                placeholder="Document Number"
                value={editPayload.number}
                onChange={(e) => setEditPayload({ ...editPayload, number: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Issue Date"
                  value={editPayload.issueDate}
                  onChange={(e) =>
                    setEditPayload({
                      ...editPayload,
                      issueDate: e.target.value,
                    })
                  }
                />
                <Input
                  placeholder="Expiry Date"
                  value={editPayload.expiryDate}
                  onChange={(e) =>
                    setEditPayload({
                      ...editPayload,
                      expiryDate: e.target.value,
                    })
                  }
                />
              </div>
              <Input
                placeholder="Issuing Country"
                value={editPayload.issuingCountry}
                onChange={(e) =>
                  setEditPayload({
                    ...editPayload,
                    issuingCountry: e.target.value,
                  })
                }
              />
              <textarea
                placeholder="Additional notes..."
                value={editPayload.notes}
                onChange={(e) => setEditPayload({ ...editPayload, notes: e.target.value })}
                className="w-full h-16 px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-text focus:outline-none focus:border-white/20"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Document Banner Mock UI */}
              <div
                className={`p-4 rounded-2xl bg-gradient-to-br ${getDocColor(data.documentType)} border flex flex-col justify-between h-[150px] shadow-lg text-white`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="text-[10px] tracking-wider text-white/70 font-semibold uppercase">
                      {data.issuingCountry || 'ISSUING AUTHORITY'}
                    </span>
                    <span className="text-[8px] text-white/50 font-bold uppercase">
                      {data.documentType}
                    </span>
                  </div>
                  <Fingerprint className="h-6 w-6 text-white/40" />
                </div>

                <div className="my-1.5 flex gap-3 items-center">
                  <div className="w-9 h-11 bg-white/10 border border-white/10 rounded flex items-center justify-center text-white/25">
                    ID
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[8px] text-white/40 uppercase font-bold tracking-widest leading-none">
                      Full Name
                    </span>
                    <span className="text-xs font-semibold uppercase truncate tracking-wider leading-relaxed">
                      {data.fullName || 'FULL NAME'}
                    </span>
                    <span className="text-[8px] text-white/40 uppercase font-bold tracking-widest leading-none mt-1">
                      Number
                    </span>
                    <span className="text-xs font-mono font-medium tracking-wide">
                      {isVisible ? data.number || 'NOT SPECIFIED' : '••••••••••••'}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-end text-[8px] text-white/50 font-bold tracking-wider">
                  <div className="flex flex-col">
                    <span>ISSUED</span>
                    <span className="font-mono text-white/80">{data.issueDate || 'N/A'}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span>EXPIRES</span>
                    <span className="font-mono text-white/80">{data.expiryDate || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Data & Copies Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-semibold text-text/40">Details Visibility</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-3 rounded-lg hover:bg-white/5 text-text/60 flex items-center gap-1.5"
                    onClick={() => setIsVisible(!isVisible)}
                  >
                    {isVisible ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    {isVisible ? 'Hide Number' : 'Show Number'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-1 relative group/copy">
                    <span className="text-[9px] font-bold text-text/30 uppercase tracking-wider block">
                      ID Number
                    </span>
                    <span className="text-xs font-mono text-text/80 truncate block">
                      {isVisible ? data.number : '••••••••••••'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-6 w-6 rounded-md opacity-0 group-hover/copy:opacity-100 transition-opacity hover:bg-white/10"
                      onClick={() => handleCopy(data.number, item.id + '-num', 'ID Number')}
                    >
                      {copiedId === item.id + '-num' ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-1 relative group/copy">
                    <span className="text-[9px] font-bold text-text/30 uppercase tracking-wider block">
                      Full Name
                    </span>
                    <span className="text-xs text-text/80 truncate block">
                      {data.fullName || 'Not specified'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-6 w-6 rounded-md opacity-0 group-hover/copy:opacity-100 transition-opacity hover:bg-white/10"
                      onClick={() => handleCopy(data.fullName, item.id + '-name', 'Name')}
                    >
                      {copiedId === item.id + '-name' ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>

                {data.notes && (
                  <div className="bg-white/[0.01] p-2.5 rounded-xl border border-white/5 text-xs text-text/60">
                    <div className="flex items-center gap-1.5 mb-1 text-[9px] font-bold uppercase tracking-wider text-text/35">
                      <FileText className="h-3 w-3" />
                      <span>Security Notes</span>
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{data.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tags management */}
          <div className="pt-3 border-t border-white/5">
            <div className="flex flex-wrap gap-1.5 items-center">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-white/5 border border-white/5 px-2 py-0.5 text-[10px] text-text/50"
                >
                  #{tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 text-text/30 hover:text-red-400 focus:outline-none"
                  >
                    ×
                  </button>
                </span>
              ))}
              {isAddingTag ? (
                <Input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onBlur={handleAddTag}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="tag..."
                  className="h-5 py-0 px-1 text-[10px] w-14 bg-white/5 border-white/10 inline-block"
                  autoFocus
                />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingTag(true)}
                  className="h-5 px-2 rounded-full text-[9px] border border-dashed border-white/10 text-text/40 hover:text-text hover:bg-white/5"
                >
                  + Tag
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

export const IdentitiesVault: React.FC = () => {
  const { items, masterKey, addItem, updateItem, removeItem, togglePin, pinningItemIds } =
    useVaultStore();
  const {
    folders,
    currentFolder,
    setCurrentFolder,
    isAddingFolder,
    setIsAddingFolder,
    newFolderName,
    setNewFolderName,
    editingFolder,
    setEditingFolder,
    editingFolderName,
    setEditingFolderName,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveToFolder,
  } = useVaultFolders('identity');

  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(false);

  // Form State
  const [newName, setNewName] = useState('');
  const [formPayload, setFormPayload] = useState<IdentityPayload>(emptyPayload());

  const identities = useMemo(() => {
    return items.filter((item) => item.type === 'identity');
  }, [items]);

  const suggestions = useMemo(() => {
    const s = new Set<string>();
    identities.forEach((item) => {
      if (item.title) s.add(item.title);
      if (item.metadata?.fullName) s.add(item.metadata.fullName);
      if (item.metadata?.documentType) s.add(item.metadata.documentType);
    });
    return Array.from(s);
  }, [identities]);

  const filteredIdentities = useMemo(() => {
    let result = identities;
    if (currentFolder) {
      result = result.filter((item) => item.folder === currentFolder);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.metadata?.fullName?.toLowerCase().includes(q) ||
          item.metadata?.documentType?.toLowerCase().includes(q) ||
          item.metadata?.issuingCountry?.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => {
      const aPinned = a.isPinned ? 1 : 0;
      const bPinned = b.isPinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return b.createdAt - a.createdAt;
    });
  }, [identities, currentFolder, searchQuery]);

  const handleCreateIdentity = async () => {
    const trimmedTitle =
      newName.trim() ||
      `${formPayload.documentType} - ${formPayload.fullName}`.trim() ||
      'New Identity';
    if (!masterKey) return;

    setIsSaving(true);
    try {
      const encryptedContent = await encryptData(JSON.stringify(formPayload), masterKey);
      await addItem({
        type: 'identity',
        title: trimmedTitle,
        content: encryptedContent,
        folder: currentFolder || undefined,
        metadata: {
          fullName: formPayload.fullName,
          documentType: formPayload.documentType,
          issuingCountry: formPayload.issuingCountry,
        },
      });

      setIsAdding(false);
      setNewName('');
      setFormPayload(emptyPayload());
      toast.success(`Identity "${trimmedTitle}" saved successfully`);
    } catch {
      toast.error('Failed to save identity document');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateIdentity = async (id: string, name: string, payload: IdentityPayload) => {
    if (!masterKey) return;
    try {
      const encryptedContent = await encryptData(JSON.stringify(payload), masterKey);
      await updateItem(id, {
        title:
          name.trim() ||
          `${payload.documentType} - ${payload.fullName}`.trim() ||
          'Updated Identity',
        content: encryptedContent,
        metadata: {
          fullName: payload.fullName,
          documentType: payload.documentType,
          issuingCountry: payload.issuingCountry,
        },
      });
      toast.success('Identity details updated');
    } catch {
      toast.error('Failed to update identity details');
    }
  };

  return (
    <div className="relative flex h-full min-h-0 gap-6">
      <FolderSidebar
        items={identities}
        folders={folders}
        currentFolder={currentFolder}
        setCurrentFolder={setCurrentFolder}
        isAddingFolder={isAddingFolder}
        setIsAddingFolder={setIsAddingFolder}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        editingFolder={editingFolder}
        setEditingFolder={setEditingFolder}
        editingFolderName={editingFolderName}
        setEditingFolderName={setEditingFolderName}
        handleCreateFolder={handleCreateFolder}
        handleRenameFolder={handleRenameFolder}
        handleDeleteFolder={handleDeleteFolder}
        handleMoveToFolder={handleMoveToFolder}
        title="Identity Categories"
        allItemLabel="All Identities"
        allItemIcon={<Fingerprint className="h-4 w-4" />}
      />

      <MobileFolderMenu
        isOpen={isMobileFolderOpen}
        onClose={() => setIsMobileFolderOpen(false)}
        items={identities}
        folders={folders}
        currentFolder={currentFolder}
        setCurrentFolder={setCurrentFolder}
        isAddingFolder={isAddingFolder}
        setIsAddingFolder={setIsAddingFolder}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        handleCreateFolder={handleCreateFolder}
        editingFolder={editingFolder}
        setEditingFolder={setEditingFolder}
        editingFolderName={editingFolderName}
        setEditingFolderName={setEditingFolderName}
        handleRenameFolder={handleRenameFolder}
        handleDeleteFolder={handleDeleteFolder}
        title="Identity Categories"
        allItemLabel="All Identities"
        allItemIcon={<Fingerprint className="h-4 w-4" />}
      />

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar space-y-6 pr-2">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-text truncate">
                {currentFolder || 'Identities'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-text/5 border border-text/10 text-text/50 text-xs font-bold shadow-inner">
                {filteredIdentities.length} items
              </span>
            </div>
            <p className="text-text/50 truncate">
              Store IDs, driver licenses, passports, and social security credentials.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              onClick={() => setIsAdding(true)}
              size="sm"
              className="hidden sm:flex transition-all"
            >
              <Plus className="mr-2 h-4 w-4" /> Add Identity
            </Button>
            <Button
              onClick={() => setIsAdding(true)}
              size="icon"
              className="flex sm:hidden transition-all"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 max-w-md w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/30 z-10 pointer-events-none" />
            <SearchInput
              placeholder="Search identities..."
              className="pl-10 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              suggestions={suggestions}
              historyKey="identities"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden flex shrink-0 border-white/5 rounded-xl bg-white/5 w-10 h-10"
            onClick={() => setIsMobileFolderOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-8"
            >
              <Card className="border-white/10 bg-gradient-to-br from-white/10 to-transparent backdrop-blur-md p-6">
                <CardHeader className="flex justify-between items-start flex-row pb-4 border-b border-white/5 mb-4">
                  <CardTitle className="text-lg font-bold">Add Identity Document</CardTitle>
                  {/* <Button variant="ghost" size="icon" onClick={() => setIsAdding(false)}>
                    <X className="h-4 w-4" />
                  </Button> */}
                </CardHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-text/40 tracking-wider">
                        Document Type
                      </label>
                      <select
                        value={formPayload.documentType}
                        onChange={(e: any) =>
                          setFormPayload({
                            ...formPayload,
                            documentType: e.target.value,
                          })
                        }
                        className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-text focus:outline-none focus:border-white/20 appearance-none"
                      >
                        <option value="Passport" className="bg-bg text-text">
                          Passport
                        </option>
                        <option value="Driver License" className="bg-bg text-text">
                          Driver's License
                        </option>
                        <option value="National ID" className="bg-bg text-text">
                          National ID Card
                        </option>
                        <option value="Social Security" className="bg-bg text-text">
                          Social Security Number
                        </option>
                        <option value="Other" className="bg-bg text-text">
                          Other ID
                        </option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-text/40 tracking-wider">
                        Custom Title
                      </label>
                      <Input
                        placeholder="e.g. My US Passport"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-text/40 tracking-wider">
                        Full Name on Document
                      </label>
                      <Input
                        placeholder="John Doe"
                        value={formPayload.fullName}
                        onChange={(e) =>
                          setFormPayload({
                            ...formPayload,
                            fullName: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-text/40 tracking-wider">
                        Document Number
                      </label>
                      <Input
                        placeholder="A1234567"
                        value={formPayload.number}
                        onChange={(e) =>
                          setFormPayload({
                            ...formPayload,
                            number: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-text/40 tracking-wider">
                          Issue Date
                        </label>
                        <Input
                          placeholder="YYYY-MM-DD"
                          value={formPayload.issueDate}
                          onChange={(e) =>
                            setFormPayload({
                              ...formPayload,
                              issueDate: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-text/40 tracking-wider">
                          Expiry Date
                        </label>
                        <Input
                          placeholder="YYYY-MM-DD"
                          value={formPayload.expiryDate}
                          onChange={(e) =>
                            setFormPayload({
                              ...formPayload,
                              expiryDate: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-text/40 tracking-wider">
                        Issuing Country
                      </label>
                      <Input
                        placeholder="United States"
                        value={formPayload.issuingCountry}
                        onChange={(e) =>
                          setFormPayload({
                            ...formPayload,
                            issuingCountry: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-1">
                  <label className="text-[10px] uppercase font-bold text-text/40 tracking-wider">
                    Additional Security Notes
                  </label>
                  <textarea
                    placeholder="Enter secondary details, recovery info, etc."
                    value={formPayload.notes}
                    onChange={(e) => setFormPayload({ ...formPayload, notes: e.target.value })}
                    className="w-full h-20 px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-text focus:outline-none focus:border-white/20"
                  />
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t border-white/5 pt-4">
                  <Button variant="ghost" onClick={() => setIsAdding(false)} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateIdentity}
                    disabled={isSaving}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Document'}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {filteredIdentities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredIdentities.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(event) => setDraggedVaultItem(event, item.id)}
                onTouchStart={(event) => setDraggedVaultItem(event as any, item.id)}
                // onTouchMove={(e) => {
                //   /* Allow custom touch drag logic */
                // }}
                title="Drag to a folder to move this identity"
              >
                <DecryptedIdentityItem
                  item={item}
                  masterKey={masterKey!}
                  onUpdate={handleUpdateIdentity}
                  onDelete={removeItem}
                  onTogglePin={togglePin}
                  isPinning={pinningItemIds.includes(item.id)}
                />
              </div>
            ))}
          </div>
        ) : (
          !isAdding && (
            <div
              className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
              onClick={() => setIsAdding(true)}
            >
              <Fingerprint className="mb-4 h-16 w-16" />
              <p className="text-lg">No identity documents found</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};
