import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Aperture,
  Camera,
  Check,
  Copy,
  Download,
  FileCode2,
  MapPin,
  Search,
  Share2,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CameraCaptureModal } from './CameraCaptureModal';
import { S24_ULTRA_OPTICS, WILDLIFE_SPECIES_PRESETS } from '../data/s24Optics';
import {
  CaptureCategory,
  ExifMetadata,
  FieldCaptureLog,
  GpsCoordinates,
  PrefilledAstroDraft,
} from '../types/field';
import {
  buildWhatsAppCaption,
  exportLogsAsCsv,
  exportLogsAsJson,
  formatFileSize,
  formatShutterDisplay,
  parseCameraFileExif,
  shareOrExportWhatsAppDocument,
} from '../utils/exifAndStorage';

interface WildlifeFieldLoggerProps {
  logs: FieldCaptureLog[];
  gps: GpsCoordinates;
  bortleClass: number;
  prefilledDraft: PrefilledAstroDraft | null;
  onConsumeDraft: () => void;
  onSaveLog: (log: FieldCaptureLog, file?: File | null) => Promise<void>;
  onDeleteLog: (id: string) => Promise<void>;
  onNotify: (msg: string) => void;
}

type LogFilter = 'all' | 'wildlife' | 'astro';

export const WildlifeFieldLogger: React.FC<WildlifeFieldLoggerProps> = ({
  logs,
  gps,
  bortleClass,
  prefilledDraft,
  onConsumeDraft,
  onSaveLog,
  onDeleteLog,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  const [category, setCategory] = useState<CaptureCategory>(CaptureCategory.Wildlife);
  const [speciesTag, setSpeciesTag] = useState<string>('Frog');
  const [selectedLensId, setSelectedLensId] = useState<string>('tele3x-67');
  const [shutterSec, setShutterSec] = useState<number>(0.002);
  const [iso, setIso] = useState<number>(200);
  const [bortle, setBortle] = useState<number>(bortleClass);
  const [notes, setNotes] = useState<string>('');
  const [attachGps, setAttachGps] = useState<boolean>(true);
  const [parsedExif, setParsedExif] = useState<ExifMetadata | null>(null);
  const [parsedGps, setParsedGps] = useState<GpsCoordinates | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [parsingFile, setParsingFile] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [cameraModalOpen, setCameraModalOpen] = useState<boolean>(false);

  const [filter, setFilter] = useState<LogFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setBortle(bortleClass);
  }, [bortleClass]);

  useEffect(() => {
    if (prefilledDraft) {
      setCategory(CaptureCategory.Astro);
      setSpeciesTag('Night Sky');
      setSelectedLensId(prefilledDraft.lensId);
      setShutterSec(prefilledDraft.shutterSec);
      setIso(prefilledDraft.iso);
      setBortle(prefilledDraft.bortle);
      setNotes(prefilledDraft.notes);
      setParsedExif(null);
      setPendingFile(null);
      setPreviewUrl(undefined);
      onConsumeDraft();
    }
  }, [prefilledDraft, onConsumeDraft]);

  const activeLens = useMemo(
    () => S24_ULTRA_OPTICS.find((o) => o.id === selectedLensId) ?? S24_ULTRA_OPTICS[4],
    [selectedLensId]
  );

  const handleFileIngest = async (file: File, fromLiveCamera = false) => {
    setParsingFile(true);
    try {
      const result = await parseCameraFileExif(file);
      let finalExif = result.exif;
      if (fromLiveCamera && !result.exif.parsedFromFile) {
        finalExif = {
          ...result.exif,
          lensName: activeLens.name,
          shutterSec,
          shutterDisplay: formatShutterDisplay(shutterSec),
          iso,
          aperture: activeLens.aperture,
          focalLengthMm: activeLens.focalLengthActualMm,
          focalLength35Mm: activeLens.focalLength35EqMm,
          resolutionMode: 'Phone Camera Capture',
        };
      }
      setPendingFile(file);
      setParsedExif(finalExif);
      setParsedGps(result.gps);
      setPreviewUrl(result.previewDataUrl);
      if (result.exif.parsedFromFile) {
        setShutterSec(result.exif.shutterSec);
        setIso(result.exif.iso);
        if (result.exif.shutterSec >= 1) {
          setCategory(CaptureCategory.Astro);
          if (speciesTag === 'Frog') setSpeciesTag('Night Sky');
        }
      }
      onNotify(
        result.exif.parsedFromFile
          ? `Decoded EXIF from ${file.name} (${result.exif.shutterDisplay}, ISO ${result.exif.iso})`
          : fromLiveCamera
          ? `Captured ${file.name} (${formatFileSize(file.size)}) — ready to tag and save.`
          : `Attached ${file.name}; no embedded EXIF found, manual fields ready.`
      );
    } catch {
      onNotify(`Could not decode ${file.name}; file retained for manual logging.`);
    } finally {
      setParsingFile(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileIngest(file);
    }
  };

  const handleLoadSampleShot = async (preset: 'frog' | 'astro') => {
    const isAstro = preset === 'astro';
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 420;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      if (isAstro) {
        grad.addColorStop(0, '#040814');
        grad.addColorStop(1, '#0d192b');
      } else {
        grad.addColorStop(0, '#0b1815');
        grad.addColorStop(1, '#162721');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (isAstro) {
        for (let i = 0; i < 160; i++) {
          const sx = ((i * 197 + 31) % 640);
          const sy = ((i * 113 + 17) % 340);
          const r = (i % 9 === 0) ? 1.8 : 0.9;
          ctx.fillStyle = i % 7 === 0 ? 'rgba(130, 212, 255, 0.85)' : 'rgba(241, 245, 249, 0.8)';
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#070b12';
        ctx.beginPath();
        ctx.moveTo(0, 380);
        ctx.lineTo(140, 330);
        ctx.lineTo(290, 360);
        ctx.lineTo(470, 320);
        ctx.lineTo(640, 365);
        ctx.lineTo(640, 420);
        ctx.lineTo(0, 420);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(320, 310, 170, 42, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#2d4d3e';
        ctx.beginPath();
        ctx.ellipse(320, 295, 95, 26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#74a87e';
        ctx.beginPath();
        ctx.ellipse(315, 272, 28, 18, -0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e5a83b';
        ctx.beginPath();
        ctx.arc(330, 260, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 20, 600, 380);
      ctx.fillStyle = 'rgba(241, 245, 249, 0.78)';
      ctx.font = '13px monospace';
      ctx.fillText(
        isAstro
          ? 'SM-S928B · 24mm f/1.7 · 9.9s · ISO 800 · SAMPLE FRAME'
          : 'SM-S928B · 111mm 5x · 1/500s · f/3.4 · ISO 200 · SAMPLE FRAME',
        32,
        44
      );
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    );
    if (!blob) return;

    const fileName = isAstro
      ? `S24U_Sample_MilkyWay_${Date.now()}.jpg`
      : `S24U_Sample_PondFrog_${Date.now()}.jpg`;
    const sampleFile = new File([blob], fileName, { type: 'image/jpeg' });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const lens = isAstro ? S24_ULTRA_OPTICS[1] : S24_ULTRA_OPTICS[5];

    const sampleExif: ExifMetadata = {
      cameraMake: 'Samsung',
      cameraModel: 'SM-S928B (Galaxy S24 Ultra)',
      lensName: lens.name,
      shutterSec: isAstro ? 9.9 : 0.002,
      shutterDisplay: isAstro ? '9.9s' : '1/500s',
      iso: isAstro ? 800 : 200,
      aperture: lens.aperture,
      focalLengthMm: lens.focalLengthActualMm,
      focalLength35Mm: lens.focalLength35EqMm,
      resolutionMode: `${lens.resolutionMp} MP Sample Frame`,
      whiteBalance: isAstro ? '4200K Manual' : 'Auto Daylight',
      capturedAt: new Date().toISOString(),
      fileName,
      fileSizeBytes: sampleFile.size,
      mimeType: 'image/jpeg',
      isRawDng: false,
      isUneditedOriginal: true,
      parsedFromFile: true,
    };

    setPendingFile(sampleFile);
    setParsedExif(sampleExif);
    setParsedGps(gps);
    setPreviewUrl(dataUrl);
    setSelectedLensId(lens.id);
    setShutterSec(sampleExif.shutterSec);
    setIso(sampleExif.iso);
    setCategory(isAstro ? CaptureCategory.Astro : CaptureCategory.Wildlife);
    setSpeciesTag(isAstro ? 'Night Sky' : 'Frog');
    setNotes(
      isAstro
        ? 'Sample Expert RAW starfield test frame ready for uncompressed document export.'
        : 'Sample 5x periscope wetland frog sighting ready for uncompressed WhatsApp export.'
    );
    onNotify(`Loaded ${isAstro ? 'Sample Night Sky' : 'Sample Pond Frog'} (${formatFileSize(sampleFile.size)}) — tap Save Capture to test logbook & export.`);
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSpecies =
      speciesTag.trim() || (category === CaptureCategory.Astro ? 'Night Sky' : 'Unclassified');
    setSaving(true);
    try {
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const finalExif: ExifMetadata =
        parsedExif && parsedExif.parsedFromFile
          ? parsedExif
          : {
              ...(parsedExif ?? {
                cameraMake: 'Samsung',
                cameraModel: 'SM-S928B (Galaxy S24 Ultra)',
                resolutionMode: `${activeLens.resolutionMp} MP ${
                  category === CaptureCategory.Astro ? 'Expert RAW' : 'Manual Log'
                }`,
                whiteBalance: 'Native Daylight / Manual',
                capturedAt: new Date().toISOString(),
                fileName: `${cleanSpecies.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.dng`,
                fileSizeBytes: 0,
                mimeType: 'image/x-adobe-dng',
                isRawDng: true,
                isUneditedOriginal: true,
                parsedFromFile: false,
              }),
              lensName: activeLens.name,
              shutterSec,
              shutterDisplay: formatShutterDisplay(shutterSec),
              iso,
              aperture: activeLens.aperture,
              focalLengthMm: activeLens.focalLengthActualMm,
              focalLength35Mm: activeLens.focalLength35EqMm,
            };

      const entry: FieldCaptureLog = {
        id,
        createdAt: finalExif.capturedAt || new Date().toISOString(),
        category,
        speciesTag: cleanSpecies,
        notes: notes.trim(),
        gps: parsedGps ?? (attachGps ? gps : null),
        bortleAtCapture: bortle,
        exif: finalExif,
        hasOriginalBlob: Boolean(pendingFile),
        previewDataUrl: previewUrl,
      };

      await onSaveLog(entry, pendingFile);

      setPendingFile(null);
      setParsedExif(null);
      setParsedGps(null);
      setPreviewUrl(undefined);
      setNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = '';
    } finally {
      setSaving(false);
    }
  };

  const collectionStats = useMemo(() => {
    let frogs = 0;
    let chickens = 0;
    let ducks = 0;
    let nightSkies = 0;
    let totalBytes = 0;

    for (const item of logs) {
      const tag = item.speciesTag.toLowerCase();
      if (tag.includes('frog') || tag.includes('toad')) frogs++;
      if (tag.includes('chicken') || tag.includes('hen') || tag.includes('rooster')) chickens++;
      if (tag.includes('duck') || tag.includes('mallard')) ducks++;
      if (item.category === CaptureCategory.Astro || tag.includes('sky')) nightSkies++;
      if (item.hasOriginalBlob) totalBytes += item.exif.fileSizeBytes || 0;
    }

    return {
      total: logs.length,
      frogs,
      chickens,
      ducks,
      nightSkies,
      totalBytes,
    };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((item) => {
      if (filter === 'wildlife' && item.category !== CaptureCategory.Wildlife) return false;
      if (filter === 'astro' && item.category !== CaptureCategory.Astro) return false;
      if (!q) return true;
      return (
        item.speciesTag.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q) ||
        item.exif.lensName.toLowerCase().includes(q) ||
        item.exif.fileName.toLowerCase().includes(q)
      );
    });
  }, [logs, filter, searchQuery]);

  const handleWhatsAppShare = async (log: FieldCaptureLog) => {
    const res = await shareOrExportWhatsAppDocument(log);
    onNotify(res.message);
  };

  const handleCopyCaption = async (log: FieldCaptureLog) => {
    const caption = buildWhatsAppCaption(log);
    try {
      await navigator.clipboard.writeText(caption);
      setCopiedId(log.id);
      setTimeout(() => setCopiedId(null), 2000);
      onNotify('Copied formatted WhatsApp EXIF telemetry caption.');
    } catch {
      onNotify('Clipboard access blocked; use Export JSON/CSV or WhatsApp Share.');
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-24 md:pb-12">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Capture & EXIF Composer Column */}
        <aside className="w-full lg:w-[400px] shrink-0 border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4 sm:p-5 space-y-5">
          <div>
            <h1 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              RAW & Wildlife Field Capture
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Select a Galaxy S24 Ultra .dng or .jpg to read EXIF/GPS bytes, or quick-log directly in the field.
            </p>
          </div>

          {/* Direct Phone Camera Capture Controls */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCameraModalOpen(true)}
              className="min-h-[44px] px-3 py-2 rounded border border-[var(--accent-primary)]/70 bg-[var(--accent-primary)]/12 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/20 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
            >
              <Camera className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
              <span className="truncate">Live Camera</span>
            </button>

            <button
              type="button"
              onClick={() => nativeCameraInputRef.current?.click()}
              className="min-h-[44px] px-3 py-2 rounded border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-secondary)] inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
            >
              <Smartphone className="w-4 h-4 text-[var(--accent-secondary)] shrink-0" />
              <span className="truncate">Phone Camera App</span>
            </button>

            <input
              ref={nativeCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileIngest(file, true);
              }}
            />
          </div>

          {/* File Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`rounded-md border border-dashed p-4 text-center cursor-pointer transition-colors min-h-[84px] flex flex-col justify-center ${
              dragActive
                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10'
                : 'border-[var(--border-strong)] bg-[var(--bg-canvas)] hover:border-[var(--accent-secondary)]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".dng,.DNG,image/jpeg,image/jpg,image/x-adobe-dng,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileIngest(file);
              }}
            />

            {parsingFile ? (
              <div className="py-2 text-xs font-mono text-[var(--accent-secondary)]">
                Decoding TIFF/IFD & GPS headers...
              </div>
            ) : pendingFile && parsedExif ? (
              <div className="flex items-center gap-3 text-left">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Pending capture preview"
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded border border-[var(--border-hairline)] object-cover shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-[var(--text-primary)] truncate">
                      {parsedExif.fileName}
                    </span>
                    <span className="text-[11px] font-mono text-[var(--accent-secondary)] shrink-0">
                      {formatFileSize(parsedExif.fileSizeBytes)}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                    {parsedExif.shutterDisplay} · f/{parsedExif.aperture} · ISO {parsedExif.iso} ·{' '}
                    {parsedExif.focalLength35Mm}mm eq.
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-[var(--status-nominal)] inline-flex items-center gap-1 truncate">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {parsedExif.isUneditedOriginal
                          ? 'Zero-Filter Original'
                          : 'Modified Software Header'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingFile(null);
                        setParsedExif(null);
                        setParsedGps(null);
                        setPreviewUrl(undefined);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                        if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = '';
                      }}
                      className="text-[11px] font-mono text-[var(--text-muted)] hover:text-[var(--status-critical)] shrink-0 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-1 space-y-1.5">
                <Upload className="w-5 h-5 mx-auto text-[var(--accent-secondary)]" />
                <div className="text-xs font-medium text-[var(--text-primary)]">
                  Tap or drop Expert RAW (.dng) / JPEG
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  100% client-side EXIF & thumbnail extraction
                </div>
              </div>
            )}
          </div>

          {/* One-Tap Sample Shot Sandbox Triggers */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleLoadSampleShot('frog')}
              className="min-h-[38px] px-2.5 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--accent-secondary)] hover:text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Aperture className="w-3.5 h-3.5 text-[var(--accent-secondary)] shrink-0" />
              <span className="truncate">Sample Pond Frog</span>
            </button>
            <button
              type="button"
              onClick={() => void handleLoadSampleShot('astro')}
              className="min-h-[38px] px-2.5 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Aperture className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
              <span className="truncate">Sample Night Sky</span>
            </button>
          </div>

          <form onSubmit={handleSaveEntry} className="space-y-4">
            {/* Category Switch */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
              <button
                type="button"
                onClick={() => {
                  setCategory(CaptureCategory.Wildlife);
                  if (speciesTag === 'Night Sky') setSpeciesTag('Frog');
                }}
                className={`min-h-[42px] text-xs font-medium rounded transition-colors cursor-pointer ${
                  category === CaptureCategory.Wildlife
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Wildlife Field Shot
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategory(CaptureCategory.Astro);
                  setSpeciesTag('Night Sky');
                }}
                className={`min-h-[42px] text-xs font-medium rounded transition-colors cursor-pointer ${
                  category === CaptureCategory.Astro
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Night Sky / Astro
              </button>
            </div>

            {/* Quick Species Tagger (2x2 on narrow mobile, 4-col on sm+) */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-[var(--text-secondary)]">
                Quick Species / Target Tag
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {WILDLIFE_SPECIES_PRESETS.map((sp) => {
                  const active = speciesTag.toLowerCase() === sp.label.toLowerCase();
                  return (
                    <button
                      key={sp.label}
                      type="button"
                      onClick={() => {
                        setSpeciesTag(sp.label);
                        setCategory(
                          sp.label === 'Night Sky'
                            ? CaptureCategory.Astro
                            : CaptureCategory.Wildlife
                        );
                      }}
                      className={`min-h-[44px] px-2.5 py-1.5 rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap truncate ${
                        active
                          ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary)]/15 text-[var(--text-primary)]'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {sp.label}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={speciesTag}
                onChange={(e) => setSpeciesTag(e.target.value)}
                placeholder="Or enter custom species (e.g. Tree Frog, Mallard, Orion)..."
                className="w-full min-h-[42px] px-3 py-2 text-xs rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:border-[var(--accent-secondary)] outline-none"
              />
            </div>

            {/* Manual EXIF / Optic Overrides */}
            {(!parsedExif || !parsedExif.parsedFromFile) && (
              <div className="space-y-3 pt-2 border-t border-[var(--border-hairline)]">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    S24 Ultra Optic Preset
                  </label>
                  <select
                    value={selectedLensId}
                    onChange={(e) => setSelectedLensId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-xs rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:border-[var(--accent-secondary)] outline-none"
                  >
                    {S24_ULTRA_OPTICS.map((lens) => (
                      <option key={lens.id} value={lens.id}>
                        {lens.zoomLabel} · {lens.name} (f/{lens.aperture})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                      Shutter (s)
                    </label>
                    <input
                      type="number"
                      step="0.0005"
                      min="0.0001"
                      max="60"
                      value={shutterSec}
                      onChange={(e) => setShutterSec(Math.max(0.0001, Number(e.target.value)))}
                      className="w-full min-h-[42px] px-2.5 py-2 text-xs font-mono rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                      ISO
                    </label>
                    <input
                      type="number"
                      step="50"
                      min="50"
                      max="12800"
                      value={iso}
                      onChange={(e) => setIso(Math.max(50, Number(e.target.value)))}
                      className="w-full min-h-[42px] px-2.5 py-2 text-xs font-mono rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                      Bortle
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="9"
                      value={bortle}
                      onChange={(e) =>
                        setBortle(Math.min(9, Math.max(1, Number(e.target.value))))
                      }
                      className="w-full min-h-[42px] px-2.5 py-2 text-xs font-mono rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* GPS Toggle & Field Notes */}
            <div className="space-y-2.5">
              <label className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] cursor-pointer min-h-[36px]">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-[var(--accent-secondary)] shrink-0" />
                  <span className="truncate">
                    {parsedGps
                      ? `EXIF GPS: ${parsedGps.lat.toFixed(4)}°, ${parsedGps.lng.toFixed(4)}°`
                      : `Attach Site GPS (${gps.lat.toFixed(4)}°, ${gps.lng.toFixed(4)}°)`}
                  </span>
                </span>
                {!parsedGps && (
                  <input
                    type="checkbox"
                    checked={attachGps}
                    onChange={(e) => setAttachGps(e.target.checked)}
                    className="w-5 h-5 accent-[var(--accent-primary)] shrink-0"
                  />
                )}
              </label>

              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Habitat, behavior, tripod/handheld, or sky seeing notes..."
                className="w-full px-3 py-2 text-xs rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:border-[var(--accent-secondary)] outline-none resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] text-xs font-semibold hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              <span>{saving ? 'Saving to Offline Logbook...' : 'Save Capture to Field Log'}</span>
            </button>
          </form>
        </aside>

        {/* Right Field Logbook & WhatsApp Document Export Stage */}
        <section className="flex-1 min-w-0 w-full space-y-4 sm:space-y-5">
          {/* Live Field Collection Tally Bar */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
            {[
              { label: 'Total Logs', value: String(collectionStats.total), accent: 'text-[var(--text-primary)]' },
              { label: 'Frogs', value: String(collectionStats.frogs), accent: 'text-[var(--accent-secondary)]' },
              { label: 'Chickens', value: String(collectionStats.chickens), accent: 'text-[var(--accent-primary)]' },
              { label: 'Ducks', value: String(collectionStats.ducks), accent: 'text-[var(--accent-secondary)]' },
              { label: 'Night Skies', value: String(collectionStats.nightSkies), accent: 'text-[var(--accent-primary)]' },
              {
                label: 'RAW Payload',
                value: collectionStats.totalBytes > 0 ? formatFileSize(collectionStats.totalBytes) : '0 B',
                accent: 'text-[var(--text-primary)]',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg px-3 py-2.5"
              >
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] truncate">
                  {stat.label}
                </div>
                <div className={`text-lg font-mono font-bold tabular-nums mt-0.5 truncate ${stat.accent}`}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Responsive Toolbar */}
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] w-full sm:w-auto">
              {[
                { id: 'all' as LogFilter, label: `All (${logs.length})` },
                {
                  id: 'wildlife' as LogFilter,
                  label: `Wildlife (${logs.filter((l) => l.category === CaptureCategory.Wildlife).length})`,
                },
                {
                  id: 'astro' as LogFilter,
                  label: `Astro (${logs.filter((l) => l.category === CaptureCategory.Astro).length})`,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`min-h-[40px] sm:min-h-[38px] px-2.5 sm:px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap truncate ${
                    filter === tab.id
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <div className="relative flex-1 sm:w-48">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search species, lens..."
                  className="w-full min-h-[40px] pl-8 pr-3 py-2 text-xs rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:border-[var(--accent-secondary)] outline-none"
                />
              </div>

              <button
                type="button"
                disabled={logs.length === 0}
                onClick={() => exportLogsAsCsv(logs)}
                className="min-h-[40px] px-3 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                disabled={logs.length === 0}
                onClick={() => exportLogsAsJson(logs)}
                className="min-h-[40px] px-3 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
            </div>
          </div>

          {/* Logbook Entries */}
          {filteredLogs.length === 0 ? (
            <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-8 sm:p-10 text-center space-y-2">
              <Camera className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                {logs.length === 0 ? 'No Field Captures Logged Yet' : 'No Matching Entries'}
              </h2>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                Select a Samsung Expert RAW (.dng) or unedited JPEG above, or tap Frog / Chicken / Duck to record an instant field sighting offline.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {filteredLogs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <motion.article
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                      key={log.id}
                      className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4 space-y-3"
                    >
                    <div className="flex flex-col sm:flex-row gap-3.5 sm:gap-4 justify-between">
                      {/* Thumbnail / Raw Sensor Fallback */}
                      <div className="flex gap-3 sm:gap-3.5 min-w-0">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] shrink-0 overflow-hidden flex items-center justify-center">
                          {log.previewDataUrl ? (
                            <img
                              src={log.previewDataUrl}
                              alt={`${log.speciesTag} capture preview`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center px-1">
                              <div className="text-[10px] font-mono font-semibold text-[var(--accent-secondary)]">
                                {log.exif.isRawDng ? 'RAW DNG' : 'LOG'}
                              </div>
                              <div className="text-[10px] font-mono text-[var(--text-muted)]">
                                {log.exif.focalLength35Mm}mm
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="text-xs font-mono text-[var(--text-muted)] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-[var(--accent-primary)] font-medium">
                              {log.category === CaptureCategory.Astro ? 'Astrophotography' : 'Wildlife'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {log.exif.isUneditedOriginal ? 'Unedited Original' : 'Software Tagged'}
                            </span>
                          </div>

                          <h3 className="font-display text-base font-semibold text-[var(--text-primary)] truncate">
                            {log.speciesTag}
                          </h3>

                          <div className="text-xs font-mono text-[var(--text-secondary)] tabular-nums flex flex-wrap gap-x-2 gap-y-0.5">
                            <span>{log.exif.shutterDisplay}</span>
                            <span aria-hidden="true">·</span>
                            <span>f/{log.exif.aperture}</span>
                            <span aria-hidden="true">·</span>
                            <span>ISO {log.exif.iso}</span>
                            <span aria-hidden="true">·</span>
                            <span>{log.exif.focalLength35Mm}mm eq.</span>
                            <span aria-hidden="true">·</span>
                            <span>Bortle {log.bortleAtCapture}</span>
                          </div>

                          {log.gps && (
                            <div className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                              GPS {log.gps.lat.toFixed(5)}°, {log.gps.lng.toFixed(5)}°
                              {log.gps.altitudeM !== undefined && log.gps.altitudeM !== null
                                ? ` · ${log.gps.altitudeM}m alt`
                                : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:items-end justify-between gap-2 shrink-0 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => void handleWhatsAppShare(log)}
                          className="w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] text-xs font-semibold hover:opacity-90 inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>
                            {log.hasOriginalBlob ? 'Export for WhatsApp (Doc)' : 'Copy WhatsApp Telemetry'}
                          </span>
                        </button>

                        <div className="grid grid-cols-3 sm:flex items-center gap-1.5 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => void handleCopyCaption(log)}
                            className="min-h-[40px] sm:min-h-[36px] px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] inline-flex items-center justify-center gap-1 cursor-pointer"
                            title="Copy WhatsApp EXIF caption"
                          >
                            {copiedId === log.id ? (
                              <Check className="w-3.5 h-3.5 text-[var(--status-nominal)]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>Caption</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                            className="min-h-[40px] sm:min-h-[36px] px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] cursor-pointer"
                          >
                            {isExpanded ? 'Hide EXIF' : 'EXIF'}
                          </button>

                          <button
                            type="button"
                            onClick={() => void onDeleteLog(log.id)}
                            aria-label={`Delete ${log.speciesTag} log`}
                            className="min-h-[40px] sm:min-h-[36px] min-w-[40px] sm:min-w-[36px] inline-flex items-center justify-center rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-muted)] hover:text-[var(--status-critical)] hover:border-[var(--status-critical)] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {log.notes && (
                      <p className="text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-hairline)]">
                        {log.notes}
                      </p>
                    )}

                    {isExpanded && (
                      <div className="pt-3 border-t border-[var(--border-hairline)] grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)]">CAMERA</div>
                          <div className="text-[var(--text-primary)] truncate">{log.exif.cameraModel}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)]">OPTIC / LENS</div>
                          <div className="text-[var(--text-primary)] truncate">{log.exif.lensName}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)]">FILE / PAYLOAD</div>
                          <div className="text-[var(--text-primary)] truncate">
                            {log.exif.fileName} (
                            {log.hasOriginalBlob ? formatFileSize(log.exif.fileSizeBytes) : 'Metadata only'})
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)]">RESOLUTION MODE</div>
                          <div className="text-[var(--text-primary)] truncate">{log.exif.resolutionMode}</div>
                        </div>
                      </div>
                    )}
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </section>
      </div>

      <CameraCaptureModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCaptureFile={(file) => handleFileIngest(file, true)}
        onTriggerNativeCamera={() => nativeCameraInputRef.current?.click()}
      />
    </div>
  );
};
