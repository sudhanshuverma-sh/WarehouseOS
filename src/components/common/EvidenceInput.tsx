import React, { useState } from 'react';
import { CheckCircle2, Link2, Loader2, Upload, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api, ApiError, qs } from '../../lib/api/client';
import { compressImage } from '../../lib/api/compressImage';
import { isGoogleDriveLink } from '../../lib/services/validateSubmission';

/**
 * A POD, a QR code, a housekeeping photo — any evidence.
 *
 * Two ways in, because both happen on a warehouse floor: take the photo
 * now (compressed on the phone, stored in the database), or paste the
 * Google Drive link of one already shared. Either way the record keeps an
 * attachment id, so everything downstream treats them the same.
 */

export interface EvidenceValue {
  /** The attachment id. Absent only in demo mode, where nothing is uploaded. */
  id?: string;
  kind: 'upload' | 'link';
  /** Where to view it: /api/attachments/:id, the Drive link, or a demo data URL. */
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
  fileName?: string;
  sizeBytes?: number;
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const kb = (bytes?: number) => (bytes ? `${Math.max(1, Math.round(bytes / 1024))} KB` : '');

export const EvidenceInput: React.FC<Props> = ({ label, serviceCode, siteCode, value, onChange, required, disabled }) => {
  const { dataMode } = useApp();
  const [tab, setTab] = useState<'upload' | 'link'>('upload');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = disabled || busy || !siteCode;

  const fail = (err: unknown) =>
    setError(err instanceof ApiError || err instanceof Error ? err.message : 'That did not work. Please try again.');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still fires
    if (!file || !siteCode) return;
    setError(null);
    setBusy(true);
    try {
      const blob = await compressImage(file);
      if (dataMode !== 'api') {
        onChange({ kind: 'upload', url: await readAsDataUrl(blob), name: file.name, sizeBytes: blob.size });
        return;
      }
      const saved = await api.upload<AttachmentResponse>(
        `/attachments${qs({ service: serviceCode, site: siteCode, name: file.name })}`,
        blob,
        blob.type || file.type || 'image/jpeg',
      );
      onChange({ id: saved.id, kind: 'upload', url: saved.url, name: saved.fileName ?? file.name, sizeBytes: saved.sizeBytes });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const handleLink = async () => {
    const trimmed = link.trim();
    if (!siteCode) return;
    if (!isGoogleDriveLink(trimmed)) {
      setError('Paste a Google Drive link (https://drive.google.com/…), or upload the photo instead.');
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
      fail(err);
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
            {value.kind === 'link' ? 'Google Drive link' : value.name || 'Photo'}
            {value.sizeBytes ? <span className="text-emerald-700/70"> · {kb(value.sizeBytes)}</span> : null}
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
          <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-xs font-semibold" role="tablist">
            {(['upload', 'link'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
                className={`px-3 py-1 rounded-md transition cursor-pointer ${tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
              >
                {t === 'upload' ? 'Upload photo' : 'Google Drive link'}
              </button>
            ))}
          </div>

          {tab === 'upload' ? (
            <label
              className={`flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-sm ${
                blocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100'
              }`}
            >
              {busy ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" /> : <Upload className="w-4 h-4 text-slate-400" />}
              <span className="text-slate-500">{busy ? 'Uploading…' : 'Tap to take a photo or choose a file'}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={handleFile}
                disabled={blocked}
                className="hidden"
              />
            </label>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  inputMode="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleLink();
                    }
                  }}
                  placeholder="https://drive.google.com/…"
                  disabled={blocked}
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleLink()}
                disabled={blocked || !link.trim()}
                className="px-3.5 py-2.5 text-xs font-bold text-white bg-slate-900 rounded-lg disabled:opacity-40 cursor-pointer"
              >
                {busy ? 'Saving…' : 'Use link'}
              </button>
            </div>
          )}

          {!siteCode && <p className="text-[11px] text-slate-400">Choose the site first.</p>}
          {tab === 'link' && siteCode && (
            <p className="text-[11px] text-slate-400">Share the file so anyone at the company with the link can view it.</p>
          )}
        </>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
};
