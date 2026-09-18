import React, { useEffect, useRef, useState } from 'react';

/**
 * Fade and lift as something comes into view, one after another.
 *
 * Entrances are the one place motion earns its keep on a data screen: a
 * card that arrives says "this is new since you last looked", where twenty
 * cards appearing at once says nothing at all. So this fires once per
 * element, as it enters, and never again while scrolling back and forth.
 *
 * Nothing here hijacks the scroll. The page still moves exactly as far as
 * the wheel says: an IntersectionObserver only watches, it never drives.
 * Anyone who asked their system for less motion gets the content straight
 * away, with no animation at all.
 */

interface RevealProps {
  children: React.ReactNode;
  /** Position in a list, so a grid arrives in sequence rather than all at once. */
  index?: number;
  as?: 'div' | 'li' | 'section' | 'article';
  className?: string;
  style?: React.CSSProperties;
}

const STEP_MS = 40;
const MAX_STEPS = 8;

const wantsLessMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const Reveal: React.FC<RevealProps> = ({ children, index = 0, as = 'div', className = '', style }) => {
  const host = useRef<HTMLElement>(null);
  // Anyone who asked for less motion, or whose browser cannot observe, sees
  // it immediately rather than waiting for an animation that never runs.
  const [shown, setShown] = useState(() => wantsLessMotion() || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (shown || !host.current) return;
    const el = host.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setShown(true);
        observer.disconnect();
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={host}
      className={`${shown ? 'reveal-in' : 'reveal'} ${className}`}
      style={shown ? { animationDelay: `${Math.min(index, MAX_STEPS) * STEP_MS}ms`, ...style } : style}
    >
      {children}
    </Tag>
  );
};
