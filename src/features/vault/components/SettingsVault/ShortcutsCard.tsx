import React from 'react'
import { Keyboard, Type, Edit3, Download, MousePointer2 } from 'lucide-react'
import { SectionCard, ShortcutCard } from './SharedComponents'

export const ShortcutsCard: React.FC = () => (
  <SectionCard
    title="Controls & Shortcuts"
    description="Essential keyboard shortcuts and interaction patterns for secure vault operations, item management, and content editing."
  >
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text/30">
          <Keyboard className="h-3.5 w-3.5" />
          Vault Operations
        </h3>
        <div className="space-y-2">
          <ShortcutCard
            label="Quick Search"
            keys={['Ctrl', 'F']}
            description="Open search to find items, folders, or notes"
          />
          <ShortcutCard
            label="Create New Item"
            keys={['Ctrl', 'N']}
            description="Quickly create a new vault record or note"
          />
          <ShortcutCard
            label="Lock Vault"
            keys={['Ctrl', 'L']}
            description="Immediately lock the vault and clear memory"
          />
          <ShortcutCard
            label="Copy to Clipboard"
            keys={['Ctrl', 'C']}
            description="Securely copy selected content to clipboard"
          />
          <ShortcutCard
            label="Delete Item"
            keys={['Delete']}
            description="Move selected item to trash"
          />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text/30">
          <Type className="h-3.5 w-3.5" />
          Navigation & Views
        </h3>
        <div className="space-y-2">
          <ShortcutCard
            label="Next / Previous Item"
            keys={['←', '→']}
            description="Cycle through items in current view or folder"
          />
          <ShortcutCard
            label="Select All Items"
            keys={['Ctrl', 'A']}
            description="Select all items in the current folder"
          />
          <ShortcutCard
            label="Toggle List / Grid"
            keys={['Ctrl', 'M']}
            description="Switch between list and grid view"
          />
          <ShortcutCard
            label="Toggle Full Screen"
            keys={['F11']}
            description="Enter or exit full-screen mode"
          />
          <ShortcutCard
            label="Go Back / Forward"
            keys={['Alt', '←', '→']}
            description="Navigate through folder history"
          />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text/30">
          <Edit3 className="h-3.5 w-3.5" />
          Text & Content Editing
        </h3>
        <div className="space-y-2">
          <ShortcutCard
            label="Undo / Redo"
            keys={['Ctrl', 'Z', '/', 'Ctrl', 'Y']}
            description="Undo or redo recent text changes"
          />
          <ShortcutCard
            label="Bold / Italic"
            keys={['Ctrl', 'B', '/', 'Ctrl', 'I']}
            description="Apply bold or italic formatting"
          />
          <ShortcutCard
            label="Create Link"
            keys={['Ctrl', 'K']}
            description="Insert or edit markdown link"
          />
          <ShortcutCard
            label="Code Block"
            keys={['Ctrl', 'Shift', 'C']}
            description="Insert inline code or code block"
          />
          <ShortcutCard
            label="Save Changes"
            keys={['Ctrl', 'S']}
            description="Save current note or record"
          />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text/30">
          <Download className="h-3.5 w-3.5" />
          Export & Security
        </h3>
        <div className="space-y-2">
          <ShortcutCard
            label="Export Item"
            keys={['Ctrl', 'E']}
            description="Export selected item as file"
          />
          <ShortcutCard
            label="Duplicate Item"
            keys={['Ctrl', 'D']}
            description="Create encrypted copy of item"
          />
          <ShortcutCard
            label="Print / Export PDF"
            keys={['Ctrl', 'P']}
            description="Print or save item as PDF"
          />
          <ShortcutCard
            label="Copy Password"
            keys={['Ctrl', 'Shift', 'C']}
            description="Copy password to clipboard safely"
          />
          <ShortcutCard
            label="Generate Credential"
            keys={['Ctrl', 'G']}
            description="Generate secure random password"
          />
        </div>
      </div>

      <div className="space-y-3 xl:col-span-2">
        <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text/30">
          <MousePointer2 className="h-3.5 w-3.5" />
          Touch & Mouse Gestures
        </h3>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <ShortcutCard
            label="Drag & Drop"
            keys={['Drag Files']}
            description="Drop files to encrypt and upload"
          />
          <ShortcutCard
            label="Category Move"
            keys={['Drag Item']}
            description="Drag to move between folders"
          />
          <ShortcutCard
            label="Swipe Left/Right"
            keys={['Swipe L/R']}
            description="Browse through media items"
          />
          <ShortcutCard
            label="Swipe Up/Down"
            keys={['Swipe U/D']}
            description="Scroll or change views"
          />
          <ShortcutCard
            label="Long Press"
            keys={['Hold Click']}
            description="Show context menu or preview"
          />
          <ShortcutCard
            label="Double Click"
            keys={['Double Tap']}
            description="Open/expand item details"
          />
        </div>
      </div>
    </div>
  </SectionCard>
)
