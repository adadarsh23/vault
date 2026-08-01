'use client'

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import createGlobe, { type COBEOptions } from 'cobe'
import { cn } from '../../lib/utils'

interface PulseMarker {
  id: string
  location: [number, number]
  delay: number
}

export interface GlobeProps {
  markers?: PulseMarker[]
  className?: string
  speed?: number
}

const defaultMarkers: PulseMarker[] = [
  { id: 'pulse-1', location: [51.51, -0.13], delay: 0 },
  { id: 'pulse-2', location: [40.71, -74.01], delay: 0.5 },
  { id: 'pulse-3', location: [35.68, 139.65], delay: 1 },
  { id: 'pulse-4', location: [-33.87, 151.21], delay: 1.5 },
]

const BASE_THETA = 0.2
const THETA_LIMIT = 0.65
const MARKER_SIZE = 0.025
const DRAG_SENSITIVITY = {
  phi: 300,
  theta: 1000,
} as const

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const sanitizeCssIdentifier = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]/g, '-')

const getCanvasSize = (canvas: HTMLCanvasElement) => {
  const rect = canvas.getBoundingClientRect()
  return Math.floor(Math.min(rect.width, rect.height))
}

interface RenderMarker extends PulseMarker {
  anchorId: string
}

export default function Globe({
  markers = defaultMarkers,
  className,
  speed = 0.003,
}: GlobeProps) {
  const componentId = useId()
  const markerNamespace = useMemo(
    () => `globe-${sanitizeCssIdentifier(componentId) || 'instance'}`,
    [componentId],
  )
  const renderMarkers = useMemo<RenderMarker[]>(
    () =>
      markers.map((marker, index) => {
        const rawId = marker.id || `marker-${index + 1}`
        const safeId = sanitizeCssIdentifier(rawId) || `marker-${index + 1}`

        return {
          ...marker,
          anchorId: `${markerNamespace}-${safeId}`,
        }
      }),
    [markerNamespace, markers],
  )
  const cobeMarkers = useMemo(
    () =>
      renderMarkers.map((marker) => ({
        location: marker.location,
        size: MARKER_SIZE,
        id: marker.anchorId,
      })),
    [renderMarkers],
  )

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerIdRef = useRef<number | null>(null)
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null)
  const dragOffset = useRef({ phi: 0, theta: 0 })
  const phiOffsetRef = useRef(0)
  const thetaOffsetRef = useRef(0)
  const canvasSizeRef = useRef(0)
  const prefersReducedMotionRef = useRef(false)
  const isPausedRef = useRef(false)

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      pointerIdRef.current = event.pointerId
      pointerInteracting.current = { x: event.clientX, y: event.clientY }
      dragOffset.current = { phi: 0, theta: 0 }
      event.currentTarget.setPointerCapture(event.pointerId)

      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grabbing'
      }

      isPausedRef.current = true
    },
    [],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (
        pointerInteracting.current === null ||
        pointerIdRef.current !== event.pointerId
      ) {
        return
      }

      dragOffset.current = {
        phi:
          (event.clientX - pointerInteracting.current.x) / DRAG_SENSITIVITY.phi,
        theta:
          (event.clientY - pointerInteracting.current.y) /
          DRAG_SENSITIVITY.theta,
      }
    },
    [],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const activePointerId = pointerIdRef.current
      if (activePointerId === null || activePointerId !== event.pointerId) {
        return
      }

      if (event.currentTarget.hasPointerCapture(activePointerId)) {
        event.currentTarget.releasePointerCapture(activePointerId)
      }

      pointerIdRef.current = null

      if (pointerInteracting.current !== null) {
        phiOffsetRef.current += dragOffset.current.phi
        thetaOffsetRef.current = clamp(
          thetaOffsetRef.current + dragOffset.current.theta,
          -THETA_LIMIT,
          THETA_LIMIT,
        )
        dragOffset.current = { phi: 0, theta: 0 }
      }

      pointerInteracting.current = null

      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grab'
      }

      isPausedRef.current = false
    },
    [],
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateReducedMotionPreference = () => {
      prefersReducedMotionRef.current = mediaQuery.matches
    }

    updateReducedMotionPreference()
    mediaQuery.addEventListener('change', updateReducedMotionPreference)

    return () => {
      mediaQuery.removeEventListener('change', updateReducedMotionPreference)
    }
  }, [])

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const activePointerId = pointerIdRef.current
      if (activePointerId === null || activePointerId !== event.pointerId) {
        return
      }

      if (event.currentTarget.hasPointerCapture(activePointerId)) {
        event.currentTarget.releasePointerCapture(activePointerId)
      }

      pointerIdRef.current = null

      if (pointerInteracting.current !== null) {
        phiOffsetRef.current += dragOffset.current.phi
        thetaOffsetRef.current = clamp(
          thetaOffsetRef.current + dragOffset.current.theta,
          -THETA_LIMIT,
          THETA_LIMIT,
        )
        dragOffset.current = { phi: 0, theta: 0 }
      }

      pointerInteracting.current = null

      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grab'
      }

      isPausedRef.current = false
    },
    [],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let globe: ReturnType<typeof createGlobe> | null = null
    let animationId = 0
    let fadeInTimeoutId = 0
    let resizeObserver: ResizeObserver | null = null
    let phi = 0
    let isDisposed = false

    const updateCanvasSize = () => {
      if (isDisposed || !canvas.isConnected) return

      const nextSize = getCanvasSize(canvas)
      if (nextSize <= 0) return

      canvasSizeRef.current = nextSize

      if (!globe) {
        initialize()
      }
    }

    const animate = () => {
      if (isDisposed) return

      const currentGlobe = globe
      if (!currentGlobe) return

      if (!isPausedRef.current && !prefersReducedMotionRef.current) {
        phi += speed
      }

      const size = canvasSizeRef.current
      if (size > 0) {
        currentGlobe.update({
          width: size,
          height: size,
          phi: phi + phiOffsetRef.current + dragOffset.current.phi,
          theta: clamp(
            BASE_THETA + thetaOffsetRef.current + dragOffset.current.theta,
            -THETA_LIMIT,
            THETA_LIMIT,
          ),
        })
      }

      animationId = window.requestAnimationFrame(animate)
    }

    const initialize = () => {
      if (isDisposed || !canvas.isConnected || globe) return

      const size = canvasSizeRef.current
      if (size === 0) return

      const globeConfig: COBEOptions = {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width: size,
        height: size,
        phi: 0,
        theta: BASE_THETA,
        dark: 1,
        diffuse: 1.5,
        mapSamples: 16000,
        mapBrightness: 10,
        baseColor: [0.5, 0.5, 0.5],
        markerColor: [0.2, 0.8, 0.9],
        glowColor: [0.05, 0.05, 0.05],
        markerElevation: 0,
        markers: cobeMarkers,
        arcs: [],
        arcColor: [0.3, 0.85, 0.95],
        arcWidth: 0.5,
        arcHeight: 0.25,
        opacity: 0.7,
      }

      const createdGlobe = createGlobe(canvas, globeConfig)
      if (isDisposed) {
        createdGlobe.destroy()
        return
      }
      globe = createdGlobe

      animationId = window.requestAnimationFrame(animate)
      fadeInTimeoutId = window.setTimeout(() => {
        if (!isDisposed && canvas.isConnected) {
          canvas.style.opacity = '1'
        }
      }, 0)
    }

    updateCanvasSize()
    resizeObserver = new ResizeObserver(() => updateCanvasSize())
    resizeObserver.observe(canvas)

    return () => {
      isDisposed = true

      if (animationId) {
        window.cancelAnimationFrame(animationId)
      }
      if (fadeInTimeoutId) {
        window.clearTimeout(fadeInTimeoutId)
      }
      resizeObserver?.disconnect()
      if (globe) {
        const activeGlobe = globe
        globe = null
        activeGlobe.destroy()
      }
    }
  }, [cobeMarkers, speed])

  return (
    <div
      className={cn(
        'relative aspect-square select-none overflow-visible',
        className,
      )}
    >
      <style>{`
        @keyframes pulse-expand {
          0% { transform: scaleX(0.3) scaleY(0.3); opacity: 0.8; }
          100% { transform: scaleX(1.5) scaleY(1.5); opacity: 0; }
        }

        @supports not (anchor-name: --globe-test) {
          .globe-pulse-marker {
            display: none;
          }
        }
      `}</style>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        aria-hidden="true"
        style={{
          width: '100%',
          height: '100%',
          cursor: 'grab',
          opacity: 0,
          transition: 'opacity 1.2s ease',
          borderRadius: '50%',
          touchAction: 'none',
        }}
      />
      {renderMarkers.map((marker) => (
        <div
          key={marker.anchorId}
          className="globe-pulse-marker"
          style={{
            position: 'absolute',
            positionAnchor: `--cobe-${marker.anchorId}` as never,
            bottom: 'anchor(center)',
            left: 'anchor(center)',
            translate: '-50% 50%',
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            opacity: `var(--cobe-visible-${marker.anchorId}, 0)`,
            filter: `blur(calc((1 - var(--cobe-visible-${marker.anchorId}, 0)) * 8px))`,
            transition: 'opacity 0.4s, filter 0.4s',
          }}
        >
          <span
            style={{
              position: 'absolute',
              inset: 0,
              border: '2px solid #33ccdd',
              borderRadius: '50%',
              opacity: 0,
              animation: `pulse-expand 2s ease-out infinite ${marker.delay}s`,
            }}
          />
          <span
            style={{
              position: 'absolute',
              inset: 0,
              border: '2px solid #33ccdd',
              borderRadius: '50%',
              opacity: 0,
              animation: `pulse-expand 2s ease-out infinite ${marker.delay + 0.5}s`,
            }}
          />
          <span
            style={{
              width: 10,
              height: 10,
              background: '#33ccdd',
              borderRadius: '50%',
              boxShadow: '0 0 0 3px #111, 0 0 0 5px #33ccdd',
            }}
          />
        </div>
      ))}
    </div>
  )
}
