import { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { unreadCount } from '../../lib/notices/audience';

/**
 * How many notices this person has not opened.
 *
 * One number, read by the sidebar, the phone drawer and the bottom bar, so
 * they cannot disagree about whether the tab should be flashing. The same
 * reason `usePendingWork` is shared rather than recomputed per surface.
 */
export function useUnreadNotices(): number {
  const { notices } = useApp();
  return useMemo(() => unreadCount(notices), [notices]);
}
