import React from 'react';
import { ShieldOff, ArrowLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * Shown when a route is reached that the current role may not use.
 *
 * Says plainly what was blocked and who to ask, rather than bouncing the user
 * somewhere with no explanation — a POC who lands here has usually followed a
 * stale link or switched persona mid-session, and needs to know nothing is
 * broken.
 */
export const AccessDenied: React.FC<{ what: string; onBack?: () => void }> = ({ what, onBack }) => {
  const { currentUser } = useApp();

  return (
    <div className="max-w-lg mx-auto mt-10 bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
        <ShieldOff className="w-6 h-6" />
      </div>
      <h2 className="text-lg font-bold text-slate-900">Not available for your role</h2>
      <p className="text-sm text-slate-600">
        You're signed in as <strong className="text-slate-900">{currentUser.fullName}</strong> ({currentUser.role.replace('_', ' ').toLowerCase()}),
        and {what} is managed by a Super Admin. Your filing forms and your site's records are unaffected.
      </p>
      {onBack && (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Go back
        </button>
      )}
    </div>
  );
};
