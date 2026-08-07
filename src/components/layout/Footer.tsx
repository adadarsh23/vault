import React, { memo } from 'react';
import { motion, useReducedMotion, Variants } from 'framer-motion';
import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

interface FooterProps {}

/* ───────── Variants ───────── */

const containerVariants = (reduce: boolean): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: reduce ? 0 : 0.05,
      delayChildren: reduce ? 0 : 0.15,
    },
  },
});

const charVariants = (reduce: boolean): Variants => ({
  hidden: { opacity: 0, y: reduce ? 0 : 60 },
  visible: {
    opacity: 0.2, // Increased visibility
    y: 0,
    transition: {
      duration: reduce ? 0 : 0.9,
      ease: [0.22, 1, 0.36, 1],
    },
  },
});

const fadeUp = (reduce: boolean): Variants => ({
  hidden: { opacity: 0, y: reduce ? 0 : 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: reduce ? 0 : 0.5,
      ease: 'easeOut',
    },
  },
});

/* ───────── Component ───────── */

export const Footer: React.FC<FooterProps> = memo(() => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <footer className="relative z-10 mt-24 sm:mt-28 lg:mt-32 pb-10 overflow-hidden">
      {/* ───── Background Text (VAULT) ───── */}
      <div
        className="absolute inset-0 flex items-end justify-center pointer-events-none select-none -z-10 overflow-hidden"
        aria-hidden="true"
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants(!!shouldReduceMotion)}
          className="
            flex items-end justify-center
            -space-x-[0.04em]
            translate-y-[35%] sm:translate-y-[15%] lg:translate-y-[12%]
            w-full h-full
            will-change-transform
          "
        >
          {Array.from('VAULT').map((char, index) => (
            <motion.span
              key={index}
              variants={charVariants(!!shouldReduceMotion)}
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 0.2, y: 0 }}
              transition={{
                duration: shouldReduceMotion ? 0 : 1.2,
                delay: index * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={
                shouldReduceMotion
                  ? {}
                  : {
                      opacity: 0.25,
                      y: -14,
                      scale: 1.03,
                    }
              }
              className="
          text-[clamp(8rem,28vw,35rem)]
          font-black
          leading-none
          text-white
          whitespace-nowrap
          tracking-tighter
        "
              style={{
                filter: 'blur(0.5px)', // subtle smoothness
              }}
            >
              {char}
            </motion.span>
          ))}
        </motion.div>

        {/* Bottom Glow */}
        <div className="absolute bottom-0 left-0 right-0 h-80 bg-gradient-to-t from-indigo-500/20 via-fuchsia-500/15 via-cyan-400/10 to-transparent blur-[120px]" />

        {/* Extra Center Glow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-60 rounded-full bg-white/5 blur-[120px]" />

        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.3)_100%)]" />

        {/* Top Fade */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30" />

        {/* Grid Noise */}
        <div className="absolute inset-0 opacity-[0.03] mix-blend-soft-light bg-[radial-gradient(circle_at_center,white_1px,transparent_1px)] [background-size:22px_22px]" />

        {/* Film Grain */}
        <div className="absolute inset-0 opacity-[0.025] bg-[url('data:image/svg+xml,%3Csvg%20viewBox=%220%200%20200%20200%22%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter%20id=%22n%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.8%22%20numOctaves=%223%22%20stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20filter=%22url(%23n)%22/%3E%3C/svg%3E')] mix-blend-overlay" />
      </div>

      {/* ───── Main Content ───── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp(!!shouldReduceMotion)}
          className="pt-14 sm:pt-16 lg:pt-20 border-t border-white/10"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-x-8 gap-y-12">
            {/* ───── Brand ───── */}
            <div className="lg:col-span-5 flex flex-col items-center sm:items-start text-center sm:text-left">
              <div className="flex items-center gap-3 mb-5">
                <motion.div
                  whileHover={shouldReduceMotion ? {} : { scale: 1.05, rotate: 4 }}
                  className="p-2 rounded-xl bg-white text-black shadow-lg"
                >
                  <Lock className="w-7 h-7" />
                </motion.div>

                <span className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                  Vault
                </span>
              </div>
            </div>

            {/* ───── Links ───── */}
            <div className="lg:col-span-7 flex flex-col items-center sm:items-end">
              <div className="w-full max-w-xs sm:max-w-none flex flex-col items-center sm:items-end">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40 mb-4">
                  Links
                </h2>

                <nav className="flex flex-col gap-2 w-full items-center sm:items-end">
                  <Link
                    to="/contact"
                    className="
                      w-full sm:w-auto
                      px-4 py-2 sm:px-0 sm:py-0
                      text-center sm:text-right
                      text-white/70 text-sm
                      rounded-lg
                      transition-all duration-200
                      hover:text-white
                      focus:outline-none focus:ring-2 focus:ring-white/20
                    "
                  >
                    Contact Us
                  </Link>
                  <Link
                    to="/legal#privacy"
                    className="
                      w-full sm:w-auto
                      px-4 py-2 sm:px-0 sm:py-0
                      text-center sm:text-right
                      text-white/70 text-sm
                      rounded-lg
                      transition-all duration-200
                      hover:text-white
                      focus:outline-none focus:ring-2 focus:ring-white/20
                    "
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    to="/legal#license"
                    className="
                      w-full sm:w-auto
                      px-4 py-2 sm:px-0 sm:py-0
                      text-center sm:text-right
                      text-white/70 text-sm
                      rounded-lg
                      transition-all duration-200
                      hover:text-white
                      focus:outline-none focus:ring-2 focus:ring-white/20
                    "
                  >
                    License
                  </Link>
                </nav>
              </div>
            </div>
          </div>

          {/* ───── Bottom ───── */}
          <div className="mt-14 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-white/40 text-xs">
              © {new Date().getFullYear()} Vault. All rights reserved.
            </p>

            <span className="text-white/30 text-[10px] uppercase tracking-[0.2em] font-medium">
              Data Encrypted Vault
            </span>
          </div>
        </motion.div>
      </div>
    </footer>
  );
});

Footer.displayName = 'Footer';
