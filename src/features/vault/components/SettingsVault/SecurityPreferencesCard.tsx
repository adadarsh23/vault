import React, { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/Card';
import { DurationSelector } from './DurationSelector';
import { ToggleRow } from './ToggleRow';

interface SecurityPreferences {
  isClipboardAutoClearEnabled: boolean;
  clipboardAutoClearDuration: number;
  isActivityLoggingEnabled: boolean;
  isMaskPasswordsEnabled: boolean;
}

interface SecurityPreferencesCardProps {
  preferences: SecurityPreferences;
  updatePreferences: (updates: Partial<SecurityPreferences>) => void;
}

export const SecurityPreferencesCard: React.FC<SecurityPreferencesCardProps> = memo(
  ({ preferences, updatePreferences }) => (
    <Card className="border-card-border bg-card-bg">
      <CardHeader>
        <CardTitle className="text-lg">Security Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <ToggleRow
            title="Clipboard auto-clear"
            description="Clear secrets from clipboard after use"
            isActive={preferences.isClipboardAutoClearEnabled}
            onToggle={(value) => updatePreferences({ isClipboardAutoClearEnabled: value })}
          />

          {preferences.isClipboardAutoClearEnabled && (
            <DurationSelector
              options={[10, 30, 60, 120]}
              current={preferences.clipboardAutoClearDuration}
              onChange={(seconds: number) =>
                updatePreferences({ clipboardAutoClearDuration: seconds })
              }
              formatLabel={(seconds: number) =>
                seconds < 60 ? `${seconds}s` : seconds === 60 ? '1m' : '2m'
              }
            />
          )}
        </div>

        <ToggleRow
          title="Obscure sensitive fields"
          description="Mask all passwords and secrets automatically"
          isActive={preferences.isMaskPasswordsEnabled}
          onToggle={(value) => updatePreferences({ isMaskPasswordsEnabled: value })}
        />

        <ToggleRow
          title="Stealth mode (No logs)"
          description="Disable activity and audit logging completely"
          isActive={!preferences.isActivityLoggingEnabled}
          activeColor="bg-purple-500"
          onToggle={(value) => updatePreferences({ isActivityLoggingEnabled: !value })}
        />
      </CardContent>
    </Card>
  )
);

SecurityPreferencesCard.displayName = 'SecurityPreferencesCard';
