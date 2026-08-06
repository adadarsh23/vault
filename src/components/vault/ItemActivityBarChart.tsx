import React from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Calendar,
  TrendingUp,
  TrendingDown,
  Sparkles,
  PieChart,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import type { VaultItem } from '../../lib/storage';

type RangeOption = 7 | 14 | 28 | 48 | 90 | 180;
type ChartMode = 'bar' | 'line' | 'pie';

const CHART_HEIGHT = 288;
const CHART_TOP_PADDING = 38;
const CHART_BOTTOM_PADDING = 44;
const CHART_SIDE_PADDING = 12;

const RANGE_OPTIONS: RangeOption[] = [7, 14, 28, 48, 90, 180];

interface ItemActivityBarChartProps {
  items: VaultItem[];
  className?: string;
}

export const ItemActivityBarChart: React.FC<ItemActivityBarChartProps> = ({ items, className }) => {
  const [rangeDays, setRangeDays] = React.useState<RangeOption>(14);
  const [chartMode, setChartMode] = React.useState<ChartMode>('bar');
  const [hoveredKey, setHoveredKey] = React.useState<string | null>(null);
  const [hoveredSliceId, setHoveredSliceId] = React.useState<string | null>(null);
  const [isRangeChanging, startRangeTransition] = React.useTransition();
  const chartId = React.useId().replace(/:/g, '');
  const lineGradientId = `item-activity-line-${chartId}`;
  const areaGradientId = `item-activity-area-${chartId}`;

  const chartState = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const buckets = Array.from({ length: rangeDays }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (rangeDays - 1 - index));
      const key = date.toISOString().slice(0, 10);

      return {
        key,
        date,
        count: 0,
        mobileLabel: date.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'numeric',
        }),
        compactLabel: date.toLocaleDateString('en-IN', {
          day: 'numeric',
        }),
        monthLabel: date.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        }),
        weekday: date.toLocaleDateString('en-IN', {
          weekday: 'short',
        }),
        fullLabel: date.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
      };
    });

    const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    for (const item of items) {
      const createdAt = new Date(item.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        continue;
      }
      createdAt.setHours(0, 0, 0, 0);
      const bucket = bucketMap.get(createdAt.toISOString().slice(0, 10));
      if (bucket) {
        bucket.count += 1;
      }
    }

    const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    const peak = Math.max(...buckets.map((bucket) => bucket.count), 0);
    const average = total === 0 ? 0 : total / buckets.length;
    const activeDays = buckets.filter((bucket) => bucket.count > 0).length;

    return {
      buckets,
      peak: peak === 0 ? 1 : peak,
      total,
      average,
      activeDays,
    };
  }, [items, rangeDays]);

  const pieData = React.useMemo(() => {
    const active = chartState.activeDays;
    const inactive = rangeDays - active;

    return [
      {
        id: 'active',
        label: 'Active Days',
        value: active,
        gradientId: `pie-active-${chartId}`,
        badgeBg: 'bg-text text-bg shadow-xs',
        badgeText: 'font-bold text-bg',
        dotBg: 'bg-text',
      },
      {
        id: 'inactive',
        label: 'Inactive Days',
        value: inactive,
        gradientId: `pie-inactive-${chartId}`,
        badgeBg: 'bg-text/[0.08] text-text/65',
        badgeText: 'font-semibold text-text/75',
        dotBg: 'bg-text/30',
      },
    ];
  }, [chartState.activeDays, rangeDays, chartId]);

  const radius = 85;
  const circumference = 2 * Math.PI * radius;

  const slices = React.useMemo(() => {
    const activeSlices = pieData.filter((slice) => slice.value > 0);
    const hasMultipleSlices = activeSlices.length > 1;
    const gap = hasMultipleSlices ? 8 : 0;
    const totalGap = activeSlices.length * gap;
    const availableCircumference = circumference - totalGap;

    let accumulatedOffset = 0;

    return pieData.map((slice) => {
      if (slice.value <= 0) {
        return {
          ...slice,
          dash: 0,
          offset: 0,
          percent: 0,
        };
      }

      const ratio = slice.value / rangeDays;
      const percent = Math.round(ratio * 100);
      const dash = ratio * availableCircumference;
      const offset = accumulatedOffset;

      accumulatedOffset += dash + gap;

      return {
        ...slice,
        dash,
        offset,
        percent,
      };
    });
  }, [pieData, rangeDays, circumference]);

  const activeSliceInfo = React.useMemo(() => {
    if (!hoveredSliceId) return null;
    return slices.find((s) => s.id === hoveredSliceId) || null;
  }, [hoveredSliceId, slices]);

  const chartMinWidth =
    rangeDays === 180
      ? 2160
      : rangeDays === 90
        ? 1440
        : rangeDays === 48
          ? 960
          : rangeDays === 28
            ? 720
            : 560;

  const hoveredIndex = chartState.buckets.findIndex((bucket) => bucket.key === hoveredKey);
  const hoveredBucket = hoveredIndex >= 0 ? chartState.buckets[hoveredIndex] : null;
  const previousBucket = hoveredIndex > 0 ? chartState.buckets[hoveredIndex - 1] : null;

  const averageDiff =
    hoveredBucket && chartState.average > 0
      ? ((hoveredBucket.count - chartState.average) / chartState.average) * 100
      : 0;

  const activityShare =
    hoveredBucket && chartState.total > 0 ? (hoveredBucket.count / chartState.total) * 100 : 0;

  const previousDiff =
    hoveredBucket && previousBucket && previousBucket.count > 0
      ? ((hoveredBucket.count - previousBucket.count) / previousBucket.count) * 100
      : null;

  const linePoints = React.useMemo(() => {
    const plotWidth = chartMinWidth - CHART_SIDE_PADDING * 2;
    const columnWidth = plotWidth / chartState.buckets.length;
    const drawableHeight = CHART_HEIGHT - CHART_TOP_PADDING - CHART_BOTTOM_PADDING;

    return chartState.buckets.map((bucket, index) => {
      const ratio = chartState.peak <= 0 ? 0 : Math.max(bucket.count / chartState.peak, 0);
      const x = CHART_SIDE_PADDING + columnWidth * index + columnWidth / 2;
      const y = CHART_TOP_PADDING + (1 - ratio) * drawableHeight;

      return { x, y, count: bucket.count, key: bucket.key };
    });
  }, [chartMinWidth, chartState.buckets, chartState.peak]);

  const linePathPoints = React.useMemo(() => {
    if (linePoints.length === 0) return [];

    const [firstPoint] = linePoints;
    const lastPoint = linePoints[linePoints.length - 1];
    const plotWidth = chartMinWidth - CHART_SIDE_PADDING * 2;
    const columnHalfWidth =
      chartState.buckets.length > 0 ? plotWidth / chartState.buckets.length / 2 : 0;

    return [
      {
        x: Math.max(firstPoint.x - columnHalfWidth, CHART_SIDE_PADDING),
        y: firstPoint.y,
      },
      ...linePoints,
      {
        x: Math.min(lastPoint.x + columnHalfWidth, chartMinWidth - CHART_SIDE_PADDING),
        y: lastPoint.y,
      },
    ];
  }, [chartMinWidth, chartState.buckets.length, linePoints]);

  const linePath = React.useMemo(() => {
    if (linePathPoints.length === 0) return '';

    return linePathPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
  }, [linePathPoints]);

  const lineAreaPath = React.useMemo(() => {
    if (linePathPoints.length === 0) return '';

    const baseline = CHART_HEIGHT - CHART_BOTTOM_PADDING;
    const [firstPoint] = linePathPoints;
    const lastPoint = linePathPoints[linePathPoints.length - 1];

    return `${linePath} L ${lastPoint.x} ${baseline} L ${firstPoint.x} ${baseline} Z`;
  }, [linePath, linePathPoints]);

  const TOOLTIP_WIDTH = 220;

  const tooltipLeft = React.useMemo(() => {
    if (hoveredIndex < 0) return 0;

    const point = linePoints[hoveredIndex];
    if (!point) return 0;

    return Math.max(0, Math.min(point.x - TOOLTIP_WIDTH / 2, chartMinWidth - TOOLTIP_WIDTH));
  }, [hoveredIndex, linePoints, chartMinWidth]);

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-[2rem] border-card-border bg-card-bg shadow-sm dark:border-white/10 dark:bg-black',
        className
      )}
    >
      <CardHeader className="border-b border-card-border/80 bg-gradient-to-r from-text/[0.02] via-transparent to-text/[0.02]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-text" />
              Item Activity
            </CardTitle>
            <CardDescription>
              {chartState.total} item{chartState.total === 1 ? '' : 's'} created in the last{' '}
              {rangeDays} days.
            </CardDescription>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:items-center">
            <div className="grid w-full grid-cols-3 rounded-xl border border-card-border/80 bg-text/[0.03] p-1 sm:inline-flex sm:w-auto sm:grid-cols-none">
              <Button
                size="sm"
                variant={chartMode === 'bar' ? 'secondary' : 'ghost'}
                className={cn(
                  'h-8 w-full rounded-lg px-3 text-xs transition-all duration-300',
                  chartMode === 'bar'
                    ? 'bg-text text-bg shadow-[0_8px_24px_-16px_rgba(15,23,42,0.85)] hover:bg-text/90'
                    : 'text-text/55 hover:bg-text/5 hover:text-text'
                )}
                onClick={() => setChartMode('bar')}
              >
                <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                Bars
              </Button>
              <Button
                size="sm"
                variant={chartMode === 'line' ? 'secondary' : 'ghost'}
                className={cn(
                  'h-8 w-full rounded-lg px-3 text-xs transition-all duration-300',
                  chartMode === 'line'
                    ? 'bg-text text-bg shadow-[0_8px_24px_-16px_rgba(15,23,42,0.85)] hover:bg-text/90'
                    : 'text-text/55 hover:bg-text/5 hover:text-text'
                )}
                onClick={() => setChartMode('line')}
              >
                <Activity className="mr-1.5 h-3.5 w-3.5" />
                Line
              </Button>
              <Button
                size="sm"
                variant={chartMode === 'pie' ? 'secondary' : 'ghost'}
                className={cn(
                  'h-8 w-full rounded-lg px-3 text-xs transition-all duration-300',
                  chartMode === 'pie'
                    ? 'bg-text text-bg shadow-[0_8px_24px_-16px_rgba(15,23,42,0.85)] hover:bg-text/90'
                    : 'text-text/55 hover:bg-text/5 hover:text-text'
                )}
                onClick={() => setChartMode('pie')}
              >
                <PieChart className="mr-1.5 h-3.5 w-3.5" />
                Pie
              </Button>
            </div>

            <div className="grid w-full grid-cols-3 rounded-xl border border-card-border/80 bg-text/[0.03] p-1 sm:inline-flex sm:w-auto sm:grid-cols-none">
              {RANGE_OPTIONS.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={rangeDays === option ? 'secondary' : 'ghost'}
                  className={cn(
                    'h-8 w-full rounded-lg px-3 text-xs transition-all duration-300',
                    rangeDays === option
                      ? 'bg-text text-bg shadow-[0_8px_24px_-16px_rgba(15,23,42,0.85)] hover:bg-text/90'
                      : 'text-text/55 hover:bg-text/5 hover:text-text'
                  )}
                  onClick={() =>
                    startRangeTransition(() => {
                      setRangeDays(option);
                      setHoveredKey(null);
                    })
                  }
                >
                  {option}D
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-4 sm:p-6">
        <motion.div
          layout
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-[1.5rem] border border-card-border/80 bg-gradient-to-b from-text/[0.035] via-text/[0.02] to-transparent p-3 sm:p-4"
        >
          <div
            className={cn(
              'custom-scrollbar pb-2',
              chartMode === 'pie'
                ? 'w-full overflow-x-hidden'
                : 'overflow-x-auto overflow-y-visible'
            )}
          >
            <div
              className={cn(
                'relative overflow-visible',
                chartMode === 'pie' ? 'w-full min-h-[288px]' : 'h-72 min-w-full'
              )}
              style={{
                minWidth: chartMode !== 'pie' ? `${chartMinWidth}px` : undefined,
              }}
            >
              <motion.div
                animate={{
                  opacity: isRangeChanging ? 1 : 0,
                }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className="pointer-events-none absolute inset-0 z-10 rounded-[1.25rem] bg-bg/20 backdrop-blur-[2px]"
              />

              {chartMode !== 'pie' && (
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                  {[0, 1, 2, 3].map((row) => (
                    <div key={row} className="border-t border-dashed border-card-border/60" />
                  ))}
                </div>
              )}

              <AnimatePresence initial={false}>
                {hoveredBucket && chartMode !== 'pie' && (
                  <motion.div
                    key={hoveredBucket.key}
                    initial={{ opacity: 0, y: 8, scale: 0.985 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      left: tooltipLeft,
                      x: 0,
                    }}
                    exit={{ opacity: 0, y: 6, scale: 0.985 }}
                    transition={{
                      left: {
                        type: 'spring',
                        stiffness: 320,
                        damping: 28,
                        mass: 0.8,
                      },
                      x: {
                        type: 'spring',
                        stiffness: 320,
                        damping: 28,
                        mass: 0.8,
                      },
                      opacity: { duration: 0.14, ease: 'easeOut' },
                      y: { duration: 0.18, ease: 'easeOut' },
                      scale: { duration: 0.18, ease: 'easeOut' },
                    }}
                    className="pointer-events-none absolute top-2 z-20 w-[220px] rounded-3xl border border-white/10 bg-bg/80 p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
                  >
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-text/15 bg-text/10 px-2 py-1">
                          <Calendar className="h-3 w-3 text-text" />
                          <span className="text-[10px] font-medium uppercase tracking-wider text-text">
                            {hoveredBucket.fullLabel}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-3xl font-bold leading-none text-text">
                            {hoveredBucket.count} item
                            {hoveredBucket.count === 1 ? '' : 's'}
                          </h3>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between rounded-xl border border-card-border/60 bg-text/[0.03] px-3 py-2">
                          <span className="text-xs text-text/60">Average</span>

                          <div className="flex items-center gap-1.5">
                            {averageDiff >= 0 ? (
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                            )}

                            <span
                              className={cn(
                                'text-xs font-semibold',
                                averageDiff >= 0 ? 'text-emerald-500' : 'text-rose-500'
                              )}
                            >
                              {Math.abs(averageDiff).toFixed(0)}%
                            </span>
                          </div>
                        </div>

                        {previousDiff !== null && (
                          <div className="flex items-center justify-between rounded-xl border border-card-border/60 bg-text/[0.03] px-3 py-2">
                            <span className="text-xs text-text/60">Previous Day</span>

                            <div className="flex items-center gap-1.5">
                              {previousDiff >= 0 ? (
                                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                              )}

                              <span
                                className={cn(
                                  'text-xs font-semibold',
                                  previousDiff >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                )}
                              >
                                {Math.abs(previousDiff).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between rounded-xl border border-card-border/60 bg-text/[0.03] px-3 py-2">
                          <span className="text-xs text-text/60">Activity Share</span>

                          <div className="flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-text/80" />

                            <span className="text-xs font-semibold text-text">
                              {activityShare.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <LayoutGroup id="item-activity-bars">
                {chartMode === 'pie' ? (
                  <motion.div
                    key="pie-view"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="grid w-full grid-cols-1 items-center gap-6 px-2 py-3 sm:grid-cols-2 sm:gap-8 sm:px-4"
                  >
                    {/* ================= Donut Chart Section ================= */}
                    <div className="relative flex w-full min-w-0 items-center justify-center py-2">
                      {/* Monochrome Background Glow matching Bar/Line chart theme */}
                      <motion.div
                        animate={{
                          scale: [1, 1.08, 1],
                          opacity: [0.15, 0.3, 0.15],
                        }}
                        transition={{
                          repeat: Infinity,
                          duration: 4,
                          ease: 'easeInOut',
                        }}
                        className="absolute size-40 rounded-full bg-text/[0.06] blur-3xl sm:size-52 md:size-60"
                      />

                      <svg
                        viewBox="0 0 280 280"
                        className="h-[150px] w-[150px] shrink-0 -rotate-90 overflow-visible transition-all duration-300 sm:h-[190px] sm:w-[190px] md:h-[230px] md:w-[230px]"
                      >
                        <defs>
                          <linearGradient
                            id={`pie-active-${chartId}`}
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="100%"
                          >
                            <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
                            <stop offset="100%" stopColor="currentColor" stopOpacity="0.75" />
                          </linearGradient>
                          <linearGradient
                            id={`pie-inactive-${chartId}`}
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="100%"
                          >
                            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="currentColor" stopOpacity="0.12" />
                          </linearGradient>
                          <filter
                            id={`pie-glow-${chartId}`}
                            x="-20%"
                            y="-20%"
                            width="140%"
                            height="140%"
                          >
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                          </filter>
                        </defs>

                        {/* Decorative Animated Dash Orbit */}
                        <motion.circle
                          cx="140"
                          cy="140"
                          r={radius + 18}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeDasharray="4 8"
                          className="text-text/20"
                          animate={{ rotate: [0, 360] }}
                          transition={{ repeat: Infinity, duration: 40, ease: 'linear' }}
                          style={{ transformOrigin: '140px 140px' }}
                        />

                        {/* Background Track Ring */}
                        <circle
                          cx="140"
                          cy="140"
                          r={radius}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="20"
                          className="text-text/[0.06]"
                        />

                        {/* Animated Pie Slices */}
                        {slices
                          .filter((slice) => slice.value > 0)
                          .map((slice, index) => {
                            const isHovered = hoveredSliceId === slice.id;
                            const isOtherHovered = hoveredSliceId !== null && !isHovered;

                            return (
                              <motion.circle
                                key={slice.id}
                                cx="140"
                                cy="140"
                                r={radius}
                                fill="none"
                                stroke={`url(#${slice.gradientId})`}
                                strokeWidth={isHovered ? 26 : 20}
                                strokeLinecap="round"
                                strokeDasharray={`${slice.dash} ${circumference}`}
                                strokeDashoffset={-slice.offset}
                                initial={{ strokeDasharray: `0 ${circumference}` }}
                                animate={{
                                  strokeDasharray: `${slice.dash} ${circumference}`,
                                  opacity: isOtherHovered ? 0.4 : 1,
                                  scale: isHovered ? 1.03 : 1,
                                }}
                                style={{ transformOrigin: '140px 140px' }}
                                onMouseEnter={() => setHoveredSliceId(slice.id)}
                                onMouseLeave={() => setHoveredSliceId(null)}
                                transition={{
                                  duration: 0.85,
                                  delay: index * 0.1,
                                  ease: [0.22, 1, 0.36, 1],
                                  scale: { duration: 0.25 },
                                  strokeWidth: { duration: 0.25 },
                                  opacity: { duration: 0.25 },
                                }}
                                className="text-text cursor-pointer drop-shadow-sm transition-all duration-300"
                                filter={isHovered ? `url(#pie-glow-${chartId})` : undefined}
                              />
                            );
                          })}
                      </svg>

                      {/* Donut Center Content */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                          initial={{ scale: 0.85, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{
                            delay: 0.15,
                            type: 'spring',
                            stiffness: 200,
                            damping: 20,
                          }}
                          className={cn(
                            'flex size-20 flex-col items-center justify-center rounded-full border p-2 text-center shadow-[0_16px_36px_rgba(0,0,0,0.35)] backdrop-blur-2xl transition-all duration-300 sm:size-24 md:size-28',
                            hoveredSliceId
                              ? 'border-text/30 bg-bg/95 dark:bg-black/90 shadow-[0_0_24px_rgba(255,255,255,0.15)]'
                              : 'border-card-border/80 bg-bg/80 dark:bg-black/80'
                          )}
                        >
                          <AnimatePresence mode="wait">
                            {activeSliceInfo ? (
                              <motion.div
                                key={activeSliceInfo.id}
                                initial={{ opacity: 0, scale: 0.9, y: 4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                                className="flex flex-col items-center justify-center"
                              >
                                <span
                                  className={cn(
                                    'text-xl font-black sm:text-2xl md:text-3xl text-text'
                                  )}
                                >
                                  {activeSliceInfo.value}
                                </span>
                                <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-text/50 sm:text-[9px] md:text-[10px]">
                                  {activeSliceInfo.label}
                                </span>
                                <div className="my-1 h-px w-6 bg-card-border/80 sm:w-8" />
                                <span className="text-[9px] font-bold text-text/80 sm:text-[10px] md:text-[11px]">
                                  {activeSliceInfo.percent}% of Range
                                </span>
                              </motion.div>
                            ) : (
                              <motion.div
                                key="default-center"
                                initial={{ opacity: 0, scale: 0.9, y: 4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                                className="flex flex-col items-center justify-center"
                              >
                                <h2 className="text-xl font-black text-text sm:text-2xl md:text-3xl">
                                  {chartState.total}
                                </h2>
                                <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-text/50 sm:text-[9px] md:text-[10px]">
                                  Total Items
                                </span>
                                <div className="my-1 h-px w-6 bg-card-border/80 sm:w-8" />
                                <span className="text-[9px] font-bold text-text/80 sm:text-[10px] md:text-[11px]">
                                  {Math.round((chartState.activeDays / rangeDays) * 100)}% Active
                                </span>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      </div>
                    </div>

                    {/* ================= Breakdown Cards Section ================= */}
                    <motion.div
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: 0.15,
                        duration: 0.45,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="flex w-full min-w-0 flex-col justify-center gap-3"
                    >
                      {slices.map((item) => {
                        const isHovered = hoveredSliceId === item.id;
                        const isOtherHovered = hoveredSliceId !== null && !isHovered;

                        return (
                          <motion.div
                            key={item.id}
                            onMouseEnter={() => setHoveredSliceId(item.id)}
                            onMouseLeave={() => setHoveredSliceId(null)}
                            whileHover={{ y: -2, scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className={cn(
                              'cursor-pointer flex items-center justify-between rounded-2xl border p-3.5 shadow-sm backdrop-blur-xl transition-all duration-300 sm:p-4',
                              isHovered
                                ? 'border-text/30 bg-gradient-to-r from-text/[0.08] via-text/[0.04] to-transparent shadow-md'
                                : isOtherHovered
                                  ? 'border-card-border/40 bg-text/[0.02] opacity-50'
                                  : 'border-card-border/80 bg-gradient-to-r from-text/[0.04] to-transparent'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  'h-3 w-3 shrink-0 rounded-full shadow-sm',
                                  item.dotBg
                                )}
                              />
                              <div>
                                <p className="text-xs font-semibold text-text sm:text-sm">
                                  {item.label}
                                </p>
                                <p className="text-[11px] text-text/55">
                                  {item.value} day{item.value === 1 ? '' : 's'} in {rangeDays}D
                                  range
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold text-text sm:text-lg">
                                {item.value}
                              </span>
                              <span
                                className={cn(
                                  'rounded-full px-2.5 py-0.5 text-xs font-bold shadow-xs',
                                  item.badgeBg,
                                  item.badgeText
                                )}
                              >
                                {item.percent}%
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}

                      {/* Activity Consistency Progress Bar */}
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.35 }}
                        className="rounded-2xl border border-card-border/80 bg-text/[0.03] p-3.5 sm:p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-text/65">
                            Activity Consistency
                          </span>
                          <span className="rounded-full bg-text/10 px-2.5 py-0.5 text-xs font-bold text-text">
                            {Math.round((chartState.activeDays / rangeDays) * 100)}%
                          </span>
                        </div>

                        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-text/10">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.round((chartState.activeDays / rangeDays) * 100)}%`,
                            }}
                            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                            className="h-full rounded-full bg-gradient-to-r from-text via-text/85 to-text/55 shadow-xs"
                          />
                        </div>
                      </motion.div>
                    </motion.div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`${rangeDays}-${chartMode}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="relative grid h-full items-end gap-1.5 sm:gap-3"
                    style={{
                      gridTemplateColumns: `repeat(${chartState.buckets.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {chartMode === 'line' && (
                      <div className="pointer-events-none absolute inset-0">
                        <svg
                          className="h-full w-full overflow-visible"
                          viewBox={`0 0 ${chartMinWidth} ${CHART_HEIGHT}`}
                          preserveAspectRatio="none"
                        >
                          <defs>
                            <linearGradient id={lineGradientId} x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                              <stop offset="50%" stopColor="currentColor" stopOpacity="0.95" />
                              <stop offset="100%" stopColor="currentColor" stopOpacity="0.45" />
                            </linearGradient>
                            <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
                              <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
                            </linearGradient>
                          </defs>

                          <motion.path
                            d={lineAreaPath}
                            fill={`url(#${areaGradientId})`}
                            className="text-text"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.35, ease: 'easeOut' }}
                          />
                          <path
                            d={linePath}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                            className="text-text/15"
                          />
                          <motion.path
                            d={linePath}
                            fill="none"
                            stroke={`url(#${lineGradientId})`}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{
                              duration:
                                rangeDays >= 180
                                  ? 1.55
                                  : rangeDays >= 90
                                    ? 1.35
                                    : rangeDays >= 48
                                      ? 1.15
                                      : rangeDays >= 28
                                        ? 0.95
                                        : 0.8,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                          />

                          {linePoints.map((point) => {
                            const isHovered = hoveredKey === point.key;

                            return (
                              <g key={point.key}>
                                <motion.circle
                                  cx={point.x}
                                  cy={point.y}
                                  r={isHovered ? 8 : 5}
                                  className={cn(
                                    'fill-bg/90 stroke-text/20',
                                    point.count === 0 && 'opacity-0'
                                  )}
                                  strokeWidth="2"
                                  initial={{ scale: 0.8, opacity: 0 }}
                                  animate={{
                                    scale: 1,
                                    opacity: point.count === 0 ? 0 : 1,
                                  }}
                                  transition={{
                                    duration: 0.25,
                                    ease: 'easeOut',
                                  }}
                                />
                                <motion.circle
                                  cx={point.x}
                                  cy={point.y}
                                  r={isHovered ? 4 : 3}
                                  className={cn('fill-text', point.count === 0 && 'opacity-0')}
                                  initial={{ scale: 0.8, opacity: 0 }}
                                  animate={{
                                    scale: 1,
                                    opacity: point.count === 0 ? 0 : 1,
                                  }}
                                  transition={{
                                    duration: 0.25,
                                    ease: 'easeOut',
                                  }}
                                />
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    )}

                    {chartState.buckets.map((bucket, index) => {
                      const heightPercent =
                        bucket.count === 0
                          ? 0
                          : Math.max((bucket.count / chartState.peak) * 100, 14);
                      const isHovered = hoveredKey === bucket.key;
                      const shouldShowLabel =
                        rangeDays <= 14 ||
                        (rangeDays === 28 && index % 2 === 0) ||
                        (rangeDays === 48 && index % 4 === 0) ||
                        (rangeDays === 90 && index % 7 === 0) ||
                        (rangeDays === 180 && index % 14 === 0);

                      return (
                        <div
                          key={bucket.key}
                          className="relative flex h-full flex-col justify-end"
                          onPointerEnter={() => setHoveredKey(bucket.key)}
                          onPointerLeave={() =>
                            setHoveredKey((current) => (current === bucket.key ? null : current))
                          }
                        >
                          <div className="flex h-full flex-col justify-end">
                            {chartMode === 'bar' ? (
                              <motion.div
                                initial={{ height: 0, opacity: 0.2, y: 14 }}
                                animate={{
                                  height: `${heightPercent}%`,
                                  opacity: 1,
                                  y: 0,
                                  scale: isHovered ? 1.02 : 1,
                                }}
                                transition={{
                                  duration: 0.7,
                                  delay: index * 0.02,
                                  ease: [0.19, 1, 0.22, 1],
                                  scale: {
                                    type: 'spring',
                                    stiffness: 320,
                                    damping: 22,
                                  },
                                }}
                                className={cn(
                                  'relative mx-auto w-full origin-bottom rounded-[1rem] border border-text/10 bg-gradient-to-t from-text via-text/80 to-text/55 shadow-[0_16px_35px_-20px_rgba(15,23,42,0.28)] transition-all duration-300',
                                  isHovered && 'shadow-[0_24px_50px_-18px_rgba(15,23,42,0.42)]'
                                )}
                                style={{
                                  maxWidth:
                                    rangeDays >= 180
                                      ? '0.25rem'
                                      : rangeDays >= 90
                                        ? '0.5rem'
                                        : rangeDays >= 48
                                          ? '1rem'
                                          : rangeDays >= 28
                                            ? '1.45rem'
                                            : '2rem',
                                }}
                                title={`${bucket.fullLabel}: ${bucket.count} item${bucket.count === 1 ? '' : 's'}`}
                              >
                                <motion.div
                                  animate={{
                                    opacity: isHovered ? 0.16 : 0.08,
                                  }}
                                  transition={{
                                    duration: 0.22,
                                    ease: 'easeOut',
                                  }}
                                  className="absolute inset-0 rounded-[1rem] bg-gradient-to-t from-bg/0 via-bg/10 to-bg/5"
                                />
                              </motion.div>
                            ) : (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: isHovered ? 1 : 0.5 }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                className="mx-auto h-full w-full"
                                title={`${bucket.fullLabel}: ${bucket.count} item${bucket.count === 1 ? '' : 's'}`}
                              >
                                <div
                                  className={cn(
                                    'mx-auto h-full w-full rounded-[1rem] transition-colors duration-200',
                                    isHovered ? 'bg-text/[0.06]' : 'bg-transparent'
                                  )}
                                />
                              </motion.div>
                            )}
                          </div>

                          <div className="mt-3 text-center">
                            {shouldShowLabel ? (
                              <p className="mt-1 text-xs text-text/55">
                                {rangeDays <= 14
                                  ? bucket.mobileLabel
                                  : rangeDays <= 28
                                    ? bucket.weekday
                                    : rangeDays <= 90
                                      ? bucket.compactLabel
                                      : bucket.monthLabel}
                              </p>
                            ) : (
                              <div className="mt-1 h-4" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </LayoutGroup>
            </div>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
};
