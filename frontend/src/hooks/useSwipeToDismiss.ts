import { useRef, useCallback } from 'react';

// Attaches to a sheet's grab handle: dragging it down past a threshold
// dismisses the sheet, dragging less snaps it back. The drag itself
// writes directly to the DOM node's style (not React state) so the sheet
// tracks the finger every frame with no re-render lag; onClose only fires
// once, after the drag decides the sheet is actually being dismissed.
export function useSwipeToDismiss<T extends HTMLElement>(onClose: () => void) {
  const sheetRef = useRef<T | null>(null);
  const startY = useRef(0);
  const draggedY = useRef(0);
  const dragging = useRef(false);

  const DISMISS_THRESHOLD = 90; // px dragged down before it counts as a dismiss

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    draggedY.current = 0;
    dragging.current = true;
    const el = sheetRef.current;
    if (el) el.style.transition = 'none';
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) return; // only follow downward drags -- upward does nothing
    draggedY.current = delta;
    const el = sheetRef.current;
    if (el) el.style.transform = `translateY(${delta}px)`;
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = 'transform 0.2s ease-out';
    if (draggedY.current > DISMISS_THRESHOLD) {
      el.style.transform = 'translateY(100%)';
      setTimeout(onClose, 200);
    } else {
      el.style.transform = 'translateY(0)';
    }
  }, [onClose]);

  return { sheetRef, onTouchStart, onTouchMove, onTouchEnd };
}
