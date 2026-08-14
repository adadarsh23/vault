import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';

interface MediaPaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export const MediaPagination: React.FC<MediaPaginationProps> = ({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
}) => {
  if (totalItems <= itemsPerPage) return null;

  return (
    <div className="flex items-center justify-center gap-8 pb-32 mt-12">
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
        <Button
          variant="outline"
          disabled={currentPage === 0}
          onClick={() => onPageChange(Math.max(0, currentPage - 1))}
          className="h-10 w-10 rounded-full border-white/10 bg-white/5 p-0 text-text/60 backdrop-blur-xl transition-all hover:border-white/30 hover:bg-white/10 hover:text-text disabled:opacity-10 disabled:cursor-not-allowed shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
      </motion.div>

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-3 rounded-full bg-white/5 px-6 py-2 border border-white/5 backdrop-blur-md shadow-inner">
          <span className="text-lg font-bold text-text tabular-nums">{currentPage + 1}</span>
          <div className="h-4 w-[1px] bg-white/10" />
          <span className="text-sm font-medium text-text/40 tabular-nums">
            {Math.ceil(totalItems / itemsPerPage)}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-text/20 font-bold">Page</span>
      </div>

      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
        <Button
          variant="outline"
          disabled={(currentPage + 1) * itemsPerPage >= totalItems}
          onClick={() => onPageChange(currentPage + 1)}
          className="h-10 w-10 rounded-full border-white/10 bg-white/5 p-0 text-text/60 backdrop-blur-xl transition-all hover:border-white/30 hover:bg-white/10 hover:text-text disabled:opacity-10 disabled:cursor-not-allowed shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      </motion.div>
    </div>
  );
};
