import type { ElementType } from 'react';
import {
  Database,
  Fingerprint,
  LayoutGrid,
  Lock,
  Network,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

/* ---------------------------
 * Types
 * --------------------------*/

export interface VaultCategoryStats {
  password: number;
  note: number;
  chat: number;
  todo: number;
  photo: number;
  video: number;
  audio: number;
  secret: number;
  contact: number;
  document: number;
  file: number;
  location: number;
  card: number;
  identity: number;
  wifi: number;
  other: number;
}

export interface Tone {
  icon: string;
  glow: string;
  ring: string;
  softBg: string;
}

export interface DiagramNode {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  details: string[];
  icon: ElementType;
  tone: Tone;
  x: number;
  y: number;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeDimensions {
  width: number;
  height: number;
}

export interface GraphSize {
  width: number;
  height: number;
}

export interface AnchorPoint {
  x: number;
  y: number;
  normalX: number;
  normalY: number;
}

const CATEGORY_LABELS: Record<keyof VaultCategoryStats, string> = {
  password: 'Passwords',
  note: 'Notes',
  chat: 'Chats',
  todo: 'Todos',
  photo: 'Photos',
  video: 'Videos',
  audio: 'Audio',
  secret: 'Secrets',
  contact: 'Contacts',
  document: 'Documents',
  file: 'Files',
  location: 'Locations',
  card: 'Cards & Bank',
  identity: 'Identities',
  wifi: 'Wi-Fi',
  other: 'Other',
};

/* ---------------------------
 * Constants
 * --------------------------*/

export const GRAPH_WIDTH = 920;
export const GRAPH_HEIGHT = 520;

export const tones: Record<string, Tone> = {
  cyan: {
    icon: 'text-cyan-500 dark:text-cyan-300',
    glow: 'from-cyan-400/20 via-cyan-300/10 to-transparent',
    ring: 'ring-cyan-500/20 dark:ring-cyan-300/20',
    softBg: 'bg-cyan-500/10',
  },
  violet: {
    icon: 'text-violet-500 dark:text-violet-300',
    glow: 'from-violet-400/20 via-violet-300/10 to-transparent',
    ring: 'ring-violet-500/20 dark:ring-violet-300/20',
    softBg: 'bg-violet-500/10',
  },
  emerald: {
    icon: 'text-emerald-500 dark:text-emerald-300',
    glow: 'from-emerald-400/20 via-emerald-300/10 to-transparent',
    ring: 'ring-emerald-500/20 dark:ring-emerald-300/20',
    softBg: 'bg-emerald-500/10',
  },
  amber: {
    icon: 'text-amber-500 dark:text-amber-300',
    glow: 'from-amber-400/20 via-amber-300/10 to-transparent',
    ring: 'ring-amber-500/20 dark:ring-amber-300/20',
    softBg: 'bg-amber-500/10',
  },
  sky: {
    icon: 'text-sky-500 dark:text-sky-300',
    glow: 'from-sky-400/20 via-sky-300/10 to-transparent',
    ring: 'ring-sky-500/20 dark:ring-sky-300/20',
    softBg: 'bg-sky-500/10',
  },
  indigo: {
    icon: 'text-indigo-500 dark:text-indigo-300',
    glow: 'from-indigo-400/20 via-indigo-300/10 to-transparent',
    ring: 'ring-indigo-500/20 dark:ring-indigo-300/20',
    softBg: 'bg-indigo-500/10',
  },
  rose: {
    icon: 'text-rose-500 dark:text-rose-300',
    glow: 'from-rose-400/20 via-rose-300/10 to-transparent',
    ring: 'ring-rose-500/20 dark:ring-rose-300/20',
    softBg: 'bg-rose-500/10',
  },
} as const;

/* ---------------------------
 * Helpers
 * --------------------------*/

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const getCanvasPadding = (containerWidth: number) => {
  if (containerWidth < 380) return 8;
  if (containerWidth < 520) return 10;
  if (containerWidth < 768) return 16;
  return 24;
};

export const getNodeDimensions = (containerWidth: number): NodeDimensions => {
  if (containerWidth < 380) {
    const width = Math.max(68, Math.floor((containerWidth - 16) * 0.22));
    return { width, height: 74 };
  }
  if (containerWidth < 480) {
    const width = Math.max(82, Math.floor((containerWidth - 20) * 0.225));
    return { width, height: 82 };
  }
  if (containerWidth < 640) {
    const width = Math.max(104, Math.floor((containerWidth - 32) * 0.23));
    return { width, height: 90 };
  }
  if (containerWidth < 768) {
    const width = Math.max(124, Math.floor((containerWidth - 40) * 0.235));
    return { width, height: 98 };
  }
  return { width: 160, height: 112 };
};

/* ---------------------------
 * Layout math (safe)
 * --------------------------*/

export const getNodePixelPosition = (
  node: NodePosition,
  graphSize: GraphSize,
  dims: NodeDimensions,
  padding = 0,
) => {
  const safeWidth = Math.max(graphSize.width - dims.width - padding * 2, 1);
  const safeHeight = Math.max(graphSize.height - dims.height - padding * 2, 1);

  return {
    left: padding + (node.x / 100) * safeWidth,
    top: padding + (node.y / 100) * safeHeight,
  };
};

export const getNodeEdgeAnchors = (
  from: NodePosition,
  to: NodePosition,
  graphSize: GraphSize,
  dims: NodeDimensions,
  padding: number,
) => {
  const fromPos = getNodePixelPosition(from, graphSize, dims, padding);
  const toPos = getNodePixelPosition(to, graphSize, dims, padding);

  const fromCenter = {
    x: fromPos.left + dims.width / 2,
    y: fromPos.top + dims.height / 2,
  };

  const toCenter = {
    x: toPos.left + dims.width / 2,
    y: toPos.top + dims.height / 2,
  };

  const halfW = Math.max(dims.width / 2, 1);
  const halfH = Math.max(dims.height / 2, 1);

  const getEdgePoint = (c: typeof fromCenter, t: typeof toCenter): AnchorPoint => {
    const dx = t.x - c.x;
    const dy = t.y - c.y;

    if (dx === 0 && dy === 0) {
      return { x: c.x, y: c.y, normalX: 1, normalY: 0 };
    }

    const wx = Math.abs(dx) / halfW;
    const hy = Math.abs(dy) / halfH;
    const scale = 1 / Math.max(wx, hy, 1e-6);

    if (wx >= hy) {
      return {
        x: c.x + Math.sign(dx) * halfW,
        y: c.y + dy * scale,
        normalX: Math.sign(dx) || 1,
        normalY: 0,
      };
    }

    return {
      x: c.x + dx * scale,
      y: c.y + Math.sign(dy) * halfH,
      normalX: 0,
      normalY: Math.sign(dy) || 1,
    };
  };

  const centerDistance = Math.hypot(toCenter.x - fromCenter.x, toCenter.y - fromCenter.y);
  const edgeGap = Math.min(10, Math.max(4, centerDistance * 0.06));

  const startRaw = getEdgePoint(fromCenter, toCenter);
  const endRaw = getEdgePoint(toCenter, fromCenter);

  return {
    start: {
      ...startRaw,
      x: startRaw.x + startRaw.normalX * edgeGap,
      y: startRaw.y + startRaw.normalY * edgeGap,
    },
    end: {
      ...endRaw,
      x: endRaw.x + endRaw.normalX * edgeGap,
      y: endRaw.y + endRaw.normalY * edgeGap,
    },
  };
};

/* ---------------------------
 * Nodes
 * --------------------------*/

export const createNodes = (
  itemCount: number,
  categoryStats: VaultCategoryStats,
): DiagramNode[] => {
  const totalByStats = Object.values(categoryStats).reduce((sum, value) => sum + value, 0);
  const activeTypes = (Object.keys(categoryStats) as Array<keyof VaultCategoryStats>).filter(
    (key) => categoryStats[key] > 0,
  );
  const dominantType = activeTypes.sort((a, b) => categoryStats[b] - categoryStats[a])[0];

  const topCategories = (Object.keys(categoryStats) as Array<keyof VaultCategoryStats>)
    .filter((key) => categoryStats[key] > 0)
    .sort((a, b) => categoryStats[b] - categoryStats[a])
    .slice(0, 3);

  const topCategoryDetails = topCategories.length
    ? topCategories.map((key) => `${CATEGORY_LABELS[key]}: ${categoryStats[key]} records`)
    : ['No category data available yet.'];

  return [
    {
      id: 'auth',
      title: 'Auth Layer',
      subtitle: 'Login, refresh, revoke',
      description:
        'Handles account access, device trust, and current session protection before vault data is opened.',
      details: [
        'Validates active sessions and trusted-device context.',
        'Supports revoke-all and targeted session shutdown.',
        'Feeds secure identity context into the vault runtime.',
      ],
      icon: ShieldCheck,
      tone: tones.cyan,
      x: 0,
      y: 12,
    },
    {
      id: 'key',
      title: 'Master Key',
      subtitle: 'Argon2id derivation',
      description:
        "Derives the vault's cryptographic root using memory-hard key stretching before any protected content is decrypted.",
      details: [
        'Generates encryption material from the user secret.',
        'Keeps derivation on the client before vault usage.',
        'Forms the trust bridge into the crypto core.',
      ],
      icon: Fingerprint,
      tone: tones.violet,
      x: 33.33,
      y: 12,
    },
    {
      id: 'crypto',
      title: 'Crypto Core',
      subtitle: 'AES-256-GCM flow',
      description:
        'Encrypts and decrypts notes, passwords, documents, and media before sync or local persistence touches the payload.',
      details: [
        'Applies client-side encryption to vault records.',
        'Protects each item before sync begins.',
        'Controls the secure handoff to storage and recovery.',
      ],
      icon: Lock,
      tone: tones.emerald,
      x: 66.66,
      y: 12,
    },
    {
      id: 'store',
      title: 'Vault Store',
      subtitle: `${itemCount} protected records (${activeTypes.length} active categories)`,
      description:
        'Coordinates the live encrypted inventory visible to the user across categories, folders, and current device state.',
      details: [
        ...topCategoryDetails,
        `Count alignment delta: ${Math.abs(totalByStats - itemCount)} record(s)`,
        `Dominant category: ${dominantType ? CATEGORY_LABELS[dominantType] : 'N/A'}`,
      ],
      icon: LayoutGrid,
      tone: tones.amber,
      x: 100,
      y: 12,
    },
    {
      id: 'local',
      title: 'Local Runtime',
      subtitle: `${itemCount} records in active session scope`,
      description:
        'Keeps only the minimum browser state needed for active sessions, previews, and responsive runtime behavior on the current device.',
      details: [
        'Avoids permanent vault persistence in browser storage.',
        `Tracks ${activeTypes.length} active data categories for current session rendering.`,
        'Leaves durable encrypted records in cloud storage.',
      ],
      icon: Smartphone,
      tone: tones.sky,
      x: 100,
      y: 68,
    },
    {
      id: 'sync',
      title: 'Sync Engine',
      subtitle: `${itemCount} records eligible for sync`,
      description:
        'Moves encrypted data between the device and cloud while handling retries, migration, and conflict-aware flow.',
      details: [
        `Coordinates upload and fetch cycles for ${itemCount} encrypted records.`,
        'Retries failed sync operations and supports migration.',
        'Keeps device and cloud state aligned.',
      ],
      icon: RefreshCw,
      tone: tones.indigo,
      x: 66.66,
      y: 68,
    },
    {
      id: 'api',
      title: 'Vault API',
      subtitle: 'Express services',
      description:
        'Accepts authenticated encrypted payloads, processes secure account operations, and routes persistence requests safely.',
      details: [
        'Secures session-aware vault requests.',
        'Bridges the app to cloud persistence.',
        'Supports account and storage workflows.',
      ],
      icon: Network,
      tone: tones.rose,
      x: 33.33,
      y: 68,
    },
    {
      id: 'mongo',
      title: 'MongoDB',
      subtitle: 'Durable persistence',
      description:
        'Stores encrypted snapshots and vault records so data can be recovered across trusted devices and sessions.',
      details: [
        'Persists encrypted records and backups.',
        'Provides durable multi-device recovery.',
        'Receives final sync output from the API layer.',
      ],
      icon: Database,
      tone: tones.emerald,
      x: 0,
      y: 68,
    },
  ] as const;
};

/* ---------------------------
 * Edges
 * --------------------------*/

export interface ColoredEdge extends DiagramEdge {
  colorFrom: string;
  colorTo: string;
}

export const EDGES: readonly ColoredEdge[] = [
  { id: 'auth-key', from: 'auth', to: 'key', colorFrom: '#06b6d4', colorTo: '#8b5cf6' },
  { id: 'key-crypto', from: 'key', to: 'crypto', colorFrom: '#8b5cf6', colorTo: '#10b981' },
  { id: 'crypto-store', from: 'crypto', to: 'store', colorFrom: '#10b981', colorTo: '#f59e0b' },
  { id: 'store-local', from: 'store', to: 'local', colorFrom: '#f59e0b', colorTo: '#0ea5e9' },
  { id: 'crypto-sync', from: 'crypto', to: 'sync', colorFrom: '#10b981', colorTo: '#6366f1' },
  { id: 'sync-api', from: 'sync', to: 'api', colorFrom: '#6366f1', colorTo: '#f43f5e' },
  { id: 'api-mongo', from: 'api', to: 'mongo', colorFrom: '#f43f5e', colorTo: '#10b981' },
] as const;
