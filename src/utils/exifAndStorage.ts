import exifr from 'exifr';
import { ExifMetadata, FieldCaptureLog, GpsCoordinates } from '../types/field';

const DB_NAME = 'nocturne_field_db';
const DB_VERSION = 1;
const STORE_LOGS = 'capture_logs';
const STORE_BLOBS = 'capture_blobs';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        db.createObjectStore(STORE_LOGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllCaptureLogs(): Promise<FieldCaptureLog[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOGS, 'readonly');
    const store = tx.objectStore(STORE_LOGS);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result as FieldCaptureLog[]) ?? [];
      rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveCaptureLog(log: FieldCaptureLog, originalFile?: File | null): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_LOGS, STORE_BLOBS], 'readwrite');
    tx.objectStore(STORE_LOGS).put(log);
    if (originalFile) {
      tx.objectStore(STORE_BLOBS).put(originalFile, log.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOriginalBlob(id: string): Promise<Blob | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readonly');
    const req = tx.objectStore(STORE_BLOBS).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteCaptureLog(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_LOGS, STORE_BLOBS], 'readwrite');
    tx.objectStore(STORE_LOGS).delete(id);
    tx.objectStore(STORE_BLOBS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function formatShutterDisplay(seconds: number): string {
  if (!seconds || seconds <= 0) return '1/125s';
  if (seconds >= 1) {
    return `${Math.round(seconds * 10) / 10}s`;
  }
  const denom = Math.round(1 / seconds);
  return `1/${denom}s`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function createScaledPreviewFromImageUrl(objectUrl: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 480;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(undefined);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(undefined);
    img.src = objectUrl;
  });
}

export async function parseCameraFileExif(file: File): Promise<{
  exif: ExifMetadata;
  gps: GpsCoordinates | null;
  previewDataUrl?: string;
}> {
  const isRawDng = file.name.toLowerCase().endsWith('.dng') || file.type === 'image/x-adobe-dng';
  let parsed: Record<string, unknown> | undefined;
  let gpsOut: GpsCoordinates | null = null;
  let previewDataUrl: string | undefined;

  try {
    parsed = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
    });
  } catch {
    parsed = undefined;
  }

  // Extract preview: for DNG try embedded thumbnail first; for JPEG scale image directly
  try {
    if (isRawDng) {
      const thumbUrl = await exifr.thumbnailUrl(file);
      if (thumbUrl) {
        previewDataUrl = await createScaledPreviewFromImageUrl(thumbUrl);
        URL.revokeObjectURL(thumbUrl);
      }
    } else if (file.type.startsWith('image/')) {
      const directUrl = URL.createObjectURL(file);
      previewDataUrl = await createScaledPreviewFromImageUrl(directUrl);
      URL.revokeObjectURL(directUrl);
    }
  } catch {
    previewDataUrl = undefined;
  }

  if (parsed && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
    gpsOut = {
      lat: Math.round(parsed.latitude * 100000) / 100000,
      lng: Math.round(parsed.longitude * 100000) / 100000,
      altitudeM: typeof parsed.GPSAltitude === 'number' ? Math.round(parsed.GPSAltitude) : null,
      label: 'Embedded EXIF GPS',
    };
  }

  const shutterSec = typeof parsed?.ExposureTime === 'number' ? parsed.ExposureTime : 0.008;
  const iso = typeof parsed?.ISO === 'number' ? parsed.ISO : 100;
  const aperture = typeof parsed?.FNumber === 'number' ? parsed.FNumber : 1.7;
  const focalLengthMm = typeof parsed?.FocalLength === 'number' ? Math.round(parsed.FocalLength * 10) / 10 : 6.3;
  const focalLength35Mm =
    typeof parsed?.FocalLengthIn35mmFormat === 'number' ? parsed.FocalLengthIn35mmFormat : 24;

  const make = typeof parsed?.Make === 'string' ? parsed.Make.trim() : 'Samsung';
  const model = typeof parsed?.Model === 'string' ? parsed.Model.trim() : 'SM-S928B (Galaxy S24 Ultra)';
  const lensModel =
    typeof parsed?.LensModel === 'string'
      ? parsed.LensModel.trim()
      : `${focalLength35Mm}mm eq. f/${aperture}`;

  const rawDate = parsed?.DateTimeOriginal ?? parsed?.CreateDate;
  const capturedAt =
    rawDate instanceof Date && !isNaN(rawDate.getTime())
      ? rawDate.toISOString()
      : new Date(file.lastModified || Date.now()).toISOString();

  const software = typeof parsed?.Software === 'string' ? parsed.Software : '';
  const editedKeywords = ['photoshop', 'lightroom', 'snapseed', 'gimp', 'affinity', 'darktable'];
  const isUneditedOriginal = !editedKeywords.some((k) => software.toLowerCase().includes(k));

  const rawWidth = typeof parsed?.ExifImageWidth === 'number' ? parsed.ExifImageWidth : typeof parsed?.ImageWidth === 'number' ? parsed.ImageWidth : undefined;
  const rawHeight = typeof parsed?.ExifImageHeight === 'number' ? parsed.ExifImageHeight : typeof parsed?.ImageHeight === 'number' ? parsed.ImageHeight : undefined;
  let resolutionMode = isRawDng ? 'Expert RAW DNG' : 'Unedited JPEG';
  if (rawWidth && rawHeight) {
    const mp = Math.round(((rawWidth * rawHeight) / 1_000_000) * 10) / 10;
    resolutionMode = `${mp} MP ${isRawDng ? 'DNG' : 'Original'}`;
  }

  return {
    exif: {
      cameraMake: make,
      cameraModel: model,
      lensName: lensModel,
      shutterSec,
      shutterDisplay: formatShutterDisplay(shutterSec),
      iso,
      aperture,
      focalLengthMm,
      focalLength35Mm,
      resolutionMode,
      whiteBalance: typeof parsed?.WhiteBalance === 'string' ? parsed.WhiteBalance : 'Auto / Native',
      capturedAt,
      fileName: file.name,
      fileSizeBytes: file.size,
      mimeType: file.type || (isRawDng ? 'image/x-adobe-dng' : 'image/jpeg'),
      isRawDng,
      isUneditedOriginal,
      parsedFromFile: Boolean(parsed),
      rawWidth,
      rawHeight,
    },
    gps: gpsOut,
    previewDataUrl,
  };
}

export function buildWhatsAppCaption(log: FieldCaptureLog): string {
  const gpsStr = log.gps
    ? `${log.gps.lat.toFixed(5)}, ${log.gps.lng.toFixed(5)}`
    : 'No GPS Lock';
  const lines = [
    `NOCTURNE FIELD · UNCOMPRESSED DOCUMENT LOG`,
    `Subject: ${log.speciesTag} (${log.category === 'astro' ? 'Astrophotography' : 'Wildlife RAW'})`,
    `Device: ${log.exif.cameraModel} · ${log.exif.lensName}`,
    `Exposure: ${log.exif.shutterDisplay} · f/${log.exif.aperture} · ISO ${log.exif.iso} · ${log.exif.focalLength35Mm}mm eq.`,
    `Format: ${log.exif.resolutionMode} (${formatFileSize(log.exif.fileSizeBytes)}) · ${
      log.exif.isUneditedOriginal ? 'Unedited Original' : 'Modified Software Tag'
    }`,
    `Sky / Site: Bortle ${log.bortleAtCapture} · GPS ${gpsStr}`,
    `Captured: ${new Date(log.createdAt).toLocaleString()}`,
  ];
  if (log.notes.trim()) {
    lines.push(`Field Notes: ${log.notes.trim()}`);
  }
  lines.push(`Tip: Send attached file as a WhatsApp Document to preserve full RAW/EXIF bytes.`);
  return lines.join('\n');
}

export async function shareOrExportWhatsAppDocument(log: FieldCaptureLog): Promise<{
  mode: 'web-share' | 'download-and-copy' | 'caption-only';
  message: string;
}> {
  const caption = buildWhatsAppCaption(log);
  try {
    await navigator.clipboard.writeText(caption);
  } catch {
    // Clipboard optional if blocked by iframe policy
  }

  const blob = log.hasOriginalBlob ? await getOriginalBlob(log.id) : null;
  if (blob) {
    const file = new File([blob], log.exif.fileName, {
      type: log.exif.mimeType || 'application/octet-stream',
    });

    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `${log.speciesTag} · ${log.exif.fileName}`,
          text: caption,
          files: [file],
        });
        return {
          mode: 'web-share',
          message: `Shared uncompressed ${log.exif.fileName} via system share sheet.`,
        };
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          return { mode: 'caption-only', message: 'Share sheet cancelled; telemetry caption copied.' };
        }
      }
    }

    // Fallback: trigger direct uncompressed file download + caption copied
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = log.exif.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
      mode: 'download-and-copy',
      message: `Downloaded uncompressed ${log.exif.fileName} & copied WhatsApp caption.`,
    };
  }

  return {
    mode: 'caption-only',
    message: 'Copied WhatsApp field telemetry caption (manual log entry without attached RAW file).',
  };
}

export function exportLogsAsJson(logs: FieldCaptureLog[]): void {
  const payload = JSON.stringify(logs, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nocturne-field-log-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportLogsAsCsv(logs: FieldCaptureLog[]): void {
  const headers = [
    'ID',
    'CapturedAt',
    'Category',
    'Species',
    'Camera',
    'Lens',
    'Shutter',
    'Aperture',
    'ISO',
    'Focal35mm',
    'Resolution',
    'Bortle',
    'Latitude',
    'Longitude',
    'FileName',
    'Unedited',
    'Notes',
  ];
  const escapeCsv = (val: string | number | boolean | undefined | null) =>
    `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = logs.map((l) =>
    [
      l.id,
      l.createdAt,
      l.category,
      l.speciesTag,
      l.exif.cameraModel,
      l.exif.lensName,
      l.exif.shutterDisplay,
      `f/${l.exif.aperture}`,
      l.exif.iso,
      l.exif.focalLength35Mm,
      l.exif.resolutionMode,
      l.bortleAtCapture,
      l.gps?.lat ?? '',
      l.gps?.lng ?? '',
      l.exif.fileName,
      l.exif.isUneditedOriginal,
      l.notes,
    ]
      .map(escapeCsv)
      .join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nocturne-field-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
