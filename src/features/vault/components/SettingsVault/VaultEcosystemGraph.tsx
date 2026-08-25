import React, { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AudioLines,
  Box,
  Cloud,
  FileText,
  FilePlus,
  Fingerprint,
  Image,
  Key,
  MapPin,
  Network,
  Shield,
  User,
  Video,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/Card';

export interface VaultCategoryStats {
  password: number;
  note: number;
  photo: number;
  video: number;
  audio: number;
  secret: number;
  document: number;
  location: number;
  other: number;
}

interface VaultEcosystemCardProps {
  itemCount: number;
  categoryStats: VaultCategoryStats;
}

export const VaultEcosystemCard: React.FC<VaultEcosystemCardProps> = memo(
  ({ itemCount, categoryStats }) => (
    <Card className="border-card-border bg-card-bg/50 backdrop-blur-md overflow-hidden group relative">
      <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/5 blur-3xl transition-opacity group-hover:opacity-20" />
      <CardHeader className="relative z-10 pb-4 sm:pb-5 px-4 pt-5 sm:px-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="h-5 w-5 text-indigo-400" />
            Unified Vault Ecosystem
          </CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-1">
          <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.15em] sm:tracking-[0.2em] text-text/30">
            Infrastructure Matrix
          </p>
          <span className="hidden sm:block h-1 w-1 rounded-full bg-text/20" />
          <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.15em] sm:tracking-[0.2em] text-text/30">
            Real-time Entropy
          </p>
        </div>
      </CardHeader>
      <CardContent className="relative h-[320px] overflow-x-auto overflow-y-hidden p-0 custom-scrollbar sm:h-[380px] lg:h-[440px]">
        <div className="relative h-full min-w-[640px] sm:min-w-[700px] lg:min-w-[750px]">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-500/5 to-transparent pointer-events-none" />
          <VaultEcosystemGraph itemCount={itemCount} categoryStats={categoryStats} />
        </div>
      </CardContent>
    </Card>
  ),
);

export const VaultEcosystemGraph = memo(({ itemCount, categoryStats }: VaultEcosystemCardProps) => {
  const shouldReduceMotion = useReducedMotion();
  const centerX = 375;
  const centerY = 200;
  const analysisRadius = 120;

  const infraNodes = React.useMemo(
    () => [
      {
        id: 'user',
        name: 'Identity',
        detail: 'Authorized',
        icon: User,
        color: 'text-blue-400',
        glow: 'rgba(59,130,246,0.3)',
        bg: 'bg-blue-400/10',
        x: 80,
        y: 200,
      },
      {
        id: 'kdf',
        name: 'Argon2id',
        detail: 'V1.0.0',
        icon: Fingerprint,
        color: 'text-purple-400',
        glow: 'rgba(168,85,247,0.3)',
        bg: 'bg-purple-400/10',
        x: 180,
        y: 200,
      },
      {
        id: 'local',
        name: 'Local DB',
        detail: `${itemCount} Cached`,
        icon: Box,
        color: 'text-amber-400',
        glow: 'rgba(251,191,36,0.3)',
        bg: 'bg-amber-400/10',
        x: centerX + 200,
        y: 120,
      },
      {
        id: 'cloud',
        name: 'Cloud Node',
        detail: 'Synchronized',
        icon: Cloud,
        color: 'text-sky-400',
        glow: 'rgba(56,189,248,0.3)',
        bg: 'bg-sky-400/10',
        x: centerX + 200,
        y: 280,
      },
    ],
    [itemCount],
  );

  const categories = React.useMemo(
    () => [
      {
        id: 'pwd',
        name: 'Passwords',
        count: categoryStats.password,
        icon: Key,
        color: 'text-amber-400',
        bg: 'bg-amber-400/10',
        angle: -140,
      },
      {
        id: 'note',
        name: 'Notes',
        count: categoryStats.note,
        icon: FileText,
        color: 'text-emerald-400',
        bg: 'bg-emerald-400/10',
        angle: -100,
      },
      {
        id: 'photo',
        name: 'Photo',
        count: categoryStats.photo,
        icon: Image,
        color: 'text-blue-400',
        bg: 'bg-blue-400/10',
        angle: -60,
      },
      {
        id: 'video',
        name: 'Video',
        count: categoryStats.video,
        icon: Video,
        color: 'text-purple-400',
        bg: 'bg-purple-400/10',
        angle: -20,
      },
      {
        id: 'audio',
        name: 'Audio',
        count: categoryStats.audio,
        icon: AudioLines,
        color: 'text-cyan-400',
        bg: 'bg-cyan-400/10',
        angle: 20,
      },
      {
        id: 'sec',
        name: 'Secrets',
        count: categoryStats.secret,
        icon: Shield,
        color: 'text-rose-400',
        bg: 'bg-rose-400/10',
        angle: 60,
      },
      {
        id: 'doc',
        name: 'Docs',
        count: categoryStats.document,
        icon: FilePlus,
        color: 'text-indigo-400',
        bg: 'bg-indigo-400/10',
        angle: 100,
      },
      {
        id: 'loc',
        name: 'Location',
        count: categoryStats.location,
        icon: MapPin,
        color: 'text-lime-400',
        bg: 'bg-lime-400/10',
        angle: 140,
      },
      {
        id: 'other',
        name: 'Other',
        count: categoryStats.other,
        icon: Box,
        color: 'text-gray-400',
        bg: 'bg-gray-400/10',
        angle: 180,
      },
    ],
    [categoryStats],
  );

  const repeatingTransition = (duration: number, delay = 0) =>
    shouldReduceMotion
      ? { duration: 0 }
      : { duration, repeat: Infinity, ease: 'easeInOut' as const, delay };

  const linearRepeatingTransition = (duration: number) =>
    shouldReduceMotion ? { duration: 0 } : { duration, repeat: Infinity, ease: 'linear' as const };

  return (
    <div className="absolute inset-0 select-none overflow-hidden group/graph">
      <svg className="h-full w-full" viewBox="0 0 750 400">
        <defs>
          <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" />
            <feFlood floodColor="currentColor" floodOpacity="0.5" result="glow" />
            <feComposite in="glow" in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.2)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
          </linearGradient>
          <radialGradient id="core-aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(16,185,129,0.24)" />
            <stop offset="55%" stopColor="rgba(59,130,246,0.12)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <linearGradient id="orbital-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(52,211,153,0.45)" />
            <stop offset="50%" stopColor="rgba(99,102,241,0.22)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
          </linearGradient>
        </defs>

        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2 }}>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path
              d="M 30 0 L 0 0 0 30"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-text/5"
            />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </motion.g>
        <motion.circle
          cx={centerX}
          cy={centerY}
          r="110"
          fill="url(#core-aura)"
          animate={
            shouldReduceMotion
              ? { scale: 1, opacity: 0.55 }
              : { scale: [0.94, 1.06, 0.94], opacity: [0.45, 0.85, 0.45] }
          }
          transition={repeatingTransition(4.8)}
        />
        <motion.rect
          x="0"
          y="0"
          width="750"
          height="2"
          fill="url(#line-grad)"
          animate={shouldReduceMotion ? { opacity: 0.12 } : { y: [0, 400, 0] }}
          transition={linearRepeatingTransition(8)}
          className="opacity-20 pointer-events-none"
        />

        <g stroke="currentColor" strokeWidth="1.5" className="text-text/10" fill="none">
          <motion.path
            d="M 80 200 L 160 200 L 375 200"
            strokeDasharray="5 5"
            animate={shouldReduceMotion ? { opacity: 0.28 } : { opacity: [0.22, 0.55, 0.22] }}
            transition={repeatingTransition(2.8)}
          />
          <motion.path
            d="M 375 200 L 575 120"
            strokeDasharray="5 5"
            animate={shouldReduceMotion ? { opacity: 0.24 } : { opacity: [0.18, 0.5, 0.18] }}
            transition={repeatingTransition(3.2, 0.4)}
          />
          <motion.path
            d="M 375 200 L 575 280"
            strokeDasharray="5 5"
            animate={shouldReduceMotion ? { opacity: 0.24 } : { opacity: [0.18, 0.5, 0.18] }}
            transition={repeatingTransition(3.2, 1)}
          />
          {!shouldReduceMotion && (
            <>
              <motion.circle r="2" fill="#6366f1">
                <animateMotion
                  path="M 80 200 L 160 200 L 375 200"
                  dur="4s"
                  repeatCount="indefinite"
                />
              </motion.circle>
              <motion.circle r="2" fill="#6366f1">
                <animateMotion path="M 375 200 L 575 120" dur="3s" repeatCount="indefinite" />
              </motion.circle>
              <motion.circle r="2" fill="#34d399">
                <animateMotion path="M 375 200 L 575 280" dur="3.6s" repeatCount="indefinite" />
              </motion.circle>
            </>
          )}
        </g>

        <motion.g
          animate={shouldReduceMotion ? { rotate: 0 } : { rotate: 360 }}
          transition={linearRepeatingTransition(24)}
          style={{ transformOrigin: `${centerX}px ${centerY}px` }}
        >
          <ellipse
            cx={centerX}
            cy={centerY}
            rx="92"
            ry="42"
            fill="none"
            stroke="url(#orbital-ring)"
            strokeWidth="1"
            strokeDasharray="7 10"
            opacity="0.45"
          />
          <circle cx={centerX + 92} cy={centerY} r="4" fill="rgba(52,211,153,0.85)" />
        </motion.g>
        <motion.g
          animate={shouldReduceMotion ? { rotate: 0 } : { rotate: -360 }}
          transition={linearRepeatingTransition(18)}
          style={{ transformOrigin: `${centerX}px ${centerY}px` }}
        >
          <ellipse
            cx={centerX}
            cy={centerY}
            rx="66"
            ry="66"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.8"
            strokeDasharray="4 8"
          />
          <circle cx={centerX} cy={centerY - 66} r="3.2" fill="rgba(99,102,241,0.9)" />
        </motion.g>

        <motion.g
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="cursor-pointer"
        >
          <motion.circle
            cx={centerX}
            cy={centerY}
            r="52"
            className="fill-bg/80 stroke-emerald-500/30 stroke-2 backdrop-blur-2xl"
            animate={
              shouldReduceMotion
                ? { filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.16))' }
                : {
                    filter: [
                      'drop-shadow(0 0 8px rgba(16,185,129,0.16))',
                      'drop-shadow(0 0 20px rgba(59,130,246,0.28))',
                      'drop-shadow(0 0 8px rgba(16,185,129,0.16))',
                    ],
                  }
            }
            transition={repeatingTransition(4)}
          />
          <motion.circle
            cx={centerX}
            cy={centerY}
            r="60"
            className="fill-none stroke-emerald-500/10 stroke-1"
            animate={
              shouldReduceMotion
                ? { scale: 1, opacity: 0.35 }
                : { scale: [1, 1.15, 1], opacity: [0.6, 0.2, 0.6] }
            }
            transition={repeatingTransition(3)}
          />
          <motion.circle
            cx={centerX}
            cy={centerY}
            r="74"
            className="fill-none stroke-sky-400/10 stroke-[0.8]"
            animate={
              shouldReduceMotion
                ? { scale: 1, opacity: 0.24 }
                : { scale: [0.92, 1.08, 0.92], opacity: [0.18, 0.5, 0.18] }
            }
            transition={repeatingTransition(5.5)}
          />
          <foreignObject x={centerX - 20} y={centerY - 20} width="40" height="40">
            <motion.div
              animate={
                shouldReduceMotion
                  ? { rotate: 0, scale: 1 }
                  : { rotate: [0, 6, -6, 0], scale: [1, 1.04, 1] }
              }
              transition={repeatingTransition(4.2)}
            >
              <Shield className="h-10 w-10 text-emerald-400 filter drop-shadow-[0_0_12px_rgba(52,211,153,0.6)]" />
            </motion.div>
          </foreignObject>
          <text
            x={centerX}
            y={centerY + 75}
            textAnchor="middle"
            className="text-[10px] font-black uppercase tracking-[0.4em] fill-text/70"
          >
            Secure Core
          </text>
          <text
            x={centerX}
            y={centerY + 90}
            textAnchor="middle"
            className="text-[8px] font-bold fill-text/30 uppercase tracking-widest"
          >
            {itemCount} Protected Objects
          </text>
        </motion.g>

        {infraNodes.map((node) => (
          <motion.g
            key={node.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <motion.circle
              cx={node.x}
              cy={node.y}
              r="28"
              className={`${node.bg} stroke-white/5 stroke-1 transition-colors group-hover/graph:stroke-white/10`}
              animate={
                shouldReduceMotion
                  ? { scale: 1, opacity: 0.98 }
                  : { scale: [1, 1.05, 1], opacity: [0.95, 1, 0.95] }
              }
              transition={repeatingTransition(
                3.6,
                node.id === 'user' ? 0 : node.id === 'kdf' ? 0.7 : node.id === 'local' ? 1.4 : 2.1,
              )}
            />
            <circle
              cx={node.x}
              cy={node.y}
              r="32"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-text/5"
            />
            <foreignObject x={node.x - 14} y={node.y - 14} width="28" height="28">
              <motion.div
                animate={
                  shouldReduceMotion ? { y: 0, scale: 1 } : { y: [0, -1.5, 0], scale: [1, 1.03, 1] }
                }
                transition={repeatingTransition(2.8)}
              >
                <node.icon
                  className={`h-7 w-7 ${node.color} filter drop-shadow-[0_0_8px_${node.glow}]`}
                />
              </motion.div>
            </foreignObject>
            <text
              x={node.x}
              y={node.y + 44}
              textAnchor="middle"
              className="text-[10px] font-bold uppercase tracking-widest fill-text/70"
            >
              {node.name}
            </text>
            <text
              x={node.x}
              y={node.y + 56}
              textAnchor="middle"
              className="text-[8px] font-semibold fill-text/20 uppercase tracking-widest"
            >
              {node.detail}
            </text>
          </motion.g>
        ))}

        {categories.map((cat, idx) => {
          const rad = (cat.angle * Math.PI) / 180;
          const x = centerX + analysisRadius * Math.cos(rad);
          const y = centerY + analysisRadius * Math.sin(rad);
          return (
            <motion.g
              key={cat.id}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8 + idx * 0.1, type: 'spring' }}
              className="group/node cursor-help"
            >
              <motion.line
                x1={centerX}
                y1={centerY}
                x2={x}
                y2={y}
                stroke="currentColor"
                strokeWidth="1"
                className="text-text/10"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 1, duration: 1.5 }}
              />
              <motion.circle
                cx={x}
                cy={y}
                r={16 + Math.min(cat.count * 2, 12)}
                className={`${cat.bg} border border-white/5 transition-all duration-300 group-hover/node:scale-110 group-hover/node:bg-text/10`}
                animate={
                  shouldReduceMotion
                    ? { scale: 1, opacity: cat.count > 0 ? 0.95 : 0.35 }
                    : {
                        scale: cat.count > 0 ? [1, 1.08, 1] : [1, 1.02, 1],
                        opacity: cat.count > 0 ? [0.82, 1, 0.82] : [0.35, 0.5, 0.35],
                      }
                }
                transition={repeatingTransition(2.6 + idx * 0.2)}
              />
              {cat.count > 0 && (
                <motion.circle
                  cx={x}
                  cy={y}
                  r={22 + Math.min(cat.count * 1.8, 10)}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="0.8"
                  animate={
                    shouldReduceMotion
                      ? { scale: 1, opacity: 0.14 }
                      : { scale: [0.92, 1.18, 0.92], opacity: [0.08, 0.35, 0.08] }
                  }
                  transition={repeatingTransition(3.2 + idx * 0.12)}
                />
              )}
              <foreignObject x={x - 10} y={y - 10} width="20" height="20">
                <motion.div
                  animate={
                    shouldReduceMotion
                      ? { rotate: 0, scale: 1 }
                      : {
                          rotate: cat.count > 0 ? [0, 4, -4, 0] : [0, 0, 0],
                          scale: cat.count > 0 ? [1, 1.04, 1] : [1, 1, 1],
                        }
                  }
                  transition={repeatingTransition(3.4)}
                >
                  <cat.icon
                    className={`h-5 w-5 ${cat.color} ${cat.count === 0 ? 'opacity-20' : ''}`}
                  />
                </motion.div>
              </foreignObject>
              <g className="opacity-0 group-hover/node:opacity-100 transition-opacity duration-300">
                <rect
                  x={x - 35}
                  y={y + 22}
                  width="70"
                  height="28"
                  rx="6"
                  className="fill-bg/95 stroke-white/10 backdrop-blur-md"
                />
                <text
                  x={x}
                  y={y + 34}
                  textAnchor="middle"
                  className="text-[9px] font-bold fill-text uppercase tracking-tight"
                >
                  {cat.name}
                </text>
                <text
                  x={x}
                  y={y + 43}
                  textAnchor="middle"
                  className="text-[8px] font-medium fill-text/40"
                >
                  {cat.count} Items
                </text>
              </g>
            </motion.g>
          );
        })}
      </svg>
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.4)_100%)] opacity-30" />
    </div>
  );
});

VaultEcosystemGraph.displayName = 'VaultEcosystemGraph';
VaultEcosystemCard.displayName = 'VaultEcosystemCard';
