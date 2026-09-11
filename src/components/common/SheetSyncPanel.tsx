import React, { useState } from 'react';
import { Link2, Check, AlertTriangle, ExternalLink, X } from 'lucide-react';
import type { Capabilities } from '../../lib/permissions';
import { validateSheetUrl, openSheetHealthCheck } from '../../lib/sheetSync/sheetSync';
import { useApp } from '../../context/AppContext';

/**
 * Connects one service to its Google Sheet.
 *
 * Super Admin only: pointing a service at a different spreadsheet reroutes
 * where every site's data lands, which is never a per-site decision. A POC
 * files readings and is not shown the plumbing.
 */

export interface SheetSyncPanelProps {
  /** The sheet id used across the app, e.g. SHEET_DIESEL. */
  sheetId: string;
  serviceLabel: string;
  caps: Capabilities;
}

export const SheetSyncPanel: React.FC<SheetSyncPanelProps> = ({ sheetId, serviceLabel, caps }) => {
  const { sheetWebhookUrls, setSheetWebhookUrl } = useApp();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(() => sheetWebhookUrls[sheetId] || '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!caps.canConfigureIntegrations) return null;

  const linked = Boolean(sheetWebhookUrls[sheetId]);

  const save = () => {
    const check = validateSheetUrl(url);
    if (!check.ok) {
      setError(check.message ?? 'That URL does not look right.');
      setSaved(false);
      return;
    }
    setSheetWebhookUrl(sheetId, url.trim());
    setError(null);
    setSaved(true);
  };

  const disconnect = () => {
    setSheetWebhookUrl(sheetId, '');
    setUrl('');
    setSaved(false);
    setError(null);
  };

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={linked ? 'Sheet connected' : 'Connect a Google Sheet'}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer ${
          linked
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <Link2 className="w-3.5 h-3.5" />
        {linked ? 'Sheet linked' : 'Link sheet'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />

          <div className="absolute right-0 z-50 mt-1.5 w-96 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">{serviceLabel} → Google Sheet</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Every submission is mirrored into the sheet.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Apps Script Web App URL
              </label>
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setSaved(false);
                  setError(null);
                }}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-slate-400"
              />
              <p className="text-[10px] text-slate-400">
                Deploy → Manage deployments → Web app URL. It ends in <code>/exec</code>.
              </p>
            </div>

            {error && (
              <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {error}
              </p>
            )}
            {saved && !error && (
              <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-start gap-1.5">
                <Check className="w-3 h-3 mt-0.5 shrink-0" /> Saved. New submissions will be mirrored.
              </p>
            )}

            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={save}
                className="px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => openSheetHealthCheck(url)}
                disabled={!validateSheetUrl(url).ok}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed rounded-lg transition cursor-pointer"
              >
                <ExternalLink className="w-3 h-3" /> Test
              </button>
              {linked && (
                <button
                  type="button"
                  onClick={disconnect}
                  className="ml-auto text-xs text-slate-500 hover:text-rose-700 underline cursor-pointer"
                >
                  Disconnect
                </button>
              )}
            </div>

            {/* The one failure mode worth naming up front: the sheet is a
                mirror, and a failed push must never look like a failed
                submission to the person who filed it. */}
            <p className="text-[10px] text-slate-400 leading-relaxed">
              The sheet is a mirror, not the record. If Google is slow or the script is down, the
              submission still saves here and the sheet catches up on the next write.
            </p>
          </div>
        </>
      )}
    </span>
  );
};
