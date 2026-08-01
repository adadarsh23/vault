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
  Wifi,
  AlertTriangle,
  Menu,
  Folder,
  Loader2,
  Pin,
  QrCode,
  Download,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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

interface WifiPayload {
  ssid: string;
  security: 'WPA2/WPA3' | 'WPA2' | 'WPA3' | 'WEP' | 'Open';
  passwordKey: string;
  notes: string;
}

const emptyPayload = (): WifiPayload => ({
  ssid: '',
  security: 'WPA2/WPA3',
  passwordKey: '',
  notes: '',
});

const getWifiQrString = (payload: WifiPayload): string => {
  const securityType =
    payload.security === 'Open' ? 'nopass' : payload.security === 'WEP' ? 'WEP' : 'WPA';
  // Format: WIFI:S:SSID;T:WPA;P:PASSWORD;;
  // Escape special chars in SSID and Password
  const escapeString = (str: string) => {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/:/g, '\\:')
      .replace(/,/g, '\\,');
  };
  const escapedSsid = escapeString(payload.ssid);
  const escapedPassword = escapeString(payload.passwordKey);
  return `WIFI:S:${escapedSsid};T:${securityType};P:${escapedPassword};;`;
};

const DecryptedWifiItem: React.FC<{
  item: VaultItem;
  masterKey: string | CryptoKey;
  onUpdate: (id: string, name: string, payload: WifiPayload) => Promise<void>;
  onDelete: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  isPinning: boolean;
}> = React.memo(({ item, masterKey, onUpdate, onDelete, onTogglePin, isPinning }) => {
  const [data, setData] = useState<WifiPayload | null>(null);
  const [error, setError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.title);
  const [editPayload, setEditPayload] = useState<WifiPayload>(emptyPayload());
  const [showQr, setShowQr] = useState(false);
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

        const parsed = parseJsonSafely<WifiPayload>(decrypted);
        if (!parsed) {
          if (isMounted) setError(true);
          return;
        }

        setData(parsed);
        setEditPayload(parsed);
      } catch (err) {
        console.error('Wi-Fi Decryption Error:', err);
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
        description: 'Wi-Fi credentials updated',
        status: 'success',
      });
    } catch (err) {
      logActivity({
        actionType: 'item_update',
        itemName: editName,
        description: 'Wi-Fi credentials update failed',
        status: 'failure',
      });
    }
  };

  const downloadQrCode = () => {
    if (!data) return;
    const svgElement = document.getElementById(`wifi-qr-${item.id}`);
    if (!svgElement) return;

    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 300, 300);
        context.drawImage(image, 10, 10, 280, 280);
        const pngURL = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = pngURL;
        downloadLink.download = `${data.ssid}_wifi_qr.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        toast.success(`Downloaded QR Code for ${data.ssid}`);
      }
    };
    image.src = blobURL;
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

  const qrValue = getWifiQrString(data);

  return (
    <motion.div whileHover={{ y: -5 }} className="h-full">
      <Card className="group relative h-full overflow-hidden border-white/5 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-md transition-all hover:border-white/20 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl transition-opacity group-hover:opacity-30" />

        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 relative z-10 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 transition-transform group-hover:scale-110 group-hover:rotate-3">
              <Wifi className="h-5 w-5 text-amber-400" />
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
                <span className="text-[9px] font-bold text-amber-400/60 uppercase tracking-wider">
                  {data.security} Protocol
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
                  className="h-8 w-8 rounded-full hover:bg-amber-400/20 text-amber-400"
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
                  className={`h-8 w-8 rounded-full ${item.isPinned ? 'text-amber-400 hover:bg-amber-400/20' : 'text-text/20 hover:text-text/60 hover:bg-white/10'} transition-colors`}
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
            <div className="inline-flex max-w-full items-center rounded-full border border-amber-400/15 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
              <Folder className="h-3 w-3 mr-1.5 text-amber-400/80" />
              <span className="truncate">{item.folder}</span>
            </div>
          )}

          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-bold text-text/30 uppercase tracking-wider block mb-1">
                  SSID (Network Name)
                </label>
                <Input
                  placeholder="Network SSID"
                  value={editPayload.ssid}
                  onChange={(e) => setEditPayload({ ...editPayload, ssid: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-text/30 uppercase tracking-wider block mb-1">
                  Security Type
                </label>
                <select
                  value={editPayload.security}
                  onChange={(e: any) =>
                    setEditPayload({ ...editPayload, security: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/5 text-text rounded-xl p-2.5 text-sm focus:outline-none focus:border-white/20"
                >
                  <option value="WPA2/WPA3" className="bg-bg text-text">
                    WPA2/WPA3
                  </option>
                  <option value="WPA3" className="bg-bg text-text">
                    WPA3
                  </option>
                  <option value="WPA2" className="bg-bg text-text">
                    WPA2
                  </option>
                  <option value="WEP" className="bg-bg text-text">
                    WEP
                  </option>
                  <option value="Open" className="bg-bg text-text">
                    Open
                  </option>
                </select>
              </div>
              {editPayload.security !== 'Open' && (
                <div>
                  <label className="text-[9px] font-bold text-text/30 uppercase tracking-wider block mb-1">
                    Password
                  </label>
                  <Input
                    placeholder="Wi-Fi Password"
                    value={editPayload.passwordKey}
                    onChange={(e) =>
                      setEditPayload({ ...editPayload, passwordKey: e.target.value })
                    }
                  />
                </div>
              )}
              <div>
                <label className="text-[9px] font-bold text-text/30 uppercase tracking-wider block mb-1">
                  Location / Notes
                </label>
                <Input
                  placeholder="Notes (e.g. Living Room Router)"
                  value={editPayload.notes}
                  onChange={(e) => setEditPayload({ ...editPayload, notes: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text/40 font-semibold">Network SSID:</span>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-text/90 select-all">{data.ssid}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded hover:bg-white/10"
                      onClick={() => handleCopy(data.ssid, item.id + '-ssid', 'SSID')}
                    >
                      {copiedId === item.id + '-ssid' ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3 text-text/40" />
                      )}
                    </Button>
                  </div>
                </div>

                {data.security !== 'Open' && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-text/40 font-semibold">Password:</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-text/90 font-medium select-all">
                        {isVisible ? data.passwordKey : '••••••••'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded hover:bg-white/10"
                        onClick={() => setIsVisible(!isVisible)}
                      >
                        {isVisible ? (
                          <EyeOff className="h-3.5 w-3.5 text-text/40" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 text-text/40" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded hover:bg-white/10"
                        onClick={() => handleCopy(data.passwordKey, item.id + '-pw', 'Password')}
                      >
                        {copiedId === item.id + '-pw' ? (
                          <Check className="h-3 w-3 text-green-400" />
                        ) : (
                          <Copy className="h-3 w-3 text-text/40" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {data.notes && (
                  <div className="text-xs text-text/50 bg-white/[0.02] border border-white/5 p-2 rounded-xl">
                    <span className="font-semibold block text-[10px] text-text/30 uppercase tracking-wider mb-0.5">
                      Notes
                    </span>
                    {data.notes}
                  </div>
                )}
              </div>

              {/* QR Code and Share Details */}
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2 border-white/5 hover:border-white/20 bg-white/5 h-10 text-xs font-semibold"
                  onClick={() => setShowQr(!showQr)}
                >
                  <QrCode className="h-4 w-4" />
                  {showQr ? 'Hide Shareable QR Code' : 'Generate Visitor QR Code'}
                </Button>

                <AnimatePresence>
                  {showQr && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center gap-3 border border-white/10 shadow-lg"
                    >
                      <QRCodeSVG
                        id={`wifi-qr-${item.id}`}
                        value={qrValue}
                        size={150}
                        bgColor="#ffffff"
                        fgColor="#000000"
                        includeMargin={true}
                      />
                      <div className="text-center space-y-1">
                        <span className="text-[10px] font-bold text-zinc-600 block">
                          Scan to Join Network
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-3 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 text-xs font-semibold flex items-center gap-1.5"
                          onClick={downloadQrCode}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download PNG
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Tags */}
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

export const WifiVault: React.FC = () => {
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
  } = useVaultFolders('wifi');

  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(false);

  // Form State
  const [newName, setNewName] = useState('');
  const [formPayload, setFormPayload] = useState<WifiPayload>(emptyPayload());

  const wifis = useMemo(() => {
    return items.filter((item) => item.type === 'wifi');
  }, [items]);

  const suggestions = useMemo(() => {
    return wifis.map((item) => item.title).filter(Boolean);
  }, [wifis]);

  const filteredWifis = useMemo(() => {
    let result = wifis;
    if (currentFolder) {
      result = result.filter((item) => item.folder === currentFolder);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) || item.metadata?.ssid?.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => {
      const aPinned = a.isPinned ? 1 : 0;
      const bPinned = b.isPinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return b.createdAt - a.createdAt;
    });
  }, [wifis, currentFolder, searchQuery]);

  const handleCreateWifi = async () => {
    const trimmedTitle = newName.trim() || formPayload.ssid.trim() || 'New Wi-Fi';
    if (!masterKey) return;

    setIsSaving(true);
    try {
      const encryptedContent = await encryptData(JSON.stringify(formPayload), masterKey);
      await addItem({
        type: 'wifi',
        title: trimmedTitle,
        content: encryptedContent,
        folder: currentFolder || undefined,
        metadata: {
          ssid: formPayload.ssid,
          security: formPayload.security,
        },
      });

      setIsAdding(false);
      setNewName('');
      setFormPayload(emptyPayload());
      toast.success(`Wi-Fi network "${trimmedTitle}" saved securely`);
    } catch {
      toast.error('Failed to save Wi-Fi network');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateWifi = async (id: string, name: string, payload: WifiPayload) => {
    if (!masterKey) return;
    try {
      const encryptedContent = await encryptData(JSON.stringify(payload), masterKey);
      await updateItem(id, {
        title: name.trim() || payload.ssid || 'Updated Wi-Fi',
        content: encryptedContent,
        metadata: {
          ssid: payload.ssid,
          security: payload.security,
        },
      });
      toast.success('Wi-Fi network credentials updated');
    } catch {
      toast.error('Failed to update Wi-Fi credentials');
    }
  };

  return (
    <div className="relative flex h-full min-h-0 gap-6">
      <FolderSidebar
        items={wifis}
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
        title="Wi-Fi Categories"
        allItemLabel="All Wi-Fi Networks"
        allItemIcon={<Wifi className="h-4 w-4" />}
      />

      <MobileFolderMenu
        isOpen={isMobileFolderOpen}
        onClose={() => setIsMobileFolderOpen(false)}
        items={wifis}
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
        title="Wi-Fi Categories"
        allItemLabel="All Wi-Fi Networks"
        allItemIcon={<Wifi className="h-4 w-4" />}
      />

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar space-y-6 pr-2">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-text truncate">
                {currentFolder || 'Wi-Fi Networks'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-text/5 border border-text/10 text-text/50 text-xs font-bold shadow-inner">
                {filteredWifis.length} items
              </span>
            </div>
            <p className="text-text/50 truncate">
              Store home network details, security protocols, and auto-generate QR codes for
              visitors.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              onClick={() => setIsAdding(true)}
              size="sm"
              className="hidden sm:flex transition-all"
            >
              <Plus className="mr-2 h-4 w-4" /> Add Wi-Fi
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
              placeholder="Search networks..."
              className="pl-10 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              suggestions={suggestions}
              historyKey="wifi"
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
              <Card className="border-white/10 bg-gradient-to-br from-white/10 to-transparent backdrop-blur-md">
                <CardHeader>
                  <CardTitle className="text-lg text-text">New Wi-Fi Network</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text/30 block mb-1">
                          Network Nickname
                        </label>
                        <Input
                          placeholder="e.g. Guest Wi-Fi / Home Router"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text/30 block mb-1">
                          Network SSID (Name)
                        </label>
                        <Input
                          placeholder="SSID"
                          value={formPayload.ssid}
                          onChange={(e) => setFormPayload({ ...formPayload, ssid: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text/30 block mb-1">
                          Security Protocol
                        </label>
                        <select
                          value={formPayload.security}
                          onChange={(e: any) =>
                            setFormPayload({ ...formPayload, security: e.target.value })
                          }
                          className="w-full bg-white/5 border border-white/5 text-text rounded-xl p-2.5 text-sm focus:outline-none focus:border-white/20"
                        >
                          <option value="WPA2/WPA3" className="bg-bg text-text">
                            WPA2/WPA3
                          </option>
                          <option value="WPA3" className="bg-bg text-text">
                            WPA3
                          </option>
                          <option value="WPA2" className="bg-bg text-text">
                            WPA2
                          </option>
                          <option value="WEP" className="bg-bg text-text">
                            WEP
                          </option>
                          <option value="Open" className="bg-bg text-text">
                            Open
                          </option>
                        </select>
                      </div>
                      {formPayload.security !== 'Open' && (
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text/30 block mb-1">
                            Password
                          </label>
                          <Input
                            placeholder="Password"
                            value={formPayload.passwordKey}
                            onChange={(e) =>
                              setFormPayload({ ...formPayload, passwordKey: e.target.value })
                            }
                          />
                        </div>
                      )}
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text/30 block mb-1">
                          Location / Notes
                        </label>
                        <Input
                          placeholder="e.g. Living Room Router"
                          value={formPayload.notes}
                          onChange={(e) =>
                            setFormPayload({ ...formPayload, notes: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                    <Button variant="ghost" onClick={() => setIsAdding(false)}>
                      Cancel
                    </Button>
                    <Button
                      className="bg-amber-500 hover:bg-amber-600 text-white min-w-[130px]"
                      onClick={handleCreateWifi}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        'Save Network'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {filteredWifis.length === 0 && !isAdding && (
          <div
            className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => setIsAdding(true)}
          >
            <Wifi className="mb-4 h-16 w-16" />
            <p className="text-lg">No Wi-Fi credentials found.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 pb-8 md:grid-cols-2 xl:grid-cols-2">
          {filteredWifis.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(event) => setDraggedVaultItem(event, item.id)}
              onTouchStart={(event) => setDraggedVaultItem(event as any, item.id)}
            >
              <DecryptedWifiItem
                item={item}
                masterKey={masterKey!}
                onUpdate={handleUpdateWifi}
                onDelete={(id, title) => {
                  if (confirm(`Are you sure you want to delete "${title}"?`)) {
                    removeItem(id);
                    toast.success(`Deleted Wi-Fi "${title}"`);
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
