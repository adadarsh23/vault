import React, { useState, useEffect, useMemo } from 'react';
import * as OTPAuth from 'otpauth';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { SearchInput } from '../../components/ui/SearchInput';
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
  Settings,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useGlobalNavigationStore } from '../../store/globalNavigationStore';
import { toast } from 'sonner';
import { useVaultStore } from '../../store/vaultStore';
import { encryptData, decryptData } from '../../lib/cryptoPrimitives';
import { useClipboard } from '../../hooks/useClipboard';
import { motion, AnimatePresence } from 'framer-motion';
import { logActivity } from '../../lib/activity';
import { setDraggedVaultItem, clearDraggedVaultItem } from '../../lib/vaultDragDrop';
import { sortPinnedFirst } from '../../lib/pinning';

import { FolderSidebar } from '../../components/vault/FolderSidebar';
import { MobileFolderMenu } from '../../components/vault/MobileFolderMenu';
import { TagManager } from '../../components/vault/TagManager';
import { useVaultFolders } from '../../hooks/useVaultFolders';
import {
  generateSecurePassword,
  PASSWORD_CONFIG,
  generatePasswordWithOptions,
  evaluatePasswordStrength,
} from '../../lib/passwordGenerator';

const PasswordStrengthMeter: React.FC<{ password?: string }> = ({ password = '' }) => {
  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);

  if (!password) return null;

  return (
    <div className="space-y-1.5 mt-1.5 text-xs">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
        <span className="text-text/40">Password Strength</span>
        <span className={`${strength.color.replace('bg-', 'text-')} font-bold`}>
          {strength.label}
        </span>
      </div>
      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full ${strength.color} transition-all duration-300`}
          style={{ width: `${strength.percentage}%` }}
        />
      </div>
      {strength.suggestions.length > 0 && (
        <ul className="text-[9px] text-text/40 list-disc list-inside space-y-0.5 mt-1">
          {strength.suggestions.slice(0, 2).map((s, idx) => (
            <li key={idx} className="truncate">
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const PasswordGeneratorPanel: React.FC<{
  onSelectPassword: (pass: string) => void;
  initialLength?: number;
}> = ({ onSelectPassword, initialLength = 20 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [length, setLength] = useState(initialLength);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeConfusing, setExcludeConfusing] = useState(true);

  const [passphrase, setPassphrase] = useState(false);
  const [numWords, setNumWords] = useState(4);
  const [separator, setSeparator] = useState('-');
  const [capitalize, setCapitalize] = useState(true);

  const handleGenerate = () => {
    const generated = generatePasswordWithOptions({
      length,
      uppercase,
      lowercase,
      numbers,
      symbols,
      excludeConfusing,
      passphrase,
      numWords,
      separator,
      capitalize,
    });
    onSelectPassword(generated);
  };

  useEffect(() => {
    handleGenerate();
  }, [
    length,
    uppercase,
    lowercase,
    numbers,
    symbols,
    excludeConfusing,
    passphrase,
    numWords,
    separator,
    capitalize,
  ]);

  const generateSuggestion = (type: 'random' | 'passphrase' | 'pin') => {
    let pass = '';
    if (type === 'random') {
      pass = generatePasswordWithOptions({
        length: 16,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
      });
    } else if (type === 'passphrase') {
      pass = generatePasswordWithOptions({
        passphrase: true,
        numWords: 4,
        separator: '-',
        capitalize: true,
      });
    } else if (type === 'pin') {
      pass = generatePasswordWithOptions({
        length: 6,
        uppercase: false,
        lowercase: false,
        numbers: true,
        symbols: false,
      });
    }
    onSelectPassword(pass);
    toast.info(`Generated ${type} style password`);
  };

  return (
    <div className="space-y-3 p-3 sm:p-3.5 rounded-xl bg-black/20 border border-white/5 mt-1.5 transition-all text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-text/70 flex items-center gap-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          Quick Suggestions:
        </span>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer focus:outline-none text-[11px] sm:text-xs"
        >
          <Settings className="h-3.5 w-3.5" />
          {isOpen ? 'Hide Options' : 'Customize Generator'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => generateSuggestion('random')}
          className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-medium hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/20 transition-all focus:outline-none cursor-pointer"
        >
          Random (Strong)
        </button>
        <button
          type="button"
          onClick={() => generateSuggestion('passphrase')}
          className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-medium hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/20 transition-all focus:outline-none cursor-pointer"
        >
          Passphrase (Memorable)
        </button>
        <button
          type="button"
          onClick={() => generateSuggestion('pin')}
          className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-medium hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/20 transition-all focus:outline-none cursor-pointer"
        >
          6-Digit PIN
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          className="p-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/15 transition-all ml-auto focus:outline-none cursor-pointer shrink-0"
          title="Regenerate"
        >
          <RefreshCw className="h-3.5 w-3.5 text-text/60" />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-3 pt-2 border-t border-white/5"
          >
            <div className="flex rounded-lg bg-black/30 p-0.5 border border-white/5 w-full">
              <button
                type="button"
                className={`flex-1 py-1 px-2 rounded-md text-center text-[10px] font-bold uppercase tracking-wider transition-colors ${!passphrase ? 'bg-amber-500 text-white font-bold' : 'text-text/40 hover:text-text/70'}`}
                onClick={() => setPassphrase(false)}
              >
                Random Characters
              </button>
              <button
                type="button"
                className={`flex-1 py-1 px-2 rounded-md text-center text-[10px] font-bold uppercase tracking-wider transition-colors ${passphrase ? 'bg-amber-500 text-white font-bold' : 'text-text/40 hover:text-text/70'}`}
                onClick={() => setPassphrase(true)}
              >
                Memorable Words
              </button>
            </div>

            {!passphrase ? (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-text/50 font-medium">
                    <span>Length: {length} chars</span>
                    <span>8 - 64</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="64"
                    value={length}
                    onChange={(e) => setLength(parseInt(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                  <label className="flex items-center gap-1.5 text-text/70 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={uppercase}
                      onChange={(e) => setUppercase(e.target.checked)}
                      className="rounded border-white/10 bg-black/20 text-amber-500 focus:ring-0 focus:ring-offset-0"
                    />
                    Uppercase (A-Z)
                  </label>
                  <label className="flex items-center gap-1.5 text-text/70 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={lowercase}
                      onChange={(e) => setLowercase(e.target.checked)}
                      className="rounded border-white/10 bg-black/20 text-amber-500 focus:ring-0 focus:ring-offset-0"
                    />
                    Lowercase (a-z)
                  </label>
                  <label className="flex items-center gap-1.5 text-text/70 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={numbers}
                      onChange={(e) => setNumbers(e.target.checked)}
                      className="rounded border-white/10 bg-black/20 text-amber-500 focus:ring-0 focus:ring-offset-0"
                    />
                    Numbers (0-9)
                  </label>
                  <label className="flex items-center gap-1.5 text-text/70 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={symbols}
                      onChange={(e) => setSymbols(e.target.checked)}
                      className="rounded border-white/10 bg-black/20 text-amber-500 focus:ring-0 focus:ring-offset-0"
                    />
                    Symbols (!@#$)
                  </label>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-text/50 font-medium">
                    <span>Number of words: {numWords}</span>
                    <span>3 - 8</span>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="8"
                    value={numWords}
                    onChange={(e) => setNumWords(parseInt(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] items-center">
                  <label className="flex items-center gap-1.5 text-text/70 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={capitalize}
                      onChange={(e) => setCapitalize(e.target.checked)}
                      className="rounded border-white/10 bg-black/20 text-amber-500 focus:ring-0 focus:ring-offset-0"
                    />
                    Capitalize words
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-text/50 shrink-0">Sep:</span>
                    <select
                      value={separator}
                      onChange={(e) => setSeparator(e.target.value)}
                      className="w-full bg-black/35 border border-white/10 rounded px-1.5 py-1 text-text focus:outline-none text-[10px]"
                    >
                      <option value="-">Hyphen (-)</option>
                      <option value="_">Underscore (_)</option>
                      <option value=" ">Space ( )</option>
                      <option value="">None</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="border-t border-white/5 pt-2">
              <label className="flex items-center gap-1.5 text-[10px] text-text/70 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={excludeConfusing}
                  onChange={(e) => setExcludeConfusing(e.target.checked)}
                  className="rounded border-white/10 bg-black/20 text-amber-500 focus:ring-0 focus:ring-offset-0"
                />
                Exclude confusing characters (e.g. 1, l, I, 0, O)
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

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

  useEffect(() => {
    let isMounted = true;
    const decrypt = async () => {
      try {
        let decrypted = await decryptData(item.content, masterKey);
        if (!decrypted && typeof item.content === 'string') {
          decrypted = item.content;
        }
        if (decrypted && isMounted) {
          try {
            const parsed = JSON.parse(decrypted);
            setData(parsed);
          } catch {
            setData({ username: item.title, password: decrypted, totpSecret: '' });
          }
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
      <Card className="group h-full relative overflow-hidden border-white/5 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-md transition-all hover:border-white/20 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl transition-opacity group-hover:opacity-30" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 sm:p-5 pb-3 sm:pb-4 relative z-10 border-b border-white/5 gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 transition-transform group-hover:scale-110 group-hover:rotate-3">
              <Key className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400" />
            </div>
            <CardTitle
              className="text-sm sm:text-base font-bold text-text transition-colors truncate"
              title={item.title}
            >
              {item.title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              disabled={isPinning}
              className={`h-8 w-8 rounded-full transition-colors ${item.isPinned ? 'text-amber-400 hover:bg-amber-400/20' : 'text-text/30 sm:text-text/20 hover:text-text/70 hover:bg-white/10'}`}
              onClick={() => onTogglePin(item.id)}
              title={item.isPinned ? 'Unpin credential' : 'Pin credential'}
            >
              {isPinning ? (
                <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
              ) : (
                <Pin
                  className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${item.isPinned ? 'fill-current' : ''}`}
                />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-red-400/20 text-text/30 sm:text-text/20 hover:text-red-400 transition-colors"
              onClick={() => onDelete(item.id, item.title)}
              title="Delete credential"
            >
              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 md:p-6 space-y-3.5 sm:space-y-4 pt-3.5 sm:pt-4 relative z-10">
          {item.folder && (
            <div className="inline-flex max-w-full items-center rounded-full border border-amber-400/15 bg-amber-400/10 px-2.5 py-0.5 sm:py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
              <Folder className="h-3 w-3 mr-1.5 text-amber-400/80 shrink-0" />
              <span className="truncate" title={item.folder}>
                {item.folder}
              </span>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text/30 transition-colors">
              Credential
            </p>
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 sm:py-2.5 transition-all hover:bg-white/10 group-hover:border-white/5 border border-transparent gap-2">
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[9px] text-text/40 transition-colors">Username / Email</span>
                <span
                  className="text-xs sm:text-sm font-medium text-text transition-colors truncate"
                  title={data.username || 'No username'}
                >
                  {data.username || 'No username'}
                </span>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg hover:bg-white/10"
                  onClick={() => handleCopy(data.username, item.id + '-u', 'Username')}
                  title="Copy username"
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

          <div className="space-y-1 pt-0.5">
            <div className="flex flex-col gap-1.5 rounded-xl bg-white/5 px-3 py-2 sm:py-2.5 transition-all hover:bg-white/10 border border-transparent group-hover:border-white/5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                  <span className="text-[9px] text-text/40 transition-colors">Password</span>
                  <div className="font-mono text-xs sm:text-sm text-text transition-colors truncate">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={isVisible ? 'visible' : 'hidden'}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="select-all"
                      >
                        {isVisible ? data.password : '••••••••••••'}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg hover:bg-white/10"
                    onClick={() => setIsVisible(!isVisible)}
                    title={isVisible ? 'Hide password' : 'Show password'}
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
                    className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg hover:bg-white/10"
                    onClick={() => handleCopy(data.password, item.id + '-p', 'Password')}
                    title="Copy password"
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
              <div className="flex items-center gap-1.5 text-[9px] border-t border-white/5 pt-1.5 mt-0.5 flex-wrap">
                {breachStatus === 'checking' && (
                  <span className="text-text/40 animate-pulse flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin text-amber-500/80 shrink-0" /> Checking
                    password breach status...
                  </span>
                )}
                {breachStatus === 'safe' && (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    ✓ Checked: Password is secure
                  </span>
                )}
                {breachStatus === 'leaked' && (
                  <span className="text-red-400 font-bold flex items-center gap-1 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 break-all sm:break-normal">
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
          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 sm:py-2.5 transition-all hover:bg-white/10 border border-transparent group-hover:border-white/5">
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[9px] text-text/40 transition-colors uppercase tracking-wider font-semibold">
                  2FA Authenticator
                </span>

                {isEditing2FA ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2">
                    <Input
                      placeholder="Enter 2FA Secret Key"
                      value={edit2FAInput}
                      onChange={(e) => setEdit2FAInput(e.target.value)}
                      className="text-xs h-8 bg-black/25 border-white/10 text-text w-full flex-1"
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        onClick={handleSave2FA}
                        className="h-8 bg-amber-500 hover:bg-amber-600 text-white text-xs px-3"
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing2FA(false)}
                        className="h-8 text-text/40 hover:text-text text-xs px-2.5"
                      >
                        Cancel
                      </Button>
                      {data.totpSecret && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleDelete2FA}
                          className="h-8 w-8 text-red-400 hover:bg-red-400/10 shrink-0"
                          title="Remove 2FA Secret"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ) : data.totpSecret ? (
                  <div className="flex items-center justify-between mt-1 gap-2">
                    <div className="flex items-baseline gap-2 min-w-0 flex-1">
                      <span className="font-mono text-sm sm:text-base font-bold tracking-widest text-amber-400 select-all truncate">
                        {formattedCode}
                      </span>
                      <span
                        className={`text-[9px] font-semibold shrink-0 ${totpTimeLeft <= 5 ? 'text-red-400 animate-pulse font-bold' : 'text-text/30'}`}
                      >
                        {totpTimeLeft}s
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg hover:bg-white/10"
                        onClick={() => handleCopy(totpCode, item.id + '-t', '2FA code')}
                        title="Copy 2FA code"
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
                        className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg hover:bg-white/10 text-text/25 hover:text-text/60"
                        onClick={() => {
                          setEdit2FAInput(data.totpSecret || '');
                          setIsEditing2FA(true);
                        }}
                        title="Edit 2FA secret"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
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
          <div className="border-t border-white/5 pt-3 mt-3 sm:mt-4">
            <TagManager item={item} size="sm" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3 mt-3 sm:mt-4">
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
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/5 border border-emerald-500/10 text-emerald-400/60 font-bold cursor-help shrink-0"
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

  const suggestions = useMemo(() => {
    const titles = passwords.map((p) => p.title);
    return Array.from(new Set(titles));
  }, [passwords]);

  useEffect(() => {
    if (!targetItemId) return;
    const target = passwords.find((p) => p.id === targetItemId);
    if (target) {
      setCurrentFolder(null);
      setSearchQuery(target.title);
      setTargetItemId(null);
    }
  }, [targetItemId, passwords, setTargetItemId, setCurrentFolder]);

  useEffect(() => {
    const handlePanicLock = () => {
      setIsAdding(false);
      setNewSite('');
      setNewUsername('');
      setNewPassword('');
      setNewTotpSecret('');
    };
    window.addEventListener('vault:panic-lock', handlePanicLock);
    return () => window.removeEventListener('vault:panic-lock', handlePanicLock);
  }, []);
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
        }),
      ),
    [passwords, normalizedSearchQuery, currentFolder],
  );

  const getFolderCount = (folder: string | null) => {
    return passwords.filter((p) => folder === null || p.folder === folder).length;
  };

  const handleAdd = async () => {
    if ((!masterKey && !useVaultStore.getState().isDecoyMode) || !newSite || !newPassword) {
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
        masterKey,
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
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 mb-1 flex-wrap">
              <h1
                className="text-2xl sm:text-3xl font-bold text-text transition-colors truncate"
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
            <p className="text-text/50 transition-colors truncate text-xs sm:text-sm">
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
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/30 z-10 pointer-events-none transition-colors" />
            <SearchInput
              placeholder="Search websites..."
              className="pl-10 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              suggestions={suggestions}
              historyKey="passwords"
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
                <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-white/5">
                  <CardTitle className="text-base sm:text-lg text-text transition-colors">
                    New Credential
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 space-y-4 pt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-text/40 tracking-wider">
                        Website / App Name
                      </label>
                      <Input
                        placeholder="e.g. Google, GitHub, Netflix"
                        value={newSite}
                        onChange={(e) => setNewSite(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-text/40 tracking-wider">
                        Username / Email
                      </label>
                      <Input
                        placeholder="e.g. user@example.com"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-text/40 tracking-wider">
                        Master Password
                      </label>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            placeholder="Password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="flex-1"
                          />
                          <Button
                            variant="secondary"
                            onClick={generatePassword}
                            type="button"
                            className="shrink-0"
                          >
                            Generate
                          </Button>
                        </div>
                        <PasswordStrengthMeter password={newPassword} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-text/40 tracking-wider">
                        2FA / TOTP Secret (Optional)
                      </label>
                      <Input
                        placeholder="e.g. JBSWY3DPEHPK3PXP"
                        value={newTotpSecret}
                        onChange={(e) => setNewTotpSecret(e.target.value)}
                      />
                    </div>
                  </div>

                  <PasswordGeneratorPanel onSelectPassword={setNewPassword} />

                  <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-white/5">
                    <span className="text-[10px] text-text/30 font-medium text-center sm:text-left">
                      End-to-end encrypted with AES-256-GCM
                    </span>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => setIsAdding(false)}
                        disabled={isSaving}
                        className="flex-1 sm:flex-initial"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAdd}
                        className="bg-amber-500 text-white hover:bg-amber-600 min-w-[130px] flex-1 sm:flex-initial shadow-lg shadow-amber-500/20"
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save'
                        )}
                      </Button>
                    </div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 pb-8">
          {filteredPasswords.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(event) => setDraggedVaultItem(event, item.id)}
              onDragEnd={clearDraggedVaultItem}
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
