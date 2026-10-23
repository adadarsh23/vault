import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  Search,
  Check,
  Edit2,
  Save,
  X,
  Menu,
  Folder,
  AlertTriangle,
  Users,
  Mail,
  Phone,
  Building2,
  Copy,
  Loader2,
  Pin,
} from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { SearchInput } from '../../components/ui/SearchInput';
import { useVaultStore } from '../../store/vaultStore';
import { VaultItem } from '../../lib/storage';
import { encryptData, decryptData } from '../../lib/cryptoPrimitives';
import { getStringContent, parseJsonSafely } from '../../lib/vaultItemContent';
import { useClipboard } from '../../hooks/useClipboard';
import { logActivity } from '../../lib/activity';
import { setDraggedVaultItem, clearDraggedVaultItem } from '../../lib/vaultDragDrop';
import { FolderSidebar } from '../../components/vault/FolderSidebar';
import { MobileFolderMenu } from '../../components/vault/MobileFolderMenu';
import { TagManager } from '../../components/vault/TagManager';
import { useVaultFolders } from '../../hooks/useVaultFolders';
import { sortPinnedFirst } from '../../lib/pinning';

interface ContactPayload {
  email: string;
  phone: string;
  company: string;
  notes: string;
}

interface ContactCardProps {
  item: VaultItem;
  masterKey: string | CryptoKey;
  onUpdate: (
    id: string,
    updates: {
      name: string;
      email: string;
      phone: string;
      company: string;
      notes: string;
    },
  ) => Promise<void>;
  onDelete: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  isPinning: boolean;
}

const DecryptedContactCard: React.FC<ContactCardProps> = React.memo(
  ({ item, masterKey, onUpdate, onDelete, onTogglePin, isPinning }) => {
    const [data, setData] = useState<ContactPayload | null>(null);
    const [error, setError] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(item.title);
    const [editEmail, setEditEmail] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editCompany, setEditCompany] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const { copy, copiedId } = useClipboard();

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
          let parsed = parseJsonSafely<ContactPayload>(decrypted || '');
          if (!parsed && item.metadata) {
            const meta = item.metadata as any;
            parsed = {
              email: meta.email ?? '',
              phone: meta.phone ?? '',
              company: meta.company ?? '',
              notes: meta.notes ?? '',
            };
          }

          if (!parsed) {
            if (isMounted) setError(true);
            return;
          }

          const nextData = {
            email: parsed.email ?? '',
            phone: parsed.phone ?? '',
            company: parsed.company ?? '',
            notes: parsed.notes ?? '',
          };

          setData(nextData);
          setEditEmail(nextData.email);
          setEditPhone(nextData.phone);
          setEditCompany(nextData.company);
          setEditNotes(nextData.notes);
        } catch (err) {
          logger.error('Contact Decryption Error', { error: err });
          if (isMounted) setError(true);
        }
      };

      decrypt();
      return () => {
        isMounted = false;
      };
    }, [item.content, masterKey]);

    const handleCopy = (value: string, id: string, label: string) => {
      if (!value.trim()) {
        toast.error(`No ${label.toLowerCase()} available`);
        return;
      }

      copy(value, id);
      toast.success(`${label} copied to clipboard`);
      logActivity({
        actionType: 'copy_value',
        itemName: item.title,
        description: `${label} copied`,
        status: 'success',
      });
    };

    const handleSave = async () => {
      if (!editName.trim()) {
        toast.error('Contact name is required');
        return;
      }
      if (!editPhone.trim()) {
        toast.error('Phone number is required');
        return;
      }
      try {
        await onUpdate(item.id, {
          name: editName,
          email: editEmail,
          phone: editPhone,
          company: editCompany,
          notes: editNotes,
        });
        setIsEditing(false);
      } catch {
        // Error notification handled by onUpdate; preserve editing state
      }
    };

    if (error) {
      return (
        <Card className="flex flex-col items-center gap-2 border-red-500/20 bg-red-400/5 p-4">
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
        <Card className="flex flex-col gap-4 border-white/5 bg-white/[0.02] p-6 animate-pulse">
          <div className="h-10 w-full rounded-xl bg-white/5" />
          <div className="h-24 w-full rounded-xl bg-white/5" />
        </Card>
      );
    }

    return (
      <motion.div whileHover={{ y: -5 }} className="h-full">
        <Card className="group relative h-full overflow-hidden border-white/5 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-md transition-all hover:border-white/20 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-teal-500/10 blur-3xl transition-opacity group-hover:opacity-30" />

          <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 transition-transform group-hover:scale-110 group-hover:rotate-3">
                <Users className="h-5 w-5 text-teal-400" />
              </div>
              {isEditing ? (
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 bg-white/5 px-2 py-0 text-sm border-white/10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSave();
                    if (e.key === 'Escape') setIsEditing(false);
                  }}
                />
              ) : (
                <div className="flex flex-col">
                  <CardTitle className="max-w-[160px] truncate text-base font-bold text-text transition-colors">
                    {item.title}
                  </CardTitle>
                  <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-teal-400/60">
                    Contact
                  </span>
                </div>
              )}
            </div>

            <div className="relative z-20 flex gap-1 transition-opacity sm:opacity-0 group-hover:opacity-100">
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
                    className="h-8 w-8 rounded-full text-green-400 hover:bg-green-400/20"
                    onClick={() => void handleSave()}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-text/20 transition-colors hover:bg-white/10 hover:text-text/60"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPinning}
                    className={`h-8 w-8 rounded-full ${item.isPinned ? 'text-teal-400 hover:bg-teal-400/20' : 'text-text/20 hover:text-text/60 hover:bg-white/10'} transition-colors`}
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
                    className="h-8 w-8 rounded-full text-text/20 transition-colors hover:bg-red-400/20 hover:text-red-400"
                    onClick={() => onDelete(item.id, item.title)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </CardHeader>

          <CardContent className="relative z-10 space-y-4 p-5 pt-4 sm:p-6">
            {item.folder && (
              <div className="inline-flex max-w-full items-center rounded-full border border-teal-400/15 bg-teal-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-300/80">
                <Folder className="mr-1.5 h-3 w-3 text-teal-400/80" />
                <span className="truncate" title={item.folder}>
                  {item.folder}
                </span>
              </div>
            )}

            {isEditing ? (
              <div className="space-y-3">
                <Input
                  placeholder="Email address"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
                <Input
                  placeholder="Phone number"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
                <Input
                  placeholder="Company / Organization"
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                />
                <textarea
                  placeholder="Notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="min-h-[96px] w-full rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-text placeholder:text-text/30 transition-all focus:border-white/20 focus:outline-none"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-transparent bg-white/5 px-3 py-2.5 transition-all hover:bg-white/10 group-hover:border-white/5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Mail className="h-4 w-4 shrink-0 text-teal-400/70" />
                    <div className="min-w-0">
                      <p className="text-[9px] text-text/40">Email</p>
                      <p className="truncate text-sm font-medium text-text">
                        {data.email || 'Not added'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-2 h-8 w-8 rounded-lg hover:bg-white/10"
                    onClick={() => handleCopy(data.email, `${item.id}-email`, 'Email')}
                  >
                    {copiedId === `${item.id}-email` ? (
                      <Check className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-text/40 group-hover:text-text/60" />
                    )}
                  </Button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-transparent bg-white/5 px-3 py-2.5 transition-all hover:bg-white/10 group-hover:border-white/5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Phone className="h-4 w-4 shrink-0 text-teal-400/70" />
                    <div className="min-w-0">
                      <p className="text-[9px] text-text/40">Phone</p>
                      <p className="truncate text-sm font-medium text-text">
                        {data.phone || 'Not added'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-2 h-8 w-8 rounded-lg hover:bg-white/10"
                    onClick={() => handleCopy(data.phone, `${item.id}-phone`, 'Phone')}
                  >
                    {copiedId === `${item.id}-phone` ? (
                      <Check className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-text/40 group-hover:text-text/60" />
                    )}
                  </Button>
                </div>

                <div className="rounded-xl border border-transparent bg-white/5 px-3 py-2.5 transition-all group-hover:border-white/5">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 shrink-0 text-teal-400/70" />
                    <div className="min-w-0">
                      <p className="text-[9px] text-text/40">Company</p>
                      <p className="truncate text-sm font-medium text-text">
                        {data.company || 'Not added'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-transparent bg-white/5 px-3 py-3 transition-all group-hover:border-white/5">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-text/30">
                    Notes
                  </p>
                  <p className="min-h-[52px] whitespace-pre-wrap break-words text-sm leading-relaxed text-text/80">
                    {data.notes || 'No notes added.'}
                  </p>
                </div>
              </div>
            )}

            {/* Tags */}
            <div className="pt-3 border-t border-white/5">
              <TagManager item={item} size="sm" />
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-teal-500 animate-pulse" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-text/30">
                  AES-256
                </span>
              </div>
              <span className="text-[9px] font-medium text-text/20">
                Updated {new Date(item.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  },
);

export const ContactsVault: React.FC = () => {
  const items = useVaultStore((state) => state.items);
  const addItem = useVaultStore((state) => state.addItem);
  const removeItem = useVaultStore((state) => state.removeItem);
  const updateItem = useVaultStore((state) => state.updateItem);
  const masterKey = useVaultStore((state) => state.masterKey);
  const togglePin = useVaultStore((state) => state.togglePin);
  const pinningItemIds = useVaultStore((state) => state.pinningItemIds);

  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(false);

  const contacts = useMemo(() => items.filter((item) => item.type === 'contact'), [items]);

  const suggestions = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((item) => {
      if (item.title) s.add(item.title);
      if (item.metadata?.email) s.add(item.metadata.email);
      if (item.metadata?.company) s.add(item.metadata.company);
      if (item.metadata?.phone) s.add(item.metadata.phone);
    });
    return Array.from(s);
  }, [contacts]);
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
  } = useVaultFolders('contact');
  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const filteredContacts = useMemo(
    () =>
      sortPinnedFirst(
        contacts.filter((contact) => {
          const matchesSearch =
            normalizedSearchQuery.length === 0 ||
            contact.title.toLowerCase().includes(normalizedSearchQuery);
          const matchesFolder = currentFolder === null || contact.folder === currentFolder;
          return matchesSearch && matchesFolder;
        }),
      ),
    [contacts, normalizedSearchQuery, currentFolder],
  );

  const getFolderCount = (folder: string | null) =>
    contacts.filter((contact) => (folder === null ? true : contact.folder === folder)).length;

  const resetForm = () => {
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setNewCompany('');
    setNewNotes('');
  };

  const handleAdd = async () => {
    const trimmedName = newName.trim();
    const trimmedPhone = newPhone.trim();

    if ((!masterKey && !useVaultStore.getState().isDecoyMode) || !trimmedName) {
      toast.error('Contact name is required');
      return;
    }
    if (!trimmedPhone) {
      toast.error('Phone number is required');
      return;
    }

    setIsSaving(true);
    try {
      const encryptedData = await encryptData(
        JSON.stringify({
          email: newEmail.trim(),
          phone: trimmedPhone,
          company: newCompany.trim(),
          notes: newNotes.trim(),
        }),
        masterKey,
      );

      await addItem({
        type: 'contact',
        title: trimmedName,
        content: encryptedData,
        folder: currentFolder || undefined,
      });

      setIsAdding(false);
      resetForm();
      toast.success(`Contact "${trimmedName}" saved`);
      logActivity({
        actionType: 'item_create',
        itemName: trimmedName,
        description: 'Contact created',
        status: 'success',
      });
    } catch (saveErr) {
      logger.error('Failed to save contact', { error: saveErr });
      toast.error('Failed to save contact');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateItem = async (
    id: string,
    updates: {
      name: string;
      email: string;
      phone: string;
      company: string;
      notes: string;
    },
  ) => {
    if (!masterKey && !useVaultStore.getState().isDecoyMode) {
      toast.error('Encryption key missing');
      throw new Error('Encryption key missing');
    }

    const trimmedName = updates.name.trim();
    if (!trimmedName) {
      toast.error('Contact name is required');
      throw new Error('Contact name is required');
    }

    const trimmedPhone = updates.phone.trim();
    if (!trimmedPhone) {
      toast.error('Phone number is required');
      throw new Error('Phone number is required');
    }

    try {
      const encryptedData = await encryptData(
        JSON.stringify({
          email: updates.email.trim(),
          phone: trimmedPhone,
          company: updates.company.trim(),
          notes: updates.notes.trim(),
        }),
        masterKey,
      );

      await updateItem(id, {
        title: trimmedName,
        content: encryptedData,
      });

      toast.success(`Contact "${trimmedName}" updated`);
      logActivity({
        actionType: 'item_update',
        itemName: trimmedName,
        description: 'Contact updated',
        status: 'success',
      });
    } catch (updateErr) {
      logger.error('Failed to update contact', { error: updateErr, id });
      toast.error('Failed to update contact');
      throw updateErr;
    }
  };

  return (
    <div className="relative flex h-full min-h-0 gap-6">
      <FolderSidebar
        items={contacts}
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
        title="Contact Categories"
        allItemLabel="All Contacts"
        allItemIcon={<Users className="h-4 w-4" />}
      />

      <MobileFolderMenu
        isOpen={isMobileFolderOpen}
        onClose={() => setIsMobileFolderOpen(false)}
        items={contacts}
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
        title="Contact Categories"
        allItemLabel="All Contacts"
        allItemIcon={<Users className="h-4 w-4" />}
      />

      <div className="custom-scrollbar flex min-w-0 flex-1 flex-col space-y-6 overflow-y-auto pr-2 h-full">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-3">
              <h1
                className="truncate text-3xl font-bold text-text transition-colors"
                title={currentFolder || 'Contacts'}
              >
                {currentFolder
                  ? currentFolder.length > 15
                    ? `${currentFolder.slice(0, 15)}...`
                    : currentFolder
                  : 'Contacts'}
              </h1>
              <span className="whitespace-nowrap rounded-full border border-text/10 bg-text/5 px-2.5 py-0.5 text-xs font-bold text-text/50 shadow-inner">
                {getFolderCount(currentFolder)} items
              </span>
            </div>
            <p className="truncate text-text/50 transition-colors">
              Store names, phone numbers, emails, and quick notes securely.
            </p>
          </div>

          <div className="shrink-0 flex gap-2">
            <Button
              onClick={() => setIsAdding(true)}
              size="sm"
              className="hidden transition-all sm:flex"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
            <Button
              onClick={() => setIsAdding(true)}
              size="icon"
              className="flex transition-all sm:hidden"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex max-w-md w-full items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/30 transition-colors z-10 pointer-events-none" />
            <SearchInput
              placeholder="Search contacts..."
              className="w-full pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              suggestions={suggestions}
              historyKey="contacts"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="flex h-10 w-10 shrink-0 rounded-xl border-white/5 bg-white/5 lg:hidden hover:bg-white/10"
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
                  <CardTitle className="text-lg text-text transition-colors">New Contact</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      placeholder="Full name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <Input
                      placeholder="Email address"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                    <Input
                      placeholder="Phone number"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                    <Input
                      placeholder="Company / Organization"
                      value={newCompany}
                      onChange={(e) => setNewCompany(e.target.value)}
                    />
                  </div>
                  <textarea
                    placeholder="Notes"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    className="min-h-[110px] w-full rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-text placeholder:text-text/30 transition-all focus:border-white/20 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2 border-t border-white/5 pt-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setIsAdding(false);
                        resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="bg-teal-500 text-white hover:bg-teal-600 min-w-[130px]"
                      onClick={handleAdd}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Contact'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {filteredContacts.length === 0 && !isAdding && (
          <div
            className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => setIsAdding(true)}
          >
            <Users className="mb-4 h-16 w-16" />
            <p className="text-lg">No contacts found.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 pb-8 md:grid-cols-2 xl:grid-cols-2">
          {filteredContacts.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(event) => setDraggedVaultItem(event, item.id)}
              onDragEnd={clearDraggedVaultItem}
              title="Drag to a folder to move this contact"
            >
              <DecryptedContactCard
                item={item}
                masterKey={masterKey!}
                onUpdate={handleUpdateItem}
                onDelete={(id, title) => {
                  if (confirm(`Are you sure you want to delete contact "${title}"?`)) {
                    void removeItem(id);
                    toast.success(`Contact "${title}" deleted`);
                    logActivity({
                      actionType: 'item_delete',
                      itemName: title,
                      description: 'Contact deleted',
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
