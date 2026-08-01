import React from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '../../../../components/ui/Button'

interface EmergencyDestructionCardProps {
  destructionStage: 'idle' | 'confirm' | 'final'
  isDestroyingVault: boolean
  onEmergencyClear: () => Promise<void>
  onAbort: () => void
}

export const EmergencyDestructionCard: React.FC<EmergencyDestructionCardProps> = ({
  destructionStage,
  isDestroyingVault,
  onEmergencyClear,
  onAbort,
}) => (
  <section className="overflow-hidden rounded-[1.7rem] bg-gradient-to-br from-red-500/12 via-transparent to-amber-500/8 p-4 shadow-[0_28px_60px_-34px_rgba(127,29,29,0.35)] ring-1 ring-red-500/15 backdrop-blur-sm sm:p-6">
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="inline-flex items-center gap-2 rounded-full bg-red-500/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-red-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          Danger
        </div>
        <h3 className="mt-4 text-xl font-bold tracking-tight text-text sm:text-2xl">
          Emergency Destruction
        </h3>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-text/65">
          Permanently erase every protected record from local storage and
          cloud storage.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-bg/55 p-4 ring-1 ring-red-500/10 backdrop-blur-sm dark:bg-black/35">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text/35">
              Local Storage
            </p>
            <p className="mt-2 text-sm font-semibold text-text">
              Permanently cleared
            </p>
          </div>
          <div className="rounded-2xl bg-bg/55 p-4 ring-1 ring-red-500/10 backdrop-blur-sm dark:bg-black/35">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text/35">
              Cloud Data
            </p>
            <p className="mt-2 text-sm font-semibold text-text">
              Records deleted
            </p>
          </div>
          <div className="rounded-2xl bg-bg/55 p-4 ring-1 ring-red-500/10 backdrop-blur-sm dark:bg-black/35">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text/35">
              Recovery
            </p>
            <p className="mt-2 text-sm font-semibold text-text">
              Not recoverable
            </p>
          </div>
        </div>
      </div>

      <div className="w-full rounded-[1.4rem] bg-black/20 p-4 ring-1 ring-white/8 backdrop-blur-sm sm:p-5 lg:max-w-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300/90">
          {destructionStage === 'idle'
            ? 'Before You Continue'
            : destructionStage === 'confirm'
              ? 'Wait - Confirmation Required'
              : 'FINAL OVERRIDE'}
        </p>
        <div className="mt-3 space-y-2 text-sm leading-6 text-text/70">
          {destructionStage === 'idle' ? (
            <ul className="list-disc space-y-1 pl-5">
              <li>Export a backup if you may need this vault later.</li>
              <li>Make sure all trusted devices are no longer in use.</li>
              <li>Confirm you want both local and cloud data removed.</li>
            </ul>
          ) : destructionStage === 'confirm' ? (
            <>
              <p className="font-bold text-red-400">
                Phase 1: Readiness check.
              </p>
              <p>
                Acknowledge that this action is irreversible and cannot be
                undone.
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-red-500">
                Phase 2: Final destruction override.
              </p>
              <p>
                Click the button below to permanently purge all data
                immediately.
              </p>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Button
            variant="danger"
            size="lg"
            onClick={onEmergencyClear}
            className="w-full justify-center"
            disabled={isDestroyingVault}
          >
            {isDestroyingVault ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Destroying Vault Data...
              </>
            ) : destructionStage === 'idle' ? (
              <>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Destroy Vault Data
              </>
            ) : destructionStage === 'confirm' ? (
              'Confirm: Initial Step'
            ) : (
              'Final Confirm: Purge Everything'
            )}
          </Button>

          {destructionStage !== 'idle' && (
            <Button
              variant="ghost"
              onClick={onAbort}
              className="w-full justify-center text-xs text-text/40 hover:text-text"
              disabled={isDestroyingVault}
            >
              Abort and return to settings
            </Button>
          )}
        </div>
      </div>
    </div>
  </section>
)
