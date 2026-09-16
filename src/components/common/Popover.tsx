import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A panel anchored to the control that opened it, rendered at the top of the
 * page rather than inside whatever opened it.
 *
 * Column filters and export menus live inside tables that scroll, and a
 * panel positioned inside a scrolling box is cut off at its edge and can
 * fall behind sticky headers. Putting the panel in a portal takes it out of
 * that box entirely: it is positioned against the trigger's place on screen,
 * kept inside the window, and drawn above everything else.
 *
 * It follows the trigger while the page or a table scrolls, closes on Esc,
 * on a click outside, and when the trigger is scrolled out of sight.
 */

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** The element the panel hangs off. */
  anchor: React.RefObject<HTMLElement | null>;
  /** Which edge of the panel lines up with the trigger. */
  align?: 'left' | 'right';
  width?: number;
  label?: string;
  children: React.ReactNode;
}

interface Placement {
  top: number;
  left: number;
  origin: string;
}

const GAP = 6;
const MARGIN = 8;

export const Popover: React.FC<PopoverProps> = ({ open, onClose, anchor, align = 'left', width = 256, label, children }) => {
  const [place, setPlace] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }

    const position = () => {
      const el = anchor.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();

      // Scrolled out of view inside a table: there is nothing to point at.
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        onClose();
        return;
      }

      const panelWidth = Math.min(width, window.innerWidth - MARGIN * 2);
      let left = align === 'right' ? rect.right - panelWidth : rect.left;
      left = Math.min(Math.max(MARGIN, left), window.innerWidth - panelWidth - MARGIN);

      // Below the trigger, or above it when the room is up there instead.
      const below = window.innerHeight - rect.bottom;
      const openUp = below < 240 && rect.top > below;
      const top = openUp ? Math.max(MARGIN, rect.top - GAP) : rect.bottom + GAP;

      setPlace({
        top,
        left,
        origin: `${openUp ? 'bottom' : 'top'} ${align}`,
      });
    };

    position();
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    return () => {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
    };
  }, [open, anchor, align, width, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !place) return null;

  const panelWidth = Math.min(width, window.innerWidth - MARGIN * 2);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[59]" onMouseDown={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={label}
        className="animate-pop-in fixed z-[60] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        style={{
          top: place.top,
          left: place.left,
          width: panelWidth,
          maxHeight: `calc(100vh - ${place.top + MARGIN}px)`,
          transform: place.origin.startsWith('bottom') ? 'translateY(-100%)' : undefined,
          ['--pop-origin' as string]: place.origin,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body,
  );
};
