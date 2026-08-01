import React from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import {
  Activity,
  BarChart3,
  Calendar,
  TrendingUp,
  TrendingDown,
  Sparkles,
  PieChart,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/Card'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'
import type { VaultItem } from '../../lib/storage'

type RangeOption = 7 | 14 | 28 | 48 | 90 | 180
type ChartMode = 'bar' | 'line' | 'pie'

const CHART_HEIGHT = 288
const CHART_TOP_PADDING = 38
const CHART_BOTTOM_PADDING = 44
const CHART_SIDE_PADDING = 12

const RANGE_OPTIONS: RangeOption[] = [7, 14, 28, 48, 90, 180]

interface ItemActivityBarChartProps {
  items: VaultItem[]
  className?: string
}

export const ItemActivityBarChart: React.FC<ItemActivityBarChartProps> = ({
  items,
  className,
}) => {
  const [rangeDays, setRangeDays] = React.useState<RangeOption>(14)
  const [chartMode, setChartMode] = React.useState<ChartMode>('bar')
  const [hoveredKey, setHoveredKey] = React.useState<string | null>(null)
  const [isRangeChanging, startRangeTransition] = React.useTransition()
  const chartId = React.useId().replace(/:/g, '')
  const lineGradientId = `item-activity-line-${chartId}`
  const areaGradientId = `item-activity-area-${chartId}`

  const chartState = React.useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const buckets = Array.from({ length: rangeDays }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() - (rangeDays - 1 - index))
      const key = date.toISOString().slice(0, 10)

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
      }
    })

    const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]))

    for (const item of items) {
      const createdAt = new Date(item.createdAt)
      if (Number.isNaN(createdAt.getTime())) {
        continue
      }
      createdAt.setHours(0, 0, 0, 0)
      const bucket = bucketMap.get(createdAt.toISOString().slice(0, 10))
      if (bucket) {
        bucket.count += 1
      }
    }

    const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
    const peak = Math.max(...buckets.map((bucket) => bucket.count), 0)
    const average = total === 0 ? 0 : total / buckets.length
    const activeDays = buckets.filter((bucket) => bucket.count > 0).length

    return {
      buckets,
      peak: peak === 0 ? 1 : peak,
      total,
      average,
      activeDays,
    }
  }, [items, rangeDays])

  const pieData = React.useMemo(() => {
    const active = chartState.activeDays
    const inactive = rangeDays - active

    return [
      {
        label: 'Active',
        value: active,
        color: '#22c55e',
      },
      {
        label: 'Inactive',
        value: inactive,
        color: '#64748b',
      },
    ]
  }, [chartState.activeDays, rangeDays])

  const radius = 85
  const circumference = 2 * Math.PI * radius

  let accumulated = 0

  const slices = pieData.map((slice) => {
    const percent = slice.value / rangeDays
    const dash = percent * circumference

    const result = {
      ...slice,
      dash,
      offset: accumulated,
    }

    accumulated += dash

    return result
  })

  const chartMinWidth =
    rangeDays === 180
      ? 2160
      : rangeDays === 90
        ? 1440
        : rangeDays === 48
          ? 960
          : rangeDays === 28
            ? 720
            : 560
  const hoveredIndex = chartState.buckets.findIndex(
    (bucket) => bucket.key === hoveredKey,
  )
  const hoveredBucket =
    hoveredIndex >= 0 ? chartState.buckets[hoveredIndex] : null
  const previousBucket =
    hoveredIndex > 0 ? chartState.buckets[hoveredIndex - 1] : null

  const averageDiff =
    hoveredBucket && chartState.average > 0
      ? ((hoveredBucket.count - chartState.average) / chartState.average) * 100
      : 0

  const activityShare =
    hoveredBucket && chartState.total > 0
      ? (hoveredBucket.count / chartState.total) * 100
      : 0

  const previousDiff =
    hoveredBucket && previousBucket && previousBucket.count > 0
      ? ((hoveredBucket.count - previousBucket.count) / previousBucket.count) *
        100
      : null
  const linePoints = React.useMemo(() => {
    const plotWidth = chartMinWidth - CHART_SIDE_PADDING * 2
    const columnWidth = plotWidth / chartState.buckets.length
    const drawableHeight =
      CHART_HEIGHT - CHART_TOP_PADDING - CHART_BOTTOM_PADDING

    return chartState.buckets.map((bucket, index) => {
      const ratio =
        chartState.peak <= 0 ? 0 : Math.max(bucket.count / chartState.peak, 0)
      const x = CHART_SIDE_PADDING + columnWidth * index + columnWidth / 2
      const y = CHART_TOP_PADDING + (1 - ratio) * drawableHeight

      return { x, y, count: bucket.count, key: bucket.key }
    })
  }, [chartMinWidth, chartState.buckets, chartState.peak])

  const linePathPoints = React.useMemo(() => {
    if (linePoints.length === 0) return []

    const [firstPoint] = linePoints
    const lastPoint = linePoints[linePoints.length - 1]
    const plotWidth = chartMinWidth - CHART_SIDE_PADDING * 2
    const columnHalfWidth =
      chartState.buckets.length > 0
        ? plotWidth / chartState.buckets.length / 2
        : 0

    return [
      {
        x: Math.max(firstPoint.x - columnHalfWidth, CHART_SIDE_PADDING),
        y: firstPoint.y,
      },
      ...linePoints,
      {
        x: Math.min(
          lastPoint.x + columnHalfWidth,
          chartMinWidth - CHART_SIDE_PADDING,
        ),
        y: lastPoint.y,
      },
    ]
  }, [chartMinWidth, chartState.buckets.length, linePoints])
  const linePath = React.useMemo(() => {
    if (linePathPoints.length === 0) return ''

    return linePathPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ')
  }, [linePathPoints])
  const lineAreaPath = React.useMemo(() => {
    if (linePathPoints.length === 0) return ''

    const baseline = CHART_HEIGHT - CHART_BOTTOM_PADDING
    const [firstPoint] = linePathPoints
    const lastPoint = linePathPoints[linePathPoints.length - 1]

    return `${linePath} L ${lastPoint.x} ${baseline} L ${firstPoint.x} ${baseline} Z`
  }, [linePath, linePathPoints])

  const TOOLTIP_WIDTH = 220

  const tooltipLeft = React.useMemo(() => {
    if (hoveredIndex < 0) return 0

    const point = linePoints[hoveredIndex]
    if (!point) return 0

    return Math.max(
      0,
      Math.min(point.x - TOOLTIP_WIDTH / 2, chartMinWidth - TOOLTIP_WIDTH),
    )
  }, [hoveredIndex, linePoints, chartMinWidth])


  return (
    <Card
      className={cn(
        'overflow-hidden border-card-border bg-card-bg rounded-[2rem] dark:border-white/10 dark:bg-black shadow-sm',
        className,
      )}
    >
      <CardHeader className="border-b border-card-border/80 bg-gradient-to-r from-text/[0.02] via-transparent to-text/[0.02]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              Item Activity
            </CardTitle>
            <CardDescription>
              {chartState.total} item{chartState.total === 1 ? '' : 's'} created
              in the last {rangeDays} days.
            </CardDescription>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <div className="grid w-full grid-cols-3 rounded-xl border border-card-border/80 bg-text/[0.03] p-1 sm:inline-flex sm:w-auto sm:grid-cols-none">
              <Button
                size="sm"
                variant={chartMode === 'bar' ? 'secondary' : 'ghost'}
                className={cn(
                  'h-8 w-full rounded-lg px-3 text-xs transition-all duration-300',
                  chartMode === 'bar'
                    ? 'bg-text text-bg shadow-[0_8px_24px_-16px_rgba(15,23,42,0.85)] hover:bg-text/90'
                    : 'text-text/55 hover:bg-text/5 hover:text-text',
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
                    : 'text-text/55 hover:bg-text/5 hover:text-text',
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
                    : 'text-text/55 hover:bg-text/5 hover:text-text',
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
                      : 'text-text/55 hover:bg-text/5 hover:text-text',
                  )}
                  onClick={() =>
                    startRangeTransition(() => {
                      setRangeDays(option)
                      setHoveredKey(null)
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
          <div className="custom-scrollbar overflow-x-auto overflow-y-visible pb-2">
            <div
              className="relative h-72 min-w-full overflow-visible"
              style={{
                minWidth:
                  typeof chartMinWidth === 'number' && chartMinWidth > 100
                    ? `${chartMinWidth}px`
                    : undefined,
              }}
            >
              <motion.div
                animate={{
                  opacity: isRangeChanging ? 1 : 0,
                }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className="pointer-events-none absolute inset-0 z-10 rounded-[1.25rem] bg-bg/20 backdrop-blur-[2px]"
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                {[0, 1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="border-t border-dashed border-card-border/60"
                  />
                ))}
              </div>

              <AnimatePresence initial={false}>
                {hoveredBucket && (
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
                    className="pointer-events-none absolute top-2 z-20 w-[220px] rounded-3xl border border-white/10 bg-bg/80 p-4 backdrop-blur-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
                  >
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/15 bg-cyan-500/10 px-2 py-1">
                          <Calendar className="h-3 w-3 text-cyan-400" />
                          <span className="text-[10px] font-medium uppercase tracking-wider text-cyan-400">
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
                                averageDiff >= 0
                                  ? 'text-emerald-500'
                                  : 'text-rose-500',
                              )}
                            >
                              {Math.abs(averageDiff).toFixed(0)}%
                            </span>
                          </div>
                        </div>

                        {previousDiff !== null && (
                          <div className="flex items-center justify-between rounded-xl border border-card-border/60 bg-text/[0.03] px-3 py-2">
                            <span className="text-xs text-text/60">
                              Previous Day
                            </span>

                            <div className="flex items-center gap-1.5">
                              {previousDiff >= 0 ? (
                                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                              )}

                              <span
                                className={cn(
                                  'text-xs font-semibold',
                                  previousDiff >= 0
                                    ? 'text-emerald-500'
                                    : 'text-rose-500',
                                )}
                              >
                                {Math.abs(previousDiff).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between rounded-xl border border-card-border/60 bg-text/[0.03] px-3 py-2">
                          <span className="text-xs text-text/60">
                            Activity Share
                          </span>

                          <div className="flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-amber-400" />

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
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="
    grid
    h-full
    grid-cols-[0.9fr_1.1fr]
    items-center
    gap-3
    overflow-hidden
    px-3
    py-4

    sm:grid-cols-[0.9fr_1.1fr]
    sm:gap-4
    sm:px-4

    md:grid-cols-[1fr_1fr]
    md:gap-6
    md:px-6

    lg:grid-cols-[1.1fr_0.9fr]
    lg:gap-8
    lg:px-8
  "
                  >
                    {/* ====================== Donut Chart ====================== */}

                    <div className="relative flex min-w-0 items-center justify-center">
                      {/* Animated Glow */}
                      <motion.div
                        animate={{
                          scale: [1, 1.05, 1],
                          opacity: [0.15, 0.35, 0.15],
                        }}
                        transition={{
                          repeat: Infinity,
                          duration: 4,
                          ease: 'easeInOut',
                        }}
                        className="
        absolute
        size-28

        sm:size-36

        md:size-48

        lg:size-56

        rounded-full
        bg-cyan-500/10
        blur-3xl
      "
                      />

                      <svg
                        viewBox="0 0 280 280"
                        className="
        h-[105px]
        w-[105px]
        shrink-0
        -rotate-90
        overflow-visible

        sm:h-[135px]
        sm:w-[135px]

        md:h-[180px]
        md:w-[180px]

        lg:h-[240px]
        lg:w-[240px]

        drop-shadow-[0_0_22px_rgba(34,211,238,.15)]
      "
                      >
                        {/* Background Ring */}
                        <circle
                          cx="140"
                          cy="140"
                          r={radius}
                          fill="none"
                          stroke="rgb(255 255 255 / .06)"
                          strokeWidth="22"
                        />

                        {/* Animated Slices */}
                        {slices.map((slice, index) => (
                          <motion.circle
                            key={slice.label}
                            cx="140"
                            cy="140"
                            r={radius}
                            fill="none"
                            stroke={slice.color}
                            strokeWidth="22"
                            strokeLinecap="round"
                            strokeDasharray={`${slice.dash} ${circumference}`}
                            strokeDashoffset={-slice.offset}
                            initial={{
                              strokeDasharray: `0 ${circumference}`,
                            }}
                            animate={{
                              strokeDasharray: `${slice.dash} ${circumference}`,
                            }}
                            whileHover={{
                              strokeWidth: 25,
                            }}
                            transition={{
                              duration: 0.9,
                              delay: index * 0.08,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                          />
                        ))}
                      </svg>

                      {/* ====================== Center Card ====================== */}

                      <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                          initial={{
                            scale: 0.85,
                            opacity: 0,
                          }}
                          animate={{
                            scale: 1,
                            opacity: 1,
                          }}
                          transition={{
                            delay: 0.2,
                            type: 'spring',
                            stiffness: 180,
                            damping: 18,
                          }}
                          className="
          flex
          size-12

          sm:size-14

          md:size-20

          lg:size-24

          flex-col
          items-center
          justify-center

          rounded-full
          border
          border-card-border/80

          bg-gradient-to-b
          from-text/[0.08]
          via-text/[0.04]
          to-transparent

          backdrop-blur-xl

          shadow-[0_12px_30px_rgba(0,0,0,.35)]
        "
                        >
                          <motion.h2
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            transition={{
                              delay: 0.3,
                              type: 'spring',
                              stiffness: 220,
                            }}
                            className="
            text-base
            font-black

            sm:text-lg

            md:text-2xl

            lg:text-3xl
          "
                          >
                            {chartState.total}
                          </motion.h2>

                          <span
                            className="
            mt-0.5

            text-[6px]

            uppercase
            tracking-[0.18em]
            text-text/55

            sm:text-[7px]

            md:text-[9px]
          "
                          >
                            Items
                          </span>

                          <div className="my-1 h-px w-5 bg-card-border/80 md:w-8" />

                          <span
                            className="
            text-[6px]
            font-semibold
            text-cyan-400

            sm:text-[7px]

            md:text-[9px]
          "
                          >
                            {Math.round(
                              (chartState.activeDays / rangeDays) * 100,
                            )}
                            %
                          </span>
                        </motion.div>
                      </div>
                    </div>
                    <motion.div
                      initial={{ opacity: 0, x: 18 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: 0.2,
                        duration: 0.45,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="
    flex
    h-full
    min-w-0
    flex-col
    justify-center
    gap-2

    sm:gap-3

    md:gap-4
  "
                    >
                      {[
                        {
                          title: 'Active Days',
                          value: chartState.activeDays,
                          percent: Math.round(
                            (chartState.activeDays / rangeDays) * 100,
                          ),
                          color: 'text-emerald-400',
                          bg: 'bg-emerald-500/10',
                          dot: 'bg-emerald-400',
                        },
                        {
                          title: 'Inactive',
                          value: rangeDays - chartState.activeDays,
                          percent:
                            100 -
                            Math.round(
                              (chartState.activeDays / rangeDays) * 100,
                            ),
                          color: 'text-slate-400',
                          bg: 'bg-slate-500/10',
                          dot: 'bg-slate-400',
                        },
                      ].map((item) => (
                        <motion.div
                          key={item.title}
                          whileHover={{
                            y: -2,
                            scale: 1.02,
                          }}
                          whileTap={{
                            scale: 0.98,
                          }}
                          className="
        flex
        min-h-[74px]
        flex-col
        justify-between

        rounded-2xl
        border
        border-card-border/80

        bg-gradient-to-br
        from-text/[0.04]
        to-transparent

        p-2.5

        shadow-sm
        backdrop-blur-xl

        transition-all
        duration-300

        sm:min-h-[90px]
        sm:p-3

        md:min-h-[110px]
        md:p-4
      "
                        >
                          {/* Header */}

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`}
                              />

                              <span
                                className="
              truncate
              text-[9px]
              font-semibold
              uppercase
              tracking-wider
              text-text/60

              sm:text-[10px]

              md:text-[11px]
            "
                              >
                                {item.title}
                              </span>
                            </div>

                            <span
                              className={`
            shrink-0
            rounded-full

            px-2
            py-0.5

            text-[8px]
            font-bold

            sm:text-[9px]

            md:text-[10px]

            ${item.bg}
            ${item.color}
          `}
                            >
                              {item.percent}%
                            </span>
                          </div>

                          {/* Value */}

                          <div className="mt-3 flex items-end justify-between gap-3">
                            <motion.h3
                              layout
                              className="
            text-base
            font-black
            text-text

            sm:text-xl

            md:text-2xl

            lg:text-3xl
          "
                            >
                              {item.value}
                            </motion.h3>

                            <div
                              className={`
            h-8
            w-1
            shrink-0
            rounded-full
            ${item.dot}
            opacity-70
          `}
                            />
                          </div>
                        </motion.div>
                      ))}

                      {/* ================= Activity Score ================= */}

                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.45 }}
                        className="
      mt-auto

      rounded-2xl
      border
      border-card-border/80

      bg-text/[0.03]

      p-3

      sm:p-4
    "
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="
          truncate
          text-[10px]
          font-medium
          text-text/60

          sm:text-xs
        "
                          >
                            Activity Score
                          </span>

                          <span
                            className="
          shrink-0
          rounded-full

          bg-cyan-500/10

          px-2
          py-1

          text-[10px]
          font-bold
          text-cyan-400

          sm:text-xs
        "
                          >
                            {Math.round(
                              (chartState.activeDays / rangeDays) * 100,
                            )}
                            %
                          </span>
                        </div>

                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.round(
                                (chartState.activeDays / rangeDays) * 100,
                              )}%`,
                            }}
                            transition={{
                              duration: 1,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="
          h-full
          rounded-full
          bg-gradient-to-r
          from-cyan-500
          to-emerald-400
        "
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
                            <linearGradient
                              id={lineGradientId}
                              x1="0"
                              y1="0"
                              x2="1"
                              y2="0"
                            >
                              <stop
                                offset="0%"
                                stopColor="currentColor"
                                stopOpacity="0.35"
                              />
                              <stop
                                offset="50%"
                                stopColor="currentColor"
                                stopOpacity="0.95"
                              />
                              <stop
                                offset="100%"
                                stopColor="currentColor"
                                stopOpacity="0.45"
                              />
                            </linearGradient>
                            <linearGradient
                              id={areaGradientId}
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="currentColor"
                                stopOpacity="0.2"
                              />
                              <stop
                                offset="100%"
                                stopColor="currentColor"
                                stopOpacity="0.02"
                              />
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
                            const isHovered = hoveredKey === point.key

                            return (
                              <g key={point.key}>
                                <motion.circle
                                  cx={point.x}
                                  cy={point.y}
                                  r={isHovered ? 8 : 5}
                                  className={cn(
                                    'fill-bg/90 stroke-text/20',
                                    point.count === 0 && 'opacity-0',
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
                                  className={cn(
                                    'fill-text',
                                    point.count === 0 && 'opacity-0',
                                  )}
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
                            )
                          })}
                        </svg>
                      </div>
                    )}

                    {chartState.buckets.map((bucket, index) => {
                      const heightPercent =
                        bucket.count === 0
                          ? 0
                          : Math.max((bucket.count / chartState.peak) * 100, 14)
                      const isHovered = hoveredKey === bucket.key
                      const shouldShowLabel =
                        rangeDays <= 14 ||
                        (rangeDays === 28 && index % 2 === 0) ||
                        (rangeDays === 48 && index % 4 === 0) ||
                        (rangeDays === 90 && index % 7 === 0) ||
                        (rangeDays === 180 && index % 14 === 0)

                      return (
                        <div
                          key={bucket.key}
                          className="relative flex h-full flex-col justify-end"
                          onPointerEnter={() => setHoveredKey(bucket.key)}
                          onPointerLeave={() =>
                            setHoveredKey((current) =>
                              current === bucket.key ? null : current,
                            )
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
                                  isHovered &&
                                    'shadow-[0_24px_50px_-18px_rgba(15,23,42,0.42)]',
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
                                    isHovered
                                      ? 'bg-text/[0.06]'
                                      : 'bg-transparent',
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
                      )
                    })}
                  </motion.div>
                )}
              </LayoutGroup>
            </div>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  )
}
