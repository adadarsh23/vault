import React from 'react';
import {
  Image,
  Video,
  AudioLines,
  FileText,
  FilePlus,
  Key,
  ShieldCheck,
  Users,
  Lock,
  Box,
  Fingerprint,
  Database,
  MapPin,
  ListTodo,
  MessageSquareText,
  CreditCard,
  Wifi,
} from 'lucide-react';
import { ItemActivityBarChart } from '../../components/vault/ItemActivityBarChart';
import { useVaultStore } from '../../store/vaultStore';
import { useActivityStore } from '../../store/activityStore';
import { useShallow } from 'zustand/react/shallow';
import { DashboardHeader } from './components/Dashboard/DashboardHeader';
import { DashboardStats } from './components/Dashboard/DashboardStats';
import { DashboardSecurity } from './components/Dashboard/DashboardSecurity';
// import { PlaybackInsights } from './components/Dashboard/PlaybackInsights'
import { mapItemTypeToTab } from '../../lib/global-navigation';
import { VaultItem as VaultStorageItem } from '../../lib/storage';
// import { SETTINGS_SURFACE } from './components/SettingsVault/Utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_TYPES = {
  NOTE: 'note',
  LOCATION: 'location',
  TODO: 'todo',
  PASSWORD: 'password',
  SECRET: 'secret',
  CONTACT: 'contact',
  PHOTO: 'photo',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  FILE: 'file',
  CHAT: 'chat',
  CARD: 'card',
  IDENTITY: 'identity',
  WIFI: 'wifi',
} as const;

type DashboardStatId = VaultStorageItem['type'];

// ─── Security Scoring ─────────────────────────────────────────────────────────

const SECURITY_WEIGHTS = {
  BASE_SCORE: 40,
  MAX_COMPLEXITY_BONUS: 30,
  POINTS_PER_ITEM: 2,
  AUTO_LOCK_BONUS: 15,
  CLIPBOARD_BONUS: 15,
  AUTO_LOCK_PENALTY: 10,
  MAX_SCORE: 100,
  MIN_SCORE: 0,
} as const;

type VaultItem = { type: string };
type Preferences = {
  isAutoLockEnabled: boolean;
  isClipboardAutoClearEnabled: boolean;
};

const calculateSecurityScore = (items: VaultItem[], preferences: Preferences) => {
  let score = SECURITY_WEIGHTS.BASE_SCORE;
  score += Math.min(
    SECURITY_WEIGHTS.MAX_COMPLEXITY_BONUS,
    items.length * SECURITY_WEIGHTS.POINTS_PER_ITEM
  );
  if (preferences.isAutoLockEnabled) score += SECURITY_WEIGHTS.AUTO_LOCK_BONUS;
  if (preferences.isClipboardAutoClearEnabled) score += SECURITY_WEIGHTS.CLIPBOARD_BONUS;
  if (!preferences.isAutoLockEnabled) score -= SECURITY_WEIGHTS.AUTO_LOCK_PENALTY;
  return Math.min(SECURITY_WEIGHTS.MAX_SCORE, Math.max(SECURITY_WEIGHTS.MIN_SCORE, score));
};

// ─── Component ────────────────────────────────────────────────────────────────

export const Dashboard: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const {
    items,
    username,
    preferences,
    allowRestrictedTypes,
    syncStatus,
    lastSuccessfulSyncAt,
    lastSyncError,
  } = useVaultStore(
    useShallow((state) => ({
      items: state.items,
      username: state.username,
      preferences: state.preferences,
      allowRestrictedTypes: state.allowRestrictedTypes,
      syncStatus: state.syncStatus,
      lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
      lastSyncError: state.lastSyncError,
    }))
  );

  const recentActivityCount = useActivityStore((state) => state.count);
  const [showHealthDetails, setShowHealthDetails] = React.useState(false);

  // ── Derived: item counts ──────────────────────────────────────────────────

  const itemCounts = React.useMemo(() => {
    const counts: Record<string, number> = {
      [ITEM_TYPES.NOTE]: 0,
      [ITEM_TYPES.LOCATION]: 0,
      [ITEM_TYPES.TODO]: 0,
      [ITEM_TYPES.PASSWORD]: 0,
      [ITEM_TYPES.SECRET]: 0,
      [ITEM_TYPES.CONTACT]: 0,
      [ITEM_TYPES.PHOTO]: 0,
      [ITEM_TYPES.VIDEO]: 0,
      [ITEM_TYPES.AUDIO]: 0,
      [ITEM_TYPES.DOCUMENT]: 0,
      [ITEM_TYPES.FILE]: 0,
      [ITEM_TYPES.CHAT]: 0,
      [ITEM_TYPES.CARD]: 0,
      [ITEM_TYPES.IDENTITY]: 0,
      [ITEM_TYPES.WIFI]: 0,
      media: 0,
    };
    const mediaTypes = new Set<string>([ITEM_TYPES.PHOTO, ITEM_TYPES.VIDEO, ITEM_TYPES.AUDIO]);
    items.forEach((item) => {
      if (item.type in counts) counts[item.type]++;
      if (mediaTypes.has(item.type)) counts.media++;
    });
    return counts;
  }, [items]);

  // ── Derived: stats ────────────────────────────────────────────────────────

  const stats = React.useMemo(
    () =>
      [
        {
          id: ITEM_TYPES.NOTE,
          label: 'Notes',
          icon: FileText,
          color: 'text-emerald-400',
          count: itemCounts[ITEM_TYPES.NOTE],
        },
        {
          id: ITEM_TYPES.CHAT,
          label: 'Chats',
          icon: MessageSquareText,
          color: 'text-purple-400',
          count: itemCounts[ITEM_TYPES.CHAT],
        },
        {
          id: ITEM_TYPES.LOCATION,
          label: 'Locations',
          icon: MapPin,
          color: 'text-lime-400',
          count: itemCounts[ITEM_TYPES.LOCATION],
        },
        {
          id: ITEM_TYPES.TODO,
          label: 'Todos',
          icon: ListTodo,
          color: 'text-orange-400',
          count: itemCounts[ITEM_TYPES.TODO],
        },
        {
          id: ITEM_TYPES.PASSWORD,
          label: 'Passwords',
          icon: Key,
          color: 'text-amber-400',
          count: itemCounts[ITEM_TYPES.PASSWORD],
        },
        {
          id: ITEM_TYPES.SECRET,
          label: 'Secrets',
          icon: ShieldCheck,
          color: 'text-rose-400',
          count: itemCounts[ITEM_TYPES.SECRET],
        },
        {
          id: ITEM_TYPES.CARD,
          label: 'Cards & Bank',
          icon: CreditCard,
          color: 'text-emerald-400',
          count: itemCounts[ITEM_TYPES.CARD],
        },
        {
          id: ITEM_TYPES.IDENTITY,
          label: 'Identities',
          icon: Fingerprint,
          color: 'text-cyan-400',
          count: itemCounts[ITEM_TYPES.IDENTITY],
        },
        {
          id: ITEM_TYPES.WIFI,
          label: 'Wi-Fi',
          icon: Wifi,
          color: 'text-amber-400',
          count: itemCounts[ITEM_TYPES.WIFI],
        },
        {
          id: ITEM_TYPES.CONTACT,
          label: 'Contacts',
          icon: Users,
          color: 'text-teal-400',
          count: itemCounts[ITEM_TYPES.CONTACT],
        },
        {
          id: ITEM_TYPES.PHOTO,
          label: 'Photos',
          icon: Image,
          color: 'text-blue-400',
          count: itemCounts[ITEM_TYPES.PHOTO],
        },
        {
          id: ITEM_TYPES.VIDEO,
          label: 'Videos',
          icon: Video,
          color: 'text-purple-400',
          count: itemCounts[ITEM_TYPES.VIDEO],
        },
        {
          id: ITEM_TYPES.AUDIO,
          label: 'Audio',
          icon: AudioLines,
          color: 'text-cyan-400',
          count: itemCounts[ITEM_TYPES.AUDIO],
        },
        {
          id: ITEM_TYPES.DOCUMENT,
          label: 'Documents',
          icon: FilePlus,
          color: 'text-indigo-400',
          count: itemCounts[ITEM_TYPES.DOCUMENT],
        },
        {
          id: ITEM_TYPES.FILE,
          label: 'Other Files',
          icon: Box,
          color: 'text-slate-300',
          count: itemCounts[ITEM_TYPES.FILE],
        },
      ] as Array<{
        id: DashboardStatId;
        label: string;
        icon: React.ElementType;
        color: string;
        count: number;
      }>,
    [itemCounts]
  );

  // ── Derived: security score ───────────────────────────────────────────────

  const securityScore = React.useMemo(
    () => calculateSecurityScore(items, preferences),
    [items, preferences]
  );

  // ── Derived: sync summary ─────────────────────────────────────────────────

  const syncSummary = React.useMemo(() => {
    if (syncStatus === 'success' && lastSuccessfulSyncAt) {
      return `Last synced ${new Date(lastSuccessfulSyncAt).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }
    if (syncStatus === 'syncing') return 'Sync currently running';
    if (syncStatus === 'error') return lastSyncError || 'Sync needs attention';
    return 'No successful sync recorded';
  }, [syncStatus, lastSuccessfulSyncAt, lastSyncError]);

  // ── Derived: security status rows ─────────────────────────────────────────

  const securityStatusRows = React.useMemo(
    () =>
      [
        {
          title: 'Vault Encryption',
          description: 'Protected item contents are encrypted before storage.',
          icon: Lock,
          tone: 'green',
          active: true,
        },
        {
          title: 'Cloud Sync',
          description: syncSummary,
          icon: Database,
          tone:
            syncStatus === 'success'
              ? 'blue'
              : syncStatus === 'syncing'
                ? 'amber'
                : syncStatus === 'error'
                  ? 'red'
                  : 'slate',
          active: syncStatus === 'success',
        },
        {
          title: 'Auto Lock',
          description: preferences.isAutoLockEnabled
            ? `Enabled after ${preferences.autoLockDuration} minute${preferences.autoLockDuration === 1 ? '' : 's'}`
            : 'Disabled',
          icon: Fingerprint,
          tone: preferences.isAutoLockEnabled ? 'purple' : 'red',
          active: preferences.isAutoLockEnabled,
        },
      ] as const,
    [syncSummary, syncStatus, preferences]
  );

  // ── Derived: vault composition ────────────────────────────────────────────

  const vaultComposition = React.useMemo(
    () => [
      { label: 'Media', count: itemCounts.media },
      { label: 'Other Files', count: itemCounts[ITEM_TYPES.FILE] },
      { label: 'Total Items', count: items.length },
    ],
    [itemCounts]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 sm:space-y-6">
      <DashboardHeader
        username={username}
        securityScore={securityScore}
        showHealthDetails={showHealthDetails}
        onToggleHealth={() => setShowHealthDetails((v) => !v)}
        onOpenProfileCard={() => onNavigate('settings')}
      />

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-text sm:text-2xl">Vault Overview</h2>
        <DashboardStats
          stats={stats}
          onNavigate={(tab) => onNavigate(mapItemTypeToTab(tab as DashboardStatId))}
        />
      </section>

      {/* <section className="space-y-4">
        <div className="flex flex-col gap-2 px-2">
          <h2 className="text-xl font-bold text-text sm:text-2xl">
            System Insights
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-text/45">
            Technical telemetry regarding playback stability, quality spectra,
            and network reliability within the secure streaming ecosystem.
          </p>
        </div>
        <PlaybackInsights />
      </section> */}

      {/* <section className={`${SETTINGS_SURFACE}`}> */}
      <section className="space-y-4">
        {/* <h2 className="text-2xl font-bold text-text sm:text-2xl">
          Activity Metrics
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-text/45">
          Temporal analysis of vault interactions and item creation cycles
          over recent time periods.
        </p> */}
        <ItemActivityBarChart items={items} />
        {/* <PlaybackInsights /> */}
      </section>

      {/* <section className={SETTINGS_SURFACE}> */}
      <section>
        <DashboardSecurity
          recentActivityCount={recentActivityCount}
          securityStatusRows={securityStatusRows}
          vaultComposition={vaultComposition}
          itemCount={items.length}
          passwordCount={itemCounts[ITEM_TYPES.PASSWORD]}
          allowRestrictedTypes={allowRestrictedTypes}
          isAutoLockEnabled={preferences.isAutoLockEnabled}
          isClipboardAutoClearEnabled={preferences.isClipboardAutoClearEnabled}
          clipboardAutoClearDuration={preferences.clipboardAutoClearDuration}
          syncStatus={syncStatus}
          lastSyncError={lastSyncError}
        />
      </section>
    </div>
  );
};
