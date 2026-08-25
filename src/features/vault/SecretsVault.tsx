import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import {
  Plus,
  Trash2,
  ShieldCheck,
  Copy,
  Eye,
  EyeOff,
  Search,
  Check,
  Edit2,
  Save,
  X,
  Lock,
  AlertTriangle,
  Menu,
  Folder,
  Loader2,
  Pin,
} from 'lucide-react';
import { toast } from 'sonner';
import { useVaultStore } from '../../store/vaultStore';
import { VaultItem } from '../../lib/storage';
import { encryptData, decryptData } from '../../lib/cryptoPrimitives';
import { useClipboard } from '../../hooks/useClipboard';
import { motion, AnimatePresence } from 'framer-motion';
import { getStringContent, parseJsonSafely } from '../../lib/vaultItemContent';
import { logActivity } from '../../lib/activity';
import { setDraggedVaultItem, clearDraggedVaultItem } from '../../lib/vaultDragDrop';
import { sortPinnedFirst } from '../../lib/pinning';

import { FolderSidebar } from '../../components/vault/FolderSidebar';
import { MobileFolderMenu } from '../../components/vault/MobileFolderMenu';
import { TagManager } from '../../components/vault/TagManager';
import { useVaultFolders } from '../../hooks/useVaultFolders';
import { useGlobalNavigationStore } from '../../store/globalNavigationStore';

interface SecretPayload {
  value: string;
  type: string;
}

interface SecretCardProps {
  item: VaultItem;
  masterKey: string | CryptoKey;
  onUpdate: (id: string, name: string, value: string) => Promise<void>;
  onDelete: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  isPinning: boolean;
}

const SECRET_TYPES = ['API Key', 'SSH Key', 'Recovery Phrase', 'Other'] as const;
type SecretType = (typeof SECRET_TYPES)[number];

const DecryptedSecretCard: React.FC<SecretCardProps> = React.memo(
  ({ item, masterKey, onUpdate, onDelete, onTogglePin, isPinning }) => {
    const [data, setData] = useState<SecretPayload | null>(null);
    const [error, setError] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(item.title);
    const [editValue, setEditValue] = useState('');
    const [showEditValue, setShowEditValue] = useState(false);
    const { copy, copiedId } = useClipboard();

    useEffect(() => {
      let isMounted = true;
      const decrypt = async () => {
        try {
          const encryptedContent = getStringContent(item.content);
          if (!encryptedContent && !item.metadata) {
            if (isMounted) setError(true);
            return;
          }

          const decrypted = encryptedContent ? await decryptData(encryptedContent, masterKey) : '';
          let parsed = parseJsonSafely<any>(decrypted || '');
          if (!parsed && typeof item.content === 'string') {
            parsed = parseJsonSafely<any>(item.content);
          }

          const meta = (item.metadata as any) || {};
          const finalValue =
            typeof parsed?.value === 'string'
              ? parsed.value
              : typeof parsed?.key === 'string'
                ? parsed.key
                : typeof meta.value === 'string'
                  ? meta.value
                  : typeof meta.key === 'string'
                    ? meta.key
                    : typeof decrypted === 'string' && decrypted.trim().length > 0
                      ? decrypted
                      : typeof item.content === 'string' && item.content.trim().length > 0
                        ? item.content
                        : '';

          const finalType =
            typeof parsed?.type === 'string'
              ? parsed.type
              : typeof parsed?.service === 'string'
                ? parsed.service
                : typeof meta.type === 'string'
                  ? meta.type
                  : typeof meta.service === 'string'
                    ? meta.service
                    : 'API Key';

          const resolvedPayload: SecretPayload = {
            value: finalValue,
            type: finalType,
          };

          setData(resolvedPayload);
          setEditValue(finalValue);
        } catch (err) {
          console.error('Secret Decryption Error:', err);
          if (isMounted) setError(true);
        }
      };

      decrypt();
      return () => {
        isMounted = false;
      };
    }, [item.content, masterKey]);

    const handleCopy = (text: string, id: string) => {
      copy(text, id);
      toast.success('Secret value copied to clipboard');
      logActivity({
        actionType: 'copy_value',
        itemName: item.title,
        description: 'Secret value copied',
        status: 'success',
      });
    };

    const handleSave = async () => {
      try {
        await onUpdate(item.id, editName, editValue);
        setIsEditing(false);
        logActivity({
          actionType: 'item_update',
          itemName: editName,
          description: 'Secret updated',
          status: 'success',
        });
      } catch (err) {
        logActivity({
          actionType: 'item_update',
          itemName: editName,
          description: 'Secret update failed',
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
          <div className="h-10 w-full bg-white/5 rounded-xl" />
          <div className="h-20 w-full bg-white/5 rounded-xl" />
        </Card>
      );
    }

    return (
      <motion.div whileHover={{ y: -5 }} className="h-full">
        <Card className="group relative h-full overflow-hidden border-white/5 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-md transition-all hover:border-white/20 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-rose-500/10 blur-3xl transition-opacity group-hover:opacity-30" />

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 relative z-10 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 transition-transform group-hover:scale-110 group-hover:rotate-3">
                <ShieldCheck className="h-5 w-5 text-rose-400" />
              </div>
              {isEditing ? (
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 py-0 px-2 text-sm bg-white/5 border-white/10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') setIsEditing(false);
                  }}
                />
              ) : (
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold text-text transition-colors truncate max-w-[120px]">
                      {item.title}
                    </CardTitle>
                  </div>
                  <span className="text-[9px] font-bold text-rose-400/60 uppercase tracking-tighter">
                    {data.type}
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
                    className="h-8 w-8 rounded-full hover:bg-green-400/20 text-green-400"
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
                      setIsEditing(true);
                      setShowEditValue(false);
                    }}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPinning}
                    className={`h-8 w-8 rounded-full ${item.isPinned ? 'text-rose-400 hover:bg-rose-400/20' : 'text-text/20 hover:text-text/60 hover:bg-white/10'} transition-colors`}
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

          <CardContent className="relative z-10 flex h-[calc(100%-81px)] flex-col justify-between space-y-4 p-5 pt-4 sm:p-6">
            <div className="space-y-2 flex-grow">
              {item.folder && (
                <div className="inline-flex max-w-full items-center rounded-full border border-rose-400/15 bg-rose-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-300/80">
                  <Folder className="h-3 w-3 mr-1.5 text-rose-400/80" />
                  <span className="truncate" title={item.folder}>
                    {item.folder}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between px-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text/30 transition-colors">
                  Secret Value
                </p>
                {!isEditing && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg hover:bg-white/10"
                      onClick={() => setIsVisible(!isVisible)}
                    >
                      {isVisible ? (
                        <EyeOff className="h-3.5 w-3.5 text-text/40" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 text-text/40 group-hover:text-text/60" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg hover:bg-white/10"
                      onClick={() => handleCopy(data.value, item.id)}
                    >
                      {copiedId === item.id ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-text/40 group-hover:text-text/60" />
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="relative">
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="min-h-[100px] w-full rounded-xl bg-white/5 px-3 py-3 text-sm font-mono text-text border border-white/5 focus:border-white/20 focus:outline-none transition-all"
                    style={
                      {
                        WebkitTextSecurity: !showEditValue ? 'disc' : 'none',
                      } as any
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 h-7 w-7 rounded-lg bg-black/20 hover:bg-black/40 text-text/60"
                    onClick={() => setShowEditValue(!showEditValue)}
                  >
                    {showEditValue ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ) : (
                <div className="relative rounded-xl bg-white/5 px-4 py-3 border border-transparent group-hover:border-white/5 transition-all min-h-[50px] flex items-center overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={isVisible ? 'visible' : 'hidden'}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.2 }}
                      className="w-full"
                    >
                      {isVisible ? (
                        <motion.p
                          className="break-all font-mono text-sm text-text/90 select-all leading-relaxed"
                          initial={{ filter: 'blur(8px)', opacity: 0 }}
                          animate={{ filter: 'blur(0px)', opacity: 1 }}
                        >
                          {data.value}
                        </motion.p>
                      ) : (
                        <div className="flex items-center justify-between py-1">
                          <div className="flex gap-1.5">
                            {[...Array(8)].map((_, i) => (
                              <motion.div
                                key={`loading-dot-${i}`}
                                animate={{
                                  opacity: [0.2, 0.4, 0.2],
                                  scale: [1, 1.1, 1],
                                }}
                                transition={{
                                  duration: 2,
                                  repeat: Infinity,
                                  delay: i * 0.15,
                                }}
                                className="h-1.5 w-1.5 rounded-full bg-rose-400/40"
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/10">
                            <Lock className="h-2.5 w-2.5 text-rose-400/40" />
                            <span className="text-[8px] font-bold text-rose-400/40 uppercase tracking-[0.2em]">
                              Hidden
                            </span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  {isVisible && (
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full"
                      animate={{ translateX: ['100%', '-100%'] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Tags section */}
            <div className="border-t border-white/5 pt-3 mt-4">
              <TagManager item={item} size="sm" />
            </div>

            <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-4">
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[9px] text-text/30 font-bold uppercase tracking-widest">
                  AES-256
                </span>
              </div>
              <span className="text-[9px] text-text/20 font-medium">
                Synced {new Date(item.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }
);

export const SecretsVault: React.FC = () => {
  const items = useVaultStore((state) => state.items);
  const addItem = useVaultStore((state) => state.addItem);
  const removeItem = useVaultStore((state) => state.removeItem);
  const updateItem = useVaultStore((state) => state.updateItem);
  const masterKey = useVaultStore((state) => state.masterKey);
  const togglePin = useVaultStore((state) => state.togglePin);
  const pinningItemIds = useVaultStore((state) => state.pinningItemIds);
  const targetItemId = useGlobalNavigationStore((state) => state.targetItemId);
  const setTargetItemId = useGlobalNavigationStore((state) => state.setTargetItemId);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newType, setNewType] = useState<SecretType>('API Key');
  const [customType, setCustomType] = useState('');
  const [showNewValue, setShowNewValue] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(false);

  const secrets = useMemo(() => items.filter((item) => item.type === 'secret'), [items]);
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
  } = useVaultFolders('secret');

  useEffect(() => {
    if (!targetItemId) return;
    const target = secrets.find((s) => s.id === targetItemId);
    if (target) {
      setCurrentFolder(null);
      setSearchQuery(target.title);
      setTargetItemId(null);
    }
  }, [targetItemId, secrets, setTargetItemId, setCurrentFolder]);
  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const filteredSecrets = useMemo(
    () =>
      sortPinnedFirst(
        secrets.filter((secret) => {
          const matchesSearch =
            normalizedSearchQuery.length === 0 ||
            secret.title.toLowerCase().includes(normalizedSearchQuery);
          const matchesFolder = currentFolder === null || secret.folder === currentFolder;
          return matchesSearch && matchesFolder;
        })
      ),
    [secrets, normalizedSearchQuery, currentFolder]
  );

  const getFolderCount = (folder: string | null) => {
    return secrets.filter((s) => (folder === null ? true : s.folder === folder)).length;
  };

  const handleAdd = async () => {
    const trimmedName = newName.trim();
    const trimmedValue = newValue.trim();
    const resolvedType = newType === 'Other' ? customType.trim() || 'Other' : newType;

    if ((!masterKey && !useVaultStore.getState().isDecoyMode) || !trimmedName || !trimmedValue) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSaving(true);
    try {
      const encryptedData = await encryptData(
        JSON.stringify({
          value: trimmedValue,
          type: resolvedType,
        }),
        masterKey
      );

      await addItem({
        type: 'secret',
        title: trimmedName,
        content: encryptedData,
        folder: currentFolder || undefined,
      });

      setIsAdding(false);
      setNewName('');
      setNewValue('');
      setNewType('API Key');
      setCustomType('');
      toast.success(`Secret "${trimmedName}" saved`);
      logActivity({
        actionType: 'item_create',
        itemName: trimmedName,
        description: 'Secret created',
        status: 'success',
      });
    } catch {
      toast.error('Failed to save secret');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateItem = async (id: string, name: string, value: string) => {
    if (!masterKey && !useVaultStore.getState().isDecoyMode) return;

    const trimmedName = name.trim();
    const trimmedValue = value.trim();
    if (!trimmedName || !trimmedValue) {
      toast.error('Secret name and value are required');
      return;
    }

    try {
      const item = secrets.find((secretItem) => secretItem.id === id);
      if (!item) return;

      const encryptedContent = getStringContent(item.content);
      if (!encryptedContent) {
        toast.error('Unsupported secret format');
        return;
      }

      const decrypted = await decryptData(encryptedContent, masterKey);
      if (!decrypted) {
        toast.error('Unable to decrypt secret');
        return;
      }

      const currentData = parseJsonSafely<SecretPayload>(decrypted);
      const encryptedData = await encryptData(
        JSON.stringify({
          type: currentData?.type ?? 'Other',
          value: trimmedValue,
        }),
        masterKey
      );

      await updateItem(id, {
        title: trimmedName,
        content: encryptedData,
      });
      toast.success(`Secret "${trimmedName}" updated`);
    } catch {
      toast.error('Failed to update secret');
    }
  };

  return (
    <div className="relative flex h-full min-h-0 gap-6">
      <FolderSidebar
        items={secrets}
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
        title="Secret Categories"
        allItemLabel="All Secrets"
        allItemIcon={<ShieldCheck className="h-4 w-4" />}
      />

      <MobileFolderMenu
        isOpen={isMobileFolderOpen}
        onClose={() => setIsMobileFolderOpen(false)}
        items={secrets}
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
        title="Secret Categories"
        allItemLabel="All Secrets"
        allItemIcon={<ShieldCheck className="h-4 w-4" />}
      />

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar space-y-6 pr-2">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1
                className="text-3xl font-bold text-text transition-colors truncate"
                title={currentFolder || 'Secrets'}
              >
                {currentFolder
                  ? currentFolder.length > 15
                    ? `${currentFolder.slice(0, 15)}...`
                    : currentFolder
                  : 'Secrets'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-text/5 border border-text/10 text-text/50 text-xs font-bold shadow-inner whitespace-nowrap">
                {getFolderCount(currentFolder)} items
              </span>
            </div>
            <p className="text-text/50 transition-colors truncate">
              Store API keys, SSH keys, and recovery phrases securely.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              onClick={() => setIsAdding(true)}
              size="sm"
              className="hidden sm:flex transition-all"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Secret
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
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/30 transition-colors" />
            <Input
              placeholder="Search secrets..."
              className="pl-10 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden flex shrink-0 border-white/5 rounded-xl bg-white/5 hover:bg-white/10 w-10 h-10"
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
              <Card className="border-white/10 bg-gradient-to-br from-white/10 to-transparent backdrop-blur-md">
                <CardHeader>
                  <CardTitle className="text-lg text-text transition-colors">New Secret</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text/30">
                      Secret Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {SECRET_TYPES.map((t) => (
                        <button
                          key={t}
                          onClick={() => setNewType(t)}
                          className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                            newType === t
                              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                              : 'bg-white/5 text-text/60 hover:bg-white/10'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-4">
                      <Input
                        placeholder="Secret Name (e.g. OpenAI Key)"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                      {newType === 'Other' && (
                        <Input
                          placeholder="Enter custom type..."
                          value={customType}
                          onChange={(e) => setCustomType(e.target.value)}
                        />
                      )}
                    </div>
                    <div className="relative">
                      <textarea
                        placeholder="Enter secret value..."
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        className={`flex min-h-[100px] w-full rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-text placeholder:text-text/30 focus:outline-none focus:border-white/20 transition-all ${!showNewValue ? 'password-mask' : ''}`}
                        style={
                          {
                            WebkitTextSecurity: !showNewValue ? 'disc' : 'none',
                          } as any
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-2 h-8 w-8 rounded-lg bg-black/20 hover:bg-black/40"
                        onClick={() => setShowNewValue(!showNewValue)}
                      >
                        {showNewValue ? (
                          <EyeOff className="h-4 w-4 text-white" />
                        ) : (
                          <Eye className="h-4 w-4 text-white" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                    <Button variant="ghost" onClick={() => setIsAdding(false)}>
                      Cancel
                    </Button>
                    <Button
                      className="bg-rose-500 hover:bg-rose-600 text-white min-w-[130px]"
                      onClick={handleAdd}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Secret'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {filteredSecrets.length === 0 && !isAdding && (
          <div
            className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => setIsAdding(true)}
          >
            <ShieldCheck className="mb-4 h-16 w-16" />
            <p className="text-lg">No secrets found.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 pb-8 md:grid-cols-2 xl:grid-cols-2">
          {filteredSecrets.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(event) => setDraggedVaultItem(event, item.id)}
              onDragEnd={clearDraggedVaultItem}
              onTouchStart={(event: React.TouchEvent) => setDraggedVaultItem(event as any, item.id)}
              onTouchMove={() => {
                /* Allow custom touch drag logic */
              }}
              title="Drag to a folder to move this secret"
            >
              <DecryptedSecretCard
                item={item}
                masterKey={masterKey!}
                onUpdate={handleUpdateItem}
                onDelete={(id, title) => {
                  if (confirm(`Are you sure you want to delete secret "${title}"?`)) {
                    removeItem(id);
                    toast.success(`Secret "${title}" deleted`);
                    logActivity({
                      actionType: 'item_delete',
                      itemName: title,
                      description: 'Secret deleted',
                      status: 'success',
                    });
                  }
                }}
                onTogglePin={(id) => void togglePin(id)}
                isPinning={pinningItemIds.includes(item.id)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
