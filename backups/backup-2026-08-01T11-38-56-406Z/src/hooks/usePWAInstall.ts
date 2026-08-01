import { useState, useEffect, useCallback, useRef } from 'react'
import { logger } from '../lib/logger'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

const PWA_INSTALLED_STORAGE_KEY = 'pwa_installed'

const isStandaloneDisplayMode = (): boolean => {
  if (typeof window === 'undefined') return false

  try {
    const matchesStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: minimal-ui)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches

    const legacyStandalone = Boolean(
      (window.navigator as Navigator & { standalone?: boolean }).standalone,
    )

    return Boolean(matchesStandalone || legacyStandalone)
  } catch (error) {
    logger.warn('Failed to detect PWA display mode', { error })
    return false
  }
}

const readPwaInstalledFlag = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(PWA_INSTALLED_STORAGE_KEY) === 'true'
  } catch (error) {
    logger.warn('Unable to read PWA install state from localStorage', { error })
    return false
  }
}

const persistPwaInstalledFlag = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, 'true')
  } catch (error) {
    logger.warn('Unable to persist PWA install state to localStorage', { error })
  }
}

const isValidBeforeInstallPromptEvent = (
  event: Event,
): event is BeforeInstallPromptEvent => {
  const candidate = event as Partial<BeforeInstallPromptEvent>
  const userChoice = candidate.userChoice as { then?: unknown } | undefined
  return (
    typeof candidate.prompt === 'function' &&
    typeof userChoice?.then === 'function'
  )
}

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)

  const [isReady, setIsReady] = useState(false)
  const [isStandalone, setIsStandalone] = useState(() => isStandaloneDisplayMode())
  const [isInstalled, setIsInstalled] = useState(
    () => isStandaloneDisplayMode() || readPwaInstalledFlag(),
  )
  const [isIOS, setIsIOS] = useState(false)

  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const isPromptingRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let isMounted = true

    const ua = window.navigator.userAgent.toLowerCase()
    setIsIOS(/iphone|ipad|ipod/.test(ua))

    const updateStatus = () => {
      if (!isMounted) return

      const standalone = isStandaloneDisplayMode()
      setIsStandalone(standalone)
      if (standalone) {
        setIsInstalled(true)
        setIsReady(false)
        setInstallPrompt(null)
        promptRef.current = null
        persistPwaInstalledFlag()
      }
    }

    updateStatus()

    const handleBeforeInstallPrompt = (event: Event) => {
      if (!isMounted || isInstalled) return
      event.preventDefault()

      if (!isValidBeforeInstallPromptEvent(event)) {
        logger.warn('Received malformed beforeinstallprompt event')
        return
      }

      promptRef.current = event
      setInstallPrompt(event)
      setIsReady(true)
    }

    const handleInstalled = () => {
      if (!isMounted) return
      setIsInstalled(true)
      setIsReady(false)
      setInstallPrompt(null)
      promptRef.current = null
      isPromptingRef.current = false
      persistPwaInstalledFlag()
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    window.addEventListener('visibilitychange', updateStatus)

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null

    const mediaHandler = () => updateStatus()

    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', mediaHandler)
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(mediaHandler)
      }
    }

    return () => {
      isMounted = false
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      window.removeEventListener('visibilitychange', updateStatus)

      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', mediaHandler)
        } else if (typeof mediaQuery.removeListener === 'function') {
          mediaQuery.removeListener(mediaHandler)
        }
      }
    }
  }, [isInstalled])

  const install = useCallback(async () => {
    const prompt = promptRef.current

    if (!prompt || isPromptingRef.current || isInstalled) return false

    try {
      isPromptingRef.current = true

      await prompt.prompt()
      const choice = await prompt.userChoice

      if (choice.outcome === 'accepted') {
        setIsInstalled(true)
        setInstallPrompt(null)
        setIsReady(false)
        promptRef.current = null
        persistPwaInstalledFlag()
        return true
      }

      return false
    } catch (error) {
      logger.error('PWA install prompt failed', { error })
      return false
    } finally {
      isPromptingRef.current = false
    }
  }, [isInstalled])

  const canInstall = Boolean(installPrompt) && !isInstalled

  return {
    isReady,
    isInstalled,
    isStandalone,
    isIOS,
    canInstall,
    needsManualInstall: isIOS && !isStandalone,
    supportsNativeInstall: canInstall,
    install,
  }
}
