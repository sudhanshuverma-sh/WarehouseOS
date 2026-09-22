import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * The banner that slides in at the top when a notice lands for you.
 *
 * It says what arrived and then gets out of the way: it disappears on its
 * own after a few seconds, holds still while the pointer is over it so it
 * cannot vanish mid-read, and one tap opens the Noticeboard. The tab keeps
 * flashing afterwards; this is the moment of arrival, that is the reminder.
 *
 * Each notice pops once per browser session per person. Without that, a
 * notice someone chose not to open yet would pop again on every screen
 * change, which is how a signal becomes something people learn to ignore.
 *
 * Portalled to <body> for the same reason the notification panel is: the
 * top bar sets backdrop-filter, which would capture a `fixed` child.
 */

const SHOW_FOR_MS = 6000;
const seenKey = (email: string) => `noticepop_seen_${email.toLowerCase()}`;

function loadSeen(email: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(seenKey(email));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(email: string, seen: Set<string>) {
  try {
    sessionStorage.setItem(seenKey(email), JSON.stringify([...seen]));
  } catch {
    /* storage blocked: it just pops again next time, which is harmless */
  }
}

interface NoticePopProps {
  currentView: string;
  onOpen: () => void;
}

export const NoticePop: React.FC<NoticePopProps> = ({ currentView, onOpen }) => {
  const { notices, currentUser } = useApp();
  const [shown, setShown] = useState<{ title: string; more: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const unread = useMemo(() => notices.filter((n) => !n.read), [notices]);

  // Something new for this person that has not popped yet this session.
  useEffect(() => {
    // Already looking at the board: a banner about it would be noise.
    if (currentView === 'noticeboard' || unread.length === 0) return;

    const seen = loadSeen(currentUser.email);
    const fresh = unread.filter((n) => !seen.has(n.id));
    if (fresh.length === 0) return;

    // Newest first, as the board lists them.
    setShown({ title: fresh[0].title, more: fresh.length - 1 });
    for (const n of fresh) seen.add(n.id);
    saveSeen(currentUser.email, seen);
  }, [unread, currentUser.email, currentView]);

  // Opening the board by any route puts the banner away.
  useEffect(() => {
    if (currentView === 'noticeboard') setShown(null);
  }, [currentView]);

  // It leaves on its own, but not while someone is reading it.
  useEffect(() => {
    if (!shown || paused) return;
    timer.current = window.setTimeout(() => setShown(null), SHOW_FOR_MS);
    return () => window.clearTimeout(timer.current);
  }, [shown, paused]);

  if (!shown) return null;

  return createPortal(
    <div className="fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top,0px))] z-50 flex justify-center px-3 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="pointer-events-auto w-full max-w-md animate-notice-pop rounded-2xl bg-(--color-ink) text-white shadow-[0_18px_40px_-12px_rgb(14_26_22/0.55)] ring-1 ring-white/10 overflow-hidden"
      >
        <div className="flex items-start gap-3 p-3.5">
          <button
            type="button"
            onClick={() => {
              setShown(null);
              onOpen();
            }}
            className="flex-1 min-w-0 flex items-start gap-3 text-left cursor-pointer"
          >
            <span className="w-9 h-9 rounded-xl bg-(--color-due) text-white flex items-center justify-center shrink-0">
              <Megaphone className="w-4.5 h-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-white/60">
                New on the Noticeboard{shown.more > 0 ? `, and ${shown.more} more` : ''}
              </span>
              <span className="block mt-0.5 text-sm font-semibold truncate">{shown.title}</span>
              <span className="block mt-0.5 text-[11px] text-white/60">Tap to read</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShown(null)}
            aria-label="Dismiss"
            className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* How long it has left, so its going does not come as a surprise.
            Held while the pointer is on it. */}
        <div
          key={`${shown.title}-${shown.more}`}
          className="h-0.5 bg-(--color-due) origin-left animate-notice-timer"
          style={{ animationDuration: `${SHOW_FOR_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
        />
      </div>
    </div>,
    document.body,
  );
};
