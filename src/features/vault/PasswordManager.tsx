import React, { useState, useEffect, useMemo } from 'react';
import * as OTPAuth from 'otpauth';
// import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import {
  Plus,
  Trash2,
  Key,
  Copy,
  Eye,
  EyeOff,
  Search,
  Check,
  AlertTriangle,
  ShieldCheck,
  Menu,
  Folder,
  Loader2,
  Pin,
  X,
} from 'lucide-react';
import { useGlobalNavigationStore } from '../../store/globalNavigationStore';
import { toast } from 'sonner';
import { useVaultStore } from '../../store/vaultStore';
import { encryptData, decryptData } from '../../lib/cryptoPrimitives';
import { useClipboard } from '../../hooks/useClipboard';
import { motion, AnimatePresence } from 'framer-motion';
import { logActivity } from '../../lib/activity';
import { setDraggedVaultItem } from '../../lib/vaultDragDrop';
import { sortPinnedFirst } from '../../lib/pinning';

import { FolderSidebar } from '../../components/vault/FolderSidebar';
import { MobileFolderMenu } from '../../components/vault/MobileFolderMenu';
import { useVaultFolders } from '../../hooks/useVaultFolders';
import { generateSecurePassword, PASSWORD_CONFIG } from '../../lib/passwordGenerator';

const DecryptedPasswordCard: React.FC<{
  item: any;
  masterKey: string | CryptoKey;
  onDelete: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  isPinning: boolean;
}> = React.memo(({ item, masterKey, onDelete, onTogglePin, isPinning }) => {
  const [data, setData] = useState<{
    username: string;
    password: string;
    totpSecret?: string;
  } | null>(null);
  const [error, setError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const { copy, copiedId } = useClipboard();

  const updateItem = useVaultStore((state) => state.updateItem);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  // 2FA TOTP states
  const [totpCode, setTotpCode] = useState<string>('');
  const [totpTimeLeft, setTotpTimeLeft] = useState<number>(30);
  const [totpError, setTotpError] = useState<boolean>(false);
  const [isEditing2FA, setIsEditing2FA] = useState(false);
  const [edit2FAInput, setEdit2FAInput] = useState('');

  // Have I Been Pwned breach check states
  const [breachStatus, setBreachStatus] = useState<
    'idle' | 'checking' | 'safe' | 'leaked' | 'error'
  >('idle');
  const [breachCount, setBreachCount] = useState<number>(0);

  // Decrypt and generate TOTP
  useEffect(() => {
    if (!data || !data.totpSecret) {
      setTotpCode('');
      return;
    }

    let intervalId: any;
    const updateTotp = () => {
      try {
        const cleanSecret = data.totpSecret!.replace(/\s+/g, '').toUpperCase();
        if (!/^[A-Z2-7]+=*$/.test(cleanSecret)) {
          setTotpError(true);
          setTotpCode('INVALID');
          return;
        }
        setTotpError(false);

        const totp = new OTPAuth.TOTP({
          secret: OTPAuth.Secret.fromBase32(cleanSecret),
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
        });
        setTotpCode(totp.generate());
        setTotpTimeLeft(30 - (Math.floor(Date.now() / 1000) % 30));
      } catch (err) {
        setTotpError(true);
        setTotpCode('ERROR');
      }
    };

    updateTotp();
    intervalId = setInterval(updateTotp, 1000);
    return () => clearInterval(intervalId);
  }, [data?.totpSecret]);

  // Check HIBP password leak status
  useEffect(() => {
    if (!data || !data.password) {
      setBreachStatus('idle');
      return;
    }

    const checkBreach = async () => {
      setBreachStatus('checking');
      try {
        const password = data.password;
        const encoder = new TextEncoder();
        const passwordData = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-1', passwordData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase();

        const prefix = hashHex.substring(0, 5);
        const suffix = hashHex.substring(5);

        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
        if (!res.ok) {
          throw new Error('API request failed');
        }
        const text = await res.text();
        const lines = text.split('\n');
        let foundCount = 0;
        for (const line of lines) {
          const parts = line.split(':');
          if (parts[0].trim().toUpperCase() === suffix) {
            foundCount = parseInt(parts[1].trim(), 10);
            break;
          }
        }

        if (foundCount > 0) {
          setBreachStatus('leaked');
          setBreachCount(foundCount);
        } else {
          setBreachStatus('safe');
          setBreachCount(0);
        }
      } catch (err) {
        console.error('HIBP check error:', err);
        setBreachStatus('error');
      }
    };

    void checkBreach();
  }, [data?.password]);

  const handleSave2FA = async () => {
    if (!data) return;
    const updatedData = {
      ...data,
      totpSecret: edit2FAInput.trim(),
    };

    try {
      const encrypted = await encryptData(JSON.stringify(updatedData), masterKey);
      await updateItem(item.id, { content: encrypted });
      setData(updatedData);
      setIsEditing2FA(false);
      toast.success('2FA Secret configured.');
      logActivity({
        actionType: 'password_create',
        itemName: item.title,
        description: '2FA Secret updated',
        status: 'success',
      });
    } catch (err) {
      toast.error('Failed to save 2FA secret.');
    }
  };

  const handleDelete2FA = async () => {
    if (!data) return;
    if (!confirm('Are you sure you want to remove the 2FA secret for this credential?')) return;

    const { totpSecret: _, ...updatedData } = data as any;

    try {
      const encrypted = await encryptData(JSON.stringify(updatedData), masterKey);
      await updateItem(item.id, { content: encrypted });
      setData(updatedData);
      setIsEditing2FA(false);
      toast.success('2FA Secret removed.');
      logActivity({
        actionType: 'password_delete',
        itemName: item.title,
        description: '2FA Secret deleted',
        status: 'success',
      });
    } catch (err) {
      toast.error('Failed to remove 2FA secret.');
    }
  };

  const formattedCode =
    totpCode.length === 6 ? `${totpCode.slice(0, 3)} ${totpCode.slice(3)}` : totpCode;

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
      await updateItem(item.id, { metadata: { ...(item.metadata || {}), tags: updated } });
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
      await updateItem(item.id, { metadata: { ...(item.metadata || {}), tags: updated } });
      toast.success(`Tag #${tagToRemove} removed`);
    } catch {
      toast.error('Failed to remove tag');
    }
  };

  useEffect(() => {
    let isMounted = true;
    const decrypt = async () => {
      try {
        const decrypted = await decryptData(item.content, masterKey);
        if (decrypted && isMounted) {
          const parsed = JSON.parse(decrypted);
          setData(parsed);
        } else if (isMounted) {
          setError(true);
        }
      } catch (err) {
        console.error('Password Decryption Error:', err);
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
      <Card className="group h-full relative overflow-hidden border-white/5 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-md transition-all">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl transition-opacity group-hover:opacity-30" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 relative z-10 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 transition-transform group-hover:scale-110 group-hover:rotate-3">
              <Key className="h-5 w-5 text-amber-400" />
            </div>
            <CardTitle className="text-base font-bold text-text transition-colors truncate max-w-[120px]">
              {item.title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              disabled={isPinning}
              className={`h-8 w-8 rounded-full transition-colors ${item.isPinned ? 'text-amber-400 hover:bg-amber-400/20' : 'text-text/20 hover:text-text/70 hover:bg-white/10'}`}
              onClick={() => onTogglePin(item.id)}
            >
              {isPinning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Pin className={`h-4 w-4 ${item.isPinned ? 'fill-current' : ''}`} />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-red-400/20 text-text/20 hover:text-red-400"
              onClick={() => onDelete(item.id, item.title)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-4  pt-4 relative z-10">
          {item.folder && (
            <div className="inline-flex max-w-full items-center rounded-full border border-amber-400/15 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
              <Folder className="h-3 w-3 mr-1.5 text-amber-400/80" />
              <span className="truncate" title={item.folder}>
                {item.folder.length > 10 ? `${item.folder.slice(0, 10)}...` : item.folder}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text/30 transition-colors">
              Credential
            </p>
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5 transition-all hover:bg-white/10 group-hover:border-white/5 border border-transparent">
              <div className="flex flex-col">
                <span className="text-[9px] text-text/40 transition-colors">Username</span>
                <span className="text-sm font-medium text-text transition-colors truncate max-w-[150px]">
                  {data.username || 'No username'}
                </span>
              </div>
              <div className="flex gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg hover:bg-white/10"
                  onClick={() => handleCopy(data.username, item.id + '-u', 'Username')}
                >
                  {copiedId === item.id + '-u' ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-text/40 group-hover:text-text/60" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex flex-col gap-1.5 rounded-xl bg-white/5 px-3 py-2.5 transition-all hover:bg-white/10 border border-transparent group-hover:border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex flex-col flex-1 overflow-hidden">
                  <span className="text-[9px] text-text/40 transition-colors">Password</span>
                  <div className="font-mono text-sm text-text transition-colors truncate">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={isVisible ? 'visible' : 'hidden'}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                      >
                        {isVisible ? data.password : '••••••••••••'}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>
                <div className="flex gap-1 ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg hover:bg-white/10"
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
                    className="h-8 w-8 rounded-lg hover:bg-white/10"
                    onClick={() => handleCopy(data.password, item.id + '-p', 'Password')}
                  >
                    {copiedId === item.id + '-p' ? (
                      <Check className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-text/40 group-hover:text-text/60" />
                    )}
                  </Button>
                </div>
              </div>

              {/* HIBP Breach Checker status badge */}
              <div className="flex items-center gap-1.5 text-[9px] border-t border-white/5 pt-1.5 mt-0.5">
                {breachStatus === 'checking' && (
                  <span className="text-text/40 animate-pulse flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin text-amber-500/80" /> Checking password
                    breach status...
                  </span>
                )}
                {breachStatus === 'safe' && (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    ✓ Checked: Password is secure
                  </span>
                )}
                {breachStatus === 'leaked' && (
                  <span className="text-red-400 font-bold flex items-center gap-1 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                    ⚠️ Compromised: Leaked in {breachCount.toLocaleString()} data breaches!
                  </span>
                )}
                {breachStatus === 'error' && (
                  <span className="text-text/30 flex items-center gap-1">
                    Could not check breach status (offline)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 2FA / TOTP section */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5 transition-all hover:bg-white/10 border border-transparent group-hover:border-white/5">
              <div className="flex flex-col flex-1 overflow-hidden">
                <span className="text-[9px] text-text/40 transition-colors uppercase tracking-wider font-semibold">
                  2FA Authenticator
                </span>

                {isEditing2FA ? (
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      placeholder="Enter 2FA Secret Key"
                      value={edit2FAInput}
                      onChange={(e) => setEdit2FAInput(e.target.value)}
                      className="text-xs h-8 bg-black/25 border-white/10 text-text"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={handleSave2FA}
                      className="h-8 bg-amber-500 hover:bg-amber-600 text-white shrink-0 px-3"
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing2FA(false)}
                      className="h-8 text-text/40 shrink-0"
                    >
                      Cancel
                    </Button>
                    {data.totpSecret && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleDelete2FA}
                        className="h-8 w-8 text-red-400 hover:bg-red-400/10 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ) : data.totpSecret ? (
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-base font-bold tracking-widest text-amber-400 select-all">
                        {formattedCode}
                      </span>
                      <span
                        className={`text-[9px] font-semibold ${totpTimeLeft <= 5 ? 'text-red-400 animate-pulse font-bold' : 'text-text/30'}`}
                      >
                        {totpTimeLeft}s
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:bg-white/10"
                        onClick={() => handleCopy(totpCode, item.id + '-t', '2FA code')}
                      >
                        {copiedId === item.id + '-t' ? (
                          <Check className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-text/40 group-hover:text-text/60" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:bg-white/10 text-text/25 hover:text-text/60"
                        onClick={() => {
                          setEdit2FAInput(data.totpSecret || '');
                          setIsEditing2FA(true);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEdit2FAInput('');
                      setIsEditing2FA(true);
                    }}
                    className="inline-flex items-center gap-1 text-[10px] mt-1.5 text-amber-400/80 hover:text-amber-300 font-semibold focus:outline-none text-left cursor-pointer"
                  >
                    <Plus className="h-3 w-3" /> Set Up 2FA Authenticator
                  </button>
                )}
                {totpError && data.totpSecret && (
                  <span className="text-[9px] text-red-400 font-semibold mt-1">
                    Invalid 2FA Secret Key
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tags section */}
          <div className="space-y-1 border-t border-white/5 pt-3 mt-4">
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {tags.map((tag: string) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 text-[9px] px-2 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium"
                >
                  #{tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="text-amber-400 hover:text-amber-300 ml-0.5 focus:outline-none"
                  >
                    <X className="h-2 w-2" />
                  </button>
                </span>
              ))}
              {isAddingTag ? (
                <input
                  type="text"
                  placeholder="tag..."
                  className="text-[9px] bg-white/5 border border-white/10 rounded px-1.5 py-0.2 text-text focus:outline-none w-14"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTag();
                    if (e.key === 'Escape') setIsAddingTag(false);
                  }}
                  onBlur={handleAddTag}
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => setIsAddingTag(true)}
                  className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.2 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-text/60 transition-colors"
                >
                  <Plus className="h-2 w-2" /> Tag
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-4">
            <span className="text-[9px] text-text/20 transition-colors">
              Last modified {new Date(item.updatedAt).toLocaleDateString()}
            </span>
            <motion.div
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 1 }}
              transition={{
                repeat: Infinity,
                duration: 2,
                repeatType: 'reverse',
              }}
              title="End-to-end encrypted with AES-256-GCM"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/5 border border-emerald-500/10 text-emerald-400/60 font-bold cursor-help"
            >
              <ShieldCheck className="h-2.5 w-2.5" />
              <span className="text-[8px] uppercase tracking-wider">Secure 256</span>
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

export const PasswordManager: React.FC = () => {
  const items = useVaultStore((state) => state.items);
  const addItem = useVaultStore((state) => state.addItem);
  const removeItem = useVaultStore((state) => state.removeItem);
  const masterKey = useVaultStore((state) => state.masterKey);
  const togglePin = useVaultStore((state) => state.togglePin);
  const pinningItemIds = useVaultStore((state) => state.pinningItemIds);
  const targetItemId = useGlobalNavigationStore((state) => state.targetItemId);
  const setTargetItemId = useGlobalNavigationStore((state) => state.setTargetItemId);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newSite, setNewSite] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newTotpSecret, setNewTotpSecret] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(false);

  const passwords = useMemo(() => items.filter((item) => item.type === 'password'), [items]);
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
  } = useVaultFolders('password');

  useEffect(() => {
    if (!targetItemId) return;
    const target = passwords.find((p) => p.id === targetItemId);
    if (target) {
      setCurrentFolder(null);
      setSearchQuery(target.title);
      setTargetItemId(null);
    }
  }, [targetItemId, passwords, setTargetItemId, setCurrentFolder]);
  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const filteredPasswords = useMemo(
    () =>
      sortPinnedFirst(
        passwords.filter((passwordItem) => {
          const matchesSearch =
            normalizedSearchQuery.length === 0 ||
            passwordItem.title.toLowerCase().includes(normalizedSearchQuery);
          const matchesFolder = currentFolder === null || passwordItem.folder === currentFolder;
          return matchesSearch && matchesFolder;
        })
      ),
    [passwords, normalizedSearchQuery, currentFolder]
  );

  const getFolderCount = (folder: string | null) => {
    return passwords.filter((p) => folder === null || p.folder === folder).length;
  };

  const handleAdd = async () => {
    if (!masterKey || !newSite || !newPassword) {
      toast.error('Please fill in all required fields');
      return;
    }

    const targetFolder = currentFolder;

    setIsSaving(true);
    try {
      const encryptedData = await encryptData(
        JSON.stringify({
          username: newUsername,
          password: newPassword,
          totpSecret: newTotpSecret.trim(),
        }),
        masterKey
      );

      await addItem({
        type: 'password',
        title: newSite,
        content: encryptedData,
        folder: targetFolder || undefined,
      });

      setIsAdding(false);
      setNewSite('');
      setNewUsername('');
      setNewPassword('');
      setNewTotpSecret('');
      toast.success(`Password for ${newSite} saved`);
      logActivity({
        actionType: 'password_create',
        itemName: newSite,
        description: 'Credential created',
        status: 'success',
      });
    } catch (err) {
      console.error('Save Password Error:', err);
      toast.error('Failed to save password');
    } finally {
      setIsSaving(false);
    }
  };

  const generatePassword = () => {
    // Generates a password with default length (32), configurable between 16-64
    const pass = generateSecurePassword(PASSWORD_CONFIG.DEFAULT_LENGTH);
    setNewPassword(pass);
    toast.info(`Secure ${pass.length} character password generated`);
  };

  return (
    <div className="relative flex h-full min-h-0 gap-6">
      <FolderSidebar
        items={passwords}
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
        title="Password Categories"
        allItemLabel="All Passwords"
        allItemIcon={<Key className="h-4 w-4" />}
      />

      <MobileFolderMenu
        isOpen={isMobileFolderOpen}
        onClose={() => setIsMobileFolderOpen(false)}
        items={passwords}
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
        title="Password Categories"
        allItemLabel="All Passwords"
        allItemIcon={<Key className="h-4 w-4" />}
      />

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar space-y-6 pr-2">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1
                className="text-3xl font-bold text-text transition-colors truncate"
                title={currentFolder || 'Passwords'}
              >
                {currentFolder
                  ? currentFolder.length > 15
                    ? `${currentFolder.slice(0, 15)}...`
                    : currentFolder
                  : 'Passwords'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-text/5 border border-text/10 text-text/50 text-xs font-bold shadow-inner whitespace-nowrap">
                {getFolderCount(currentFolder)} items
              </span>
            </div>
            <p className="text-text/50 transition-colors truncate">
              Manage your credentials securely.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              onClick={() => setIsAdding(true)}
              size="sm"
              className="hidden sm:flex transition-all"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Password
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
              placeholder="Search websites..."
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
                  <CardTitle className="text-lg text-text transition-colors">
                    New Credential
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      placeholder="Website / App Name"
                      value={newSite}
                      onChange={(e) => setNewSite(e.target.value)}
                    />
                    <Input
                      placeholder="Username / Email"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="Password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <Button variant="secondary" onClick={generatePassword}>
                        Generate
                      </Button>
                    </div>
                    <Input
                      placeholder="2FA / TOTP Secret (optional)"
                      value={newTotpSecret}
                      onChange={(e) => setNewTotpSecret(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={() => setIsAdding(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAdd}
                      className="bg-amber-500 text-white hover:bg-amber-600 min-w-[140px]"
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Password'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {filteredPasswords.length === 0 && !isAdding && (
          <div
            className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => setIsAdding(true)}
          >
            <Key className="mb-4 h-16 w-16" />
            <p className="text-lg">No credentials found.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 pb-8 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
          {filteredPasswords.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(event) => setDraggedVaultItem(event, item.id)}
              onTouchStart={(event) => setDraggedVaultItem(event as any, item.id)}
              onTouchMove={() => {
                /* Allow custom touch drag logic */
              }}
              title="Drag to a folder to move this password"
            >
              <DecryptedPasswordCard
                item={item}
                masterKey={masterKey!}
                onDelete={(id, title) => {
                  if (confirm(`Are you sure you want to delete the credentials for ${title}?`)) {
                    removeItem(id);
                    toast.success(`Password for ${title} deleted`);
                    logActivity({
                      actionType: 'password_delete',
                      itemName: title,
                      description: 'Credential deleted',
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
