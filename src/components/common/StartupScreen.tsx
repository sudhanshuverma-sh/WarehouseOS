import React from 'react';
import { Loader2, ShieldOff, WifiOff } from 'lucide-react';
import type { ApiError } from '../../lib/api/client';

/**
 * What a person sees before the app can show them anything: while their
 * access loads, or when it cannot — not signed in, no access row, or the
 * server unreachable. Each case says what to do, because an empty
 * dashboard reads as "the app is broken" when the fix is "ask an admin".
 */
export const StartupScreen: React.FC<{ problem?: ApiError | null }> = ({ problem }) => {
  if (!problem) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--color-floor)]">
        <div className="flex items-center gap-3 text-sm text-slate-500" role="status">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading your sites…
        </div>
      </div>
    );
  }

  const noAccess = problem.code === 'NO_ACCESS';
  const signedOut = problem.status === 401;
  const offline = problem.code === 'OFFLINE' || problem.status >= 500;

  const title = noAccess
    ? 'No site is assigned to you yet'
    : signedOut
      ? 'You are not signed in'
      : offline
        ? 'Cannot reach WarehouseOS'
        : 'Something stopped the app loading';

  const help = noAccess
    ? 'Ask a Super Admin to add you in Master Data → POC Master, with your site and services. Then reload this page.'
    : signedOut
      ? 'Open the app through apps.blinkit.in so your company sign-in is used, then reload.'
      : offline
        ? 'The server or its database is not answering. Nothing you filed earlier is lost — try again in a minute.'
        : problem.message;

  const Icon = offline ? WifiOff : ShieldOff;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--color-floor)] p-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
          <Icon className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600">{help}</p>
        {noAccess && problem.message && <p className="text-xs text-slate-400">{problem.message}</p>}
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
        >
          Reload
        </button>
      </div>
    </div>
  );
};

/**
 * A standing reminder, in development only, that nothing typed here reaches
 * the database. It sits in the footer as a small chip, so it never covers
 * anything or needs room kept for it. Production builds never enter demo
 * mode, so never show it.
 */
export const DemoModeBanner: React.FC = () => (
  <span
    role="note"
    title="Run npm run api:dev to use Postgres."
    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-semibold"
  >
    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden />
    Demo mode: saved in this browser only
  </span>
);
