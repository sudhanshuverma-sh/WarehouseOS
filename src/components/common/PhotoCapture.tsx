import React, { useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, RotateCcw, X } from 'lucide-react';
import { api } from '../../lib/api/client';
import { compressImage } from '../../lib/api/compressImage';
import { useApp } from '../../context/AppContext';

/**
 * Take a photo (or pick one) and attach it to a service entry.
 *
 * On a phone the button opens the camera. The photo is shrunk in the browser
 * (compressImage) and uploaded as an attachment for this service and site;
 * `value` is its attachment id, which the entry then points at. The server
 * checks that id belongs to the same service and site before it accepts
 * the entry.
 *
 * Demo mode has no server, so the shrunk photo is kept as a data URL instead.
 */
export interface PhotoCaptureProps {
  serviceCode: string;
  siteCode: string;
  /** Attachment id, or a data URL in demo mode. Empty when there is no photo. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Used as the stored file name, e.g. "hydrant_boxes". */
  name: string;
  required?: boolean;
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({ serviceCode, siteCode, value, onChange, name, required }) => {
  const { dataMode } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const pick = () => input.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // the same photo can be picked again after a failure
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await compressImage(file);
      const local = await readAsDataUrl(blob);
      if (dataMode === 'api') {
        const saved = await api.upload<{ id: string }>(
          `/attachments?service=${encodeURIComponent(serviceCode)}&site=${encodeURIComponent(siteCode)}&name=${encodeURIComponent(`${name}.jpg`)}`,
          blob,
          blob.type || 'image/jpeg',
        );
        onChange(saved.id);
      } else {
        onChange(local);
      }
      setPreview(local);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The photo did not upload.');
    } finally {
      setBusy(false);
    }
  };

  const shown = preview ?? (value?.startsWith('data:') ? value : value ? `/api/attachments/${value}` : null);

  return (
    <div className="space-y-1.5">
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      {value ? (
        <div className="flex items-center gap-3 p-2 rounded-lg border border-emerald-300 bg-emerald-50">
          {shown && <img src={shown} alt="" className="w-12 h-12 rounded-md object-cover border border-emerald-200" />}
          <span className="flex-1 text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Photo attached
          </span>
          <button type="button" onClick={pick} title="Take another photo"
            className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-100 cursor-pointer">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => { onChange(undefined); setPreview(null); }} title="Remove photo"
            className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={pick} disabled={busy}
          className={`w-full min-h-11 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed text-xs font-semibold ${required ? 'border-rose-400 text-rose-700 hover:bg-rose-50' : 'border-slate-300 text-slate-600 bg-white hover:bg-slate-50'} disabled:opacity-60 cursor-pointer`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {busy ? 'Uploading photo…' : `Take or attach a photo${required ? ' — required' : ' (optional)'}`}
        </button>
      )}
      {error && <p className="text-[11px] text-rose-700">{error} Try again.</p>}
    </div>
  );
};
