import React, { useState } from 'react';
import { Link2, AlertTriangle, ExternalLink, X, Send } from 'lucide-react';
import type { Capabilities } from '../../lib/permissions';
import { validateSheetUrl, openSheetHealthCheck } from '../../lib/sheetSync/sheetSync';
import { useApp } from '../../context/AppContext';
import { Button } from './Button';

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
  const { sheetWebhookUrls, setSheetWebhookUrl, syncSheetNow } = useApp();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(() => sheetWebhookUrls[sheetId] || '');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!caps.canConfigureIntegrations) return null;

  const linked = Boolean(sheetWebhookUrls[sheetId]);
  const canSendAll = sheetId === 'SHEET_DIESEL' || sheetId === 'SHEET_EB_DG';

  const save = async () => {
    const check = validateSheetUrl(url);
    if (!check.ok) {
      setError(check.message ?? 'That URL does not look right.');
      setSaved(false);
      return;
    }
    setBusy(true);
    const res = await setSheetWebhookUrl(sheetId, url.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.message ?? 'Could not save the link.');
      return;
    }
    setError(null);
    setSaved(true);
    // Settles back to "Save" so the control does not sit there claiming a
    // success from several minutes ago.
    window.setTimeout(() => setSaved(false), 1800);
  };

  const disconnect = async () => {
    setBusy(true);
    const res = await setSheetWebhookUrl(sheetId, '');
    setBusy(false);
    if (!res.ok) {
      setError(res.message ?? 'Could not remove the link.');
      return;
    }
    setUrl('');
    setSaved(false);
    setError(null);
    setInfo(null);
  };

  // Called straight from the click, so the browser allows its popup.
  const sendAll = () => {
    const res = syncSheetNow(sheetId);
    if (res.ok) {
      setError(null);
      setInfo(res.message);
    } else {
      setInfo(null);
      setError(res.message);
    }
  };

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={linked ? 'Sheet connected' : 'Connect a Google Sheet'}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer transition-[background-color,border-color,color] duration-(--motion-fast) ease-(--ease-standard) active:scale-[0.98] ${
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

          <div
            className="absolute right-0 z-50 mt-1.5 w-96 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl p-4 space-y-3 elevate-3 animate-pop-in"
            style={{ '--pop-origin': 'top right' } as React.CSSProperties}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">{serviceLabel} → Google Sheet</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Every submission, approval and validation is copied into the sheet.
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
                placeholder="https://script.google.com/a/macros/zomato.com/s/.../exec"
                className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-slate-400"
              />
              <p className="text-[10px] text-slate-400">
                Deploy as Web app, access <strong>Anyone within Zomato</strong>, and copy the URL ending in <code>/exec</code>.
              </p>
            </div>

            {error && (
              <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {error}
              </p>
            )}
            {info && (
              <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{info}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
              <Button variant="primary" size="sm" onClick={save} loading={busy} success={saved} successLabel="Saved">
                Save
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<ExternalLink className="w-3 h-3" />}
                onClick={() => openSheetHealthCheck(url)}
                disabled={!validateSheetUrl(url).ok}
              >
                Test
              </Button>
              {linked && canSendAll && (
                <Button variant="secondary" size="sm" icon={<Send className="w-3 h-3" />} onClick={sendAll}>
                  Send all to sheet
                </Button>
              )}
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

            <p className="text-[10px] text-slate-400 leading-relaxed">
              The copy is sent by the browser of whoever files or approves, so they must be signed in to their
              Zomato Google account and allow pop-ups for this site. The database is the record; if a row is
              missing, “Send all to sheet” fills the gaps without duplicating.
            </p>
          </div>
        </>
      )}
    </span>
  );
};
