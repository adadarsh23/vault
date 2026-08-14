import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Loader2, Lock, ShieldAlert } from 'lucide-react';

interface InfoOverlaysProps {
  rsaKeyPair: any;
  isEncrypting: boolean;
}

export const InfoOverlays: React.FC<InfoOverlaysProps> = ({ rsaKeyPair, isEncrypting }) => {
  return (
    <div className="absolute left-4 md:left-8 top-4 md:top-8 z-20 flex flex-col gap-2 md:gap-3">
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 md:px-4 md:py-2 backdrop-blur-2xl shadow-xl shadow-emerald-500/5"
      >
        <Lock className="h-3 w-3 md:h-4 w-4 text-emerald-400" />
        <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.15em] text-emerald-400">
          AES-256-GCM
        </span>
      </motion.div>

      {rsaKeyPair ? (
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-1.5 md:px-4 md:py-2 backdrop-blur-2xl shadow-xl shadow-blue-500/5"
        >
          {isEncrypting ? (
            <Loader2 className="h-3 w-3 md:h-4 w-4 animate-spin text-blue-400" />
          ) : (
            <ShieldCheck className="h-3 w-3 md:h-4 w-4 text-blue-400" />
          )}
          <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.15em] text-blue-400">
            {isEncrypting ? 'RSA E2EE WRAPPING ACTIVE' : 'RSA E2EE ENABLED'}
          </span>
        </motion.div>
      ) : (
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-1.5 md:px-4 md:py-2 backdrop-blur-2xl shadow-xl"
        >
          <ShieldAlert className="h-3 w-3 md:h-4 w-4 text-yellow-500/70" />
          <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.15em] text-yellow-500/70">
            SERVER-ONLY ENCRYPTION MODE
          </span>
        </motion.div>
      )}

      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/5 px-3 py-1.5 md:px-4 md:py-2 backdrop-blur-2xl shadow-xl"
      >
        <ShieldCheck className="h-3 w-3 md:h-4 w-4 text-purple-400" />
        <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.15em] text-purple-400">
          QTN + AV active
        </span>
      </motion.div>
    </div>
  );
};
