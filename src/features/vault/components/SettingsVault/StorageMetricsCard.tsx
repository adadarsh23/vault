import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { Activity, Wifi, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/Card';

interface StorageMetricsCardProps {
  storageUsedBytes: number;
  usagePercentage: string;
  formatBytes: (bytes: number) => string;
  storageLimit?: string;
}

export const StorageMetricsCard: React.FC<StorageMetricsCardProps> = memo(
  ({ storageUsedBytes, usagePercentage, formatBytes, storageLimit = '1.0 GB' }) => (
    <Card className="border-card-border bg-card-bg">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-400" />
          Storage & Performance Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text/60 font-medium tracking-wide">Data Size</span>
            <span className="font-bold text-text">
              {formatBytes(storageUsedBytes)}{' '}
              <span className="text-text/40 font-normal">/ {storageLimit}</span>
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-black/20 border border-white/5 relative">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${usagePercentage}%` }}
              transition={{ duration: 1.5, ease: 'easeOut', delay: 0.2 }}
              className="h-full bg-gradient-to-r from-black via-gray-500 to-white rounded-full relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </motion.div>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-text/40 text-right">
            {usagePercentage}% Capacity Used
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 border border-green-500/20">
              <Wifi className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-text">Network Node</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-[10px] uppercase tracking-widest text-green-500 font-bold">
                  Connected Server
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-text">Crypto Engine</p>
              <p className="text-[10px] uppercase tracking-widest text-amber-500 font-bold mt-0.5">
                Hardware Accelerated
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
);

StorageMetricsCard.displayName = 'StorageMetricsCard';
