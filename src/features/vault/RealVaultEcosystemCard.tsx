import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  RefreshCw,
  Plus,
  Minus,
  Download,
  Loader2,
  Cpu,
  Activity,
  Monitor,
  Server,
  Gauge,
} from 'lucide-react';
import { usePerformanceMetrics } from '../../hooks/usePerformanceMetrics';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { NodeDetailsModal } from './NodeDetailsModal';
import { cn } from '../../lib/utils';
import {
  GRAPH_WIDTH,
  GRAPH_HEIGHT,
  clamp,
  getCanvasPadding,
  getNodePixelPosition,
  getNodeEdgeAnchors,
  getNodeDimensions,
  createNodes,
  EDGES,
  type VaultCategoryStats,
  type NodePosition,
  type GraphSize,
} from './ecosystemHelpers';

export type { VaultCategoryStats };

interface RealVaultEcosystemCardProps {
  itemCount: number;
  categoryStats: VaultCategoryStats;
}

export const RealVaultEcosystemCard: React.FC<RealVaultEcosystemCardProps> = memo(
  ({ itemCount, categoryStats }) => {
    const shouldReduceMotion = useReducedMotion();
    const performance = usePerformanceMetrics();
    const graphRef = useRef<HTMLDivElement>(null);

    // ─────────────────────────────────────────────
    // Drag / modal safety flags
    // ─────────────────────────────────────────────
    const dragSuppressRef = useRef(false);
    const modalSuppressRef = useRef(false); // Used for debouncing modal open
    const dragOriginRef = useRef<Record<string, NodePosition>>({}); // Used to store node positions before dragging starts

    // ─────────────────────────────────────────────
    // Zoom + Pan (State and Persistence)
    // ─────────────────────────────────────────────
    const [scale, setScale] = useState<number>(() => {
      try {
        const savedScale = localStorage.getItem('vault_ecosystem_scale');
        return savedScale ? parseFloat(savedScale) : 1;
      } catch (e) {
        console.error('Failed to load scale from localStorage', e);
        return 1;
      }
    });
    const [pan, setPan] = useState<{ x: number; y: number }>(() => {
      try {
        const savedPan = localStorage.getItem('vault_ecosystem_pan');
        return savedPan ? JSON.parse(savedPan) : { x: 0, y: 0 };
      } catch (e) {
        console.error('Failed to load pan from localStorage', e);
        return { x: 0, y: 0 };
      }
    });
    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0 });
    const panFrameRef = useRef<number | null>(null);
    const panPendingRef = useRef<{ x: number; y: number } | null>(null);
    const wheelFrameRef = useRef<number | null>(null);
    const wheelDeltaRef = useRef(0);
    const [isResetting, setIsResetting] = useState(false); // For animation smoothing on reset
    const isMinimapPanning = useRef(false);
    const [isExporting, setIsExporting] = useState(false); // For export button loading state

    // ─────────────────────────────────────────────
    // Graph size
    // ─────────────────────────────────────────────
    const [graphSize, setGraphSize] = useState<GraphSize>({
      width: GRAPH_WIDTH,
      height: GRAPH_HEIGHT,
    });
    // ─────────────────────────────────────────────
    // Nodes
    // ─────────────────────────────────────────────
    const nodeTemplates = useMemo(
      () => createNodes(itemCount, categoryStats),
      [itemCount, categoryStats]
    );

    const defaultPositions = useMemo(
      () =>
        Object.fromEntries(nodeTemplates.map((n) => [n.id, { x: n.x, y: n.y }])) as Record<
          string,
          NodePosition
        >,
      [nodeTemplates]
    );

    const [positions, setPositions] = useState<Record<string, NodePosition>>(() => {
      try {
        const savedVer = localStorage.getItem('vault_ecosystem_layout_version');
        if (savedVer === 'v2') {
          const saved = localStorage.getItem('vault_ecosystem_positions');
          if (saved) {
            return { ...defaultPositions, ...JSON.parse(saved) };
          }
        } else {
          localStorage.setItem('vault_ecosystem_layout_version', 'v2');
          localStorage.removeItem('vault_ecosystem_positions');
        }
      } catch (e) {
        console.error('Failed to load node positions', e);
      }
      return defaultPositions;
    });

    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
    const [focusedNode, setFocusedNode] = useState<string | null>(null);

    const [layoutResetKey, setLayoutResetKey] = useState(0);

    // ─────────────────────────────────────────────
    // Resize observer
    // ─────────────────────────────────────────────
    useEffect(() => {
      const el = graphRef.current;
      if (!el || typeof ResizeObserver === 'undefined') return;

      const ro = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        setGraphSize({
          width: width || GRAPH_WIDTH,
          height: height || GRAPH_HEIGHT,
        });
      });

      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // ─────────────────────────────────────────────
    // Persist positions to local storage (Debounced)
    // ─────────────────────────────────────────────
    const savePositionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
      if (savePositionsTimer.current) clearTimeout(savePositionsTimer.current);
      savePositionsTimer.current = setTimeout(() => {
        try {
          localStorage.setItem('vault_ecosystem_positions', JSON.stringify(positions));
        } catch (e) {
          console.error('Failed to save node positions', e);
        }
      }, 300);
      return () => {
        if (savePositionsTimer.current) clearTimeout(savePositionsTimer.current);
      };
    }, [positions]);

    // ─────────────────────────────────────────────
    // Persist scale to local storage (Debounced)
    // ─────────────────────────────────────────────
    const saveScaleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
      if (saveScaleTimer.current) clearTimeout(saveScaleTimer.current);
      saveScaleTimer.current = setTimeout(() => {
        try {
          localStorage.setItem('vault_ecosystem_scale', String(scale));
        } catch (e) {
          console.error('Failed to save scale to localStorage', e);
        }
      }, 300);
      return () => {
        if (saveScaleTimer.current) clearTimeout(saveScaleTimer.current);
      };
    }, [scale]);

    // ─────────────────────────────────────────────
    // Persist pan to local storage (Debounced)
    // ─────────────────────────────────────────────
    const savePanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
      if (savePanTimer.current) clearTimeout(savePanTimer.current);
      savePanTimer.current = setTimeout(() => {
        try {
          localStorage.setItem('vault_ecosystem_pan', JSON.stringify(pan));
        } catch (e) {
          console.error('Failed to save pan to localStorage', e);
        }
      }, 300);
      return () => {
        if (savePanTimer.current) clearTimeout(savePanTimer.current);
      };
    }, [pan]);

    useEffect(
      () => () => {
        if (panFrameRef.current !== null) {
          cancelAnimationFrame(panFrameRef.current);
        }
        if (wheelFrameRef.current !== null) {
          cancelAnimationFrame(wheelFrameRef.current);
        }
      },
      []
    );

    // ─────────────────────────────────────────────
    // Sync positions on item change
    // ─────────────────────────────────────────────
    useEffect(() => {
      setPositions((prev) => {
        const next = { ...defaultPositions };
        for (const n of nodeTemplates) {
          if (prev[n.id]) next[n.id] = prev[n.id];
        }
        return next;
      });
    }, [defaultPositions, nodeTemplates]);

    // ─────────────────────────────────────────────
    // Derived
    // ─────────────────────────────────────────────
    const nodeDimensions = useMemo(() => getNodeDimensions(graphSize.width), [graphSize.width]);

    const nodes = useMemo(
      () =>
        nodeTemplates.map((n) => ({
          ...n,
          ...(positions[n.id] ?? { x: n.x, y: n.y }),
        })),
      [nodeTemplates, positions]
    );

    const activeNode = useMemo(
      () => nodes.find((n) => n.id === activeNodeId) ?? null,
      [nodes, activeNodeId]
    );

    const { width: gsW, height: gsH } = graphSize;
    const { width: ndW, height: ndH } = nodeDimensions;
    const canvasPadding = useMemo(() => getCanvasPadding(gsW), [gsW]);

    // ─────────────────────────────────────────────
    // Position update
    // ─────────────────────────────────────────────
    const updateNodePositionFromOffset = useCallback(
      (nodeId: string, offset: { x: number; y: number }) => {
        const node = dragOriginRef.current[nodeId] ?? positions[nodeId];
        const container = graphRef.current;
        if (!node || !container) return;

        const availW = container.clientWidth - ndW - canvasPadding * 2;
        const availH = container.clientHeight - ndH - canvasPadding * 2;

        const left = canvasPadding + (node.x / 100) * Math.max(availW, 1) + offset.x;
        const top = canvasPadding + (node.y / 100) * Math.max(availH, 1) + offset.y;

        const x = clamp(((left - canvasPadding) / Math.max(availW, 1)) * 100, 0, 100);
        const y = clamp(((top - canvasPadding) / Math.max(availH, 1)) * 100, 0, 100);

        setPositions((prev) => ({ ...prev, [nodeId]: { x, y } }));
      },
      [positions, ndW, ndH, canvasPadding]
    );

    // ─────────────────────────────────────────────
    // Drag handlers
    // ─────────────────────────────────────────────
    const handleDragStart = useCallback(
      (id: string) => {
        dragOriginRef.current[id] = positions[id];
      },
      [positions]
    );

    const handleDrag = useCallback(
      (id: string, info: { offset: { x: number; y: number } }) => {
        updateNodePositionFromOffset(id, info.offset);
      },
      [updateNodePositionFromOffset]
    );

    const handleDragEnd = useCallback(
      (id: string, _e: any, info: { offset: { x: number; y: number } }) => {
        updateNodePositionFromOffset(id, info.offset);
        delete dragOriginRef.current[id];

        dragSuppressRef.current = true;
        setTimeout(() => (dragSuppressRef.current = false), 120);
      },
      [updateNodePositionFromOffset]
    );

    // ─────────────────────────────────────────────
    // Node click + focus
    // ─────────────────────────────────────────────
    const handleNodeClick = useCallback((id: string) => {
      if (!dragSuppressRef.current && !modalSuppressRef.current) {
        setActiveNodeId(id);
        setFocusedNode(id);
      }
    }, []);

    const handleCloseModal = useCallback(() => {
      modalSuppressRef.current = true;
      setActiveNodeId(null);
      setTimeout(() => (modalSuppressRef.current = false), 150);
    }, []);

    // ─────────────────────────────────────────────
    // Reset layout
    // ─────────────────────────────────────────────
    const handleResetLayout = useCallback(() => {
      dragSuppressRef.current = true;
      modalSuppressRef.current = true;

      setIsResetting(true);
      setActiveNodeId(null);
      setFocusedNode(null);
      setPositions({ ...defaultPositions });
      setScale(1);
      setPan({ x: 0, y: 0 });

      setLayoutResetKey((k) => k + 1);

      setTimeout(() => {
        setIsResetting(false);
        dragSuppressRef.current = false;
        modalSuppressRef.current = false;
      }, 400);
    }, [defaultPositions]);

    // ─────────────────────────────────────────────
    // Export Diagram (4K Ultra-HD Resolution)
    // ─────────────────────────────────────────────
    const handleExportImage = useCallback(async () => {
      if (!graphRef.current || isExporting) return;
      setIsExporting(true);
      const element = graphRef.current;
      element.classList.add('is-exporting-png');

      try {
        // Dynamically import to keep initial bundle size small
        const { toBlob, toPng } = await import('html-to-image');

        // Target 4K Ultra-HD canvas width for maximum sharpness
        const targetWidth = 3840;
        const currentWidth = Math.max(element.clientWidth || GRAPH_WIDTH, 1);
        const currentHeight = Math.max(element.clientHeight || GRAPH_HEIGHT, 1);
        const targetHeight = Math.round(targetWidth * (currentHeight / currentWidth));

        const exportOptions = {
          quality: 1,
          cacheBust: true,
          pixelRatio: 4, // 4x supersampling for Ultra-HD vector text and curved edges
          canvasWidth: targetWidth,
          canvasHeight: targetHeight,
          style: {
            backdropFilter: 'none',
            webkitBackdropFilter: 'none',
            backgroundColor: '#090d16',
            color: '#ffffff',
          },
          filter: (node: Node) =>
            !(node instanceof HTMLElement && node.dataset.exportIgnore === 'true'),
        };

        const blob = await toBlob(element, exportOptions);
        let href = '';
        if (blob) {
          href = URL.createObjectURL(blob);
        } else {
          const dataUrl = await toPng(element, exportOptions);
          href = dataUrl;
        }

        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const link = document.createElement('a');
        link.download = `vault-ecosystem-4k-${timestamp}.png`;
        link.href = href;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        if (href.startsWith('blob:')) {
          setTimeout(() => URL.revokeObjectURL(href), 0);
        }
        toast.success('4K Ultra-HD Diagram exported successfully');
      } catch (error) {
        console.error('Failed to export image', error);
        toast.error('Failed to export diagram');
      } finally {
        element.classList.remove('is-exporting-png');
        setIsExporting(false);
      }
    }, [isExporting]);

    // ─────────────────────────────────────────────
    // Zoom + Pan handlers
    // ─────────────────────────────────────────────
    const handleZoomStep = useCallback((delta: number) => {
      setIsResetting(true);
      setScale((s) => clamp(s + delta, 0.6, 2));
      setTimeout(() => setIsResetting(false), 400);
    }, []);

    const flushWheelZoom = useCallback(() => {
      wheelFrameRef.current = null;
      const accumulatedDelta = wheelDeltaRef.current;
      wheelDeltaRef.current = 0;
      if (!accumulatedDelta) return;

      const sensitivity = shouldReduceMotion ? 0.00075 : 0.0011;
      setScale((s) => clamp(s + -accumulatedDelta * sensitivity, 0.6, 2));
    }, [shouldReduceMotion]);

    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        e.preventDefault();
        wheelDeltaRef.current += e.deltaY;
        if (wheelFrameRef.current === null) {
          wheelFrameRef.current = requestAnimationFrame(flushWheelZoom);
        }
      },
      [flushWheelZoom]
    );

    const handlePointerDown = (e: React.PointerEvent) => {
      isPanning.current = true;
      panStart.current = {
        x: e.clientX - pan.x,
        y: e.clientY - pan.y,
      };
    };

    const flushPanFrame = useCallback(() => {
      panFrameRef.current = null;
      const nextPan = panPendingRef.current;
      panPendingRef.current = null;
      if (!nextPan) return;
      setPan(nextPan);
    }, []);

    const handlePointerMove = (e: React.PointerEvent) => {
      if (!isPanning.current) return;

      const rawX = e.clientX - panStart.current.x;
      const rawY = e.clientY - panStart.current.y;

      const limitX = gsW * scale * 0.6;
      const limitY = gsH * scale * 0.6;

      const clampedX = clamp(rawX, -limitX, limitX);
      const clampedY = clamp(rawY, -limitY, limitY);

      // Prevent cursor slip when hitting the boundary wall
      if (rawX !== clampedX) panStart.current.x = e.clientX - clampedX;
      if (rawY !== clampedY) panStart.current.y = e.clientY - clampedY;

      panPendingRef.current = {
        x: clampedX,
        y: clampedY,
      };
      if (panFrameRef.current === null) {
        panFrameRef.current = requestAnimationFrame(flushPanFrame);
      }
    };

    const handlePointerUp = () => {
      isPanning.current = false;
      const pendingPan = panPendingRef.current;
      if (pendingPan) {
        setPan(pendingPan);
        panPendingRef.current = null;
      }
    };

    // ─────────────────────────────────────────────
    // Minimap logic
    // ─────────────────────────────────────────────
    const minimapW = 140;
    const minimapScale = minimapW / Math.max(gsW, 1);
    const minimapH = gsH * minimapScale;

    const vpW = minimapW / scale;
    const vpH = minimapH / scale;
    const vpX = minimapW / 2 - vpW / 2 - (pan.x / scale) * minimapScale;
    const vpY = minimapH / 2 - vpH / 2 - (pan.y / scale) * minimapScale;

    const updatePanFromMinimap = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = clamp(e.clientX - rect.left, 0, minimapW);
        const mouseY = clamp(e.clientY - rect.top, 0, minimapH);

        const nextPanX = (minimapW / 2 - mouseX) * (scale / minimapScale);
        const nextPanY = (minimapH / 2 - mouseY) * (scale / minimapScale);

        setPan({
          x: clamp(nextPanX, -gsW * scale * 0.6, gsW * scale * 0.6),
          y: clamp(nextPanY, -gsH * scale * 0.6, gsH * scale * 0.6),
        });
      },
      [gsW, gsH, scale]
    );

    const handleMinimapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      isMinimapPanning.current = true;
      updatePanFromMinimap(e);
    };
    const handleMinimapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isMinimapPanning.current) return;
      e.stopPropagation();
      updatePanFromMinimap(e);
    };
    const handleMinimapPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.releasePointerCapture(e.pointerId);
      isMinimapPanning.current = false;
    };

    // ─────────────────────────────────────────────
    // Edge computation (optimized)
    // ─────────────────────────────────────────────
    const edges = useMemo(() => {
      return EDGES.map((edge) => {
        const from = nodes.find((n) => n.id === edge.from);
        const to = nodes.find((n) => n.id === edge.to);
        if (!from || !to) return null;

        return {
          ...edge,
          anchors: getNodeEdgeAnchors(
            from,
            to,
            { width: gsW, height: gsH },
            { width: ndW, height: ndH },
            canvasPadding
          ),
        };
      });
    }, [nodes, gsW, gsH, ndW, ndH, canvasPadding]).filter(
      (edge): edge is NonNullable<typeof edge> => edge !== null
    );

    const graphMinHeight = gsW < 480 ? 320 : gsW < 640 ? 360 : 420;
    const graphTransformTransition = shouldReduceMotion
      ? { duration: 0 }
      : isResetting
        ? { type: 'tween' as const, ease: 'easeInOut' as const, duration: 0.38 }
        : { type: 'spring' as const, stiffness: 165, damping: 24, mass: 0.42 };
    const minimapViewportTransition = shouldReduceMotion
      ? { duration: 0 }
      : isResetting
        ? { type: 'tween' as const, ease: 'easeOut' as const, duration: 0.32 }
        : { type: 'spring' as const, stiffness: 210, damping: 30, mass: 0.38 };

    // ─────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────

    return (
      <>
        <Card className="overflow-hidden border-card-border bg-card-bg shadow-[0_24px_60px_-38px_rgba(15,23,42,0.24)] dark:border-white/10 dark:bg-black">
          {/* ── Header ── */}
          <CardHeader className="border-b border-card-border bg-text/[0.02] px-4 py-5 sm:px-6 dark:border-white/10 dark:bg-black/40">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text/45">
                  Vault Ecosystem
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2.5 py-1 text-[10px] font-bold tracking-tight text-text/75">
                    <Activity className="h-3 w-3 text-sky-400" />
                    {itemCount} Items
                  </span>

                  <div
                    className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2 py-0.5 text-[10px] font-bold tracking-tight text-text/70"
                    title={`${performance.cpuCores} CPU Cores Detected`}
                  >
                    <Cpu className="h-3 w-3 text-sky-400" />
                    {performance.cpuCores}C
                  </div>

                  <div
                    className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2 py-0.5 text-[10px] font-bold tracking-tight text-text/70"
                    title={`System Memory: ${performance.memoryUsed ? `Usage ${performance.memoryUsed}MB` : `Available ${performance.deviceMemory}GB`}`}
                  >
                    <Server className="h-3 w-3 text-violet-400" />
                    {performance.memoryUsed
                      ? `${performance.memoryUsed}M`
                      : `${performance.deviceMemory}G`}
                  </div>

                  <div
                    className="hidden items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2 py-0.5 text-[10px] font-bold tracking-tight text-text/70 lg:inline-flex"
                    title={`Hardware Acceleration: ${performance.gpuRenderer}`}
                  >
                    <Monitor className="h-3 w-3 text-amber-400" />
                    <span className="max-w-[80px] truncate uppercase">
                      {performance.gpuRenderer.split(' ')[0]}
                    </span>
                  </div>

                  <div
                    className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2 py-0.5 text-[10px] font-bold tracking-tight text-text/70"
                    title="Real-time Frame Rate"
                  >
                    <Gauge
                      className={cn(
                        'h-3 w-3',
                        performance.fps > 55
                          ? 'text-emerald-400'
                          : performance.fps > 30
                            ? 'text-amber-400'
                            : 'text-rose-400'
                      )}
                    />
                    {performance.fps} FPS
                  </div>

                  {performance.ping !== undefined && (
                    <div
                      className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2 py-0.5 text-[10px] font-bold tracking-tight text-text/70"
                      title="End-to-end Network Latency"
                    >
                      <div
                        className={cn(
                          'h-1.5 w-1.5 rounded-full animate-pulse',
                          performance.ping < 50
                            ? 'bg-emerald-500'
                            : performance.ping < 150
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                        )}
                      />
                      {performance.ping}ms
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={handleExportImage}
                  disabled={isExporting}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-card-border bg-text/5 text-text/65 transition-colors hover:bg-text/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/30 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Export diagram as PNG"
                  title="Export diagram as PNG"
                >
                  {isExporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={handleResetLayout}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-card-border bg-text/5 text-text/65 transition-colors hover:bg-text/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/30"
                  aria-label="Reset node layout"
                  title="Reset node layout"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </CardHeader>

          {/* ── Body ── */}
          <CardContent className="space-y-3 p-3 sm:p-4 xl:p-5">
            <div className="overflow-auto rounded-[1.5rem] border border-card-border bg-text/[0.02] custom-scrollbar dark:border-white/10 dark:bg-black/30">
              {/* Graph container */}
              <div
                ref={graphRef}
                role="region"
                aria-label="Vault ecosystem diagram"
                className="relative min-w-[680px] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.1),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.08),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] lg:min-w-0"
                style={{
                  aspectRatio: `${GRAPH_WIDTH} / ${GRAPH_HEIGHT}`,
                  minHeight: graphMinHeight,
                  touchAction: 'none',
                }}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.12),transparent_30%),radial-gradient(circle_at_80%_80%,rgba(34,197,94,0.1),transparent_34%)]"
                  initial={false}
                  animate={
                    shouldReduceMotion
                      ? { opacity: 0.85 }
                      : { opacity: [0.75, 1, 0.75], scale: [1, 1.02, 1] }
                  }
                  transition={{
                    duration: 8,
                    repeat: shouldReduceMotion ? 0 : Infinity,
                    ease: 'easeInOut',
                  }}
                />

                {/* Transform Wrapper for Zoom and Pan */}
                <motion.div
                  className="absolute inset-0 h-full w-full origin-center will-change-transform"
                  initial={false}
                  animate={{ x: pan.x, y: pan.y, scale }}
                  transition={graphTransformTransition}
                >
                  {/* SVG edges */}
                  <svg
                    viewBox={`0 0 ${gsW} ${gsH}`}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    aria-hidden="true"
                  >
                    <defs>
                      <pattern
                        id="ecosystem-grid"
                        width="28"
                        height="28"
                        patternUnits="userSpaceOnUse"
                      >
                        <path
                          d="M 28 0 L 0 0 0 28"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1"
                          className="text-text/10"
                        />
                      </pattern>
                      {EDGES.map((edge) => (
                        <linearGradient
                          key={`grad-${edge.id}`}
                          id={`edge-grad-${edge.id}`}
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          <stop offset="0%" stopColor={edge.colorFrom} stopOpacity="0.85" />
                          <stop offset="100%" stopColor={edge.colorTo} stopOpacity="0.85" />
                        </linearGradient>
                      ))}
                    </defs>

                    <rect
                      x="0"
                      y="0"
                      width={gsW}
                      height={gsH}
                      fill="url(#ecosystem-grid)"
                      opacity="0.65"
                    />

                    {edges.map((edge, i) => {
                      const { start, end } = edge.anchors;
                      const joinOffset = 6;
                      const startJoin = {
                        x: start.x - start.normalX * joinOffset,
                        y: start.y - start.normalY * joinOffset,
                      };
                      const endJoin = {
                        x: end.x - end.normalX * joinOffset,
                        y: end.y - end.normalY * joinOffset,
                      };
                      const controlDistance = Math.max(
                        32,
                        Math.min(
                          96,
                          Math.hypot(endJoin.x - startJoin.x, endJoin.y - startJoin.y) * 0.35
                        )
                      );
                      const cp1 = {
                        x: startJoin.x + start.normalX * controlDistance,
                        y: startJoin.y + start.normalY * controlDistance,
                      };
                      const cp2 = {
                        x: endJoin.x + end.normalX * controlDistance,
                        y: endJoin.y + end.normalY * controlDistance,
                      };

                      const gradId = `edge-grad-${edge.id}`;
                      const pathD = `M ${startJoin.x} ${startJoin.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${endJoin.x} ${endJoin.y}`;

                      return (
                        <g key={edge.id}>
                          {/* Soft ambient glow stroke */}
                          <path
                            d={pathD}
                            fill="none"
                            stroke={`url(#${gradId})`}
                            strokeWidth="6"
                            strokeLinecap="round"
                            opacity="0.22"
                          />
                          {/* Main gradient stroke line */}
                          <path
                            d={pathD}
                            fill="none"
                            stroke={`url(#${gradId})`}
                            strokeWidth="2.6"
                            strokeLinecap="round"
                            opacity="0.82"
                          />
                          {/* Animated particle dash flow */}
                          <motion.path
                            d={pathD}
                            fill="none"
                            stroke="#ffffff"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeDasharray="6 14"
                            initial={{ opacity: 0.5 }}
                            animate={
                              shouldReduceMotion
                                ? { opacity: 0.7 }
                                : {
                                    opacity: [0.35, 0.95, 0.35],
                                    strokeDashoffset: [0, -20],
                                  }
                            }
                            transition={{
                              duration: 2.8,
                              delay: i * 0.12,
                              repeat: Infinity,
                              ease: 'linear',
                            }}
                          />
                        </g>
                      );
                    })}
                  </svg>

                  {/* Draggable nodes */}
                  {nodes.map((node, i) => {
                    const Icon = node.icon;
                    const isFocused = focusedNode === node.id;
                    const isActive = activeNodeId === node.id;
                    const isHighlighted = isFocused || isActive;
                    const { left, top } = getNodePixelPosition(
                      node,
                      { width: gsW, height: gsH },
                      nodeDimensions,
                      canvasPadding
                    );

                    return (
                      <motion.button
                        key={`${node.id}-${layoutResetKey}`}
                        type="button"
                        aria-label={`Open ${node.title} details`}
                        drag
                        dragMomentum={false}
                        dragElastic={0.08}
                        dragTransition={{
                          bounceStiffness: 360,
                          bounceDamping: 28,
                          power: 0.12,
                        }}
                        dragConstraints={graphRef}
                        onDragStart={() => handleDragStart(node.id)}
                        onDrag={(_event, info) => handleDrag(node.id, info)}
                        onDragEnd={(e, info) => handleDragEnd(node.id, e, info)}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => handleNodeClick(node.id)}
                        whileHover={{
                          scale: shouldReduceMotion ? 1 : isHighlighted ? 1.025 : 1.02,
                          y: shouldReduceMotion ? 0 : -2,
                        }}
                        whileTap={{ scale: isHighlighted ? 1 : 0.985 }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: !shouldReduceMotion && isHighlighted ? 1.018 : 1,
                        }}
                        transition={{
                          delay: i * 0.045,
                          type: 'spring',
                          stiffness: 230,
                          damping: 22,
                          mass: 0.52,
                        }}
                        className={cn(
                          'absolute cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/30',
                          isHighlighted && 'z-20'
                        )}
                        style={{ left, top, width: ndW, height: ndH }}
                      >
                        <div
                          className={cn(
                            'group/node relative flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-card-border bg-card-bg/90 p-3 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.34)] backdrop-blur-2xl transition-all duration-300 hover:border-text/15 hover:shadow-[0_28px_70px_-34px_rgba(15,23,42,0.4)] ring-1 transform-gpu sm:rounded-[1.55rem] sm:p-4 dark:border-white/10 dark:bg-black/50',
                            node.tone.ring,
                            isHighlighted &&
                              'border-text/25 shadow-[0_30px_80px_-34px_rgba(15,23,42,0.52)] ring-2 ring-white/10'
                          )}
                        >
                          {/* {isHighlighted && !shouldReduceMotion && (
                            <motion.div
                              aria-hidden="true"
                              className="pointer-events-none absolute -inset-[2px] rounded-[1.45rem] border border-white/20"
                              initial={{ opacity: 0.35 }}
                              animate={{ opacity: [0.35, 0.7, 0.35] }}
                              transition={{
                                duration: 1.8,
                                repeat: Infinity,
                                ease: 'easeInOut',
                              }}
                            />
                          )} */}

                          {/* Colour glow */}
                          <div
                            aria-hidden="true"
                            className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${node.tone.glow} opacity-70`}
                          />
                          {/* Hover shimmer */}
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/node:opacity-100"
                          />

                          <div className="relative flex h-full flex-col justify-between">
                            <div className="space-y-2.5">
                              <div className="flex items-start gap-2.5">
                                {/* Icon badge */}
                                <div
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border bg-card-bg/85 sm:h-9 sm:w-9 ${node.tone.softBg} ${node.tone.ring}`}
                                >
                                  <Icon
                                    className={`h-4 w-4 sm:h-[18px] sm:w-[18px] ${node.tone.icon}`}
                                    aria-hidden="true"
                                  />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="mt-0.5 text-xs font-semibold tracking-tight text-text sm:text-sm leading-snug break-words">
                                    {node.title}
                                  </p>
                                </div>
                              </div>

                              <p className="line-clamp-2 text-[10px] leading-relaxed text-text/65 sm:text-[11px]">
                                {node.subtitle}
                              </p>
                            </div>

                            {/* <div className="mt-2 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.14em] text-text/45">
                              <span className={cn(
                                'inline-flex items-center gap-1',
                                isHighlighted && 'text-text/70',
                              )}>
                                <span className={cn(
                                  'h-1.5 w-1.5 rounded-full bg-emerald-400/70',
                                  isHighlighted && 'bg-emerald-400',
                                )} />
                                Active
                              </span>
                              <span className={cn(
                                'rounded-full border border-card-border bg-text/[0.04] px-1.5 py-0.5',
                                isHighlighted && 'border-text/20 bg-text/[0.08] text-text/70',
                              )}>
                                Details
                              </span>
                            </div> */}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>

                {/* Mobile Floating Zoom Controls (< sm screens) */}
                <div
                  data-export-ignore="true"
                  className="absolute bottom-3 left-3 z-40 flex sm:hidden items-center gap-1.5 rounded-xl border border-card-border bg-card-bg/95 p-1 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-black/90"
                  aria-label="Mobile diagram controls"
                >
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleZoomStep(0.25);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-card-border bg-text/10 text-text/80 transition-colors active:bg-text/20"
                    aria-label="Zoom in"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <span className="px-1 text-[10px] font-bold text-text/60">
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleZoomStep(-0.25);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-card-border bg-text/10 text-text/80 transition-colors active:bg-text/20"
                    aria-label="Zoom out"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetLayout();
                    }}
                    className="flex h-8 px-2 text-[10px] font-bold items-center justify-center rounded-lg border border-card-border bg-text/10 text-text/80 transition-colors active:bg-text/20"
                    aria-label="Reset layout"
                  >
                    Reset
                  </button>
                </div>

                {/* Minimap Overview (sm+ screens) */}
                <div
                  data-export-ignore="true"
                  className="absolute bottom-4 left-4 z-40 hidden cursor-crosshair overflow-hidden rounded-xl border border-card-border bg-card-bg/90 shadow-xl backdrop-blur-md transition-opacity duration-300 hover:opacity-100 sm:block dark:border-white/10 dark:bg-black/70"
                  style={{
                    width: minimapW,
                    height: minimapH,
                    opacity: scale > 1.05 || pan.x !== 0 || pan.y !== 0 ? 0.9 : 0.3,
                  }}
                  onPointerDown={handleMinimapPointerDown}
                  onPointerMove={handleMinimapPointerMove}
                  onPointerUp={handleMinimapPointerUp}
                  onPointerCancel={handleMinimapPointerUp}
                  aria-hidden="true"
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:8px_8px]" />

                  {/* Zoom controls */}
                  <div className="absolute right-2 top-2 z-50 flex flex-col gap-1">
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleZoomStep(0.25);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-card-border bg-text/10 text-text/75 shadow-sm transition-colors hover:bg-text/15 hover:text-text"
                      aria-label="Zoom in"
                      title="Zoom in"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleZoomStep(-0.25);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-card-border bg-text/10 text-text/75 shadow-sm transition-colors hover:bg-text/15 hover:text-text"
                      aria-label="Zoom out"
                      title="Zoom out"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {nodes.map((node) => {
                    const { left, top } = getNodePixelPosition(
                      node,
                      { width: gsW, height: gsH },
                      nodeDimensions,
                      canvasPadding
                    );
                    const isActive = node.id === focusedNode;

                    return (
                      <div
                        key={`minimap-${node.id}`}
                        className={`absolute rounded-[2px] transition-all duration-300 ${
                          isActive
                            ? 'z-10 scale-[1.35] bg-white opacity-100 shadow-[0_0_8px_rgba(255,255,255,0.9)] ring-1 ring-white/50'
                            : `bg-current opacity-70 ${node.tone.icon}`
                        }`}
                        style={{
                          left: parseFloat(String(left)) * minimapScale,
                          top: parseFloat(String(top)) * minimapScale,
                          width: Math.max(ndW * minimapScale, 3),
                          height: Math.max(ndH * minimapScale, 3),
                        }}
                      />
                    );
                  })}

                  <motion.div
                    className="absolute border border-text/35 bg-text/10 shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                    style={{ borderRadius: 4 }}
                    initial={false}
                    animate={{ width: vpW, height: vpH, x: vpX, y: vpY }}
                    transition={minimapViewportTransition}
                  />
                </div>
              </div>
            </div>

            <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-text/40">
              Drag nodes to reorganize, tap any node for details, and scroll on smaller screens to
              explore the full graph.
            </p>
          </CardContent>
        </Card>

        <NodeDetailsModal node={activeNode} onClose={handleCloseModal} />
      </>
    );
  }
);

RealVaultEcosystemCard.displayName = 'RealVaultEcosystemCard';
