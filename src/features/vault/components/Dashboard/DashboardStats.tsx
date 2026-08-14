import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatItem {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  count: number;
}

interface DashboardStatsProps {
  stats: StatItem[];
  onNavigate: (tab: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAT_COLOR_MAP: Record<string, string> = {
  'text-indigo-400': 'bg-indigo-400',
  'text-teal-400': 'bg-teal-400',
  'text-amber-400': 'bg-amber-400',
  'text-emerald-400': 'bg-emerald-400',
  'text-sky-400': 'bg-sky-400',
  'text-rose-400': 'bg-rose-400',
  'text-yellow-400': 'bg-yellow-400',
  'text-orange-400': 'bg-orange-400',
  'text-purple-400': 'bg-purple-400',
  'text-lime-400': 'bg-lime-400',
  'text-blue-400': 'bg-blue-400',
  'text-fuchsia-400': 'bg-fuchsia-400',
  'text-cyan-400': 'bg-cyan-400',
  'text-violet-400': 'bg-violet-400',
  'text-slate-400': 'bg-slate-400',
  'text-slate-300': 'bg-slate-400',
};

// ─── Animation Variants ───────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

// ─── Component ────────────────────────────────────────────────────────────────

export const DashboardStats: React.FC<DashboardStatsProps> = ({ stats, onNavigate }) => {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {stats.map((stat) => (
        <motion.div
          key={stat.id}
          variants={itemVariants}
          whileHover={{ y: -6 }}
          whileTap={{ scale: 0.98 }}
          className="h-full"
        >
          <button
            onClick={() => onNavigate(stat.id)}
            aria-label={`Open ${stat.label} vault`}
            className="group relative flex min-h-[160px] w-full flex-col items-start justify-between overflow-hidden rounded-[2rem] border border-card-border bg-card-bg p-6 text-left dark:border-white/10 dark:bg-black/40 transition-all hover:bg-text/[0.02] hover:border-text/20 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            {/* Category-specific Glow */}
            <div
              className={`absolute -right-6 -top-6 h-32 w-32 rounded-full blur-[60px] opacity-10 transition-opacity duration-500 group-hover:opacity-30 ${STAT_COLOR_MAP[stat.color] || 'bg-rose-400'}`}
            />

            <div className="relative z-10 flex w-full items-start justify-between">
              <div
                className={`rounded-2xl border border-card-border/50 bg-text/5 p-3.5 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 group-hover:bg-text/10`}
              >
                <stat.icon
                  size={24}
                  className={`${stat.color} transition-colors drop-shadow-[0_0_8px_currentColor]`}
                />
              </div>
              <div className="p-2 rounded-full bg-text/5 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                <ArrowUpRight className="h-4 w-4 text-text/60" />
              </div>
            </div>

            <div className="relative z-10 w-full space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text/30 transition-colors group-hover:text-text/50">
                {stat.label}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tracking-tighter text-text/90 transition-colors group-hover:text-text">
                  {stat.count}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-text/20">
                  Units
                </span>
              </div>
            </div>

            {/* Bottom Accent */}
            <div
              className={`absolute bottom-0 left-0 h-1 w-full translate-y-2 transition-transform duration-500 group-hover:translate-y-0 ${STAT_COLOR_MAP[stat.color] || 'bg-rose-400'} opacity-40 blur-sm`}
            />
          </button>
        </motion.div>
      ))}
    </motion.div>
  );
};
