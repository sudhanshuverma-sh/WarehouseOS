import React, { useState } from 'react';
import { CheckCircle2, Link2, Loader2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api, ApiError } from '../../lib/api/client';
import { isGoogleDriveLink } from '../../lib/services/validateSubmission';

/**
 * A POD, a QR code — any evidence — as an attached link.
 *
 * Link only: the POC shares the photo from Google Drive and pastes its
 * link. The record keeps an attachment id pointing at that link, and the
 * sheet gets the same link, so anyone with Drive access opens the photo
 * from either place.
 */

export interface EvidenceValue {
  /** The attachment id. Absent only in demo mode, where nothing is saved to the database. */
  id?: string;
  kind: 'upload' | 'link';
  /** Where to view it. */
  url: string;
  name?: string;
  sizeBytes?: number;
}

interface Props {
  label: string;
  serviceCode: string;
  siteCode: string | undefined;
  value: EvidenceValue | null;
  onChange: (value: EvidenceValue | null) => void;
  required?: boolean;
  disabled?: boolean;
}

interface AttachmentResponse {
  id: string;
  kind: 'upload' | 'link';
  url: string;
  linkUrl?: string;
}

export const EvidenceInput: React.FC<Props> = ({ label, serviceCode, siteCode, value, onChange, required, disabled }) => {
  const { dataMode } = useApp();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = disabled || busy || !siteCode;

  const attach = async () => {
    const trimmed = link.trim();
    if (!siteCode) return;
    if (!isGoogleDriveLink(trimmed)) {
      setError('Paste a Google Drive link — it starts with https://drive.google.com/');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (dataMode !== 'api') {
        onChange({ kind: 'link', url: trimmed });
      } else {
        const saved = await api.post<AttachmentResponse>('/attachments', { serviceCode, siteCode, link: trimmed });
        onChange({ id: saved.id, kind: 'link', url: saved.linkUrl ?? trimmed });
      }
      setLink('');
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>

      {value ? (
        <div className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <a href={value.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-emerald-900 hover:underline">
            Link attached
          </a>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="p-1 rounded text-emerald-800 hover:bg-emerald-100 cursor-pointer"
              aria-label={`Remove ${label}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="url"
                inputMode="url"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void attach();
                  }
                }}
                placeholder="Paste link (https://drive.google.com/…)"
                disabled={blocked}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60"
              />
            </div>
            <button
              type="button"
              onClick={() => void attach()}
              disabled={blocked || !link.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-white bg-slate-900 rounded-lg disabled:opacity-40 cursor-pointer"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              {busy ? 'Attaching…' : 'Attach link'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            {siteCode ? 'Share the file in Google Drive so Zomato colleagues with the link can view it.' : 'Choose the site first.'}
          </p>
        </>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
};
