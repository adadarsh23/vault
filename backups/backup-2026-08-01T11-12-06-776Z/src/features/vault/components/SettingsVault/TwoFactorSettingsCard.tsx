import React, { useState } from 'react'
import { Shield, Smartphone, QrCode, Clipboard, Check, RefreshCw, X, AlertTriangle, Download, Trash2, Key } from 'lucide-react'
import { SectionCard, StatCard, ActionButton } from './SharedComponents'
import { SETTINGS_PANEL, SETTINGS_PANEL_SOFT } from './Utils'
import { motion, AnimatePresence } from 'framer-motion'
import { setup2FA, verify2FASetup, disable2FA } from '../../../../lib/auth-api'
import { toast } from 'sonner'
import { handleError } from '../../../../lib/error-handler'

interface TwoFactorSettingsCardProps {
  twoFactorEnabled: boolean
  onUpdate: () => void
}

export const TwoFactorSettingsCard: React.FC<TwoFactorSettingsCardProps> = ({ twoFactorEnabled, onUpdate }) => {
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [isDisabling, setIsDisabling] = useState(false)
  const [loading, setLoading] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [otpToken, setOtpToken] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)

  const handleStartSetup = async () => {
    try {
      setLoading(true)
      const data = await setup2FA()
      setQrCode(data.qrCodeUrl)
      setSecret(data.secret)
      setIsSettingUp(true)
    } catch (error) {
      handleError(error, '2FA Setup')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifySetup = async () => {
    if (!otpToken) return
    try {
      setLoading(true)
      const data = await verify2FASetup(otpToken)
      setBackupCodes(data.backupCodes)
      toast.success('2FA enabled successfully!')
      onUpdate()
    } catch (error) {
      handleError(error, '2FA Verification')
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async () => {
    if (!otpToken) {
      toast.error('Please enter OTP to disable 2FA')
      return
    }
    try {
      setLoading(true)
      await disable2FA(otpToken)
      toast.success('2FA disabled')
      setIsDisabling(false)
      setOtpToken('')
      onUpdate()
    } catch (error) {
      handleError(error, '2FA Disable')
    } finally {
      setLoading(false)
    }
  }

  const downloadBackupCodes = () => {
    if (!backupCodes) return
    const content = `VAULT BACKUP CODES\nGenerated: ${new Date().toLocaleString()}\n\n${backupCodes.join('\n')}\n\nKeep these codes in a secure place. Each code can be used only once.`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vault-backup-codes.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Backup codes downloaded')
  }

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <SectionCard
      title="2FA"
      description="Add an extra layer of protection to your vault using industry-standard Time-based One-Time Passwords (TOTP). Backup codes provide emergency access if you lose your device."
    >
      <div className="space-y-5">
        <div className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="2FA Status"
            value={twoFactorEnabled ? 'Enabled' : 'Disabled'}
            hint={twoFactorEnabled ? 'Secure TOTP active' : 'Account is unprotected'}
            icon={Shield}
            iconClassName={twoFactorEnabled ? 'text-green-400' : 'text-yellow-500'}
          />
          <StatCard
            label="Method"
            value="Authenticator"
            hint="Google/Microsoft"
            icon={Smartphone}
          />
          <StatCard
            label="Recovery"
            value="Backup Codes"
            hint="One-time use"
            icon={Key}
          />
        </div>

        <div className={`${SETTINGS_PANEL} space-y-6 overflow-hidden`}>
          <AnimatePresence mode="wait">
            {!isSettingUp && !isDisabling && !backupCodes && (
              <motion.div
                key="main"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
                    <Shield className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-text">Authenticator App</h4>
                    <p className="mt-1 text-xs leading-5 text-text/45 max-w-sm">
                      Protect your vault with 2FA. Every time you sign in, you'll be asked for a code from your authenticator app.
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 gap-3">
                  {twoFactorEnabled ? (
                    <ActionButton
                      icon={Trash2}
                      label="Disable 2FA"
                      onClick={() => setIsDisabling(true)}
                      variant="ghost"
                      className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    />
                  ) : (
                    <ActionButton
                      icon={RefreshCw}
                      label="Enable 2FA"
                      onClick={handleStartSetup}
                      loading={loading}
                    />
                  )}
                </div>
              </motion.div>
            )}

            {isSettingUp && !backupCodes && (
              <motion.div
                key="setup"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-blue-400">
                    <QrCode className="h-4 w-4" />
                    Setup 2FA Authenticator
                  </h3>
                  <button
                    onClick={() => setIsSettingUp(false)}
                    className="p-1 text-text/30 hover:text-text/80 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex flex-col md:flex-row gap-8">
                  <div className="flex flex-col items-center gap-4 shrink-0">
                    <div className="bg-white p-3 rounded-2xl">
                      {qrCode ? (
                        <img src={qrCode} alt="2FA QR Code" className="w-40 h-40" />
                      ) : (
                        <div className="w-40 h-40 flex items-center justify-center">
                          <RefreshCw className="h-8 w-8 animate-spin text-black/10" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-text/30">Scan QR Code</p>
                      <button
                        onClick={handleStartSetup}
                        disabled={loading}
                        className="p-1 text-text/20 hover:text-blue-400 transition-colors disabled:opacity-50"
                        title="Regenerate QR Code"
                      >
                        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 space-y-6">
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-text/80">Step 1: Save manual secret (Optional)</p>
                      <div className={`flex items-center gap-3 ${SETTINGS_PANEL_SOFT} px-4 py-3`}>
                        <code className="text-xs font-mono text-blue-300/80 flex-1 truncate">{secret}</code>
                        <button
                          onClick={copySecret}
                          className="p-1 text-text/40 hover:text-blue-400 transition-colors"
                        >
                          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Clipboard className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-text/80">Step 2: Enter validation code</p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="000 000"
                          className={`${SETTINGS_PANEL_SOFT} flex-1 px-4 py-3 font-mono text-lg tracking-[0.4em] text-center outline-none focus:ring-1 focus:ring-blue-500/50`}
                          value={otpToken}
                          onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        />
                        <ActionButton
                          icon={Check}
                          label="Verify"
                          onClick={handleVerifySetup}
                          disabled={otpToken.length < 6}
                          loading={loading}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {backupCodes && (
              <motion.div
                key="backup"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                <div className="rounded-2xl bg-green-500/5 border border-green-500/20 p-5">
                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-500/20 text-green-400">
                      <Check className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-green-400">2FA successfully activated</h4>
                      <p className="text-xs leading-5 text-text/45">
                        Save these backup codes immediately. They are the only way to access your vault if you lose your authenticator device.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {backupCodes.map((code, i) => (
                    <div key={i} className={`${SETTINGS_PANEL_SOFT} py-2.5 text-center font-mono text-[13px] text-green-300/70 border border-green-500/10`}>
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-white/5">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-yellow-500/70 bg-yellow-500/5 px-3 py-2 rounded-lg border border-yellow-500/10">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Each code can only be used once
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <ActionButton
                      icon={Download}
                      label="Download Codes"
                      onClick={downloadBackupCodes}
                    />
                    <ActionButton
                      icon={Check}
                      label="Dismiss"
                      onClick={() => {
                        setBackupCodes(null)
                        setIsSettingUp(false)
                        setOtpToken('')
                      }}
                      variant="ghost"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {isDisabling && (
              <motion.div
                key="disable"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-red-400">
                    Deactivate 2FA protection
                  </h3>
                  <button
                    onClick={() => setIsDisabling(false)}
                    className="p-1 text-text/30 hover:text-text/80 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <p className="text-xs leading-5 text-text/45">
                  Confirm deactivation by entering a valid code from your authenticator app or one of your backup codes.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    placeholder="Enter Code"
                    className={`${SETTINGS_PANEL_SOFT} flex-1 px-4 py-3 font-mono text-center outline-none focus:ring-1 focus:ring-red-500/50`}
                    value={otpToken}
                    onChange={(e) => setOtpToken(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8))}
                  />
                  <ActionButton
                    icon={Trash2}
                    label="Confirm Disable"
                    onClick={handleDisable}
                    disabled={otpToken.length < 6}
                    loading={loading}
                    variant="danger"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </SectionCard>
  )
}
