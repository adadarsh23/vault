import React from 'react';
import {
  Lock,
  Zap,
  Fingerprint,
  ShieldCheck,
  Globe,
  RefreshCw,
  Cpu,
  Key,
  ChevronDown,
} from 'lucide-react';
import { Card, CardContent } from '../../../../components/ui/Card';
import { motion, AnimatePresence } from 'framer-motion';
import { SECURITY_LAYERS } from '../../../auth/useVaultAuth';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardHeaderProps {
  username: string | null | undefined;
  securityScore: number;
  showHealthDetails: boolean;
  onToggleHealth: () => void;
  onOpenProfileCard: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export interface HealthMetric {
  id?: string;
  label: string;
  value: string;
  name?: string;
  status: string;
  icon: React.ComponentType<{ className?: string }>;
  specs?: string;
  standard?: string;
  category?: string;
  quantumSafe?: boolean;
  description?: string;
  details?: readonly string[] | string[];
}

const LAYER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'layer-kdf': Fingerprint,
  'layer-exchange': Zap,
  'layer-encryption': Lock,
  'layer-transport': Globe,
  'layer-verification': ShieldCheck,
  'layer-pqc-fs': RefreshCw,
  'layer-storage': Cpu,
  'layer-mfa': Key,
};

const LAYER_STATUSES: Record<string, string> = {
  'layer-kdf': 'Active',
  'layer-exchange': 'Quantum-Safe',
  'layer-encryption': 'Cascaded',
  'layer-transport': 'Enforced',
  'layer-verification': 'Verified',
  'layer-pqc-fs': 'Shielded',
  'layer-storage': 'Shielded',
  'layer-mfa': 'Hardened',
};

const LAYER_DISPLAY_VALUES: Record<string, string> = {
  'layer-kdf': 'Argon2id (RFC 9106)',
  'layer-exchange': 'X25519 + Kyber768',
  'layer-encryption': 'Dual Cascade Cipher',
  'layer-transport': 'RSA-OAEP + TLS 1.3',
  'layer-verification': 'Entropy + Ed25519',
  'layer-pqc-fs': '60s Inactivity Shredder',
  'layer-storage': 'Isolated Memory & Decoy',
  'layer-mfa': 'WebAuthn Passkeys & TOTP',
};

export const healthMetrics: HealthMetric[] = SECURITY_LAYERS.map((layer, index) => {
  const layerId = layer.id || `layer-${index + 1}`;
  const icon = LAYER_ICONS[layerId] ?? Fingerprint;
  const status = LAYER_STATUSES[layerId] ?? (layer.quantumSafe ? 'Quantum-Safe' : 'Active');
  const value = LAYER_DISPLAY_VALUES[layerId] || layer.name;

  return {
    id: layerId,
    label: layer.label || `Layer ${index + 1}`,
    value,
    name: layer.name,
    status,
    specs: layer.specs,
    standard: layer.standard,
    category: layer.category,
    quantumSafe: layer.quantumSafe,
    description: layer.description || layer.desc,
    details: layer.details || [],
    icon,
  };
});

// ─── Animation Variants ───────────────────────────────────────────────────────

const healthContainerVariants = {
  hidden: {
    transition: { staggerChildren: 0.04, staggerDirection: -1 },
  },
  show: {
    transition: { delayChildren: 0.08, staggerChildren: 0.06 },
  },
};

const healthItemVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.28,
    },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getScoreColor = (score: number) => {
  if (score >= 80) return 'text-green-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
};

const getLayerStatusTheme = (status?: string) => {
  const normalized = status?.toLowerCase() || '';

  if (normalized.includes('quantum') || normalized.includes('pqc')) {
    return {
      badge: 'border-purple-500/25 bg-purple-500/10 text-purple-300',
      icon: 'text-purple-400',
      glow: 'bg-purple-500/10',
    };
  }

  if (
    normalized.includes('active') ||
    normalized.includes('shielded') ||
    normalized.includes('optimal') ||
    normalized.includes('cascaded') ||
    normalized.includes('enforced') ||
    normalized.includes('verified') ||
    normalized.includes('hardened')
  ) {
    return {
      badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
      icon: 'text-emerald-400',
      glow: 'bg-emerald-500/10',
    };
  }

  if (normalized.includes('vulnerable')) {
    return {
      badge: 'border-red-500/20 bg-red-500/10 text-red-300',
      icon: 'text-red-400',
      glow: 'bg-red-500/10',
    };
  }

  return {
    badge: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    icon: 'text-amber-400',
    glow: 'bg-amber-500/10',
  };
};

// ─── Component ────────────────────────────────────────────────────────────────

const LiveClock: React.FC = React.memo(() => {
  const [time, setTime] = React.useState(() => new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 font-mono tabular-nums">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text/40 whitespace-nowrap">
        {time.toLocaleDateString(undefined, {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
        })}
      </span>
      <span className="text-text/20">|</span>
      <span className="text-sm font-bold text-text min-w-[95px] text-left">
        {time.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })}
      </span>
    </div>
  );
});
LiveClock.displayName = 'LiveClock';

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  username,
  securityScore,
  showHealthDetails,
  onToggleHealth,
  onOpenProfileCard,
}) => {
  const [expandedLayers, setExpandedLayers] = React.useState<Record<string, boolean>>({});
  const [showAllDetails, setShowAllDetails] = React.useState(false);

  const toggleLayer = (id?: string) => {
    if (!id) return;
    if (showAllDetails) {
      const nextState: Record<string, boolean> = {};
      healthMetrics.forEach((m) => {
        const mId = m.id || m.label;
        nextState[mId] = mId !== id;
      });
      setShowAllDetails(false);
      setExpandedLayers(nextState);
    } else {
      setExpandedLayers((prev) => ({
        ...prev,
        [id]: !prev[id],
      }));
    }
  };

  const handleToggleAll = () => {
    if (showAllDetails) {
      setShowAllDetails(false);
      setExpandedLayers({});
    } else {
      setShowAllDetails(true);
      const nextState: Record<string, boolean> = {};
      healthMetrics.forEach((m) => {
        const mId = m.id || m.label;
        nextState[mId] = true;
      });
      setExpandedLayers(nextState);
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">Dashboard</h1>
            <div className="mt-3 max-w-3xl text-sm leading-6 text-text/45 flex flex-col gap-1">
              <p>
                Welcome back,
                {username ? (
                  <button
                    type="button"
                    onClick={onOpenProfileCard}
                    className="text-text font-bold ml-1 transition-colors hover:text-text/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20 rounded-md"
                  >
                    @{username}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenProfileCard}
                    className="text-text font-bold ml-1 transition-colors hover:text-text/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20 rounded-md"
                  >
                    Operator
                  </button>
                )}
              </p>
            </div>
          </div>

          {/* DATE + TIME CARD */}
          <LiveClock />
        </div>

        {/* RIGHT SIDE BUTTON */}
        <motion.button
          onClick={onToggleHealth}
          whileHover={{ y: -4, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          aria-label={`${showHealthDetails ? 'Hide' : 'Show'} detailed security health metrics`}
          aria-expanded={showHealthDetails}
          className="relative group w-full md:w-auto flex items-center justify-between md:justify-start gap-5 rounded-3xl border border-card-border/50 bg-card-bg/40 p-5 backdrop-blur-xl transition-all hover:bg-card-bg/60 hover:border-text/20 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        >
          {/* Animated border glow */}
          <div className="absolute inset-x-0 bottom-0 h-1 w-1/2 mx-auto bg-gradient-to-r from-transparent via-blue-500/50 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />

          {/* TEXT */}
          <div className="text-left md:text-right flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text/30 group-hover:text-text/50 transition-colors">
              Security
            </p>
            <p className={`text-2xl font-black tracking-tight ${getScoreColor(securityScore)}`}>
              {securityScore < 100 ? `${securityScore}%` : 'Optimal'}
            </p>
          </div>

          {/* CIRCLE */}
          <div className="relative h-14 w-14 sm:h-16 sm:w-16">
            <svg className="h-full w-full rotate-[-90deg]" viewBox="0 0 36 36">
              <path
                className="stroke-text/5"
                strokeWidth="2.5"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <motion.path
                className={
                  securityScore >= 80
                    ? 'stroke-emerald-500'
                    : securityScore >= 50
                      ? 'stroke-amber-500'
                      : 'stroke-red-500'
                }
                strokeWidth="2.5"
                strokeDasharray={`${securityScore}, 100`}
                strokeLinecap="round"
                fill="none"
                initial={{ strokeDasharray: '0, 100' }}
                animate={{ strokeDasharray: `${securityScore}, 100` }}
                transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>

            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className={`p-2 rounded-full ${securityScore >= 80 ? 'bg-emerald-500/10' : securityScore >= 50 ? 'bg-amber-500/10' : 'bg-red-500/10'} transition-colors`}
              >
                <Zap
                  className={`h-5 w-5 ${getScoreColor(securityScore)} drop-shadow-[0_0_8px_currentColor]`}
                />
              </div>
            </div>
          </div>
        </motion.button>
      </div>

      {/* Expandable Health Metrics Panel */}
      <AnimatePresence initial={false}>
        {showHealthDetails && (
          <motion.div
            key="health-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: {
                when: 'beforeChildren',
                height: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.2, delay: 0.1 },
              },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: {
                when: 'afterChildren',
                height: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.2 },
              },
            }}
            className="overflow-hidden"
          >
            {/* Header / Inspection bar */}
            <div className="mb-3 flex items-center justify-between px-1 pt-1">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-text/40 font-mono">
                    {healthMetrics.length} Active Protocols
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleAll}
                  className="inline-flex items-center text-[10px] sm:text-[11px] font-semibold text-text/60 hover:text-text underline decoration-dotted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 rounded px-2.5 py-1 bg-card-bg/50 border border-card-border/60 hover:bg-card-bg/80"
                >
                  {showAllDetails ? 'Compact view' : 'Inspect view'}
                </button>
              </div>
            </div>

            <motion.div
              initial="hidden"
              animate="show"
              variants={healthContainerVariants}
              className="grid grid-cols-1 items-start gap-4 pb-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {healthMetrics.map((metric) => {
                const theme = getLayerStatusTheme(metric.status);
                const layerKey = metric.id || metric.label;
                const isExpanded = showAllDetails || Boolean(expandedLayers[layerKey]);
                const hasDetails = Boolean(metric.details && metric.details.length > 0);

                return (
                  <motion.div
                    key={layerKey}
                    variants={healthItemVariants}
                    exit={{ opacity: 0, transition: { duration: 0.16 } }}
                  >
                    <Card
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => toggleLayer(layerKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleLayer(layerKey);
                        }
                      }}
                      className={`group overflow-hidden border transition-all duration-200 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                        isExpanded
                          ? 'border-text/30 bg-card-bg/80 shadow-md ring-1 ring-text/10'
                          : 'border-card-border/60 bg-card-bg/40 hover:bg-card-bg/60 hover:border-text/25'
                      } backdrop-blur-sm`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3.5">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-card-border/50 ${theme.glow} transition-colors mt-0.5`}
                          >
                            <metric.icon className={`h-5 w-5 transition-colors ${theme.icon}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-text/40 transition-colors truncate">
                                  {metric.label}
                                </p>
                                {metric.quantumSafe && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-1 py-0.2 text-[8px] font-semibold uppercase text-purple-400 shrink-0">
                                    PQC
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {metric.standard && (
                                  <span className="text-[8px] font-mono text-text/40 shrink-0">
                                    {metric.standard}
                                  </span>
                                )}
                                <ChevronDown
                                  className={`h-3.5 w-3.5 text-text/35 transition-transform duration-200 shrink-0 ${
                                    isExpanded
                                      ? 'rotate-180 text-text/80'
                                      : 'group-hover:text-text/65'
                                  }`}
                                  aria-hidden="true"
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-sm font-black text-text transition-colors truncate">
                                {metric.value}
                              </p>
                              <span
                                className={`rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase ${theme.badge} shrink-0`}
                              >
                                {metric.status}
                              </span>
                            </div>

                            {metric.specs && (
                              <p
                                className={`text-[10px] font-mono text-text/45 mt-1 leading-tight ${
                                  isExpanded ? 'break-words' : 'truncate'
                                }`}
                              >
                                {metric.specs}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Dropdown details panel */}
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{
                                opacity: 1,
                                height: 'auto',
                                transition: {
                                  height: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
                                  opacity: { duration: 0.2, delay: 0.05 },
                                },
                              }}
                              exit={{
                                opacity: 0,
                                height: 0,
                                transition: {
                                  height: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
                                  opacity: { duration: 0.15 },
                                },
                              }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3.5 pt-3 border-t border-card-border/60 w-full space-y-2">
                                {metric.description && (
                                  <p className="text-[11px] leading-relaxed text-text/60 break-words">
                                    {metric.description}
                                  </p>
                                )}

                                {metric.category && (
                                  <div className="flex items-center gap-1 text-[9px] text-text/40 font-mono">
                                    <span className="uppercase tracking-wider">
                                      Protocol Category:
                                    </span>
                                    <span className="text-text/70">{metric.category}</span>
                                  </div>
                                )}

                                {hasDetails && (
                                  <div className="space-y-1.5 pt-1">
                                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-text/45">
                                      Cryptographic Specifications
                                    </p>
                                    <ul className="space-y-1 pl-3.5 text-[10px] leading-snug text-text/65 list-disc">
                                      {metric.details?.map((detail, dIdx) => (
                                        <li key={dIdx} className="break-words">
                                          {detail}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
