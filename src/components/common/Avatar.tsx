import React from 'react';
import { initialsOf } from '../../lib/masterData/personas';

/**
 * A person, pictured.
 *
 * Master Data holds names and numbers, not photographs, so most people in
 * this app have no avatar. A missing `src` renders a broken-image glyph,
 * which reads as a fault rather than as "no photo" - initials do not.
 */
export const Avatar: React.FC<{
  name: string;
  src?: string;
  /** Tailwind size classes, e.g. "w-8 h-8". */
  className?: string;
}> = ({ name, src, className = 'w-8 h-8' }) =>
  src ? (
    <img src={src} alt="" className={`${className} rounded-lg object-cover shrink-0`} />
  ) : (
    <span
      aria-hidden
      className={`${className} rounded-lg shrink-0 inline-flex items-center justify-center bg-(--color-frost) text-(--color-ink) text-[11px] font-bold`}
    >
      {initialsOf(name)}
    </span>
  );
