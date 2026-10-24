import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, motionValue, useReducedMotion, type MotionValue } from 'framer-motion';
import type { Options } from 'html-to-image/lib/types';
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
  ShieldCheck,
  Home,
} from 'lucide-react';
import { usePerformanceMetrics } from '../../hooks/usePerformanceMetrics';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
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

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const clearTimer = (ref: React.MutableRefObject<number | null>) => {
  if (ref.current !== null) {
    clearTimeout(ref.current);
    ref.current = null;
  }
};

const PAN_LIMIT = 0.6;
const EDGE_CURVE_CONTROL_DISTANCE = 0.35;

export type { VaultCategoryStats };

interface RealVaultEcosystemCardProps {
  itemCount: number;
  categoryStats: VaultCategoryStats;
}

const RealVaultEcosystemCardInternal = memo(function RealVaultEcosystemCard({
  itemCount,
  categoryStats,
}: RealVaultEcosystemCardProps) {
  const shouldReduceMotion = useReducedMotion();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const initialStorage = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        scale: 1,
        pan: { x: 0, y: 0 },
        positions: {},
      };
    }

    return {
      scale: safeJsonParse(localStorage.getItem('vault_ecosystem_scale'), 1),
      pan: safeJsonParse(localStorage.getItem('vault_ecosystem_pan'), { x: 0, y: 0 }),
      positions: safeJsonParse(localStorage.getItem('vault_ecosystem_positions'), {}),
    };
  }, []);

  const svgId = useId();
  const performance = usePerformanceMetrics();
  const graphRef = useRef<HTMLDivElement>(null);

  // ─────────────────────────────────────────────
  // Drag / modal safety flags
  // ─────────────────────────────────────────────
  const dragSuppressRef = useRef(false);
  const modalSuppressRef = useRef(false);
  const dragOriginRef = useRef<Record<string, NodePosition>>({});

  // ─────────────────────────────────────────────
  // Multi-pointer & Gesture tracking
  // ─────────────────────────────────────────────
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinchDistRef = useRef<number | null>(null);
  const initialPinchScaleRef = useRef<number>(1);

  // ─────────────────────────────────────────────
  // Zoom + Pan (State and Persistence)
  // ─────────────────────────────────────────────
  const [scale, setScale] = useState<number>(() => initialStorage.scale);
  const [pan, setPan] = useState<{ x: number; y: number }>(() => initialStorage.pan);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panFrameRef = useRef<number | null>(null);
  const panPendingRef = useRef<{ x: number; y: number } | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelDeltaRef = useRef(0);
  const [isResetting, setIsResetting] = useState(false);
  const isMinimapPanning = useRef(false);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const resetTimeoutRef = useRef<number | null>(null);
  const dragSuppressTimeoutRef = useRef<number | null>(null);
  const modalSuppressTimeoutRef = useRef<number | null>(null);

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
    [itemCount, categoryStats],
  );

  const defaultPositions = useMemo(
    () =>
      Object.fromEntries(nodeTemplates.map((n) => [n.id, { x: n.x, y: n.y }])) as Record<
        string,
        NodePosition
      >,
    [nodeTemplates],
  );

  const [positions, setPositions] = useState<Record<string, NodePosition>>(() => {
    if (typeof window === 'undefined') {
      return defaultPositions;
    }
    try {
      if (localStorage.getItem('vault_ecosystem_layout_version') !== 'v3') {
        localStorage.setItem('vault_ecosystem_layout_version', 'v3');
        localStorage.removeItem('vault_ecosystem_positions');
        return defaultPositions;
      }
      return {
        ...defaultPositions,
        ...initialStorage.positions,
      };
    } catch {
      return defaultPositions;
    }
  });

  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [motionPositions, setMotionPositions] = useState<
    Record<string, { x: MotionValue<number>; y: MotionValue<number> }>
  >({});
  const [focusedNode, setFocusedNode] = useState<string | null>(null);

  useEffect(() => {
    setMotionPositions((currentPositions) => {
      const newPositions: Record<string, { x: MotionValue<number>; y: MotionValue<number> }> = {};
      let needsUpdate = false;
      const currentNodeIds = new Set(nodeTemplates.map((n) => n.id));

      for (const id in currentPositions) {
        if (!currentNodeIds.has(id)) {
          needsUpdate = true;
        }
      }

      for (const n of nodeTemplates) {
        if (currentPositions[n.id]) {
          newPositions[n.id] = currentPositions[n.id];
        } else {
          needsUpdate = true;
          newPositions[n.id] = {
            x: motionValue(0) as MotionValue<number>,
            y: motionValue(0) as MotionValue<number>,
          };
        }
      }

      return needsUpdate ||
        Object.keys(newPositions).length !== Object.keys(currentPositions).length
        ? newPositions
        : currentPositions;
    });
  }, [nodeTemplates]);

  // ─────────────────────────────────────────────
  // Resize observer
  // ─────────────────────────────────────────────
  useEffect(() => {
    const element = graphRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        const { width, height } = entry.contentRect;
        setGraphSize({
          width: width > 0 ? width : GRAPH_WIDTH,
          height: height > 0 ? height : GRAPH_HEIGHT,
        });
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
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
        logger.warn('Failed to save node positions to storage', { error: e });
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
        logger.warn('Failed to save scale to storage', { error: e });
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
        logger.warn('Failed to save pan to storage', { error: e });
      }
    }, 300);
    return () => {
      if (savePanTimer.current) clearTimeout(savePanTimer.current);
    };
  }, [pan]);

  useEffect(
    () => () => {
      if (panFrameRef.current !== null) {
        window.cancelAnimationFrame(panFrameRef.current);
        panFrameRef.current = null;
      }
      if (wheelFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelFrameRef.current);
        wheelFrameRef.current = null;
      }
      panPendingRef.current = null;
      wheelDeltaRef.current = 0;
      clearTimer(resetTimeoutRef);
      clearTimer(dragSuppressTimeoutRef);
      clearTimer(modalSuppressTimeoutRef);
    },
    [],
  );

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

    clearTimer(resetTimeoutRef);
    resetTimeoutRef.current = window.setTimeout(() => {
      if (mountedRef.current) {
        setIsResetting(false);
        dragSuppressRef.current = false;
        modalSuppressRef.current = false;
      }
    }, 400);
  }, [defaultPositions]);

  // ─────────────────────────────────────────────
  // Keyboard Shortcuts
  // ─────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Home') {
        e.preventDefault();
        handleResetLayout();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleResetLayout]);

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
    [nodeTemplates, positions],
  );

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const activeNode = useMemo(
    () => nodes.find((n) => n.id === activeNodeId) ?? null,
    [nodes, activeNodeId],
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
      if (!node || !container || !motionPositions[nodeId]) return;

      const availW = container.clientWidth - ndW - canvasPadding * 2;
      const availH = container.clientHeight - ndH - canvasPadding * 2;

      const left = canvasPadding + (node.x / 100) * availW + offset.x;
      const top = canvasPadding + (node.y / 100) * availH + offset.y;

      const x = clamp(((left - canvasPadding) / Math.max(availW, 1)) * 100, 0, 100);
      const y = clamp(((top - canvasPadding) / Math.max(availH, 1)) * 100, 0, 100);

      setPositions((prev) => ({ ...prev, [nodeId]: { x, y } }));
    },
    [positions, ndW, ndH, canvasPadding, motionPositions],
  );

  // ─────────────────────────────────────────────
  // Drag handlers
  // ─────────────────────────────────────────────
  const handleDragStart = useCallback(
    (id: string) => {
      dragOriginRef.current[id] = positions[id];
      setIsDraggingNode(true);
    },
    [positions],
  );

  const handleDrag = useCallback(
    (id: string, info: { offset: { x: number; y: number } }) => {
      const motionPos = motionPositions[id];
      if (motionPos) {
        motionPos.x.set(info.offset.x);
        motionPos.y.set(info.offset.y);
      }
    },
    [motionPositions],
  );

  const handleDragEnd = useCallback(
    (id: string, _e: unknown, info: { offset: { x: number; y: number } }) => {
      setIsDraggingNode(false);
      updateNodePositionFromOffset(id, info.offset);
      delete dragOriginRef.current[id];
      motionPositions[id]?.x.set(0);
      motionPositions[id]?.y.set(0);
      dragSuppressRef.current = true;
      clearTimer(dragSuppressTimeoutRef);
      dragSuppressTimeoutRef.current = window.setTimeout(() => {
        if (mountedRef.current) {
          dragSuppressRef.current = false;
        }
      }, 120);
    },
    [motionPositions, updateNodePositionFromOffset],
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
    clearTimer(modalSuppressTimeoutRef);
    modalSuppressTimeoutRef.current = window.setTimeout(() => {
      if (mountedRef.current) {
        modalSuppressRef.current = false;
      }
    }, 150);
  }, []);

  // ─────────────────────────────────────────────
  // Double click to center
  // ─────────────────────────────────────────────
  const handleDoubleClick = useCallback(() => {
    if (isResetting) return;
    setIsResetting(true);
    setScale(1);
    setPan({ x: 0, y: 0 });
    clearTimer(resetTimeoutRef);
    resetTimeoutRef.current = window.setTimeout(() => {
      if (mountedRef.current) {
        setIsResetting(false);
      }
    }, 400);
  }, [isResetting]);

  // ─────────────────────────────────────────────
  // Export Diagram (4K Ultra-HD Resolution)
  // ─────────────────────────────────────────────
  const handleExportImage = useCallback(async () => {
    if (!graphRef.current || isExporting) return;

    const securityErrorHandler = (err: unknown) => {
      if (err instanceof Error && err.name === 'SecurityError') {
        toast.error('Export failed due to security restrictions', {
          description: 'The diagram may contain cross-origin content that cannot be exported.',
        });
        return true;
      }
      return false;
    };

    const element = graphRef.current;
    if (!element) return;
    setIsExporting(true);
    try {
      element.classList.add('is-exporting-png');
      const { toBlob, toPng } = await import('html-to-image');
      const width = element.scrollWidth;
      const height = element.scrollHeight;

      const TARGET_WIDTH = 3840;
      let exportScale = TARGET_WIDTH / width;
      const MAX_CANVAS_PIXELS = 4096 * 4096;
      let canvasWidth = TARGET_WIDTH;
      let canvasHeight = Math.round(height * exportScale);

      if (canvasWidth * canvasHeight > MAX_CANVAS_PIXELS) {
        exportScale = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
        canvasWidth = Math.round(width * exportScale);
        canvasHeight = Math.round(height * exportScale);
        toast.info('Export size reduced to prevent browser crash.');
      }

      const useBlob = typeof toBlob !== 'undefined';

      const exportOptions: Options = {
        cacheBust: true,
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        width,
        height,
        canvasWidth,
        canvasHeight,
        backgroundColor: '#090d16',
        style: {
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor: '#090d16',
          transform: 'none',
          transformOrigin: 'top left',
        },
        filter: (node: Node) =>
          !(node instanceof HTMLElement && node.dataset.exportIgnore === 'true'),
      };

      let href = '';

      if (useBlob) {
        try {
          const blob = await toBlob(element, exportOptions);
          if (blob) href = URL.createObjectURL(blob);
        } catch (err) {
          if (securityErrorHandler(err)) return;
          throw err;
        }
      }
      if (!href) {
        href = await toPng(element, exportOptions);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      const link = document.createElement('a');
      link.download = `vault-ecosystem-4k-${timestamp}.png`;
      link.href = href;
      link.rel = 'noopener';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (useBlob && href.startsWith('blob:')) {
        if (typeof requestIdleCallback !== 'undefined') {
          window.requestIdleCallback?.(() => URL.revokeObjectURL(href), { timeout: 2000 });
        } else {
          setTimeout(() => URL.revokeObjectURL(href), 2000);
        }
      }

      toast.success('Diagram exported in 4K.');
    } catch (err) {
      if (securityErrorHandler(err)) return;
      logger.error('Failed to export diagram', { error: err });
      toast.error('Failed to export diagram.');
    } finally {
      element.classList.remove('is-exporting-png');
      if (mountedRef.current) {
        setIsExporting(false);
      }
    }
  }, [isExporting]);

  // ─────────────────────────────────────────────
  // Zoom + Pan handlers
  // ─────────────────────────────────────────────
  const handleZoomStep = useCallback((delta: number) => {
    clearTimer(resetTimeoutRef);
    setIsResetting(true);
    setScale((s) => clamp(s + delta, 0.25, 4));
    resetTimeoutRef.current = window.setTimeout(() => {
      if (mountedRef.current) {
        setIsResetting(false);
      }
    }, 400);
  }, []);

  const flushWheelZoom = useCallback(() => {
    wheelFrameRef.current = null;
    const accumulatedDelta = wheelDeltaRef.current;
    wheelDeltaRef.current = 0;
    if (!accumulatedDelta) return;

    const delta = clamp(accumulatedDelta, -120, 120);
    const sensitivity = shouldReduceMotion ? 0.00075 : 0.0011;
    setScale((s) => clamp(s + -delta * sensitivity, 0.25, 4));
  }, [shouldReduceMotion]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      wheelDeltaRef.current += e.deltaY;
      if (wheelFrameRef.current === null) {
        wheelFrameRef.current = requestAnimationFrame(flushWheelZoom);
      }
    },
    [flushWheelZoom],
  );

  useEffect(() => {
    const element = graphRef.current;
    if (!element) return;

    element.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Multi-pointer gesture & pan handling
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target !== graphRef.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);

      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointersRef.current.size === 1) {
        isPanning.current = true;
        panStart.current = {
          x: e.clientX - pan.x,
          y: e.clientY - pan.y,
        };
      } else if (activePointersRef.current.size === 2) {
        isPanning.current = false;
        const pointers = Array.from(activePointersRef.current.values());
        const dist = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
        initialPinchDistRef.current = dist > 0 ? dist : 1;
        initialPinchScaleRef.current = scale;
      }
    },
    [pan.x, pan.y, scale],
  );

  const flushPanFrame = useCallback(() => {
    panFrameRef.current = null;
    const nextPan = panPendingRef.current;
    panPendingRef.current = null;
    if (!nextPan) return;
    if (mountedRef.current) {
      setPan(nextPan);
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointersRef.current.size === 1 && isPanning.current) {
        const rawX = e.clientX - panStart.current.x;
        const rawY = e.clientY - panStart.current.y;

        const limitX = gsW * scale * PAN_LIMIT;
        const limitY = gsH * scale * PAN_LIMIT;

        const clampedX = clamp(rawX, -limitX, limitX);
        const clampedY = clamp(rawY, -limitY, limitY);

        if (rawX !== clampedX) panStart.current.x = e.clientX - clampedX;
        if (rawY !== clampedY) panStart.current.y = e.clientY - clampedY;

        panPendingRef.current = {
          x: clampedX,
          y: clampedY,
        };
        if (panFrameRef.current === null) {
          panFrameRef.current = requestAnimationFrame(flushPanFrame);
        }
      } else if (activePointersRef.current.size === 2 && initialPinchDistRef.current) {
        const pointers = Array.from(activePointersRef.current.values());
        const currentDist = Math.hypot(
          pointers[0].x - pointers[1].x,
          pointers[0].y - pointers[1].y,
        );
        const newScale = clamp(
          initialPinchScaleRef.current * (currentDist / initialPinchDistRef.current),
          0.25,
          4,
        );
        setScale(newScale);
      }
    },
    [flushPanFrame, gsH, gsW, scale],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      activePointersRef.current.delete(e.pointerId);

      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      if (activePointersRef.current.size < 2) {
        initialPinchDistRef.current = null;
      }

      if (activePointersRef.current.size === 1) {
        const remaining = Array.from(activePointersRef.current.values())[0];
        isPanning.current = true;
        panStart.current = {
          x: remaining.x - pan.x,
          y: remaining.y - pan.y,
        };
      } else if (activePointersRef.current.size === 0) {
        isPanning.current = false;
        const pendingPan = panPendingRef.current;
        if (pendingPan) {
          if (mountedRef.current) {
            setPan(pendingPan);
          }
          panPendingRef.current = null;
        }
      }
    },
    [pan.x, pan.y],
  );

  // ─────────────────────────────────────────────
  // Minimap logic
  // ─────────────────────────────────────────────
  const minimapW = Math.min(180, gsW * 0.2);
  const minimapScale = minimapW / Math.max(gsW, 1);
  const minimapH = gsH * minimapScale;

  const vpW = minimapW / scale;
  const vpH = minimapH / scale;
  const vpX = minimapW / 2 - vpW / 2 - (pan.x / scale) * minimapScale;
  const vpY = minimapH / 2 - vpH / 2 - (pan.y / scale) * minimapScale;

  const handleUpdatePanFromMinimap = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = clamp(e.clientX - rect.left, 0, minimapW);
      const mouseY = clamp(e.clientY - rect.top, 0, minimapH);

      const nextPanX = (minimapW / 2 - mouseX) * (scale / minimapScale);
      const nextPanY = (minimapH / 2 - mouseY) * (scale / minimapScale);

      setPan({
        x: clamp(nextPanX, -gsW * scale * PAN_LIMIT, gsW * scale * PAN_LIMIT),
        y: clamp(nextPanY, -gsH * scale * PAN_LIMIT, gsH * scale * PAN_LIMIT),
      });
    },
    [gsW, gsH, scale, minimapW, minimapH, minimapScale],
  );

  const handleMinimapPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      isMinimapPanning.current = true;
      handleUpdatePanFromMinimap(e);
    },
    [handleUpdatePanFromMinimap],
  );

  const handleMinimapPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isMinimapPanning.current) return;
      e.stopPropagation();
      handleUpdatePanFromMinimap(e);
    },
    [handleUpdatePanFromMinimap],
  );

  const handleMinimapPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    isMinimapPanning.current = false;
  }, []);

  // ─────────────────────────────────────────────
  // Performance Score
  // ─────────────────────────────────────────────
  const performanceScore = useMemo(() => {
    let score = 100;
    const { fps, ping } = performance;

    if (fps < 58) score -= (58 - fps) * 1.5;
    if (fps < 30) score -= (30 - fps) * 2.5;

    if (typeof ping === 'number' && ping > 80) score -= (ping - 80) * 0.2;
    if (typeof ping === 'number' && ping > 200) score -= (ping - 200) * 0.3;

    return Math.max(0, Math.min(100, Math.round(score)));
  }, [performance.fps, performance.ping]);

  const healthStatus = useMemo(() => {
    if (performanceScore > 90) {
      return {
        label: 'Healthy',
        className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
      };
    }
    if (performanceScore > 60) {
      return {
        label: 'Degraded',
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
      };
    }
    return {
      label: 'Critical',
      className: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    };
  }, [performanceScore]);

  const isGraphInteracting = isPanning.current || isDraggingNode || isResetting;

  // ─────────────────────────────────────────────
  // Edge computation (optimized)
  // ─────────────────────────────────────────────
  const edges = useMemo(() => {
    return EDGES.map((edge) => {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) return null;

      return {
        ...edge,
        anchors: getNodeEdgeAnchors(from, to, graphSize, nodeDimensions, canvasPadding),
      };
    }).filter((edge): edge is NonNullable<typeof edge> => edge !== null);
  }, [nodeMap, graphSize, nodeDimensions, canvasPadding]);

  const graphMinHeight = gsW < 380 ? 270 : gsW < 520 ? 310 : gsW < 768 ? 370 : 420;

  const graphTransformTransition = useMemo(() => {
    if (shouldReduceMotion) return { duration: 0 };
    if (isResetting) {
      return { type: 'tween' as const, ease: 'easeInOut' as const, duration: 0.38 };
    }
    return { type: 'spring' as const, stiffness: 165, damping: 24, mass: 0.42 };
  }, [shouldReduceMotion, isResetting]);

  const minimapViewportTransition = useMemo(() => {
    if (shouldReduceMotion) return { duration: 0 };
    if (isResetting) return { type: 'tween' as const, ease: 'easeOut' as const, duration: 0.32 };
    return { type: 'spring' as const, stiffness: 210, damping: 30, mass: 0.38 };
  }, [shouldReduceMotion, isResetting]);

  // Dynamic Bezier Control Limits based on current graph width
  const minCurveControl = Math.min(32, Math.max(16, gsW * 0.05));
  const maxCurveControl = Math.min(96, Math.max(48, gsW * 0.14));

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <>
      <Card className="overflow-hidden border-card-border bg-card-bg shadow-[0_24px_60px_-38px_rgba(15,23,42,0.24)] dark:border-white/10 dark:bg-black">
        {/* ── Header ── */}
        <CardHeader className="border-b border-card-border bg-text/[0.02] px-3 py-4 sm:px-6 sm:py-5 dark:border-white/10 dark:bg-black/40">
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            {/* Left pills bar */}
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="no-scrollbar overflow-x-auto pb-1 -mb-1">
                <div className="flex w-max items-center gap-1.5 sm:gap-2 pr-2">
                  {/* Items */}
                  <span
                    aria-live="polite"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2.5 py-1 text-[10px] font-semibold tracking-tight text-text/70 sm:text-xs"
                  >
                    <Activity className="h-3 w-3 text-sky-400" />
                    {itemCount} Items
                  </span>

                  {/* Health */}
                  <div
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-tight transition-colors sm:text-xs',
                      healthStatus.className,
                    )}
                    title={`Performance Score: ${performanceScore}/100`}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {healthStatus.label}
                  </div>

                  {/* CPU */}
                  <div
                    aria-live="polite"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2.5 py-1 text-[10px] font-semibold text-text/70 transition-colors sm:text-xs"
                    title={`${performance.cpuCores} CPU Cores`}
                  >
                    <Cpu className="h-3 w-3 text-sky-400" />
                    {performance.cpuCores} Cores
                  </div>

                  {/* Memory */}
                  <div
                    aria-live="polite"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2.5 py-1 text-[10px] font-semibold text-text/70 transition-colors sm:text-xs"
                    title={`Memory: ${performance.memoryUsed != null ? `${performance.memoryUsed}MB used` : `${performance.deviceMemory ?? 'N/A'}GB available`}`}
                  >
                    <Server className="h-3 w-3 text-violet-400" />
                    {performance.memoryUsed != null
                      ? `${performance.memoryUsed} MB`
                      : `${performance.deviceMemory ?? 'N/A'} GB`}
                  </div>

                  {/* GPU */}
                  <div
                    aria-live="polite"
                    className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2.5 py-1 text-[10px] font-semibold text-text/70 transition-colors sm:text-xs"
                    title={`GPU: ${performance.gpuRenderer}`}
                  >
                    <Monitor className="h-3 w-3 text-amber-400" />
                    <span className="max-w-[90px] truncate sm:max-w-[120px]">
                      {performance.gpuRenderer ?? 'N/A'}
                    </span>
                  </div>

                  {/* FPS */}
                  <div
                    aria-live="polite"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2.5 py-1 text-[10px] font-semibold text-text/70 transition-colors sm:text-xs"
                    title="Frames Per Second"
                  >
                    <Gauge
                      className={cn(
                        'h-3 w-3',
                        performance.fps >= 58
                          ? 'text-emerald-400'
                          : performance.fps >= 30
                            ? 'text-amber-400'
                            : 'text-rose-400',
                      )}
                    />
                    {performance.fps} FPS
                  </div>

                  {/* Ping */}
                  {performance.ping !== undefined && (
                    <div
                      aria-live="polite"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2.5 py-1 text-[10px] font-semibold text-text/70 transition-colors sm:text-xs"
                      title="Network Latency"
                    >
                      <div
                        className={cn(
                          'h-1.5 w-1.5 rounded-full animate-pulse',
                          performance.ping < 80
                            ? 'bg-emerald-500'
                            : performance.ping < 200
                              ? 'bg-amber-500'
                              : 'bg-rose-500',
                        )}
                      />
                      {performance.ping} ms
                    </div>
                  )}

                  {/* Shortcut */}
                  <div className="hidden md:inline-flex shrink-0 items-center gap-1.5 rounded-full border border-card-border bg-text/5 px-2.5 py-1 text-[10px] font-semibold text-text/70 sm:text-xs">
                    <Home className="h-3 w-3 text-indigo-400" />
                    Ctrl+Home to Reset
                  </div>
                </div>
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={handleExportImage}
                disabled={isExporting || isGraphInteracting || isResetting}
                aria-label="Export diagram in 4K"
                title="Export diagram in 4K"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-card-border bg-text/5 text-text/70 transition hover:bg-text/10 hover:text-text disabled:opacity-50 sm:h-9 sm:w-9"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                onClick={handleResetLayout}
                aria-label="Reset diagram layout"
                aria-pressed={isResetting}
                title="Reset layout"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-card-border bg-text/5 text-text/70 transition hover:bg-text/10 hover:text-text sm:h-9 sm:w-9"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardHeader>

        {/* ── Body ── */}
        <CardContent className="space-y-3 p-2.5 sm:p-4 xl:p-5">
          <div className="relative w-full overflow-hidden rounded-[1.35rem] border border-card-border bg-text/[0.02] sm:rounded-[1.5rem] dark:border-white/10 dark:bg-black/30">
            {/* Graph container */}
            <div
              ref={graphRef}
              role="region"
              aria-label="Vault ecosystem diagram"
              className="relative w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.1),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]"
              style={{
                aspectRatio: `${GRAPH_WIDTH} / ${GRAPH_HEIGHT}`,
                minHeight: graphMinHeight,
                touchAction: 'none',
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onDoubleClick={handleDoubleClick}
            >
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.14),transparent_30%),radial-gradient(circle_at_80%_80%,rgba(34,197,94,0.12),transparent_34%)]"
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
                animate={{
                  x: pan.x,
                  y: pan.y,
                  scale,
                }}
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
                      id={`ecosystem-grid-${svgId}`}
                      width="28"
                      height="28"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 28 0 L 0 0 0 28"
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.08)"
                        strokeWidth="1"
                      />
                    </pattern>
                    {EDGES.map((edge) => (
                      <linearGradient
                        key={`grad-${edge.id}`}
                        id={`edge-grad-${svgId}-${edge.id}`}
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
                    fill={`url(#ecosystem-grid-${svgId})`}
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
                      minCurveControl,
                      Math.min(
                        maxCurveControl,
                        Math.hypot(endJoin.x - startJoin.x, endJoin.y - startJoin.y) *
                          EDGE_CURVE_CONTROL_DISTANCE,
                      ),
                    );
                    const cp1 = {
                      x: startJoin.x + start.normalX * controlDistance,
                      y: startJoin.y + start.normalY * controlDistance,
                    };
                    const cp2 = {
                      x: endJoin.x + end.normalX * controlDistance,
                      y: endJoin.y + end.normalY * controlDistance,
                    };

                    const gradId = `edge-grad-${svgId}-${edge.id}`;
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
                            repeat: shouldReduceMotion || performance.fps < 45 ? 0 : Infinity,
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
                    canvasPadding,
                  );

                  const subtitleId = `${svgId}-${node.id}-subtitle`;
                  return (
                    <motion.button
                      key={node.id}
                      type="button"
                      aria-label={`Open ${node.title} details`}
                      aria-grabbed={isDraggingNode && focusedNode === node.id}
                      drag
                      aria-pressed={isActive}
                      aria-describedby={subtitleId}
                      dragMomentum={false}
                      dragElastic={0.08}
                      dragTransition={{
                        bounceStiffness: 360,
                        bounceDamping: 28,
                        power: 0.12,
                      }}
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
                        delay: Math.min(i * 0.045, 0.5),
                        type: 'spring',
                        stiffness: 230,
                        damping: 22,
                        mass: 0.52,
                      }}
                      className={cn(
                        'absolute cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card-bg focus-visible:ring-text/30',
                        isHighlighted && 'z-20',
                      )}
                      style={{
                        left,
                        top,
                        width: ndW,
                        height: ndH,
                        x: motionPositions[node.id]?.x,
                        y: motionPositions[node.id]?.y,
                      }}
                    >
                      <div
                        className={cn(
                          'group/node relative flex h-full flex-col overflow-hidden rounded-[1.1rem] border border-card-border bg-card-bg/90 p-2 sm:rounded-[1.4rem] sm:p-3 md:rounded-[1.55rem] md:p-4 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.34)] backdrop-blur-2xl transition-all duration-300 hover:border-text/15 hover:shadow-[0_28px_70px_-34px_rgba(15,23,42,0.4)] ring-1 transform-gpu dark:border-white/10 dark:bg-black/50',
                          node.tone.ring,
                          isHighlighted &&
                            'border-text/25 shadow-[0_30px_80px_-34px_rgba(15,23,42,0.52)] ring-2 ring-white/10',
                        )}
                      >
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
                          <div className="space-y-1 sm:space-y-2">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              {/* Icon badge */}
                              <div
                                className={cn(
                                  'flex shrink-0 items-center justify-center rounded-lg border bg-card-bg/85 transition-all sm:rounded-xl',
                                  node.tone.softBg,
                                  node.tone.ring,
                                  'h-6 w-6 sm:h-8 sm:w-8 md:h-9 md:w-9',
                                )}
                              >
                                <Icon
                                  className={cn(
                                    'h-3 w-3 sm:h-4 sm:w-4 md:h-[18px] md:w-[18px]',
                                    node.tone.icon,
                                  )}
                                  aria-hidden="true"
                                />
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold tracking-tight text-text sm:text-xs md:text-sm leading-tight truncate">
                                  {node.title}
                                </p>
                              </div>
                            </div>

                            <p
                              id={subtitleId}
                              className="line-clamp-2 text-[8.5px] leading-tight text-text/65 sm:text-[10px] md:text-[11px] sm:leading-relaxed"
                            >
                              {node.subtitle}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>

              {/* Mobile Floating Zoom Controls (< sm screens) */}
              <div
                data-export-ignore="true"
                className="absolute bottom-2.5 left-2.5 z-40 flex sm:hidden items-center gap-1 rounded-xl border border-card-border bg-card-bg/95 p-1 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-black/90"
                aria-label="Mobile diagram controls"
              >
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleZoomStep(0.25);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-card-border bg-text/10 text-text/80 transition-colors active:bg-text/20"
                  aria-label="Zoom in"
                >
                  <Plus className="h-3.5 w-3.5" />
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
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-card-border bg-text/10 text-text/80 transition-colors active:bg-text/20"
                  aria-label="Zoom out"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetLayout();
                  }}
                  className="flex h-7 px-2 text-[10px] font-bold items-center justify-center rounded-lg border border-card-border bg-text/10 text-text/80 transition-colors active:bg-text/20"
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
                    canvasPadding,
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
                        left: left * minimapScale,
                        top: top * minimapScale,
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

          <p className="mt-2.5 text-[10px] uppercase tracking-[0.16em] text-text/40 sm:text-[11px] sm:tracking-[0.18em]">
            Drag nodes to reorganize, tap any node for details, or pinch to zoom & pan across all
            device viewports.
          </p>
        </CardContent>
      </Card>

      <NodeDetailsModal node={activeNode} onClose={handleCloseModal} />
    </>
  );
});

export const RealVaultEcosystemCard: React.FC<RealVaultEcosystemCardProps> = (props) => (
  <ErrorBoundary
    fallback={
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-red-500/30 bg-red-500/10 p-4 text-center text-red-400">
        The ecosystem graph encountered a rendering error.
      </div>
    }
  >
    <RealVaultEcosystemCardInternal {...props} />
  </ErrorBoundary>
);

RealVaultEcosystemCard.displayName = 'RealVaultEcosystemCard';
