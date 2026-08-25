import React from 'react';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useScrollLock } from '../../../../hooks/useScrollLock';

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
}) => {
  useScrollLock(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-session-title"
    >
      <div
        className="w-full max-w-md my-auto max-h-[90vh] overflow-y-auto custom-scrollbar rounded-2xl sm:rounded-[2rem] border border-card-border bg-card-bg dark:border-white/10 dark:bg-black p-4 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 sm:mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-text/5 px-2.5 py-0.5 sm:px-3 sm:py-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.2em] text-text/40 mb-2 sm:mb-3">
            Device Configuration
          </div>
          <h3 id="rename-session-title" className="text-lg sm:text-xl font-bold text-text">
            Rename {renamingSession.isCurrent ? 'Current Session' : 'Device'}
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-text/45 leading-relaxed">
            Give this session a recognizable name to help identify it in your vault activity and
            secure logs.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5 sm:space-y-2">
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
              className="h-11 sm:h-12 rounded-xl sm:rounded-2xl bg-white/5 border-white/10 text-text focus:border-text/30 text-xs sm:text-sm"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-2">
            <Button
              variant="outline"
              className="w-full sm:flex-1 justify-center h-10 sm:h-11 rounded-xl text-xs sm:text-sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              className="w-full sm:flex-1 justify-center h-10 sm:h-11 rounded-xl text-xs sm:text-sm font-semibold"
              onClick={() => onSave(renamingSession.id, renameDraft)}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
