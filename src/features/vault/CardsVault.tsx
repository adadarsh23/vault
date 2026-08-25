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
  CreditCard,
  AlertTriangle,
  Menu,
  Folder,
  Loader2,
  Pin,
  Banknote,
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

import { FolderSidebar } from '../../components/vault/FolderSidebar';
import { MobileFolderMenu } from '../../components/vault/MobileFolderMenu';
import { TagManager } from '../../components/vault/TagManager';
import { useVaultFolders } from '../../hooks/useVaultFolders';
import { useGlobalNavigationStore } from '../../store/globalNavigationStore';

interface CardPayload {
  cardholderName: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  cardType: string;
}

const emptyPayload = (): CardPayload => ({
  cardholderName: '',
  cardNumber: '',
  expiryMonth: '',
  expiryYear: '',
  cvv: '',
  bankName: '',
  accountNumber: '',
  routingNumber: '',
  cardType: 'Visa',
});

const detectCardType = (number: string): string => {
  const cleanNumber = number.replace(/\D/g, '');
  if (/^4/.test(cleanNumber)) return 'Visa';
  if (/^5[1-5]/.test(cleanNumber)) return 'Mastercard';
  if (/^3[47]/.test(cleanNumber)) return 'American Express';
  if (/^6(?:011|5)/.test(cleanNumber)) return 'Discover';
  return 'Credit Card';
};

const formatCardNumber = (number: string): string => {
  const clean = number.replace(/\D/g, '').slice(0, 16);
  const matches = clean.match(/\d{1,4}/g);
  return matches ? matches.join(' ') : clean;
};

const formatCvv = (cvv: string): string => {
  return cvv.replace(/\D/g, '').slice(0, 4);
};

const VisualCreditCard: React.FC<{
  cardholderName: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  bankName: string;
  cardType: string;
  isVisible: boolean;
  isFlipped: boolean;
  onClick?: () => void;
}> = ({
  cardholderName,
  cardNumber,
  expiryMonth,
  expiryYear,
  cvv,
  bankName,
  cardType,
  isVisible,
  isFlipped,
  onClick,
}) => {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [gloss, setGloss] = useState({ x: 50, y: 50 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const box = card.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const px = x / box.width;
    const py = y / box.height;

    const rotX = (py - 0.5) * -15;
    const rotY = (px - 0.5) * 15;
    setTilt({ x: rotX, y: rotY });
    setGloss({ x: px * 100, y: py * 100 });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setGloss({ x: 50, y: 50 });
  };

  const getGradient = (type: string) => {
    switch (type) {
      case 'Visa':
        return 'from-[#1a1f3c] via-[#0d235c] to-[#010924]';
      case 'Mastercard':
        return 'from-[#2e2323] via-[#1c1414] to-[#0f0b0b]';
      case 'American Express':
        return 'from-[#1e3d36] via-[#122b25] to-[#04120e]';
      case 'Discover':
        return 'from-[#3b271d] via-[#241710] to-[#120a05]';
      default:
        return 'from-[#2b1845] via-[#150d26] to-[#090514]';
    }
  };

  const displayCardNumber = isVisible
    ? formatCardNumber(cardNumber)
    : formatCardNumber(cardNumber).replace(/\d/g, '•');

  return (
    <div
      className="credit-card-wrapper select-none w-full max-w-[350px] mx-auto"
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: '1000px', aspectRatio: '1.586 / 1' }}
    >
      {/* 1. Tilt Container */}
      <div
        className="credit-card-tilt-container w-full h-full"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: 'transform 0.15s ease-out',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* 2. Flip Container */}
        <div
          className="credit-card-flip-container w-full h-full relative"
          style={{
            transform: `rotateY(${isFlipped ? 180 : 0}deg)`,
            transition: 'transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Front Side */}
          <div
            className={`credit-card-front absolute inset-0 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xl text-white border border-white/10 overflow-hidden bg-gradient-to-br ${getGradient(cardType)}`}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {/* Hologram abstract vector line overlay */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M-20,50 Q40,120 100,20 T300,150"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                />
                <path
                  d="M-10,80 Q70,40 150,110 T320,80"
                  fill="none"
                  stroke="white"
                  strokeWidth="1.5"
                />
                <circle
                  cx="240"
                  cy="50"
                  r="80"
                  fill="none"
                  stroke="white"
                  strokeWidth="1"
                  strokeDasharray="5,5"
                />
              </svg>
            </div>

            {/* Dynamic Reflection/Gloss Overlay */}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-300"
              style={{
                background: `radial-gradient(circle at ${gloss.x}% ${gloss.y}%, rgba(255, 255, 255, 0.12) 0%, transparent 65%)`,
              }}
            />

            <div className="flex justify-between items-start z-10">
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] tracking-[0.2em] font-bold text-white/70 uppercase truncate max-w-[180px] sm:max-w-[200px]">
                  {bankName || 'SECURE CARD'}
                </span>
                <span className="text-[8px] text-white/40 font-bold uppercase tracking-wider mt-0.5">
                  {cardType}
                </span>
              </div>
              <div className="h-6 flex items-center justify-end shrink-0">
                {cardType === 'Visa' && (
                  <span className="text-sm font-black italic text-sky-400 tracking-tighter">
                    VISA
                  </span>
                )}
                {cardType === 'Mastercard' && (
                  <div className="flex items-center">
                    <div className="w-4 h-4 rounded-full bg-red-500/80 -mr-1.5 backdrop-blur-[2px]" />
                    <div className="w-4 h-4 rounded-full bg-amber-500/80 backdrop-blur-[2px]" />
                  </div>
                )}
                {cardType === 'American Express' && (
                  <div className="border border-sky-400 bg-sky-950/40 px-1 py-0.5 rounded text-[8px] font-extrabold tracking-tighter text-sky-300 uppercase">
                    AMEX
                  </div>
                )}
                {cardType === 'Discover' && (
                  <span className="text-xs font-bold text-orange-400 tracking-wider">DISCOVER</span>
                )}
                {cardType !== 'Visa' &&
                  cardType !== 'Mastercard' &&
                  cardType !== 'American Express' &&
                  cardType !== 'Discover' && <CreditCard className="h-5 w-5 text-white/50" />}
              </div>
            </div>

            <div className="w-8 h-5 sm:w-10 sm:h-7 rounded-md bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 border border-yellow-500/30 p-1 flex flex-col justify-between shadow-inner relative z-10 opacity-90">
              <div className="w-full h-[1px] bg-yellow-950/20" />
              <div className="flex justify-between h-[60%]">
                <div className="w-[1px] h-full bg-yellow-950/20" />
                <div className="w-[1px] h-full bg-yellow-950/20" />
              </div>
            </div>

            <div className="my-1.5 sm:my-2 z-10">
              <p className="font-mono text-sm sm:text-base md:text-lg tracking-[0.12em] sm:tracking-[0.16em] font-semibold text-center text-white drop-shadow-md">
                {displayCardNumber || '•••• •••• •••• ••••'}
              </p>
            </div>

            <div className="flex justify-between items-end z-10">
              <div className="flex flex-col min-w-0">
                <span className="text-[7px] text-white/40 uppercase font-bold tracking-wider">
                  Cardholder
                </span>
                <span className="text-[10px] sm:text-[11px] font-semibold tracking-wide uppercase truncate max-w-[130px] sm:max-w-[150px]">
                  {cardholderName || 'CARDHOLDER NAME'}
                </span>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="text-[7px] text-white/40 uppercase font-bold tracking-wider">
                  Expires
                </span>
                <span className="text-[10px] sm:text-[11px] font-mono font-semibold">
                  {expiryMonth || 'MM'}/{expiryYear || 'YY'}
                </span>
              </div>
            </div>
          </div>

          {/* Back Side */}
          <div
            className={`credit-card-back absolute inset-0 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xl text-white border border-white/10 overflow-hidden bg-gradient-to-br ${getGradient(cardType)}`}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(circle at ${100 - gloss.x}% ${gloss.y}%, rgba(255, 255, 255, 0.08) 0%, transparent 65%)`,
              }}
            />

            <div className="w-[calc(100%+2.5rem)] h-7 sm:h-9 bg-black/80 -mx-5 mt-1" />

            <div className="space-y-2">
              <div className="w-full h-7 sm:h-8 bg-white/15 rounded-lg flex items-center justify-end px-3 relative">
                <div className="absolute left-3 inset-y-2 right-16 opacity-40 bg-gradient-to-r from-zinc-400/20 via-zinc-400/5 to-zinc-400/20" />
                <div className="bg-white text-zinc-950 px-2 py-0.5 rounded text-xs font-mono font-bold tracking-widest z-10 shadow-sm">
                  {isVisible ? cvv || '***' : '***'}
                </div>
              </div>
              <div className="flex justify-between items-center text-[8px] text-white/40 font-bold px-1 uppercase tracking-wider">
                <span>Security Code (CVV)</span>
                <span>Authorized Signature</span>
              </div>
            </div>

            <div className="flex justify-between items-end text-[7px] text-white/30 font-medium px-1">
              <span>E2EE PROTECTED ASSET</span>
              <span className="font-mono">ID: {cardholderName ? 'ACTIVE' : 'STANDBY'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DecryptedCardItem: React.FC<{
  item: VaultItem;
  masterKey: string | CryptoKey;
  onUpdate: (id: string, name: string, payload: CardPayload) => Promise<void>;
  onDelete: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  isPinning: boolean;
}> = React.memo(({ item, masterKey, onUpdate, onDelete, onTogglePin, isPinning }) => {
  const [data, setData] = useState<CardPayload | null>(null);
  const [error, setError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.title);
  const [editPayload, setEditPayload] = useState<CardPayload>(emptyPayload());
  const [isFlipped, setIsFlipped] = useState(false);
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
        let parsed = parseJsonSafely<CardPayload>(decrypted || '');
        if (!parsed && typeof item.content === 'string') {
          parsed = parseJsonSafely<CardPayload>(item.content);
        }
        if (!parsed && item.metadata) {
          const meta = item.metadata as any;
          parsed = {
            cardNumber: meta.cardNumber || '•••• •••• •••• 1234',
            expiryMonth: meta.expiryMonth || '12',
            expiryYear: meta.expiryYear || '28',
            cvv: meta.cvv || '123',
            cardholderName: meta.cardholderName || 'Decoy User',
            bankName: meta.bankName || item.title || 'Standard Bank',
            cardType: meta.cardType || 'visa',
          };
        }

        if (!parsed || !isMounted) {
          if (isMounted) setError(true);
          return;
        }

        setData(parsed);
        setEditPayload(parsed);
      } catch (err) {
        console.error('Card Decryption Error:', err);
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
        description: 'Card details updated',
        status: 'success',
      });
    } catch (err) {
      logActivity({
        actionType: 'item_update',
        itemName: editName,
        description: 'Card details update failed',
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

  return (
    <motion.div whileHover={{ y: -5 }} className="h-full">
      <Card className="group relative h-full overflow-hidden border-white/5 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-md transition-all hover:border-white/20 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
        <style>{`
          .credit-card-container {
            perspective: 1000px;
            width: 100%;
            height: 180px;
          }
          .credit-card-inner {
            transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            transform-style: preserve-3d;
            position: relative;
            width: 100%;
            height: 100%;
          }
          .credit-card-flipped {
            transform: rotateY(180deg);
          }
          .credit-card-front, .credit-card-back {
            backface-visibility: hidden;
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            border-radius: 1rem;
          }
          .credit-card-back {
            transform: rotateY(180deg);
          }
        `}</style>

        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl transition-opacity group-hover:opacity-30" />

        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 relative z-10 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 transition-transform group-hover:scale-110 group-hover:rotate-3">
              <CreditCard className="h-5 w-5 text-emerald-400" />
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
                <span className="text-[9px] font-bold text-emerald-400/60 uppercase tracking-wider">
                  {data.bankName || 'Financial Asset'}
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
                  className="h-8 w-8 rounded-full hover:bg-emerald-400/20 text-emerald-400"
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
                  className={`h-8 w-8 rounded-full ${item.isPinned ? 'text-emerald-400 hover:bg-emerald-400/20' : 'text-text/20 hover:text-text/60 hover:bg-white/10'} transition-colors`}
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
            <div className="inline-flex max-w-full items-center rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">
              <Folder className="h-3 w-3 mr-1.5 text-emerald-400/80" />
              <span className="truncate">{item.folder}</span>
            </div>
          )}

          {isEditing ? (
            <div className="space-y-3">
              <Input
                placeholder="Cardholder Name"
                value={editPayload.cardholderName}
                onChange={(e) =>
                  setEditPayload({
                    ...editPayload,
                    cardholderName: e.target.value,
                  })
                }
              />
              <Input
                placeholder="Card Number"
                value={formatCardNumber(editPayload.cardNumber)}
                onChange={(e) =>
                  setEditPayload({
                    ...editPayload,
                    cardNumber: e.target.value.replace(/\s/g, ''),
                    cardType: detectCardType(e.target.value),
                  })
                }
              />
              <div className="grid grid-cols-3 gap-2">
                <Input
                  placeholder="MM"
                  value={editPayload.expiryMonth}
                  onChange={(e) =>
                    setEditPayload({
                      ...editPayload,
                      expiryMonth: e.target.value.slice(0, 2),
                    })
                  }
                />
                <Input
                  placeholder="YY"
                  value={editPayload.expiryYear}
                  onChange={(e) =>
                    setEditPayload({
                      ...editPayload,
                      expiryYear: e.target.value.slice(0, 2),
                    })
                  }
                />
                <Input
                  placeholder="CVV"
                  value={formatCvv(editPayload.cvv)}
                  onChange={(e) => setEditPayload({ ...editPayload, cvv: e.target.value })}
                  onFocus={() => setIsFlipped(true)}
                  onBlur={() => setIsFlipped(false)}
                />
              </div>
              <div className="border-t border-white/5 pt-2 mt-2 space-y-2">
                <Input
                  placeholder="Bank Name"
                  value={editPayload.bankName}
                  onChange={(e) =>
                    setEditPayload({
                      ...editPayload,
                      bankName: e.target.value,
                    })
                  }
                />
                <Input
                  placeholder="Account Number"
                  value={editPayload.accountNumber}
                  onChange={(e) =>
                    setEditPayload({
                      ...editPayload,
                      accountNumber: e.target.value,
                    })
                  }
                />
                <Input
                  placeholder="Routing Number"
                  value={editPayload.routingNumber}
                  onChange={(e) =>
                    setEditPayload({
                      ...editPayload,
                      routingNumber: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <VisualCreditCard
                cardholderName={data.cardholderName}
                cardNumber={data.cardNumber}
                expiryMonth={data.expiryMonth}
                expiryYear={data.expiryYear}
                cvv={data.cvv}
                bankName={data.bankName}
                cardType={data.cardType}
                isVisible={isVisible}
                isFlipped={isFlipped}
                onClick={() => setIsFlipped(!isFlipped)}
              />

              {/* Controls & Bank Details */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-semibold text-text/40">Visibility</span>
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
                    {isVisible ? 'Hide Details' : 'Show Details'}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-1 relative group/copy">
                    <span className="text-[9px] font-bold text-text/30 uppercase tracking-wider block">
                      Card Number
                    </span>
                    <span className="text-xs font-mono text-text/80 truncate block">
                      {formatCardNumber(data.cardNumber)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-6 w-6 rounded-md opacity-0 group-hover/copy:opacity-100 transition-opacity hover:bg-white/10"
                      onClick={() => handleCopy(data.cardNumber, item.id + '-num', 'Card number')}
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
                      CVV
                    </span>
                    <span className="text-xs font-mono text-text/80 block">
                      {isVisible ? data.cvv : '***'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-6 w-6 rounded-md opacity-0 group-hover/copy:opacity-100 transition-opacity hover:bg-white/10"
                      onClick={() => handleCopy(data.cvv, item.id + '-cvv', 'CVV')}
                    >
                      {copiedId === item.id + '-cvv' ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>

                {(data.accountNumber || data.routingNumber) && (
                  <div className="mt-2 bg-gradient-to-br from-white/[0.02] to-transparent p-3 rounded-xl border border-white/5 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400/80 mb-1 border-b border-white/5 pb-1">
                      <Banknote className="h-3.5 w-3.5" />
                      <span>Bank Account Details</span>
                    </div>
                    {data.accountNumber && (
                      <div className="flex justify-between items-center relative group/copy text-xs">
                        <span className="text-text/40">Account Number:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-text/80">
                            {data.accountNumber}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded hover:bg-white/10"
                            onClick={() =>
                              handleCopy(data.accountNumber, item.id + '-acc', 'Account number')
                            }
                          >
                            {copiedId === item.id + '-acc' ? (
                              <Check className="h-3 w-3 text-green-400" />
                            ) : (
                              <Copy className="h-3 w-3 text-text/40" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                    {data.routingNumber && (
                      <div className="flex justify-between items-center relative group/copy text-xs">
                        <span className="text-text/40">Routing Number:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-text/80">
                            {data.routingNumber}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded hover:bg-white/10"
                            onClick={() =>
                              handleCopy(data.routingNumber, item.id + '-rt', 'Routing number')
                            }
                          >
                            {copiedId === item.id + '-rt' ? (
                              <Check className="h-3 w-3 text-green-400" />
                            ) : (
                              <Copy className="h-3 w-3 text-text/40" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tags management */}
          <div className="pt-3 border-t border-white/5">
            <TagManager item={item} size="sm" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

export const CardsVault: React.FC = () => {
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
  } = useVaultFolders('card');

  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(false);

  // Form State
  const [newName, setNewName] = useState('');
  const [formPayload, setFormPayload] = useState<CardPayload>(emptyPayload());
  const [isFormFlipped, setIsFormFlipped] = useState(false);
  const targetItemId = useGlobalNavigationStore((state) => state.targetItemId);
  const setTargetItemId = useGlobalNavigationStore((state) => state.setTargetItemId);

  const cards = useMemo(() => {
    return items.filter((item) => item.type === 'card');
  }, [items]);

  const suggestions = useMemo(() => {
    const s = new Set<string>();
    cards.forEach((item) => {
      if (item.title) s.add(item.title);
      if (item.metadata?.bankName) s.add(item.metadata.bankName);
      if (item.metadata?.cardholderName) s.add(item.metadata.cardholderName);
    });
    return Array.from(s);
  }, [cards]);

  const filteredCards = useMemo(() => {
    let result = cards;
    if (currentFolder) {
      result = result.filter((item) => item.folder === currentFolder);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.metadata?.bankName?.toLowerCase().includes(q) ||
          item.metadata?.cardholderName?.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => {
      const aPinned = a.isPinned ? 1 : 0;
      const bPinned = b.isPinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return b.createdAt - a.createdAt;
    });
  }, [cards, currentFolder, searchQuery]);

  useEffect(() => {
    if (!targetItemId) return;
    const target = cards.find((c) => c.id === targetItemId);
    if (target) {
      setCurrentFolder(null);
      setSearchQuery(target.title);
      setTargetItemId(null);
    }
  }, [targetItemId, cards, setTargetItemId, setCurrentFolder]);

  const handleCreateCard = async () => {
    const trimmedTitle = newName.trim() || formPayload.bankName.trim() || 'New Card';
    if (!masterKey && !useVaultStore.getState().isDecoyMode) return;

    setIsSaving(true);
    try {
      const encryptedContent = await encryptData(JSON.stringify(formPayload), masterKey);
      await addItem({
        type: 'card',
        title: trimmedTitle,
        content: encryptedContent,
        folder: currentFolder || undefined,
        metadata: {
          bankName: formPayload.bankName,
          cardholderName: formPayload.cardholderName,
          cardType: formPayload.cardType,
        },
      });

      setIsAdding(false);
      setNewName('');
      setFormPayload(emptyPayload());
      toast.success(`Card "${trimmedTitle}" saved successfully`);
    } catch {
      toast.error('Failed to save credit card');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCard = async (id: string, name: string, payload: CardPayload) => {
    if (!masterKey && !useVaultStore.getState().isDecoyMode) return;
    try {
      const encryptedContent = await encryptData(JSON.stringify(payload), masterKey);
      await updateItem(id, {
        title: name.trim() || payload.bankName || 'Updated Card',
        content: encryptedContent,
        metadata: {
          bankName: payload.bankName,
          cardholderName: payload.cardholderName,
          cardType: payload.cardType,
        },
      });
      toast.success('Card details updated');
    } catch {
      toast.error('Failed to update card details');
    }
  };

  return (
    <div className="relative flex h-full min-h-0 gap-6">
      <FolderSidebar
        items={cards}
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
        title="Card Categories"
        allItemLabel="All Cards"
        allItemIcon={<CreditCard className="h-4 w-4" />}
      />

      <MobileFolderMenu
        isOpen={isMobileFolderOpen}
        onClose={() => setIsMobileFolderOpen(false)}
        items={cards}
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
        title="Card Categories"
        allItemLabel="All Cards"
        allItemIcon={<CreditCard className="h-4 w-4" />}
      />

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar space-y-6 pr-2">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-text truncate">{currentFolder || 'Cards'}</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-text/5 border border-text/10 text-text/50 text-xs font-bold shadow-inner">
                {filteredCards.length} items
              </span>
            </div>
            <p className="text-text/50 truncate">
              Manage your credit cards and bank details securely using AES-GCM.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              onClick={() => setIsAdding(true)}
              size="sm"
              className="hidden sm:flex transition-all"
            >
              <Plus className="mr-2 h-4 w-4" /> Add Card
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
              placeholder="Search cards..."
              className="pl-10 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              suggestions={suggestions}
              historyKey="cards"
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
                <style>{`
                  .credit-card-container {
                    perspective: 1000px;
                    width: 100%;
                    height: 180px;
                  }
                  .credit-card-inner {
                    transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    transform-style: preserve-3d;
                    position: relative;
                    width: 100%;
                    height: 100%;
                  }
                  .credit-card-flipped {
                    transform: rotateY(180deg);
                  }
                  .credit-card-front, .credit-card-back {
                    backface-visibility: hidden;
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    top: 0;
                    left: 0;
                    border-radius: 1rem;
                  }
                  .credit-card-back {
                    transform: rotateY(180deg);
                  }
                `}</style>
                <CardHeader>
                  <CardTitle className="text-lg text-text">
                    New Credit Card & Bank Account
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Left: Input Fields */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-[8px] font-bold uppercase tracking-[0.2em] text-text/30 block mb-1">
                          Asset Name
                        </label>
                        <Input
                          placeholder="Card / Account Nickname (e.g. Chase Preferred)"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[8px] font-bold uppercase tracking-[0.2em] text-text/30 block mb-1">
                            Cardholder Name
                          </label>
                          <Input
                            placeholder="Full Name"
                            value={formPayload.cardholderName}
                            onChange={(e) =>
                              setFormPayload({
                                ...formPayload,
                                cardholderName: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[8px] font-bold uppercase tracking-[0.2em] text-text/30 block mb-1">
                            Card Number
                          </label>
                          <Input
                            placeholder="4111 2222 3333 4444"
                            value={formatCardNumber(formPayload.cardNumber)}
                            onChange={(e) =>
                              setFormPayload({
                                ...formPayload,
                                cardNumber: e.target.value.replace(/\s/g, ''),
                                cardType: detectCardType(e.target.value),
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[8px] font-bold uppercase tracking-[0.2em] text-text/30 block mb-1">
                            Expiry Month
                          </label>
                          <Input
                            placeholder="MM"
                            value={formPayload.expiryMonth}
                            onChange={(e) =>
                              setFormPayload({
                                ...formPayload,
                                expiryMonth: e.target.value.slice(0, 2),
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[8px] font-bold uppercase tracking-[0.2em] text-text/30 block mb-1">
                            Expiry Year
                          </label>
                          <Input
                            placeholder="YY"
                            value={formPayload.expiryYear}
                            onChange={(e) =>
                              setFormPayload({
                                ...formPayload,
                                expiryYear: e.target.value.slice(0, 2),
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[8px] font-bold uppercase tracking-[0.2em] text-text/30 block mb-1">
                            CVV
                          </label>
                          <Input
                            placeholder="123"
                            value={formatCvv(formPayload.cvv)}
                            onChange={(e) =>
                              setFormPayload({
                                ...formPayload,
                                cvv: e.target.value,
                              })
                            }
                            onFocus={() => setIsFormFlipped(true)}
                            onBlur={() => setIsFormFlipped(false)}
                          />
                        </div>
                      </div>

                      <div className="border-t border-white/5 pt-4 space-y-3">
                        <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-text/30 block mb-1">
                          Linked Bank Account (Optional)
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-1">
                            <Input
                              placeholder="Bank Name"
                              value={formPayload.bankName}
                              onChange={(e) =>
                                setFormPayload({
                                  ...formPayload,
                                  bankName: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="col-span-1">
                            <Input
                              placeholder="Account Number"
                              value={formPayload.accountNumber}
                              onChange={(e) =>
                                setFormPayload({
                                  ...formPayload,
                                  accountNumber: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="col-span-1">
                            <Input
                              placeholder="Routing Number"
                              value={formPayload.routingNumber}
                              onChange={(e) =>
                                setFormPayload({
                                  ...formPayload,
                                  routingNumber: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Live Card Visualizer */}
                    <div className="flex flex-col justify-center items-center">
                      <VisualCreditCard
                        cardholderName={formPayload.cardholderName}
                        cardNumber={formPayload.cardNumber}
                        expiryMonth={formPayload.expiryMonth}
                        expiryYear={formPayload.expiryYear}
                        cvv={formPayload.cvv}
                        bankName={formPayload.bankName}
                        cardType={formPayload.cardType}
                        isVisible={true}
                        isFlipped={isFormFlipped}
                        onClick={() => setIsFormFlipped(!isFormFlipped)}
                      />
                      <span className="text-[10px] text-text/30 mt-2">
                        Click card to flip manually
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                    <Button variant="ghost" onClick={() => setIsAdding(false)}>
                      Cancel
                    </Button>
                    <Button
                      className="bg-emerald-500 hover:bg-emerald-600 text-white min-w-[130px]"
                      onClick={handleCreateCard}
                      disabled={isSaving}
                    >
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Asset'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {filteredCards.length === 0 && !isAdding && (
          <div
            className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => setIsAdding(true)}
          >
            <CreditCard className="mb-4 h-16 w-16" />
            <p className="text-lg">No financial assets found.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 pb-8 md:grid-cols-2 xl:grid-cols-2">
          {filteredCards.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(event) => setDraggedVaultItem(event, item.id)}
              onDragEnd={clearDraggedVaultItem}
              onTouchStart={(event) => setDraggedVaultItem(event as any, item.id)}
            >
              <DecryptedCardItem
                item={item}
                masterKey={masterKey!}
                onUpdate={handleUpdateCard}
                onDelete={(id, title) => {
                  if (confirm(`Are you sure you want to delete "${title}"?`)) {
                    removeItem(id);
                    toast.success(`Deleted credit card "${title}"`);
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
