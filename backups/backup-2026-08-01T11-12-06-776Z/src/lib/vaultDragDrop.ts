import type React from 'react'

const VAULT_ITEM_DRAG_TYPE = 'application/x-my-vault-item'
const VAULT_ITEM_PLAIN_PREFIX = 'vault-item:'
const MAX_VAULT_ITEM_ID_LENGTH = 256
const DRAG_FALLBACK_TTL_MS = 30_000

type DragDataTransferLike = Pick<
  DataTransfer,
  'effectAllowed' | 'setData' | 'getData' | 'types'
>

type DragEventLike =
  | Pick<React.DragEvent<HTMLElement>, 'dataTransfer'>
  | { dataTransfer?: DragDataTransferLike | null }

type DragFallbackState = {
  itemId: string
  expiresAt: number
}

let dragFallbackState: DragFallbackState | null = null

const setDragFallback = (itemId: string) => {
  dragFallbackState = {
    itemId,
    expiresAt: Date.now() + DRAG_FALLBACK_TTL_MS,
  }
}

const getDragFallback = (): string | null => {
  if (!dragFallbackState) {
    return null
  }

  if (Date.now() > dragFallbackState.expiresAt) {
    dragFallbackState = null
    return null
  }

  return dragFallbackState.itemId
}

const normalizeVaultItemId = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_VAULT_ITEM_ID_LENGTH) {
    return null
  }

  // Reject control characters in drag payloads.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return null
  }

  return trimmed
}

const safeGetData = (
  dataTransfer: DragDataTransferLike,
  format: string,
): string => {
  try {
    return dataTransfer.getData(format)
  } catch {
    return ''
  }
}

const dragTypesContain = (
  types: DataTransfer['types'] | undefined,
  expectedType: string,
): boolean => {
  if (!types) {
    return false
  }
  return Array.from(types as ArrayLike<string>).includes(expectedType)
}

export const clearDraggedVaultItem = () => {
  dragFallbackState = null
}

export const setDraggedVaultItem = (
  event: DragEventLike,
  itemId: string,
): boolean => {
  const normalizedItemId = normalizeVaultItemId(itemId)
  if (!normalizedItemId) {
    return false
  }

  setDragFallback(normalizedItemId)

  const dataTransfer = event.dataTransfer
  if (!dataTransfer) {
    return true
  }

  try {
    dataTransfer.effectAllowed = 'move'
    dataTransfer.setData(VAULT_ITEM_DRAG_TYPE, normalizedItemId)
    dataTransfer.setData('text/plain', `${VAULT_ITEM_PLAIN_PREFIX}${normalizedItemId}`)
    return true
  } catch {
    return true
  }
}

/* ─────────────────────────────────────────────────────────────
   PRODUCTION TOUCH / POINTER DRAG & DROP POLYFILL
   ───────────────────────────────────────────────────────────── */

type TouchIntent = 'undecided' | 'scroll' | 'drag'

let activeDragElement: HTMLElement | null = null
let pendingDragElement: HTMLElement | null = null
let dragGhost: HTMLElement | null = null

let touchStartOffset = { x: 0, y: 0 }
let touchStartPos = { x: 0, y: 0 }
let currentTouchY = 0

let lastTarget: Element | null = null
let lastMoveTime = 0
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let isDraggingActive = false
let touchIntent: TouchIntent = 'undecided'

let autoScrollRafId: number | null = null
let lastAnimationFrameTime = 0

const LONG_PRESS_MS = 200
const DRAG_HANDLE_DELAY_MS = 40
const MOVE_THRESHOLD_PX = 8
const VERTICAL_SCROLL_THRESHOLD_PX = 6
const THROTTLE_MS = 16
const EDGE_SCROLL_MARGIN_PX = 90
const MAX_SCROLL_SPEED_PX = 18

const cancelPendingTouch = () => {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  pendingDragElement = null
  touchIntent = 'undecided'
}

const stopAutoScroll = () => {
  if (autoScrollRafId !== null) {
    cancelAnimationFrame(autoScrollRafId)
    autoScrollRafId = null
  }
  lastAnimationFrameTime = 0
}

const findNearestScrollContainer = (el: Element | null): HTMLElement | null => {
  let curr: HTMLElement | null = el instanceof HTMLElement ? el : null
  while (curr && curr !== document.body && curr !== document.documentElement) {
    const style = window.getComputedStyle(curr)
    const overflowY = style.overflowY
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      curr.scrollHeight > curr.clientHeight
    ) {
      return curr
    }
    curr = curr.parentElement
  }
  return null
}

const startAutoScrollIfNeeded = () => {
  if (autoScrollRafId !== null) return

  lastAnimationFrameTime = performance.now()

  const autoScrollLoop = (now: number) => {
    if (!isDraggingActive || !dragGhost) {
      stopAutoScroll()
      return
    }

    const dt = Math.min((now - (lastAnimationFrameTime || now)) / 1000, 0.05) // cap frame delta
    lastAnimationFrameTime = now

    const viewportHeight = window.innerHeight
    let scrollDelta = 0

    if (currentTouchY < EDGE_SCROLL_MARGIN_PX) {
      // Near top edge
      const dist = Math.max(0, currentTouchY)
      const factor = Math.pow(1 - dist / EDGE_SCROLL_MARGIN_PX, 2)
      scrollDelta = -Math.round(factor * MAX_SCROLL_SPEED_PX * (dt * 60))
    } else if (currentTouchY > viewportHeight - EDGE_SCROLL_MARGIN_PX) {
      // Near bottom edge
      const dist = Math.max(0, viewportHeight - currentTouchY)
      const factor = Math.pow(1 - dist / EDGE_SCROLL_MARGIN_PX, 2)
      scrollDelta = Math.round(factor * MAX_SCROLL_SPEED_PX * (dt * 60))
    }

    if (scrollDelta !== 0) {
      // 1. Scroll window
      window.scrollBy(0, scrollDelta)

      // 2. Scroll active scroll container under touch
      const scrollContainer = findNearestScrollContainer(lastTarget)
      if (scrollContainer) {
        scrollContainer.scrollTop += scrollDelta
      }
    }

    autoScrollRafId = requestAnimationFrame(autoScrollLoop)
  }

  autoScrollRafId = requestAnimationFrame(autoScrollLoop)
}

const createDataTransfer = (): any => {
  try {
    return new DataTransfer()
  } catch {
    return {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: () => {},
      getData: () => '',
      types: [],
    }
  }
}

const createDragEvent = (type: string, dataTransfer?: any): Event => {
  const dt = dataTransfer || createDataTransfer()
  try {
    return new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
    })
  } catch {
    const event = document.createEvent('Event')
    event.initEvent(type, true, true)
    Object.defineProperty(event, 'dataTransfer', {
      value: dt,
      writable: true,
      configurable: true,
    })
    return event
  }
}

const isDropTarget = (el: Element): boolean => {
  const htmlEl = el as HTMLElement
  if (htmlEl.ondragover || htmlEl.ondrop) return true
  if (
    el.hasAttribute('ondragover') ||
    el.hasAttribute('ondrop') ||
    el.hasAttribute('onDragOver') ||
    el.hasAttribute('onDrop') ||
    el.hasAttribute('data-drop-target')
  ) {
    return true
  }
  const role = el.getAttribute('role')
  if (
    role === 'tab' ||
    role === 'button' ||
    role === 'treeitem' ||
    role === 'listitem' ||
    role === 'gridcell'
  ) {
    return true
  }
  if (
    el.classList.contains('drop-target') ||
    el.classList.contains('folder-item') ||
    el.classList.contains('vault-folder')
  ) {
    return true
  }
  return false
}

const findDropTarget = (startEl: Element | null): HTMLElement | null => {
  let curr: Element | null = startEl
  while (curr && curr !== document.body && curr !== document.documentElement) {
    if (isDropTarget(curr)) {
      return curr as HTMLElement
    }
    curr = curr.parentElement
  }
  return null
}

const startTouchDrag = (clientX: number, clientY: number) => {
  if (!pendingDragElement) return

  activeDragElement = pendingDragElement
  pendingDragElement = null
  isDraggingActive = true
  touchIntent = 'drag'

  activeDragElement.setAttribute('data-is-dragging', 'true')

  // Subtle haptic vibration feedback if supported
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(25)
    } catch {}
  }

  const rect = activeDragElement.getBoundingClientRect()
  touchStartOffset = {
    x: clientX - rect.left,
    y: clientY - rect.top,
  }

  // Create GPU-accelerated drag ghost
  dragGhost = activeDragElement.cloneNode(true) as HTMLElement
  dragGhost.style.position = 'fixed'
  dragGhost.style.width = `${rect.width}px`
  dragGhost.style.height = `${rect.height}px`
  dragGhost.style.left = '0px'
  dragGhost.style.top = '0px'
  dragGhost.style.transform = `translate3d(${clientX - touchStartOffset.x}px, ${clientY - touchStartOffset.y}px, 0) scale(1.04)`
  dragGhost.style.opacity = '0.9'
  dragGhost.style.pointerEvents = 'none'
  dragGhost.style.zIndex = '99999'
  dragGhost.style.willChange = 'transform'
  dragGhost.style.transition = 'transform 0.04s linear'
  dragGhost.style.boxShadow =
    '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(59, 130, 246, 0.6)'
  dragGhost.style.borderRadius = '1rem'
  dragGhost.style.backdropFilter = 'blur(12px)'
  document.body.appendChild(dragGhost)

  // Dispatch synthetic dragstart
  const dataTransfer = createDataTransfer()
  const dragStartEvent = createDragEvent('dragstart', dataTransfer)
  activeDragElement.dispatchEvent(dragStartEvent)

  startAutoScrollIfNeeded()
}

const handleTouchStart = (e: TouchEvent) => {
  if (e.touches.length !== 1) {
    cancelPendingTouch()
    return
  }

  const target = e.target as HTMLElement
  const draggableEl = target.closest('[draggable="true"], [draggable]') as HTMLElement | null
  if (!draggableEl) return

  // Check if touched an interactive control inside card unless marked as drag handle
  const isDragHandle = Boolean(target.closest('[data-drag-handle], .drag-handle'))
  const interactiveEl = target.closest('button, input, select, textarea, a[href]')
  if (!isDragHandle && interactiveEl && draggableEl.contains(interactiveEl)) {
    return
  }

  const touch = e.touches[0]
  touchStartPos = { x: touch.clientX, y: touch.clientY }
  currentTouchY = touch.clientY

  cancelPendingTouch()
  pendingDragElement = draggableEl
  touchIntent = 'undecided'

  const delay = isDragHandle ? DRAG_HANDLE_DELAY_MS : LONG_PRESS_MS
  longPressTimer = setTimeout(() => {
    startTouchDrag(touch.clientX, touch.clientY)
  }, delay)
}

const handleTouchMove = (e: TouchEvent) => {
  const touch = e.touches[0]
  if (!touch) return

  currentTouchY = touch.clientY

  // If user is swiping before drag activation
  if (!isDraggingActive && pendingDragElement) {
    const dx = touch.clientX - touchStartPos.x
    const dy = touch.clientY - touchStartPos.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    const dist = Math.hypot(dx, dy)

    // Direction lock: if movement is primarily vertical or exceeds vertical scroll threshold
    if (absDy > absDx || absDy > VERTICAL_SCROLL_THRESHOLD_PX || dist > MOVE_THRESHOLD_PX) {
      touchIntent = 'scroll'
      cancelPendingTouch()
    }
    return
  }

  // If intent was locked to scroll, return immediately for 0-latency native scrolling
  if (touchIntent === 'scroll') {
    return
  }

  if (!isDraggingActive || !activeDragElement || !dragGhost) return

  // Prevent default page scroll ONLY while actively dragging an item
  if (e.cancelable) {
    e.preventDefault()
  }

  const x = touch.clientX
  const y = touch.clientY

  const ghostX = x - touchStartOffset.x
  const ghostY = y - touchStartOffset.y
  dragGhost.style.transform = `translate3d(${ghostX}px, ${ghostY}px, 0) scale(1.04)`

  // Throttle drop target detection for maximum performance
  const now = Date.now()
  if (now - lastMoveTime < THROTTLE_MS) return
  lastMoveTime = now

  const elementUnder = document.elementFromPoint(x, y)
  if (!elementUnder) return

  const dropTarget = findDropTarget(elementUnder)

  if (dropTarget !== lastTarget) {
    if (lastTarget) {
      const dragLeaveEvent = createDragEvent('dragleave')
      lastTarget.dispatchEvent(dragLeaveEvent)
    }
    if (dropTarget) {
      const dragEnterEvent = createDragEvent('dragenter')
      dropTarget.dispatchEvent(dragEnterEvent)
    }
    lastTarget = dropTarget
  }

  if (dropTarget) {
    const dataTransfer = createDataTransfer()
    dataTransfer.dropEffect = 'move'
    const dragOverEvent = createDragEvent('dragover', dataTransfer)
    dropTarget.dispatchEvent(dragOverEvent)
  }
}

const handleTouchEnd = (e: TouchEvent) => {
  cancelPendingTouch()
  stopAutoScroll()

  if (activeDragElement) {
    activeDragElement.removeAttribute('data-is-dragging')
  }

  if (!isDraggingActive || !activeDragElement) {
    isDraggingActive = false
    return
  }

  const touch = e.changedTouches[0]
  if (touch) {
    const x = touch.clientX
    const y = touch.clientY
    const elementUnder = document.elementFromPoint(x, y)
    const dropTarget = findDropTarget(elementUnder)

    if (dropTarget) {
      const dataTransfer = createDataTransfer()
      dataTransfer.dropEffect = 'move'
      const dropEvent = createDragEvent('drop', dataTransfer)
      dropTarget.dispatchEvent(dropEvent)
    }
  }

  const dragEndEvent = createDragEvent('dragend')
  activeDragElement.dispatchEvent(dragEndEvent)

  // Cleanup
  if (dragGhost) {
    dragGhost.remove()
    dragGhost = null
  }
  activeDragElement = null
  lastTarget = null
  lastMoveTime = 0
  isDraggingActive = false
}

export const initTouchDragDrop = () => {
  if (typeof window === 'undefined') return

  // Window-level touch listeners
  window.addEventListener('touchstart', handleTouchStart, { passive: true })
  window.addEventListener('touchmove', handleTouchMove, { passive: false })
  window.addEventListener('touchend', handleTouchEnd, { passive: true })
  window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
}

export const getDraggedVaultItem = (
  event: DragEventLike,
): string | null => {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) {
    return getDragFallback()
  }

  const customId = normalizeVaultItemId(
    safeGetData(dataTransfer, VAULT_ITEM_DRAG_TYPE),
  )
  if (customId) {
    setDragFallback(customId)
    return customId
  }

  const plainValue = safeGetData(dataTransfer, 'text/plain')
  const prefixedPlainId = plainValue.startsWith(VAULT_ITEM_PLAIN_PREFIX)
    ? normalizeVaultItemId(plainValue.slice(VAULT_ITEM_PLAIN_PREFIX.length))
    : null
  if (prefixedPlainId) {
    setDragFallback(prefixedPlainId)
    return prefixedPlainId
  }

  if (dragTypesContain(dataTransfer.types, VAULT_ITEM_DRAG_TYPE)) {
    const legacyPlainId = normalizeVaultItemId(plainValue)
    if (legacyPlainId) {
      setDragFallback(legacyPlainId)
      return legacyPlainId
    }
  }

  return getDragFallback()
}
