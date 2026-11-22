import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Download,
  FileCode2,
  MapPin,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
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

  // Composer state
  const [category, setCategory] = useState<CaptureCategory>(CaptureCategory.Wildlife);
  const [speciesTag, setSpeciesTag] = useState<string>('Frog');
  const [selectedLensId, setSelectedLensId] = useState<string>('tele3x-67');
  const [shutterSec, setShutterSec] = useState<number>(0.002); // 1/500s
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

  // Logbook filter state
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

  const handleFileIngest = async (file: File) => {
    setParsingFile(true);
    try {
      const result = await parseCameraFileExif(file);
      setPendingFile(file);
      setParsedExif(result.exif);
      setParsedGps(result.gps);
      setPreviewUrl(result.previewDataUrl);
      setShutterSec(result.exif.shutterSec);
      setIso(result.exif.iso);
      if (result.exif.shutterSec >= 1) {
        setCategory(CaptureCategory.Astro);
        if (speciesTag === 'Frog') setSpeciesTag('Night Sky');
      }
      onNotify(
        result.exif.parsedFromFile
          ? `Decoded EXIF from ${file.name} (${result.exif.shutterDisplay}, ISO ${result.exif.iso})`
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

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSpecies = speciesTag.trim() || (category === CaptureCategory.Astro ? 'Night Sky' : 'Unclassified');
    setSaving(true);
    try {
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const finalExif: ExifMetadata = parsedExif ?? {
        cameraMake: 'Samsung',
        cameraModel: 'SM-S928B (Galaxy S24 Ultra)',
        lensName: activeLens.name,
        shutterSec,
        shutterDisplay: formatShutterDisplay(shutterSec),
        iso,
        aperture: activeLens.aperture,
        focalLengthMm: activeLens.focalLengthActualMm,
        focalLength35Mm: activeLens.focalLength35EqMm,
        resolutionMode: `${activeLens.resolutionMp} MP ${category === CaptureCategory.Astro ? 'Expert RAW' : 'Manual Log'}`,
        whiteBalance: 'Native Daylight / Manual',
        capturedAt: new Date().toISOString(),
        fileName: `${cleanSpecies.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.dng`,
        fileSizeBytes: 0,
        mimeType: 'image/x-adobe-dng',
        isRawDng: true,
        isUneditedOriginal: true,
        parsedFromFile: false,
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

      // Reset transient file attachment after saving
      setPendingFile(null);
      setParsedExif(null);
      setParsedGps(null);
      setPreviewUrl(undefined);
      setNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setSaving(false);
    }
  };

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
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Capture & EXIF Composer Column */}
        <aside className="w-full lg:w-[400px] shrink-0 border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-5 space-y-5">
          <div>
            <h1 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              RAW & Wildlife Field Capture
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Drop an unedited Galaxy S24 Ultra .dng or .jpg to read EXIF/GPS bytes, or quick-log directly in the field.
            </p>
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
            className={`rounded-md border border-dashed p-4 text-center cursor-pointer transition-colors ${
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
              <div className="py-3 text-xs font-mono text-[var(--accent-secondary)]">
                Decoding TIFF/IFD & GPS headers...
              </div>
            ) : pendingFile && parsedExif ? (
              <div className="space-y-2 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-semibold text-[var(--text-primary)] truncate">
                    {parsedExif.fileName}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--accent-secondary)] shrink-0">
                    {formatFileSize(parsedExif.fileSizeBytes)}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)]">
                  {parsedExif.shutterDisplay} · f/{parsedExif.aperture} · ISO {parsedExif.iso} ·{' '}
                  {parsedExif.focalLength35Mm}mm eq.
                </div>
                <div className="text-[11px] font-mono text-[var(--status-nominal)] inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    {parsedExif.isUneditedOriginal
                      ? 'Zero-Filter Original Verified'
                      : 'Modified Software Header'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-2 space-y-1.5">
                <Upload className="w-5 h-5 mx-auto text-[var(--accent-secondary)]" />
                <div className="text-xs font-medium text-[var(--text-primary)]">
                  Select or drop Expert RAW (.dng) / JPEG
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  100% client-side EXIF & thumbnail extraction · Zero cloud upload
                </div>
              </div>
            )}
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
                className={`min-h-[40px] text-xs font-medium rounded transition-colors cursor-pointer ${
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
                className={`min-h-[40px] text-xs font-medium rounded transition-colors cursor-pointer ${
                  category === CaptureCategory.Astro
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Night Sky / Astro
              </button>
            </div>

            {/* Quick Species Tagger */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-[var(--text-secondary)]">
                Quick Species / Target Tag
              </span>
              <div className="grid grid-cols-4 gap-1.5">
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
                      className={`min-h-[40px] px-2 py-1.5 rounded border text-xs font-medium transition-colors cursor-pointer truncate ${
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
                className="w-full px-3 py-2 text-xs rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:border-[var(--accent-secondary)] outline-none"
              />
            </div>

            {/* Manual EXIF / Optic Overrides (used if no DNG uploaded or for adjustments) */}
            {!parsedExif && (
              <div className="space-y-3 pt-2 border-t border-[var(--border-hairline)]">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    S24 Ultra Optic Preset
                  </label>
                  <select
                    value={selectedLensId}
                    onChange={(e) => setSelectedLensId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:border-[var(--accent-secondary)] outline-none"
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
                      className="w-full px-2.5 py-2 text-xs font-mono rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] outline-none"
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
                      className="w-full px-2.5 py-2 text-xs font-mono rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] outline-none"
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
                      className="w-full px-2.5 py-2 text-xs font-mono rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* GPS Toggle & Field Notes */}
            <div className="space-y-2.5">
              <label className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] cursor-pointer py-1">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
                  <span>
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
                    className="w-4 h-4 accent-[var(--accent-primary)]"
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
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] text-xs font-semibold hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              <span>{saving ? 'Saving to Offline Logbook...' : 'Save Capture to Field Log'}</span>
            </button>
          </form>
        </aside>

        {/* Right Field Logbook & WhatsApp Document Export Stage */}
        <section className="flex-1 min-w-0 w-full space-y-5">
          {/* Toolbar */}
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
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
                  className={`min-h-[38px] px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    filter === tab.id
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 flex-1 sm:flex-initial justify-end">
              <div className="relative flex-1 sm:w-52">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search species, lens..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:border-[var(--accent-secondary)] outline-none"
                />
              </div>

              <button
                type="button"
                disabled={logs.length === 0}
                onClick={() => exportLogsAsCsv(logs)}
                className="min-h-[38px] px-3 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                disabled={logs.length === 0}
                onClick={() => exportLogsAsJson(logs)}
                className="min-h-[38px] px-3 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
            </div>
          </div>

          {/* Logbook Entries */}
          {filteredLogs.length === 0 ? (
            <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-10 text-center space-y-2">
              <Camera className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                {logs.length === 0 ? 'No Field Captures Logged Yet' : 'No Matching Entries'}
              </h2>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                Drop a Samsung Expert RAW (.dng) or unedited JPEG into the left panel, or tap Frog / Chicken / Duck to record an instant field sighting offline.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => {
                const isExpanded = expandedId === log.id;
                return (
                  <article
                    key={log.id}
                    className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row gap-4 justify-between">
                      {/* Thumbnail / Raw Sensor Fallback */}
                      <div className="flex gap-3.5 min-w-0">
                        <div className="w-20 h-20 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] shrink-0 overflow-hidden flex items-center justify-center">
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
                      <div className="flex flex-wrap sm:flex-col items-stretch sm:items-end justify-between gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleWhatsAppShare(log)}
                          className="min-h-[40px] px-3.5 py-2 rounded bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] text-xs font-semibold hover:opacity-90 inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>
                            {log.hasOriginalBlob ? 'Export for WhatsApp (Doc)' : 'Copy WhatsApp Telemetry'}
                          </span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleCopyCaption(log)}
                            className="min-h-[36px] px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] inline-flex items-center gap-1 cursor-pointer"
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
                            className="min-h-[36px] px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] cursor-pointer"
                          >
                            {isExpanded ? 'Hide EXIF' : 'EXIF'}
                          </button>

                          <button
                            type="button"
                            onClick={() => void onDeleteLog(log.id)}
                            aria-label={`Delete ${log.speciesTag} log`}
                            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-muted)] hover:text-[var(--status-critical)] hover:border-[var(--status-critical)] cursor-pointer"
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
                      <div className="pt-3 border-t border-[var(--border-hairline)] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
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
                            {log.exif.fileName} ({log.hasOriginalBlob ? formatFileSize(log.exif.fileSizeBytes) : 'Metadata only'})
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)]">RESOLUTION MODE</div>
                          <div className="text-[var(--text-primary)] truncate">{log.exif.resolutionMode}</div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
