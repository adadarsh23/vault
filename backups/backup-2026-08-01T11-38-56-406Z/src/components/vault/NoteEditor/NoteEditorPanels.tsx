import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp, Replace, ReplaceAll } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'

interface FindReplacePanelProps {
  findInputRef: React.RefObject<HTMLInputElement | null>
  findValue: string
  setFindValue: (value: string) => void
  replaceValue: string
  setReplaceValue: (value: string) => void
  matchCount: number
  activeMatchIndex: number
  setShowFindReplace: (show: boolean) => void
  goToPreviousMatch: () => void
  goToNextMatch: () => void
  applyReplaceOne: () => void
  applyReplaceAll: () => void
}

interface GoToLinePanelProps {
  goToLineValue: string
  setGoToLineValue: (value: string) => void
  goToLine: () => void
  setShowGoToLine: (show: boolean) => void
}

interface UrlInputPanelProps {
  placeholder: string
  value: string
  ariaLabel: string
  submitLabel: string
  onChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

interface NoteEditorPanelsProps {
  showFindReplace: boolean
  findReplace: FindReplacePanelProps
  showGoToLine: boolean
  goToLinePanel: GoToLinePanelProps
  showImageUrlInput: boolean
  imageUrlPanel: UrlInputPanelProps
  showLinkUrlInput: boolean
  linkUrlPanel: UrlInputPanelProps
}

const PanelShell: React.FC<{
  className: string
  children: React.ReactNode
}> = ({ className, children }) => (
  <motion.div
    initial={{ opacity: 0, y: -20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    className={className}
  >
    {children}
  </motion.div>
)

const FindReplacePanel: React.FC<FindReplacePanelProps> = ({
  findInputRef,
  findValue,
  setFindValue,
  replaceValue,
  setReplaceValue,
  matchCount,
  activeMatchIndex,
  setShowFindReplace,
  goToPreviousMatch,
  goToNextMatch,
  applyReplaceOne,
  applyReplaceAll,
}) => (
  <PanelShell className="relative z-20 m-2 w-auto max-w-3xl self-center rounded-xl border border-white/10 bg-bg/90 p-2 shadow-2xl backdrop-blur-md">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-col">
        <Input
          ref={findInputRef}
          placeholder="Find..."
          className="h-8 w-full text-xs sm:w-56"
          value={findValue}
          aria-label="Find text"
          onChange={(e) => setFindValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') goToNextMatch()
            if (e.key === 'Escape') setShowFindReplace(false)
          }}
        />
        <Input
          placeholder="Replace..."
          className="h-8 w-full text-xs sm:w-56"
          value={replaceValue}
          aria-label="Replace text"
          onChange={(e) => setReplaceValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyReplaceOne()
            if (e.key === 'Escape') setShowFindReplace(false)
          }}
        />
      </div>
      <div className="flex flex-nowrap items-center justify-start gap-1 overflow-x-auto">
        <div className="min-w-[3.5rem] shrink-0 px-1 text-center text-xs text-text/60">
          {matchCount ? `${activeMatchIndex + 1}/${matchCount}` : '0/0'}
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={goToPreviousMatch}
          title="Previous match"
          aria-label="Previous match"
          className="h-8 w-8 shrink-0"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={goToNextMatch}
          title="Next match"
          aria-label="Next match"
          className="h-8 w-8 shrink-0"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          onClick={applyReplaceOne}
          title="Replace one"
          aria-label="Replace one"
          className="h-8 w-8 shrink-0"
        >
          <Replace className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          onClick={applyReplaceAll}
          title="Replace all"
          aria-label="Replace all"
          className="h-8 w-8 shrink-0"
        >
          <ReplaceAll className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  </PanelShell>
)

const GoToLinePanel: React.FC<GoToLinePanelProps> = ({
  goToLineValue,
  setGoToLineValue,
  goToLine,
  setShowGoToLine,
}) => (
  <PanelShell className="relative z-20 mx-2 mb-2 flex w-auto max-w-xs self-center items-center gap-2 rounded-xl border border-white/10 bg-bg/90 p-2 shadow-2xl backdrop-blur-md">
    <Input
      placeholder="Line number..."
      className="h-8 w-full text-xs"
      value={goToLineValue}
      aria-label="Go to line number"
      onChange={(e) => setGoToLineValue(e.target.value)}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === 'Enter') goToLine()
        if (e.key === 'Escape') setShowGoToLine(false)
      }}
    />
    <Button size="sm" onClick={goToLine} className="h-8 px-3">
      Go
    </Button>
  </PanelShell>
)

const UrlInputPanel: React.FC<UrlInputPanelProps> = ({
  placeholder,
  value,
  ariaLabel,
  submitLabel,
  onChange,
  onSubmit,
  onClose,
}) => (
  <PanelShell className="relative z-20 mx-2 mb-2 flex w-auto max-w-md self-center items-center gap-2 rounded-xl border border-white/10 bg-bg/90 p-2 shadow-2xl backdrop-blur-md">
    <Input
      placeholder={placeholder}
      className="h-8 w-full text-xs"
      value={value}
      aria-label={ariaLabel}
      maxLength={2048}
      onChange={(e) => onChange(e.target.value)}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit()
        if (e.key === 'Escape') onClose()
      }}
    />
    <Button size="sm" onClick={onSubmit} className="h-8 px-3">
      {submitLabel}
    </Button>
  </PanelShell>
)

export const NoteEditorPanels: React.FC<NoteEditorPanelsProps> = ({
  showFindReplace,
  findReplace,
  showGoToLine,
  goToLinePanel,
  showImageUrlInput,
  imageUrlPanel,
  showLinkUrlInput,
  linkUrlPanel,
}) => (
  <AnimatePresence>
    {showFindReplace && <FindReplacePanel {...findReplace} />}
    {showGoToLine && <GoToLinePanel {...goToLinePanel} />}
    {showImageUrlInput && <UrlInputPanel {...imageUrlPanel} />}
    {showLinkUrlInput && <UrlInputPanel {...linkUrlPanel} />}
  </AnimatePresence>
)
