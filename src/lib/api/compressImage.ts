/**
 * Shrinks a phone photo before it leaves the phone.
 *
 * A modern camera photo is 3–12 MB; the database accepts 2 MB. Scaling
 * the longest side to 1600 px and re-encoding as JPEG lands most photos
 * around 200–400 KB — still plenty to read a meter, a QR code or a POD
 * signature — and turns a 30-second upload on a warehouse's mobile data
 * into a two-second one.
 *
 * PDFs pass through untouched. If the browser cannot decode the image
 * (some HEIC files), the original is sent and the server decides.
 */

export const MAX_SIDE_PX = 1600;
export const UPLOAD_LIMIT_BYTES = 2 * 1024 * 1024;

/** Scales (w, h) to fit within a max side, never enlarging. */
export function fitWithin(width: number, height: number, maxSide = MAX_SIDE_PX): { width: number; height: number } {
  if (width <= maxSide && height <= maxSide) return { width, height };
  const scale = maxSide / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function encode(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<Blob | null> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // White first: a transparent PNG would otherwise turn black as JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function compressImage(file: File): Promise<Blob> {
  if (file.type === 'application/pdf') return file;
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Choose a photo (JPEG, PNG or WebP) or a PDF.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    // One gentler pass, then a firmer one only if still over the limit.
    const first = await encode(bitmap, MAX_SIDE_PX, 0.8);
    if (first && first.size <= UPLOAD_LIMIT_BYTES) return first.size < file.size ? first : file;
    const second = await encode(bitmap, 1200, 0.6);
    return second ?? file;
  } finally {
    bitmap.close();
  }
}
