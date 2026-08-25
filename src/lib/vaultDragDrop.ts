import { useState, useEffect } from 'react';
import type React from 'react';

export const VAULT_ITEM_DRAG_TYPE = 'application/x-my-vault-item';
export const VAULT_ITEMS_DRAG_TYPE = 'application/x-my-vault-items';
export const VAULT_ITEM_PLAIN_PREFIX = 'vault-item:';
export const VAULT_ITEMS_PLAIN_PREFIX = 'vault-items:';
const MAX_VAULT_ITEM_ID_LENGTH = 256;
const DRAG_FALLBACK_TTL_MS = 30_000;

type DragDataTransferLike = Pick<
  DataTransfer,
  'effectAllowed' | 'setData' | 'getData' | 'types'
> & {
  setDragImage?: (image: Element, x: number, y: number) => void;
};

type DragEventLike =
  | Pick<React.DragEvent<HTMLElement>, 'dataTransfer'>
  | { dataTransfer?: DragDataTransferLike | null };

type DragFallbackState = {
  itemId: string;
  itemIds: string[];
  expiresAt: number;
};

let dragFallbackState: DragFallbackState | null = null;

const setDragFallback = (itemIds: string[]) => {
  if (itemIds.length === 0) return;
  dragFallbackState = {
    itemId: itemIds[0],
    itemIds,
    expiresAt: Date.now() + DRAG_FALLBACK_TTL_MS,
  };
};

const getDragFallbackItems = (): string[] => {
  if (!dragFallbackState) {
    return [];
  }

  if (Date.now() > dragFallbackState.expiresAt) {
    dragFallbackState = null;
    return [];
  }

  return dragFallbackState.itemIds || (dragFallbackState.itemId ? [dragFallbackState.itemId] : []);
};

const normalizeVaultItemId = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_VAULT_ITEM_ID_LENGTH) {
    return null;
  }

  // Reject control characters in drag payloads.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return null;
  }

  return trimmed;
};

const normalizeVaultItemIds = (value: string | string[]): string[] => {
  if (Array.isArray(value)) {
    const deduped = Array.from(
      new Set(
        value
          .map((id) => (typeof id === 'string' ? normalizeVaultItemId(id) : null))
          .filter((id): id is string => id !== null),
      ),
    );
    return deduped;
  }

  const single = normalizeVaultItemId(value);
  return single ? [single] : [];
};

const safeGetData = (dataTransfer: DragDataTransferLike, format: string): string => {
  try {
    return dataTransfer.getData(format);
  } catch {
    return '';
  }
};

const dragTypesContain = (
  types: DataTransfer['types'] | undefined,
  expectedType: string,
): boolean => {
  if (!types) {
    return false;
  }
  return Array.from(types as ArrayLike<string>).includes(expectedType);
};

export const clearDraggedVaultItem = () => {
  dragFallbackState = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vault-drag-end'));
  }
};

export const setDraggedVaultItems = (
  event: DragEventLike,
  itemIdOrIds: string | string[],
): boolean => {
  const normalizedIds = normalizeVaultItemIds(itemIdOrIds);
  if (normalizedIds.length === 0) {
    return false;
  }

  setDragFallback(normalizedIds);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('vault-drag-start', {
        detail: { itemIds: normalizedIds, count: normalizedIds.length },
      }),
    );
  }

  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) {
    return true;
  }

  try {
    dataTransfer.effectAllowed = 'move';
    dataTransfer.setData(VAULT_ITEM_DRAG_TYPE, normalizedIds[0]);
    dataTransfer.setData(VAULT_ITEMS_DRAG_TYPE, JSON.stringify(normalizedIds));

    if (normalizedIds.length > 1) {
      dataTransfer.setData('text/plain', `${VAULT_ITEMS_PLAIN_PREFIX}${normalizedIds.join(',')}`);
    } else {
      dataTransfer.setData('text/plain', `${VAULT_ITEM_PLAIN_PREFIX}${normalizedIds[0]}`);
    }
    return true;
  } catch {
    return true;
  }
};

export const setDraggedVaultItem = (
  event: DragEventLike,
  itemIdOrIds: string | string[],
): boolean => {
  return setDraggedVaultItems(event, itemIdOrIds);
};

export const createMultiItemDragImage = (count: number, label = 'items'): HTMLElement => {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '99999';
  container.innerHTML = `
    <div style="position: relative; width: 144px; height: 86px; pointer-events: none;">
      <div style="position: absolute; inset: 0; transform: rotate(-4deg) translateY(-2px); border-radius: 12px; background: rgba(10, 10, 10, 0.8); border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 10px 25px rgba(0,0,0,0.6);"></div>
      <div style="position: absolute; inset: 0; transform: rotate(2deg) translateY(2px); border-radius: 12px; background: rgba(15, 15, 15, 0.9); border: 1px solid rgba(255, 255, 255, 0.4); box-shadow: 0 10px 25px rgba(0,0,0,0.6);"></div>
      <div style="position: absolute; inset: 0; border-radius: 12px; background: rgba(0, 0, 0, 0.96); border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 255, 255, 0.25); backdrop-filter: blur(16px);">
        <div style="display: flex; align-items: center; gap: 8px; color: #ffffff; font-weight: 700; font-size: 13px; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
            <circle cx="9" cy="9" r="2"/>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
          </svg>
          <span>Moving ${count} ${label}</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(container);
  return container;
};

/* ─────────────────────────────────────────────────────────────
   PRODUCTION TOUCH / POINTER DRAG & DROP POLYFILL
   ───────────────────────────────────────────────────────────── */

type TouchIntent = 'undecided' | 'scroll' | 'drag';

let activeDragElement: HTMLElement | null = null;
let pendingDragElement: HTMLElement | null = null;
let dragGhost: HTMLElement | null = null;

let touchStartOffset = { x: 0, y: 0 };
let touchStartPos = { x: 0, y: 0 };
let currentTouchY = 0;

let lastTarget: Element | null = null;
let lastMoveTime = 0;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let isDraggingActive = false;
let touchIntent: TouchIntent = 'undecided';

let autoScrollRafId: number | null = null;
let lastAnimationFrameTime = 0;

const LONG_PRESS_MS = 200;
const DRAG_HANDLE_DELAY_MS = 40;
const MOVE_THRESHOLD_PX = 8;
const VERTICAL_SCROLL_THRESHOLD_PX = 6;
const THROTTLE_MS = 16;
const EDGE_SCROLL_MARGIN_PX = 90;
const MAX_SCROLL_SPEED_PX = 18;

const cancelPendingTouch = () => {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  pendingDragElement = null;
  touchIntent = 'undecided';
};

const stopAutoScroll = () => {
  if (autoScrollRafId !== null) {
    cancelAnimationFrame(autoScrollRafId);
    autoScrollRafId = null;
  }
  lastAnimationFrameTime = 0;
};

const findNearestScrollContainer = (el: Element | null): HTMLElement | null => {
  let curr: HTMLElement | null = el instanceof HTMLElement ? el : null;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    const style = window.getComputedStyle(curr);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && curr.scrollHeight > curr.clientHeight) {
      return curr;
    }
    curr = curr.parentElement;
  }
  return null;
};

const startAutoScrollIfNeeded = () => {
  if (autoScrollRafId !== null) return;

  lastAnimationFrameTime = performance.now();

  const autoScrollLoop = (now: number) => {
    if (!isDraggingActive || !dragGhost) {
      stopAutoScroll();
      return;
    }

    const dt = Math.min((now - (lastAnimationFrameTime || now)) / 1000, 0.05); // cap frame delta
    lastAnimationFrameTime = now;

    const viewportHeight = window.innerHeight;
    let scrollDelta = 0;

    if (currentTouchY < EDGE_SCROLL_MARGIN_PX) {
      // Near top edge
      const dist = Math.max(0, currentTouchY);
      const factor = Math.pow(1 - dist / EDGE_SCROLL_MARGIN_PX, 2);
      scrollDelta = -Math.round(factor * MAX_SCROLL_SPEED_PX * (dt * 60));
    } else if (currentTouchY > viewportHeight - EDGE_SCROLL_MARGIN_PX) {
      // Near bottom edge
      const dist = Math.max(0, viewportHeight - currentTouchY);
      const factor = Math.pow(1 - dist / EDGE_SCROLL_MARGIN_PX, 2);
      scrollDelta = Math.round(factor * MAX_SCROLL_SPEED_PX * (dt * 60));
    }

    if (scrollDelta !== 0) {
      // 1. Scroll window
      window.scrollBy(0, scrollDelta);

      // 2. Scroll active scroll container under touch
      const scrollContainer = findNearestScrollContainer(lastTarget);
      if (scrollContainer) {
        scrollContainer.scrollTop += scrollDelta;
      }
    }

    autoScrollRafId = requestAnimationFrame(autoScrollLoop);
  };

  autoScrollRafId = requestAnimationFrame(autoScrollLoop);
};

const createDataTransfer = (): any => {
  try {
    return new DataTransfer();
  } catch {
    return {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: () => {},
      getData: () => '',
      types: [],
    };
  }
};

const createDragEvent = (type: string, dataTransfer?: any): Event => {
  const dt = dataTransfer || createDataTransfer();
  try {
    return new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
    });
  } catch {
    const event = document.createEvent('Event');
    event.initEvent(type, true, true);
    Object.defineProperty(event, 'dataTransfer', {
      value: dt,
      writable: true,
      configurable: true,
    });
    return event;
  }
};

const isDropTarget = (el: Element): boolean => {
  const htmlEl = el as HTMLElement;
  if (
    el.hasAttribute('data-drop-target') ||
    el.getAttribute('data-drop-target') === 'true' ||
    el.classList.contains('drop-target') ||
    el.classList.contains('folder-drop-zone') ||
    el.classList.contains('vault-folder')
  ) {
    return true;
  }
  if (
    htmlEl.ondragover ||
    htmlEl.ondrop ||
    el.hasAttribute('ondragover') ||
    el.hasAttribute('ondrop') ||
    el.hasAttribute('onDragOver') ||
    el.hasAttribute('onDrop')
  ) {
    return true;
  }
  return false;
};

const findDropTarget = (startEl: Element | null): HTMLElement | null => {
  let curr: Element | null = startEl;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    if (isDropTarget(curr)) {
      return curr as HTMLElement;
    }
    curr = curr.parentElement;
  }
  return null;
};

const startTouchDrag = (clientX: number, clientY: number) => {
  if (!pendingDragElement) return;

  activeDragElement = pendingDragElement;
  pendingDragElement = null;
  isDraggingActive = true;
  touchIntent = 'drag';

  activeDragElement.setAttribute('data-is-dragging', 'true');

  // Subtle haptic vibration feedback if supported
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(25);
    } catch {}
  }

  const rect = activeDragElement.getBoundingClientRect();
  touchStartOffset = {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };

  // Create GPU-accelerated drag ghost
  dragGhost = activeDragElement.cloneNode(true) as HTMLElement;
  dragGhost.style.position = 'fixed';
  dragGhost.style.width = `${rect.width}px`;
  dragGhost.style.height = `${rect.height}px`;
  dragGhost.style.left = '0px';
  dragGhost.style.top = '0px';
  dragGhost.style.transform = `translate3d(${clientX - touchStartOffset.x}px, ${clientY - touchStartOffset.y}px, 0) scale(1.04)`;
  dragGhost.style.opacity = '0.92';
  dragGhost.style.pointerEvents = 'none';
  dragGhost.style.zIndex = '99999';
  dragGhost.style.willChange = 'transform';
  dragGhost.style.transition = 'transform 0.04s linear';
  dragGhost.style.boxShadow =
    '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(255, 255, 255, 0.9), 0 0 25px rgba(255, 255, 255, 0.25)';
  dragGhost.style.borderRadius = '1rem';
  dragGhost.style.backdropFilter = 'blur(16px)';

  // Check if multiple items are dragged
  const fallbackItems = getDragFallbackItems();
  if (fallbackItems.length > 1) {
    const badge = document.createElement('div');
    badge.style.position = 'absolute';
    badge.style.top = '-8px';
    badge.style.right = '-8px';
    badge.style.backgroundColor = '#000000';
    badge.style.color = '#ffffff';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = 'bold';
    badge.style.padding = '3px 8px';
    badge.style.borderRadius = '9999px';
    badge.style.boxShadow = '0 4px 14px rgba(0,0,0,0.8), 0 0 10px rgba(255,255,255,0.4)';
    badge.style.border = '2px solid #ffffff';
    badge.style.zIndex = '100000';
    badge.innerText = `${fallbackItems.length}`;
    dragGhost.appendChild(badge);
  }

  document.body.appendChild(dragGhost);

  // Dispatch synthetic dragstart
  const dataTransfer = createDataTransfer();
  const dragStartEvent = createDragEvent('dragstart', dataTransfer);
  activeDragElement.dispatchEvent(dragStartEvent);

  startAutoScrollIfNeeded();
};

const handleTouchStart = (e: TouchEvent) => {
  if (e.touches.length !== 1) {
    cancelPendingTouch();
    return;
  }

  const target = e.target as HTMLElement;
  const draggableEl = target.closest('[draggable="true"], [draggable]') as HTMLElement | null;
  if (!draggableEl) return;

  // Check if touched an interactive control inside card unless marked as drag handle
  const isDragHandle = Boolean(target.closest('[data-drag-handle], .drag-handle'));
  const interactiveEl = target.closest('button, input, select, textarea, a[href]');
  if (!isDragHandle && interactiveEl && draggableEl.contains(interactiveEl)) {
    return;
  }

  const touch = e.touches[0];
  touchStartPos = { x: touch.clientX, y: touch.clientY };
  currentTouchY = touch.clientY;

  cancelPendingTouch();
  pendingDragElement = draggableEl;
  touchIntent = 'undecided';

  const delay = isDragHandle ? DRAG_HANDLE_DELAY_MS : LONG_PRESS_MS;
  longPressTimer = setTimeout(() => {
    startTouchDrag(touch.clientX, touch.clientY);
  }, delay);
};

const handleTouchMove = (e: TouchEvent) => {
  const touch = e.touches[0];
  if (!touch) return;

  currentTouchY = touch.clientY;

  // If user is swiping before drag activation
  if (!isDraggingActive && pendingDragElement) {
    const dx = touch.clientX - touchStartPos.x;
    const dy = touch.clientY - touchStartPos.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const dist = Math.hypot(dx, dy);

    // Direction lock: if movement is primarily vertical or exceeds vertical scroll threshold
    if (absDy > absDx || absDy > VERTICAL_SCROLL_THRESHOLD_PX || dist > MOVE_THRESHOLD_PX) {
      touchIntent = 'scroll';
      cancelPendingTouch();
    }
    return;
  }

  // If intent was locked to scroll, return immediately for 0-latency native scrolling
  if (touchIntent === 'scroll') {
    return;
  }

  if (!isDraggingActive || !activeDragElement || !dragGhost) return;

  // Prevent default page scroll ONLY while actively dragging an item
  if (e.cancelable) {
    e.preventDefault();
  }

  const x = touch.clientX;
  const y = touch.clientY;

  const ghostX = x - touchStartOffset.x;
  const ghostY = y - touchStartOffset.y;
  dragGhost.style.transform = `translate3d(${ghostX}px, ${ghostY}px, 0) scale(1.04)`;

  // Throttle drop target detection for maximum performance
  const now = Date.now();
  if (now - lastMoveTime < THROTTLE_MS) return;
  lastMoveTime = now;

  const elementUnder = document.elementFromPoint(x, y);
  if (!elementUnder) return;

  const dropTarget = findDropTarget(elementUnder);

  if (dropTarget !== lastTarget) {
    if (lastTarget) {
      const dragLeaveEvent = createDragEvent('dragleave');
      lastTarget.dispatchEvent(dragLeaveEvent);
    }
    if (dropTarget) {
      const dragEnterEvent = createDragEvent('dragenter');
      dropTarget.dispatchEvent(dragEnterEvent);
    }
    lastTarget = dropTarget;
  }

  if (dropTarget) {
    const dataTransfer = createDataTransfer();
    dataTransfer.dropEffect = 'move';
    const dragOverEvent = createDragEvent('dragover', dataTransfer);
    dropTarget.dispatchEvent(dragOverEvent);
  }
};

const handleTouchEnd = (e: TouchEvent) => {
  cancelPendingTouch();
  stopAutoScroll();

  if (activeDragElement) {
    activeDragElement.removeAttribute('data-is-dragging');
  }

  if (!isDraggingActive || !activeDragElement) {
    isDraggingActive = false;
    return;
  }

  const touch = e.changedTouches[0];
  if (touch) {
    const x = touch.clientX;
    const y = touch.clientY;
    const elementUnder = document.elementFromPoint(x, y);
    const dropTarget = findDropTarget(elementUnder);

    if (dropTarget) {
      const dataTransfer = createDataTransfer();
      dataTransfer.dropEffect = 'move';
      const dropEvent = createDragEvent('drop', dataTransfer);
      dropTarget.dispatchEvent(dropEvent);
    }
  }

  const dragEndEvent = createDragEvent('dragend');
  activeDragElement.dispatchEvent(dragEndEvent);

  // Cleanup
  if (dragGhost) {
    dragGhost.remove();
    dragGhost = null;
  }
  activeDragElement = null;
  lastTarget = null;
  lastMoveTime = 0;
  isDraggingActive = false;
  clearDraggedVaultItem();
};

export const initTouchDragDrop = () => {
  if (typeof window === 'undefined') return;

  // Window-level touch listeners
  window.addEventListener('touchstart', handleTouchStart, { passive: true });
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchend', handleTouchEnd, { passive: true });
  window.addEventListener('touchcancel', handleTouchEnd, { passive: true });
};

export const getDraggedVaultItems = (event: DragEventLike): string[] => {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) {
    return getDragFallbackItems();
  }

  // 1. Check custom items type (JSON array)
  const itemsJson = safeGetData(dataTransfer, VAULT_ITEMS_DRAG_TYPE);
  if (itemsJson) {
    try {
      const parsed = JSON.parse(itemsJson);
      const normalized = normalizeVaultItemIds(parsed);
      if (normalized.length > 0) {
        setDragFallback(normalized);
        return normalized;
      }
    } catch {
      // ignore
    }
  }

  // 2. Check custom single item type
  const customId = normalizeVaultItemId(safeGetData(dataTransfer, VAULT_ITEM_DRAG_TYPE));
  if (customId) {
    setDragFallback([customId]);
    return [customId];
  }

  // 3. Check plain text payload
  const plainValue = safeGetData(dataTransfer, 'text/plain');
  if (plainValue.startsWith(VAULT_ITEMS_PLAIN_PREFIX)) {
    const rawContent = plainValue.slice(VAULT_ITEMS_PLAIN_PREFIX.length);
    try {
      const parsed = JSON.parse(rawContent);
      const normalized = normalizeVaultItemIds(parsed);
      if (normalized.length > 0) {
        setDragFallback(normalized);
        return normalized;
      }
    } catch {
      const parts = rawContent
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const normalized = normalizeVaultItemIds(parts);
      if (normalized.length > 0) {
        setDragFallback(normalized);
        return normalized;
      }
    }
  }

  if (plainValue.startsWith(VAULT_ITEM_PLAIN_PREFIX)) {
    const prefixedPlainId = normalizeVaultItemId(plainValue.slice(VAULT_ITEM_PLAIN_PREFIX.length));
    if (prefixedPlainId) {
      setDragFallback([prefixedPlainId]);
      return [prefixedPlainId];
    }
  }

  // 4. Legacy plain id fallback
  if (
    dragTypesContain(dataTransfer.types, VAULT_ITEMS_DRAG_TYPE) ||
    dragTypesContain(dataTransfer.types, VAULT_ITEM_DRAG_TYPE)
  ) {
    const legacyPlainId = normalizeVaultItemId(plainValue);
    if (legacyPlainId) {
      setDragFallback([legacyPlainId]);
      return [legacyPlainId];
    }
  }

  return getDragFallbackItems();
};

export const getDraggedVaultItem = (event: DragEventLike): string | null => {
  const items = getDraggedVaultItems(event);
  return items.length > 0 ? items[0] : null;
};

export interface VaultDragState {
  isDragging: boolean;
  itemIds: string[];
  count: number;
}

export const useVaultDragState = (): VaultDragState => {
  const [dragState, setDragState] = useState<VaultDragState>(() => {
    const items = getDragFallbackItems();
    return {
      isDragging: items.length > 0,
      itemIds: items,
      count: items.length,
    };
  });

  useEffect(() => {
    const handleDragStart = (e: DragEvent) => {
      const items = getDraggedVaultItems({ dataTransfer: e.dataTransfer });
      if (items.length > 0) {
        setDragState({
          isDragging: true,
          itemIds: items,
          count: items.length,
        });
      }
    };

    const handleCustomStart = (e: Event) => {
      const customEvent = e as CustomEvent<{ itemIds: string[]; count: number }>;
      const items = customEvent.detail?.itemIds || [];
      if (items.length > 0) {
        setDragState({
          isDragging: true,
          itemIds: items,
          count: items.length,
        });
      }
    };

    const handleDragEnd = () => {
      dragFallbackState = null;
      setDragState({
        isDragging: false,
        itemIds: [],
        count: 0,
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDragEnd();
        clearDraggedVaultItem();
      }
    };

    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('dragend', handleDragEnd);
    window.addEventListener('drop', handleDragEnd);
    window.addEventListener('dragcancel', handleDragEnd as EventListener);
    window.addEventListener('vault-drag-start', handleCustomStart);
    window.addEventListener('vault-drag-end', handleDragEnd);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchend', handleDragEnd);
    window.addEventListener('touchcancel', handleDragEnd);
    window.addEventListener('blur', handleDragEnd);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('dragend', handleDragEnd);
      window.removeEventListener('drop', handleDragEnd);
      window.removeEventListener('dragcancel', handleDragEnd as EventListener);
      window.removeEventListener('vault-drag-start', handleCustomStart);
      window.removeEventListener('vault-drag-end', handleDragEnd);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchend', handleDragEnd);
      window.removeEventListener('touchcancel', handleDragEnd);
      window.removeEventListener('blur', handleDragEnd);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return dragState;
};
