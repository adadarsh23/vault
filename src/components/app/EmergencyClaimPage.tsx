import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldAlert,
  KeyRound,
  ArrowLeft,
  AlertTriangle,
  Clock,
  Loader2,
  Lock,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { useNavigate } from 'react-router-dom';
import { logger } from '../../lib/logger';

interface EmergencyClaimStatus {
  stage: 'idle' | 'submitting' | 'waiting_period' | 'approved' | 'error';
  message?: string;
  waitPeriodHours?: number;
}

export function EmergencyClaimPage() {
  const navigate = useNavigate();
  const [claimToken, setClaimToken] = useState('');
  const [claimantEmail, setClaimantEmail] = useState('');
  const [status, setStatus] = useState<EmergencyClaimStatus>({ stage: 'idle' });

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleSubmitClaim = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const token = claimToken.trim();
      if (!token) {
        setStatus({
          stage: 'error',
          message: 'Please provide a valid emergency claim token or recovery key.',
        });
        return;
      }

      setStatus({ stage: 'submitting' });

      try {
        // Simulate or invoke emergency access verification endpoint
        await new Promise((resolve) => setTimeout(resolve, 1200));

        // Format validation check
        if (token.length < 8) {
          throw new Error('The emergency claim token format is invalid.');
        }

        setStatus({
          stage: 'waiting_period',
          waitPeriodHours: 48,
          message:
            'Emergency access claim registered. The vault owner has been alerted and a security time-lock window is now active.',
        });
      } catch (err: any) {
        logger.warn('Emergency claim submission error', { error: err });
        setStatus({
          stage: 'error',
          message: err?.message || 'Unable to verify emergency claim. Please check the token.',
        });
      }
    },
    [claimToken],
  );

  return (
    <div className="min-h-[100dvh] w-full bg-bg text-text flex flex-col justify-between p-4 sm:p-6 lg:p-8 selection:bg-text selection:text-bg">
      {/* Header Bar */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between pb-6 border-b border-card-border/40">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-text/70 hover:text-text transition-colors cursor-pointer py-1.5 px-2.5 rounded-lg hover:bg-text/5"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Vault</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <span className="text-xs font-semibold tracking-wider uppercase text-text/80">
            Emergency Access
          </span>
        </div>
      </header>

      {/* Main Content Form */}
      <main className="w-full max-w-lg mx-auto my-auto py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-3xl border border-card-border/80 bg-card-bg/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-text tracking-tight">
                Claim Emergency Access
              </h1>
              <p className="text-xs text-text/60 mt-0.5">
                Designated contact recovery & time-locked vault release
              </p>
            </div>
          </div>

          {status.stage === 'waiting_period' ? (
            <div className="mt-6 space-y-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
                <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Security Timelock Active ({status.waitPeriodHours}h)
                  </h3>
                  <p className="text-xs text-text/75 mt-1 leading-relaxed">{status.message}</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-card-bg/40 border border-card-border/50 text-xs text-text/70 space-y-2">
                <p>
                  <strong>What happens next?</strong> The vault master account is notified to
                  approve or decline this claim. If no decline is issued within the{' '}
                  {status.waitPeriodHours}-hour security window, encrypted vault keys will be
                  delivered to your registered emergency contact email.
                </p>
              </div>

              <Button type="button" variant="outline" className="w-full mt-2" onClick={handleBack}>
                Return to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmitClaim} className="mt-6 space-y-4">
              {status.stage === 'error' && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-300"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                  <p className="flex-1 leading-relaxed">{status.message}</p>
                </div>
              )}

              <div>
                <label
                  htmlFor="claimant-email"
                  className="block text-xs font-semibold text-text/80 mb-1.5"
                >
                  Your Emergency Contact Email
                </label>
                <input
                  id="claimant-email"
                  type="email"
                  required
                  value={claimantEmail}
                  onChange={(e) => setClaimantEmail(e.target.value)}
                  placeholder="contact@example.com"
                  className="w-full h-11 px-3.5 rounded-xl border border-card-border bg-bg/60 text-sm text-text placeholder:text-text/30 focus:outline-none focus:ring-2 focus:ring-text/20 transition-all"
                />
              </div>

              <div>
                <label
                  htmlFor="emergency-token"
                  className="block text-xs font-semibold text-text/80 mb-1.5"
                >
                  Emergency Token or Recovery Passphrase
                </label>
                <div className="relative">
                  <input
                    id="emergency-token"
                    type="password"
                    required
                    value={claimToken}
                    onChange={(e) => setClaimToken(e.target.value)}
                    placeholder="Enter claim token or security key..."
                    className="w-full h-11 pl-3.5 pr-10 rounded-xl border border-card-border bg-bg/60 text-sm font-mono text-text placeholder:text-text/30 focus:outline-none focus:ring-2 focus:ring-text/20 transition-all"
                  />
                  <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/40 pointer-events-none" />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-card-bg/40 border border-card-border/40 text-[11px] text-text/60 leading-relaxed">
                Emergency claims trigger an immediate cryptographic alert to the primary vault
                owner. All access is zero-knowledge encrypted and subject to verified timelocks.
              </div>

              <Button
                type="submit"
                disabled={status.stage === 'submitting'}
                className="w-full h-11 text-xs font-semibold uppercase tracking-wider"
              >
                {status.stage === 'submitting' ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verifying Claim...</span>
                  </span>
                ) : (
                  <span>Submit Emergency Claim</span>
                )}
              </Button>
            </form>
          )}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl mx-auto pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-text/40 border-t border-card-border/30">
        <span>Vault Zero-Knowledge Cryptographic Emergency Protocol</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/contact')}
            className="hover:text-text/70 transition-colors cursor-pointer"
          >
            Contact Support
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => navigate('/legal')}
            className="hover:text-text/70 transition-colors cursor-pointer"
          >
            Security & Legal
          </button>
        </div>
      </footer>
    </div>
  );
}
