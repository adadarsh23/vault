import React, { memo } from 'react';
import { Fingerprint, KeyRound, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/Card';

export const AdvancedAuthCard: React.FC = memo(() => (
  <Card className="border-card-border bg-card-bg">
    <CardHeader>
      <CardTitle className="text-lg flex items-center gap-2">
        <Shield className="h-5 w-5 text-violet-400" />
        Advanced Authentication
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
        <p className="text-sm font-bold text-text">Coming Next</p>
        <p className="mt-2 text-sm text-text/60">
          Multi-factor authentication and passkey-based login are planned for a future hardening
          pass.
        </p>
      </div>

      <div className="grid gap-3">
        <div className="rounded-xl border border-white/5 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-sm font-bold text-text">TOTP 2FA</p>
              <p className="mt-1 text-xs text-text/50">
                Add time-based one-time codes for step-up verification during login.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <Fingerprint className="h-5 w-5 text-cyan-400" />
            <div>
              <p className="text-sm font-bold text-text">WebAuthn / Passkeys</p>
              <p className="mt-1 text-xs text-text/50">
                Bind trusted devices with phishing-resistant passkeys and security keys.
              </p>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
));

AdvancedAuthCard.displayName = 'AdvancedAuthCard';
