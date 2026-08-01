import React, { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Download,
  Upload,
  Key,
  Check,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { RecaptchaField } from '../security/RecaptchaField'
import { useVaultStore } from '../../store/vaultStore'
import { toast } from 'sonner'
import {
  generateFormattedPassword,
  normalizeGeneratedCredentialLength,
  validatePassword,
} from '../../lib/utils'
import {
  changeAccountPassword,
  verifyMasterKeyChangeCaptcha,
} from '../../lib/auth-api'
import { useRecaptchaChallenge } from '../../hooks/useRecaptchaChallenge'
import { useScrollLock } from '../../hooks/useScrollLock'

interface MaintenanceModalProps {
  isOpen: boolean
  onClose: () => void
  type: 'export' | 'import' | 'changeKey' | 'changePassword'
}

export const MaintenanceModal: React.FC<MaintenanceModalProps> = ({
  isOpen,
  onClose,
  type,
}) => {
  const SUCCESS_ANIMATION_DELAY_MS = 900
  const GENERATION_WINDOW_MS = 60_000
  const GENERATION_COOLDOWN_MS = 4_000
  const GENERATION_MAX_ATTEMPTS = 8
  const {
    exportVaultData,
    importVaultData,
    changeMasterKey,
    preferences,
    fullLogout,
  } = useVaultStore()
  const generatedCredentialLength = normalizeGeneratedCredentialLength(
    preferences.generatedCredentialLength || 16,
  )
  const [step, setStep] = useState(1)
  const [progress, setProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)

  // Password / Key state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newKey, setNewKey] = useState('')
  const [confirmKey, setConfirmKey] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewKey, setShowNewKey] = useState(false)
  const [showConfirmKey, setShowConfirmKey] = useState(false)
  const [generationCooldownUntil, setGenerationCooldownUntil] = useState(0)
  const generationAttemptTimestampsRef = useRef<number[]>([])
  const {
    token: captchaToken,
    isCompleted: isCaptchaCompleted,
    resetNonce: captchaResetNonce,
    feedback: captchaFeedback,
    handleTokenChange: handleCaptchaTokenChange,
    handleExpired: handleCaptchaExpired,
    handleError: handleCaptchaError,
    resetChallenge: resetCaptchaChallenge,
    setRejected: setCaptchaRejected,
  } = useRecaptchaChallenge()
  const requiresCaptcha = type === 'changePassword' || type === 'changeKey'

  const currentPasswordRef = useRef<HTMLInputElement>(null)
  const newKeyRef = useRef<HTMLInputElement>(null)
  const confirmKeyRef = useRef<HTMLInputElement>(null)
  const titleId = 'maintenance-modal-title'
  const descriptionId = 'maintenance-modal-description'

  useScrollLock(isOpen)

  useLayoutEffect(() => {
    if (isOpen && step === 1) {
      if (type === 'changePassword') currentPasswordRef.current?.focus()
      if (type === 'changeKey') newKeyRef.current?.focus()
    }
  }, [isOpen, step, type])

  // File import state
  const [importFile, setImportFile] = useState<File | null>(null)

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setStep(1)
      setProgress(0)
      setIsProcessing(false)
      setCurrentPassword('')
      setNewKey('')
      setConfirmKey('')
      setImportFile(null)
      setShowCurrentPassword(false)
      setShowNewKey(false)
      setShowConfirmKey(false)
      setGenerationCooldownUntil(0)
      generationAttemptTimestampsRef.current = []
      resetCaptchaChallenge()
    }
  }, [isOpen, resetCaptchaChallenge])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isProcessing) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isProcessing, onClose])

  const timeoutRef = useRef<number | null>(null)

  const canGenerateCredentialNow = (): boolean => {
    const now = Date.now()
    if (now < generationCooldownUntil) {
      const remainingSeconds = Math.max(
        1,
        Math.ceil((generationCooldownUntil - now) / 1000),
      )
      toast.info(`Please wait ${remainingSeconds}s before regenerating.`)
      return false
    }

    const recentAttempts = generationAttemptTimestampsRef.current.filter(
      (timestamp) => now - timestamp <= GENERATION_WINDOW_MS,
    )

    if (recentAttempts.length >= GENERATION_MAX_ATTEMPTS) {
      const resetAt = recentAttempts[0] + GENERATION_WINDOW_MS
      const remainingSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000))
      setGenerationCooldownUntil(resetAt)
      generationAttemptTimestampsRef.current = recentAttempts
      toast.error(
        `Generation limit reached. Try again in ${remainingSeconds}s.`,
      )
      return false
    }

    generationAttemptTimestampsRef.current = [...recentAttempts, now]
    setGenerationCooldownUntil(now + GENERATION_COOLDOWN_MS)
    return true
  }

  const generateSecureKey = () => {
    if (!canGenerateCredentialNow()) {
      return
    }

    const key = generateFormattedPassword(generatedCredentialLength)
    setNewKey(key)
    setConfirmKey(key)
    setShowNewKey(true)
    setShowConfirmKey(true)

    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(key)

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => {
      setShowNewKey(false)
      setShowConfirmKey(false)
    }, 10000)
  }

  // Clear on modal close
  useEffect(() => {
    if (!isOpen && timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [isOpen])

  const handleExport = async () => {
    setIsProcessing(true)
    setStep(2)

    try {
      // Export vault data with progress callback
      const data = await exportVaultData((done, total) => {
        const percentage = total ? Math.round((done / total) * 100) : 0
        setProgress(percentage)
      })

      // Create a Blob and object URL safely
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      // Create a temporary download link
      const link = document.createElement('a')
      link.href = url
      link.download = `vault-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)

      // Trigger download
      link.click()

      // Clean up
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setStep(3)
      toast.success('Vault exported successfully')
    } catch (err) {
      console.error('Export failed:', err)
      toast.error('Vault export failed. Please try again.')
      setStep(1)
    } finally {
      // Reset progress and processing state
      setIsProcessing(false)
      setProgress(0)
    }
  }

  const handleImport = async () => {
    if (!importFile) {
      toast.error('No file selected')
      return
    }

    if (!importFile.name.endsWith('.json')) {
      toast.error('Please select a JSON file')
      return
    }

    setIsProcessing(true)
    setStep(2)

    const reader = new FileReader()

    reader.onload = async (event: ProgressEvent<FileReader>) => {
      try {
        const text = event.target?.result
        if (!text) throw new Error('File is empty')

        let content: any
        try {
          content = JSON.parse(text as string)
        } catch {
          throw new Error('Invalid JSON format')
        }

        if (!Array.isArray(content)) {
          throw new Error('Expected an array of items')
        }

        // Import with progress
        await importVaultData(content, (done, total) => {
          const percentage = total ? Math.round((done / total) * 100) : 0
          setProgress(percentage)
        })

        setStep(3)
        toast.success(`Imported ${content.length} items successfully`)
      } catch (err: any) {
        console.error('Import error:', err)
        toast.error(`Import failed: ${err.message || 'Unknown error'}`)
        setStep(1)
      } finally {
        setIsProcessing(false)
        setProgress(0)
      }
    }

    reader.onerror = () => {
      toast.error('Failed to read file')
      setIsProcessing(false)
      setProgress(0)
    }

    reader.readAsText(importFile)
  }
  const handleChangeKey = async () => {
    if (!newKey || !confirmKey)
      return toast.error('New key and confirmation required')
    if (newKey.length < 16)
      return toast.error('Master key must be 16+ characters')
    if (newKey !== confirmKey) return toast.error('Keys do not match')
    if (!isCaptchaCompleted || !captchaToken)
      return toast.error('Please complete CAPTCHA before continuing.')

    const validation = validatePassword(newKey)
    if (!validation.isValid)
      return toast.error('Requirement Error', { description: validation.error })

    setIsProcessing(true)
    setStep(2)
    try {
      await verifyMasterKeyChangeCaptcha(captchaToken)
      await changeMasterKey(newKey, (done, total) =>
        setProgress(Math.round((done / total) * 100)),
      )
      setStep(3)
      resetCaptchaChallenge()
      toast.success('Master key changed successfully')
      await new Promise((resolve) =>
        window.setTimeout(resolve, SUCCESS_ANIMATION_DELAY_MS),
      )
      // Perform immediate, single logout to avoid stale-session race conditions.
      fullLogout({ skipServerLogout: true })
      onClose()
      toast.info('Please sign in again with your new master key.')
    } catch (err) {
      console.error(err)
      setCaptchaRejected(
        'Security verification failed. Complete CAPTCHA and retry.',
      )
      toast.error('Failed to change master key')
      setStep(1)
    } finally {
      setIsProcessing(false)
      setProgress(0)
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword) return toast.error('Current password is required')
    if (!newKey || !confirmKey)
      return toast.error('New password and confirmation required')
    if (newKey !== confirmKey)
      return toast.error('New password and confirmation do not match')
    if (!isCaptchaCompleted || !captchaToken)
      return toast.error('Please complete CAPTCHA before continuing.')

    const validation = validatePassword(newKey)
    if (!validation.isValid)
      return toast.error('Requirement Error', { description: validation.error })

    setIsProcessing(true)
    setStep(2)
    try {
      await changeAccountPassword(currentPassword, newKey, captchaToken)
      setStep(3)
      resetCaptchaChallenge()
      toast.success('Account password changed successfully')
      await new Promise((resolve) =>
        window.setTimeout(resolve, SUCCESS_ANIMATION_DELAY_MS),
      )
      // Perform immediate, single logout to avoid stale-session race conditions.
      fullLogout({ skipServerLogout: true })
      onClose()
      toast.info('Please sign in again with your new account password.')
    } catch (err: any) {
      console.error(err)
      const message =
        typeof err?.message === 'string' ? err.message.toLowerCase() : ''
      const code = typeof err?.code === 'string' ? err.code : ''

      setCaptchaRejected(
        'Security verification failed. Complete CAPTCHA again.',
      )

      if (
        code === 'INVALID_CREDENTIALS' ||
        message.includes('current password is incorrect')
      ) {
        toast.error('Current password is incorrect')
      } else if (code === 'PASSWORD_UNCHANGED') {
        toast.error('New password must be different from current password')
      } else if (code === 'AUTH_WEAK_PASSWORD') {
        toast.error('New password does not meet security requirements')
      } else if (code === 'TOO_MANY_PASSWORD_CHANGE_ATTEMPTS') {
        toast.error('Too many password change attempts. Please wait and retry.')
      } else {
        toast.error('Failed to change account password')
      }
      setStep(1)
    } finally {
      setIsProcessing(false)
      setProgress(0)
    }
  }

  if (!isOpen) return null

  const modalTitle =
    type === 'export'
      ? 'Export Vault'
      : type === 'import'
        ? 'Import Vault'
        : type === 'changeKey'
          ? 'Change Master Key'
          : 'Change Account Password'

  const modalDescription =
    type === 'export'
      ? 'Create a secure backup of your encrypted data.'
      : type === 'import'
        ? 'Restore data from a previously exported backup only.'
        : type === 'changeKey'
          ? 'Update your master key and re-encrypt all items.'
          : 'Update the password you use to sign in to this vault.'

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain p-3 sm:items-center sm:p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={!isProcessing ? onClose : undefined}
          className="absolute inset-0 bg-bg/80 backdrop-blur-md"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="relative my-4 w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain rounded-3xl border border-card-border bg-card-bg p-4 shadow-2xl transition-colors sm:p-6 md:p-8"
        >
          {!isProcessing && (
            <button
              onClick={onClose}
              aria-label="Close maintenance dialog"
              className="absolute right-4 top-4 text-text/20 transition-colors hover:text-text sm:right-6 sm:top-6"
            >
              <X className="h-6 w-6" />
            </button>
          )}

          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (step !== 1) return
              if (type === 'export') await handleExport()
              else if (type === 'import') await handleImport()
              else if (type === 'changePassword') await handleChangePassword()
              else if (type === 'changeKey') await handleChangeKey()
            }}
            className="space-y-6"
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-text/5 text-text sm:h-16 sm:w-16">
                {type === 'export' && (
                  <Download className="h-8 w-8 text-blue-400" />
                )}
                {type === 'import' && (
                  <Upload className="h-8 w-8 text-green-400" />
                )}
                {type === 'changeKey' && (
                  <Key className="h-8 w-8 text-amber-400" />
                )}
                {type === 'changePassword' && (
                  <Key className="h-8 w-8 text-emerald-400" />
                )}
              </div>

              <div>
                <h2
                  id={titleId}
                  className="text-xl font-bold text-text sm:text-2xl"
                >
                  {modalTitle}
                </h2>
                <p id={descriptionId} className="text-sm text-text/50">
                  {modalDescription}
                </p>
              </div>
            </div>

            <div className="min-h-[120px] flex flex-col justify-center">
              {step === 1 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  {type === 'export' && (
                    <div className="space-y-4">
                      <div className="rounded-xl bg-blue-500/5 p-4 border border-blue-500/10">
                        <p className="text-xs text-blue-400/80 leading-relaxed">
                          The exported file will be a JSON document containing
                          your items in their current encrypted state. You will
                          need your current master key to decrypt it after
                          importing.
                        </p>
                      </div>
                      <div className="flex items-start gap-2 rounded-xl bg-amber-500/5 p-3 border border-amber-500/10">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-500/80 leading-relaxed">
                          Ensure you are importing the JSON file into the same
                          account using the same Master Key that was active when
                          you exported the backup.
                          <br />
                          <br />
                          If you changed/rotated your key via{' '}
                          <code className="bg-amber-500/10 px-1 py-0.5 rounded text-[10px] font-mono text-amber-400 font-semibold">
                            Change Master Key
                          </code>
                          , the rotation process uses{' '}
                          <code className="bg-amber-500/10 px-1 py-0.5 rounded text-[10px] font-mono text-amber-400 font-semibold">
                            Reencrypt Vault Item Content
                          </code>{' '}
                          to successfully re-encrypt existing database records.
                          However, this does not update previously exported JSON
                          backups. You must generate a fresh export after
                          rotating your key.
                        </p>
                      </div>
                    </div>
                  )}

                  {type === 'import' && (
                    <div className="space-y-4">
                      <div
                        className="group relative flex h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all"
                        onClick={() =>
                          document.getElementById('import-file-input')?.click()
                        }
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          const file = e.dataTransfer.files[0]
                          if (file) setImportFile(file)
                        }}
                      >
                        <input
                          id="import-file-input"
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={(e) =>
                            setImportFile(e.target.files?.[0] || null)
                          }
                        />
                        {importFile ? (
                          <>
                            <Check className="mb-2 h-8 w-8 text-green-400" />
                            <p className="text-sm font-medium text-text">
                              {importFile.name}
                            </p>
                            <p className="text-[10px] text-text/40">
                              {(importFile.size / 1024).toFixed(1)} KB
                            </p>
                          </>
                        ) : (
                          <>
                            <Upload className="mb-2 h-8 w-8 text-text/10 group-hover:text-text/30 transition-colors" />
                            <p className="text-sm font-medium text-text/40">
                              Click to select backup file
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {type === 'changeKey' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label
                          htmlFor="new-master-key"
                          className="text-[10px] font-bold uppercase tracking-widest text-text/30"
                        >
                          New Master Key
                        </label>
                        <div className="relative">
                          <Input
                            id="new-master-key"
                            type={showNewKey ? 'text' : 'password'}
                            autoComplete="new-password"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder="********"
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            ref={newKeyRef}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                confirmKeyRef.current?.focus()
                              }
                            }}
                            className="pr-20 bg-white/5 border-white/10"
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setShowNewKey(!showNewKey)}
                              className="p-1.5 text-text/20 hover:text-text/60 transition-colors"
                              aria-label={
                                showNewKey ? 'Hide new key' : 'Show new key'
                              }
                            >
                              {showNewKey ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={generateSecureKey}
                              className="p-1.5 text-text/20 hover:text-blue-500/60 transition-colors"
                              aria-label="Generate secure key"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label
                          htmlFor="confirm-new-key"
                          className="text-[10px] font-bold uppercase tracking-widest text-text/30"
                        >
                          Confirm New Key
                        </label>
                        <div className="relative">
                          <Input
                            id="confirm-new-key"
                            type={showConfirmKey ? 'text' : 'password'}
                            autoComplete="new-password"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder="********"
                            value={confirmKey}
                            onChange={(e) => setConfirmKey(e.target.value)}
                            ref={confirmKeyRef}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleChangeKey()
                              }
                            }}
                            className="pr-10 bg-white/5 border-white/10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmKey(!showConfirmKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text/20 hover:text-text/60 transition-colors"
                            aria-label={
                              showConfirmKey
                                ? 'Hide confirm key'
                                : 'Show confirm key'
                            }
                          >
                            {showConfirmKey ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] text-text/40 -mt-2">
                        Requires: 16+ chars, Capital start, Number, Special
                        char. Generated length: {generatedCredentialLength}
                      </div>
                      <div className="flex items-start gap-2 rounded-xl bg-amber-500/5 p-3 border border-amber-500/10">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-amber-500/80 leading-relaxed">
                          Changing your master key requires re-encrypting every
                          item in your vault. This process cannot be interrupted
                          once started.
                        </p>
                      </div>
                    </div>
                  )}

                  {type === 'changePassword' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label
                          htmlFor="current-account-password"
                          className="text-[10px] font-bold uppercase tracking-widest text-text/30"
                        >
                          Current Account Password
                        </label>
                        <div className="relative">
                          <Input
                            id="current-account-password"
                            type={showCurrentPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder="Enter your current sign-in password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            ref={currentPasswordRef}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                newKeyRef.current?.focus()
                              }
                            }}
                            className="pr-10 bg-white/5 border-white/10"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowCurrentPassword(!showCurrentPassword)
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text/20 hover:text-text/60 transition-colors"
                            aria-label={
                              showCurrentPassword
                                ? 'Hide current password'
                                : 'Show current password'
                            }
                          >
                            {showCurrentPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label
                          htmlFor="new-account-password"
                          className="text-[10px] font-bold uppercase tracking-widest text-text/30"
                        >
                          New Account Password
                        </label>
                        <div className="relative">
                          <Input
                            id="new-account-password"
                            type={showNewKey ? 'text' : 'password'}
                            autoComplete="new-password"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder="Enter a new sign-in password"
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            ref={newKeyRef}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                confirmKeyRef.current?.focus()
                              }
                            }}
                            className="pr-20 bg-white/5 border-white/10"
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setShowNewKey(!showNewKey)}
                              className="p-1.5 text-text/20 hover:text-text/60 transition-colors"
                              aria-label={
                                showNewKey
                                  ? 'Hide new password'
                                  : 'Show new password'
                              }
                            >
                              {showNewKey ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={generateSecureKey}
                              className="p-1.5 text-text/20 hover:text-emerald-500/60 transition-colors"
                              aria-label="Generate secure password"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label
                          htmlFor="confirm-new-password"
                          className="text-[10px] font-bold uppercase tracking-widest text-text/30"
                        >
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <Input
                            id="confirm-new-password"
                            type={showConfirmKey ? 'text' : 'password'}
                            autoComplete="new-password"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder="Confirm the new sign-in password"
                            value={confirmKey}
                            onChange={(e) => setConfirmKey(e.target.value)}
                            ref={confirmKeyRef}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleChangePassword()
                              }
                            }}
                            className="pr-10 bg-white/5 border-white/10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmKey(!showConfirmKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text/20 hover:text-text/60 transition-colors"
                            aria-label={
                              showConfirmKey
                                ? 'Hide confirm password'
                                : 'Show confirm password'
                            }
                          >
                            {showConfirmKey ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] text-text/40 -mt-2">
                        Requires: 16+ chars, Capital start, Number, Special
                        char. Generated length: {generatedCredentialLength}
                      </div>
                      <div className="flex items-start gap-2 rounded-xl bg-emerald-500/5 p-3 border border-emerald-500/10">
                        <AlertTriangle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-emerald-500/80 leading-relaxed">
                          This changes only your account sign-in password. Your
                          Master Key and encrypted vault data remain unchanged.
                        </p>
                      </div>
                    </div>
                  )}
                  {requiresCaptcha && (
                    <RecaptchaField
                      id="maintenance-recaptcha"
                      token={captchaToken}
                      status={captchaFeedback.status}
                      message={captchaFeedback.message}
                      resetNonce={captchaResetNonce}
                      onChange={handleCaptchaTokenChange}
                      onExpired={handleCaptchaExpired}
                      onError={handleCaptchaError}
                      disabled={isProcessing}
                    />
                  )}
                </motion.div>
              )}

              {step === 2 && (
                <div className="space-y-6 py-4">
                  <div className="flex items-center justify-between text-xs font-medium text-text/40 uppercase tracking-widest">
                    <span>{progress < 100 ? 'Processing...' : 'Ready'}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-black/20">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ ease: 'easeOut', duration: 0.3 }}
                      className="h-full transition-colors bg-white"
                    />
                  </div>
                  <p className="text-center text-[10px] text-text/30 animate-pulse">
                    Please do not close the tab or window
                  </p>
                </div>
              )}

              {step === 3 && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center justify-center py-4 gap-4"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-400">
                    <Check className="h-8 w-8" />
                  </div>
                  <p className="text-sm font-medium text-text">
                    Process Completed Successfully
                  </p>
                  <Button
                    variant="ghost"
                    className="mt-2"
                    onClick={onClose}
                    type="button"
                  >
                    Close
                  </Button>
                </motion.div>
              )}
            </div>

            {step === 1 && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="secondary"
                  className="w-full sm:flex-1"
                  onClick={onClose}
                  type="button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  aria-busy={isProcessing}
                  className={`w-full text-white sm:flex-1 ${
                    type === 'export'
                      ? 'bg-blue-500 hover:bg-blue-600'
                      : type === 'import'
                        ? 'bg-green-500 hover:bg-green-600'
                        : type === 'changePassword'
                          ? 'bg-emerald-500 hover:bg-emerald-600'
                          : 'bg-amber-500 hover:bg-amber-600'
                  }`}
                  disabled={
                    isProcessing ||
                    (type === 'import'
                      ? !importFile
                      : type === 'changeKey'
                        ? !newKey || !confirmKey || !isCaptchaCompleted
                        : type === 'changePassword'
                          ? !currentPassword ||
                            !newKey ||
                            !confirmKey ||
                            !isCaptchaCompleted
                          : false)
                  }
                >
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Initializing...
                    </span>
                  ) : type === 'export' ? (
                    'Start Export'
                  ) : type === 'import' ? (
                    'Start Import'
                  ) : type === 'changeKey' ? (
                    'Update Key'
                  ) : (
                    'Update Password'
                  )}
                </Button>
              </div>
            )}
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
