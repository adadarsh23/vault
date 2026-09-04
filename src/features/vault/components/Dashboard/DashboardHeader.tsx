import React from 'react';
import { Lock, Zap, Fingerprint, ShieldCheck, Globe, RefreshCw, Cpu, Key } from 'lucide-react';
import { Card, CardContent } from '../../../../components/ui/Card';
import { motion, AnimatePresence } from 'framer-motion';

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
  label: string;
  value: string;
  status: string;
  icon: React.ComponentType<{ className?: string }>;
  specs?: string;
  standard?: string;
}

const healthMetrics: HealthMetric[] = [
  {
    label: 'Layer 1: Key Derivation',
    value: 'Argon2id (RFC 9106)',
    status: 'Active',
    specs: '64 MB RAM • 3 Iterations • 4 Parallel Lanes',
    standard: 'RFC 9106',
    icon: Fingerprint,
  },
  {
    label: 'Layer 2: Key Exchange',
    value: 'X25519 + Kyber768',
    status: 'Quantum-Safe',
    specs: 'Curve25519 ECDH + Kyber-768 (ML-KEM)',
    standard: 'NIST FIPS 203',
    icon: Zap,
  },
  {
    label: 'Layer 3: Encryption',
    value: 'Dual Cascade Cipher',
    status: 'Cascaded',
    specs: 'AES-256-GCM + ChaCha20-Poly1305 (VCAS01)',
    standard: 'SP 800-38D • RFC 8439',
    icon: Lock,
  },
  {
    label: 'Layer 4: Communication',
    value: 'RSA-OAEP + TLS 1.3',
    status: 'Enforced',
    specs: 'Zero-Knowledge CSE Envelope • Perfect Forward Secrecy',
    standard: 'RFC 8017 • RFC 8446',
    icon: Globe,
  },
  {
    label: 'Layer 5: Verification',
    value: 'Entropy + Ed25519',
    status: 'Verified',
    specs: 'Hardware Fingerprint (SHA-256) • Digital Signatures',
    standard: 'RFC 8032',
    icon: ShieldCheck,
  },
  {
    label: 'Layer 6: Forward Secrecy',
    value: '60s Inactivity Shredder',
    status: 'Shielded',
    specs: 'Automated RAM Watchdog • Buffer Zero-Fill (.fill(0))',
    standard: 'Anti-Cold Boot',
    icon: RefreshCw,
  },
  {
    label: 'Layer 7: Key Storage',
    value: 'Isolated Memory & Decoy',
    status: 'Shielded',
    specs: 'extractable: false • Duress Decoy PIN Shield',
    standard: 'W3C WebCrypto',
    icon: Cpu,
  },
  {
    label: 'Layer 8: Multi-Factor',
    value: 'WebAuthn Passkeys & TOTP',
    status: 'Hardened',
    specs: 'FIDO2 Biometrics • 6-Digit TOTP • Auto Emergency Wipe',
    standard: 'RFC 6238 • FIDO2',
    icon: Key,
  },
];

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

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  username,
  securityScore,
  showHealthDetails,
  onToggleHealth,
  onOpenProfileCard,
}) => {
  const [currentTime, setCurrentTime] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
          <div className="flex items-center gap-2 font-mono tabular-nums">
            {/* DATE */}
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text/40 whitespace-nowrap">
              {currentTime.toLocaleDateString('en-IN', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
              })}
            </span>

            {/* SEPARATOR */}
            <span className="text-text/20">|</span>

            {/* TIME */}
            <span className="text-sm font-bold text-text min-w-[95px] text-left">
              {currentTime.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              })}
            </span>
          </div>
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
            <motion.div
              initial="hidden"
              animate="show"
              variants={healthContainerVariants}
              className="grid grid-cols-1 gap-4 pt-2 pb-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {healthMetrics.map((metric) => {
                const theme = getLayerStatusTheme(metric.status);

                return (
                  <motion.div
                    key={metric.label}
                    variants={healthItemVariants}
                    exit={{ opacity: 0, transition: { duration: 0.16 } }}
                  >
                    <Card className="overflow-hidden border-card-border/60 bg-card-bg/40 backdrop-blur-sm transition-colors hover:bg-card-bg/60">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3.5">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-card-border/50 ${theme.glow} transition-colors mt-0.5`}
                          >
                            <metric.icon className={`h-5 w-5 transition-colors ${theme.icon}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-text/40 transition-colors truncate">
                                {metric.label}
                              </p>
                              {metric.standard && (
                                <span className="text-[8px] font-mono text-text/40 shrink-0">
                                  {metric.standard}
                                </span>
                              )}
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
                              <p className="text-[10px] font-mono text-text/45 mt-1 truncate leading-tight">
                                {metric.specs}
                              </p>
                            )}
                          </div>
                        </div>
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
