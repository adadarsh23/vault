import { useState, useEffect, useRef } from 'react'
import { logger } from '../lib/logger'

export interface PerformanceMetrics {
  cpuCores: number
  deviceMemory: number | string
  gpuRenderer: string
  fps: number
  browser: string
  os: string
  memoryUsed?: number
  ping?: number
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize?: number
  }
}

const sanitizeGpuRenderer = (value: string): string =>
  value
    .replace('Angle (', '')
    .replace(')', '')
    .split('Direct3D')[0]
    .trim() || 'Standard'

const detectBrowser = (ua: string): string => {
  if (/edg\//i.test(ua)) return 'Edge'
  if (/firefox\//i.test(ua)) return 'Firefox'
  if (/chrome\//i.test(ua) || /crios\//i.test(ua)) return 'Chrome'
  if (/safari\//i.test(ua)) return 'Safari'
  return 'Unknown'
}

const detectOs = (ua: string): string => {
  if (/windows/i.test(ua)) return 'Windows'
  if (/android/i.test(ua)) return 'Android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS'
  if (/mac os|macintosh/i.test(ua)) return 'macOS'
  if (/linux/i.test(ua)) return 'Linux'
  return 'Unknown'
}

export const usePerformanceMetrics = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    cpuCores: 0,
    deviceMemory: 'Unknown',
    gpuRenderer: 'Detecting...',
    fps: 0,
    browser: 'Detecting...',
    os: 'Detecting...',
  })

  const lastTimeRef = useRef(
    typeof performance !== 'undefined' ? performance.now() : 0,
  )
  const framesRef = useRef(0)

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof navigator === 'undefined' ||
      typeof performance === 'undefined'
    ) {
      return
    }

    let isMounted = true
    lastTimeRef.current = performance.now()
    framesRef.current = 0

    // Basic hardware info
    const nav = navigator as NavigatorWithDeviceMemory
    const cpuCores = navigator.hardwareConcurrency || 0
    const deviceMemory =
      typeof nav.deviceMemory === 'number' && Number.isFinite(nav.deviceMemory)
        ? nav.deviceMemory
        : 'Unknown'

    // GPU info
    let gpuRenderer = 'Standard'
    try {
      const canvas = document.createElement('canvas')
      const gl =
        (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          const rendererValue = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          if (typeof rendererValue === 'string' && rendererValue.trim()) {
            gpuRenderer = rendererValue
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to detect GPU renderer', { error })
    }

    // Browser and OS detection
    const ua = navigator.userAgent
    if (isMounted) {
      setMetrics((prev) => ({
        ...prev,
        cpuCores,
        deviceMemory,
        gpuRenderer: sanitizeGpuRenderer(gpuRenderer),
        browser: detectBrowser(ua),
        os: detectOs(ua),
      }))
    }

    // FPS and memory calculation
    let animationFrameId: number | null = null
    let fpsFallbackInterval: ReturnType<typeof setInterval> | null = null

    const calculateFps = () => {
      if (!isMounted) return

      const now = performance.now()
      framesRef.current++

      if (now >= lastTimeRef.current + 1000) {
        // Memory is currently available only on some Chromium-based browsers.
        let memoryUsed: number | undefined
        const perfWithMemory = performance as PerformanceWithMemory
        if (perfWithMemory.memory?.usedJSHeapSize) {
          memoryUsed = Math.round(
            perfWithMemory.memory.usedJSHeapSize / (1024 * 1024),
          )
        }

        if (isMounted) {
          setMetrics((prev) => ({
            ...prev,
            fps: Math.round((framesRef.current * 1000) / (now - lastTimeRef.current)),
            memoryUsed,
          }))
        }
        framesRef.current = 0
        lastTimeRef.current = now
      }

      if (typeof window.requestAnimationFrame === 'function') {
        animationFrameId = window.requestAnimationFrame(calculateFps)
      }
    }

    // Simple ping measurement
    const measurePing = async () => {
      if (!isMounted) return

      const start = performance.now()
      const abortController =
        typeof AbortController !== 'undefined' ? new AbortController() : null
      const timeoutId =
        abortController !== null
          ? window.setTimeout(() => abortController.abort(), 3000)
          : null

      try {
        await fetch('/favicon.ico', {
          method: 'HEAD',
          cache: 'no-store',
          signal: abortController?.signal,
        })
        const end = performance.now()
        if (isMounted) {
          setMetrics((prev) => ({ ...prev, ping: Math.round(end - start) }))
        }
      } catch (error) {
        if (
          !(error instanceof DOMException && error.name === 'AbortError') &&
          import.meta.env.DEV
        ) {
          logger.debug('Ping measurement failed', { error })
        }
      } finally {
        if (timeoutId !== null) {
          clearTimeout(timeoutId)
        }
      }
    }

    if (typeof window.requestAnimationFrame === 'function') {
      animationFrameId = window.requestAnimationFrame(calculateFps)
    } else {
      fpsFallbackInterval = setInterval(calculateFps, 1000 / 60)
    }

    const pingInterval = setInterval(measurePing, 5000)
    void measurePing()

    return () => {
      isMounted = false
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
      if (fpsFallbackInterval) {
        clearInterval(fpsFallbackInterval)
      }
      clearInterval(pingInterval)
    }
  }, [])

  return metrics
}
