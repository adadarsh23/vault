import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

export const ScrollButton: React.FC<{ 
  onClick: () => void; 
  visible: boolean; 
  icon: React.ElementType;
  className?: string;
}> = ({ onClick, visible, icon: Icon, className }) => (
  <AnimatePresence>
    {visible && (
      <motion.button
        type="button"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onClick}
        className={cn(
          "absolute z-30 p-2 rounded-full bg-white/5 text-white/20 hover:text-white/40 shadow-lg transition-all border border-white/5 backdrop-blur-sm",
          className
        )}
      >
        <Icon className="h-4 w-4" />
      </motion.button>
    )}
  </AnimatePresence>
);
