import React, { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { downloadPdf, pdfFileName } from '../../lib/export/pdf';

/**
 * "Download PDF": the screen in `target`, as an A4 PDF, straight to the
 * downloads folder. See lib/export/pdf for what it leaves out and expands.
 */
export const PdfButton: React.FC<{
  target: React.RefObject<HTMLElement | null>;
  title: string;
  subtitle?: string;
  /** Defaults to the title and today's date. */
  fileName?: string;
  className?: string;
}> = ({ target, title, subtitle, fileName, className = '' }) => {
  const { currentDate, notify } = useApp();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!target.current || busy) return;
    setBusy(true);
    try {
      await downloadPdf(target.current, { title, subtitle, fileName: fileName ?? pdfFileName(title, currentDate) });
      notify('success', 'PDF downloaded', `${title} is in your downloads.`);
    } catch (e) {
      console.error('PDF export failed', e);
      notify('error', 'Could not make the PDF', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      data-pdf-ignore
      aria-busy={busy}
      className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer disabled:opacity-60 disabled:cursor-wait ${className}`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
      {busy ? 'Preparing PDF' : 'Download PDF'}
    </button>
  );
};
