import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

interface InstrumentDialProps {
  /** 0–100 */
  value: number;
  size?: number;
  color?: string;
  label?: string;
  className?: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Signature element: a radial gauge that reads as a physical instrument-panel dial
 * (conic-gradient face + inset bevel, defined in index.css) rather than a flat donut
 * chart. Used everywhere a % reading appears — compliance, uptime, deployment — so the
 * whole app shares one consistent "control room" reading, not a chart-per-library look.
 */
export const InstrumentDial: React.FC<InstrumentDialProps> = ({
  value,
  size = 96,
  color = '#0d9488',
  label,
  className = ''
}) => {
  const target = clamp(value);
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setDisplay(target);
      return;
    }

    const duration = 700;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(target * eased);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, [target]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`instrument-dial ${className}`}
      style={{ width: size, height: size, ['--dial-value' as any]: display, ['--dial-color' as any]: color }}
    >
      <div className="flex flex-col items-center justify-center leading-none">
        <span className="font-display font-bold text-slate-900" style={{ fontSize: size * 0.22 }}>
          {Math.round(display)}%
        </span>
        {label && (
          <span
            className="text-slate-500 font-semibold uppercase tracking-wider mt-0.5 text-center px-1"
            style={{ fontSize: Math.max(8, size * 0.085) }}
          >
            {label}
          </span>
        )}
      </div>
    </motion.div>
  );
};
