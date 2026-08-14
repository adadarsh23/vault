import React from 'react';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';

interface RenameSessionModalProps {
  renamingSession: { id: string; label: string; isCurrent?: boolean };
  renameDraft: string;
  setRenameDraft: (value: string) => void;
  onSave: (deviceId: string, label: string) => void;
  onCancel: () => void;
}

export const RenameSessionModal: React.FC<RenameSessionModalProps> = ({
  renamingSession,
  renameDraft,
  setRenameDraft,
  onSave,
  onCancel,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
    <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-black p-6 shadow-2xl animate-in zoom-in-95 duration-300">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-text/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-text/40 mb-3">
          Device Configuration
        </div>
        <h3 className="text-xl font-bold text-text">
          Rename {renamingSession.isCurrent ? 'Current Session' : 'Device'}
        </h3>
        <p className="mt-1 text-sm text-text/45">
          Give this session a recognizable name to help identify it in your vault activity and
          secure logs.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text/30 ml-1">
            Label Name
          </label>
          <Input
            autoFocus
            value={renameDraft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameDraft(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                onSave(renamingSession.id, renameDraft);
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }}
            placeholder="E.g. Work Macbook, Personal iPhone..."
            className="h-12 rounded-2xl bg-white/5 border-white/10 text-text focus:border-text/30"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            variant="secondary"
            className="flex-1 justify-center h-11 rounded-xl"
            onClick={() => onSave(renamingSession.id, renameDraft)}
          >
            Save
          </Button>
          <Button
            variant="outline"
            className="flex-1 justify-center h-11 rounded-xl"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  </div>
);
