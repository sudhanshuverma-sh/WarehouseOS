/**
 * Download a screen as a PDF, in one click, with no print dialog.
 *
 * "Print / Save PDF" used to call window.print(), which does nothing where
 * the browser blocks the dialog (an embedded view, some kiosk setups) and,
 * where it works, still asks the person to pick "Save as PDF" and fiddle
 * with margins. This draws the element exactly as it looks on screen
 * (html-to-image renders it through the browser, so charts, fonts and
 * colours match) and lays it out on A4 pages with a title band, the time it
 * was made, and page numbers.
 *
 * Marking parts of a screen:
 *  - `data-pdf-ignore` (or Tailwind's `print:hidden`) leaves a control out:
 *    buttons, filters, anything that means nothing on paper.
 *  - `data-pdf-expand` on a scrolling box shows all of it in the PDF, not
 *    just the part scrolled into view.
 *
 * Both libraries load only when someone asks for a PDF.
 */

export interface PdfOptions {
  /** The file name, `.pdf` added when missing. */
  fileName: string;
  /** The title band's heading. */
  title: string;
  /** A line under it: the filters, the period. */
  subtitle?: string;
  /** Landscape suits wide dashboards; the default picks from the element's shape. */
  orientation?: 'portrait' | 'landscape';
}

const MARGIN = 10; // mm
const HEADER = 16; // mm
const FOOTER = 8; // mm
const INK: [number, number, number] = [14, 26, 22];
const MUTED: [number, number, number] = [107, 131, 120];

/** What to leave off the page. */
function keep(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return true;
  if (node.dataset.pdfIgnore !== undefined) return false;
  return !node.classList.contains('print:hidden');
}

/** Let scrolling boxes show everything while the picture is taken. */
function expandScrollers(root: HTMLElement): () => void {
  const touched: { el: HTMLElement; maxHeight: string; overflow: string; height: string }[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-pdf-expand]')) {
    touched.push({ el, maxHeight: el.style.maxHeight, overflow: el.style.overflow, height: el.style.height });
    el.style.maxHeight = 'none';
    el.style.height = 'auto';
    el.style.overflow = 'visible';
  }
  return () => {
    for (const t of touched) {
      t.el.style.maxHeight = t.maxHeight;
      t.el.style.overflow = t.overflow;
      t.el.style.height = t.height;
    }
  };
}

export async function downloadPdf(el: HTMLElement, opts: PdfOptions): Promise<void> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);

  const restore = expandScrollers(el);
  let canvas: HTMLCanvasElement;
  try {
    // One frame so the expanded boxes lay out before the picture is taken.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    canvas = await toCanvas(el, {
      pixelRatio: Math.min(2, window.devicePixelRatio > 1 ? 2 : 1.75),
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
      filter: keep,
      cacheBust: true,
    });
  } finally {
    restore();
  }

  const orientation = opts.orientation ?? (el.offsetWidth > 900 ? 'landscape' : 'portrait');
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const contentH = pageH - MARGIN * 2 - HEADER - FOOTER;
  const mmPerPx = contentW / canvas.width;
  const slicePx = Math.floor(contentH / mmPerPx);
  const pages = Math.max(1, Math.ceil(canvas.height / slicePx));
  const made = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  for (let i = 0; i < pages; i++) {
    if (i > 0) pdf.addPage();

    // Title band.
    pdf.setFillColor(...INK);
    pdf.rect(0, 0, pageW, MARGIN + HEADER - 4, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text(opts.title, MARGIN, MARGIN + 3);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(200, 214, 207);
    if (opts.subtitle) pdf.text(opts.subtitle, MARGIN, MARGIN + 8.5);
    pdf.text(`Generated ${made}`, pageW - MARGIN, MARGIN + 3, { align: 'right' });

    // This page's slice of the picture.
    const top = i * slicePx;
    const h = Math.min(slicePx, canvas.height - top);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = h;
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the PDF.');
    ctx.drawImage(canvas, 0, top, canvas.width, h, 0, 0, canvas.width, h);
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, MARGIN + HEADER, contentW, h * mmPerPx, undefined, 'FAST');

    // Footer.
    pdf.setDrawColor(213, 227, 220);
    pdf.line(MARGIN, pageH - MARGIN - 3, pageW - MARGIN, pageH - MARGIN - 3);
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED);
    pdf.text('WarehouseOS', MARGIN, pageH - MARGIN + 1);
    pdf.text(`Page ${i + 1} of ${pages}`, pageW - MARGIN, pageH - MARGIN + 1, { align: 'right' });
  }

  pdf.save(opts.fileName.toLowerCase().endsWith('.pdf') ? opts.fileName : `${opts.fileName}.pdf`);
}

/** A file name from a title and today: "EB-DG Site Power" → "eb-dg-site-power-2026-09-26". */
export function pdfFileName(title: string, day: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'report'}-${day}`;
}
