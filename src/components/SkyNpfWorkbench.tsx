import React, { useMemo, useState } from 'react';
import {
  Cloud,
  Droplets,
  MapPin,
  RefreshCw,
  Send,
  Sun,
  Wind,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { BORTLE_SCALE_REFERENCE, S24_ULTRA_OPTICS } from '../data/s24Optics';
import {
  GpsCoordinates,
  OpticalLensProfile,
  PrefilledAstroDraft,
  SkyConditions,
} from '../types/field';
import {
  calculateLunarTelemetry,
  calculateNpfExposure,
  calculateTwilightSchedule,
  getBortleInfo,
} from '../utils/astroMath';

interface SkyNpfWorkbenchProps {
  selectedLensId: string;
  onSelectLensId: (id: string) => void;
  bortleClass: number;
  onChangeBortle: (val: number) => void;
  gps: GpsCoordinates;
  onUpdateManualGps: (lat: number, lng: number, label?: string) => void;
  onLocateGps: () => void;
  gpsLocating: boolean;
  skyConditions: SkyConditions | null;
  skyLoading: boolean;
  skyError: string | null;
  onRefreshSky: () => void;
  onApplyToFieldLog: (draft: PrefilledAstroDraft) => void;
}

const SITE_PRESETS: Array<{ label: string; lat: number; lng: number; bortle: number }> = [
  { label: 'Joshua Tree Dark Sky', lat: 33.8734, lng: -115.901, bortle: 2 },
  { label: 'Atacama / ALMA Plateau', lat: -23.029, lng: -67.755, bortle: 1 },
  { label: 'Rural Wetland Reserve', lat: 52.3555, lng: 0.2584, bortle: 4 },
  { label: 'Suburban Backyard', lat: 34.0522, lng: -118.2437, bortle: 7 },
];

export const SkyNpfWorkbench: React.FC<SkyNpfWorkbenchProps> = ({
  selectedLensId,
  onSelectLensId,
  bortleClass,
  onChangeBortle,
  gps,
  onUpdateManualGps,
  onLocateGps,
  gpsLocating,
  skyConditions,
  skyLoading,
  skyError,
  onRefreshSky,
  onApplyToFieldLog,
}) => {
  const [declinationDeg, setDeclinationDeg] = useState<number>(15);
  const [toleranceK, setToleranceK] = useState<number>(1);
  const [hoveredOpticId, setHoveredOpticId] = useState<string | null>(null);
  const [manualLatInput, setManualLatInput] = useState<string>(gps.lat.toFixed(4));
  const [manualLngInput, setManualLngInput] = useState<string>(gps.lng.toFixed(4));

  const activeLens: OpticalLensProfile = useMemo(
    () => S24_ULTRA_OPTICS.find((o) => o.id === selectedLensId) ?? S24_ULTRA_OPTICS[1],
    [selectedLensId]
  );

  const npfResult = useMemo(
    () => calculateNpfExposure(activeLens, declinationDeg, toleranceK, bortleClass),
    [activeLens, declinationDeg, toleranceK, bortleClass]
  );

  const bortleInfo = useMemo(() => getBortleInfo(bortleClass), [bortleClass]);
  const lunar = useMemo(() => calculateLunarTelemetry(new Date()), []);
  const twilight = useMemo(
    () => calculateTwilightSchedule(gps.lat, gps.lng, new Date()),
    [gps.lat, gps.lng]
  );

  // Comparison dataset for Dual-Curve NPF vs 500-Rule SVG Chart across all 7 optical modes
  const chartData = useMemo(() => {
    return S24_ULTRA_OPTICS.map((lens) => {
      const calc = calculateNpfExposure(lens, declinationDeg, toleranceK, bortleClass);
      return {
        lens,
        npf: calc.npfSeconds,
        rule500: calc.rule500Seconds,
      };
    });
  }, [declinationDeg, toleranceK, bortleClass]);

  const maxChartSec = useMemo(() => {
    const peak = Math.max(...chartData.flatMap((d) => [d.npf, d.rule500]), 15);
    return Math.ceil(peak / 5) * 5;
  }, [chartData]);

  const hoveredPoint = chartData.find((d) => d.lens.id === hoveredOpticId) ?? chartData.find((d) => d.lens.id === activeLens.id) ?? chartData[1];

  const handleApplyCoords = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLat = parseFloat(manualLatInput);
    const parsedLng = parseFloat(manualLngInput);
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      onUpdateManualGps(
        Math.max(-90, Math.min(90, parsedLat)),
        Math.max(-180, Math.min(180, parsedLng)),
        'Manual Coordinates'
      );
    }
  };

  // Dew point spread safety calculation
  const dewSpreadC = skyConditions
    ? Math.round((skyConditions.tempC - skyConditions.dewPointC) * 10) / 10
    : null;
  const dewRisk =
    dewSpreadC === null
      ? null
      : dewSpreadC <= 2.5
      ? 'High Lens Dew Risk'
      : dewSpreadC <= 5
      ? 'Moderate Condensation Risk'
      : 'Dry Optics Safe';

  // SVG Lunar Phase Mask Math
  const lunarPath = useMemo(() => {
    const r = 34;
    const cx = 44;
    const cy = 44;
    // phaseFraction: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter
    const angle = lunar.phaseFraction * 2 * Math.PI;
    const rx = Math.abs(Math.cos(angle)) * r;
    const waxing = lunar.isWaxing;
    const outerSweep = waxing ? 1 : 0;
    const innerSweep =
      lunar.phaseFraction < 0.25 || lunar.phaseFraction > 0.75
        ? waxing
          ? 0
          : 1
        : waxing
        ? 1
        : 0;
    return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${outerSweep} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${innerSweep} ${cx} ${cy - r} Z`;
  }, [lunar]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-10">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Control & Parameter Column (340-380px) */}
        <aside className="w-full lg:w-[360px] shrink-0 space-y-5 border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-5">
          <div>
            <h1 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              S24 Ultra Exposure Console
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Calibrate NPF pinpoint shutter limits per Expert RAW binning mode and site sky darkness.
            </p>
          </div>

          {/* Optical Lens & Binning Selector */}
          <div className="space-y-2 pt-3 border-t border-[var(--border-hairline)]">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              Galaxy S24 Ultra Optic & Binning
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {S24_ULTRA_OPTICS.map((lens) => {
                const selected = lens.id === activeLens.id;
                return (
                  <button
                    key={lens.id}
                    type="button"
                    onClick={() => onSelectLensId(lens.id)}
                    className={`w-full text-left px-3 py-2.5 rounded border transition-colors cursor-pointer min-h-[44px] flex items-center justify-between gap-2 ${
                      selected
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/12 text-[var(--text-primary)]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{lens.name}</div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                        f/{lens.aperture} · {lens.pixelPitchUm.toFixed(2)} µm · {lens.focalLengthActualMm}mm ({lens.focalLength35EqMm}mm eq.)
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-[var(--accent-secondary)] shrink-0">
                      {lens.zoomLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Declination & Trailing Tolerance */}
          <div className="space-y-4 pt-3 border-t border-[var(--border-hairline)]">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="declination-range" className="font-medium text-[var(--text-secondary)]">
                  Target Celestial Declination (δ)
                </label>
                <span className="font-mono font-semibold text-[var(--accent-secondary)] tabular-nums">
                  {declinationDeg}°
                </span>
              </div>
              <input
                id="declination-range"
                type="range"
                min={0}
                max={85}
                step={1}
                value={declinationDeg}
                onChange={(e) => setDeclinationDeg(Number(e.target.value))}
                className="w-full telemetry-slider"
              />
              <div className="flex justify-between text-[11px] font-mono text-[var(--text-muted)] mt-1">
                <span>0° Equator (Orion)</span>
                <span>45° Mid</span>
                <span>85° Pole</span>
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Star Trailing Tolerance (k)
              </span>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
                {[
                  { k: 1, label: 'k=1 Strict' },
                  { k: 2, label: 'k=2 Balanced' },
                  { k: 3, label: 'k=3 Trail OK' },
                ].map((opt) => (
                  <button
                    key={opt.k}
                    type="button"
                    onClick={() => setToleranceK(opt.k)}
                    className={`min-h-[38px] px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      toleranceK === opt.k
                        ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bortle Class Selector */}
          <div className="space-y-2.5 pt-3 border-t border-[var(--border-hairline)]">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="bortle-range" className="font-medium text-[var(--text-secondary)]">
                Bortle Sky Darkness Class
              </label>
              <span className="font-mono font-semibold text-[var(--accent-primary)] tabular-nums">
                Class {bortleClass} · {bortleInfo.sqmMid.toFixed(1)} SQM
              </span>
            </div>
            <input
              id="bortle-range"
              type="range"
              min={1}
              max={9}
              step={1}
              value={bortleClass}
              onChange={(e) => onChangeBortle(Number(e.target.value))}
              className="w-full telemetry-slider"
            />
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              <span className="text-[var(--text-secondary)] font-medium">{bortleInfo.name}</span> —{' '}
              {bortleInfo.milkyWayNote}
            </p>
          </div>

          {/* Site Coordinates & Presets */}
          <div className="space-y-2.5 pt-3 border-t border-[var(--border-hairline)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">Observation Site</span>
              <button
                type="button"
                onClick={onLocateGps}
                disabled={gpsLocating}
                className="inline-flex items-center gap-1 text-xs text-[var(--accent-secondary)] hover:underline cursor-pointer disabled:opacity-50"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>{gpsLocating ? 'Locking...' : 'Use Device GPS'}</span>
              </button>
            </div>

            <form onSubmit={handleApplyCoords} className="grid grid-cols-2 gap-2">
              <input
                type="text"
                aria-label="Latitude"
                value={manualLatInput}
                onChange={(e) => setManualLatInput(e.target.value)}
                placeholder="Latitude"
                className="px-2.5 py-2 text-xs font-mono rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:border-[var(--accent-secondary)] outline-none"
              />
              <input
                type="text"
                aria-label="Longitude"
                value={manualLngInput}
                onChange={(e) => setManualLngInput(e.target.value)}
                placeholder="Longitude"
                className="px-2.5 py-2 text-xs font-mono rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] focus:border-[var(--accent-secondary)] outline-none"
              />
              <button
                type="submit"
                className="col-span-2 min-h-[38px] px-3 py-1.5 text-xs font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--accent-secondary)] transition-colors cursor-pointer"
              >
                Update Sky Coordinates
              </button>
            </form>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {SITE_PRESETS.map((site) => (
                <button
                  key={site.label}
                  type="button"
                  onClick={() => {
                    setManualLatInput(site.lat.toFixed(4));
                    setManualLngInput(site.lng.toFixed(4));
                    onUpdateManualGps(site.lat, site.lng, site.label);
                    onChangeBortle(site.bortle);
                  }}
                  className="text-left px-2.5 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] truncate cursor-pointer"
                >
                  {site.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onApplyToFieldLog({
                lensId: activeLens.id,
                shutterSec: npfResult.npfSeconds,
                iso: npfResult.suggestedIso,
                bortle: bortleClass,
                notes: `NPF calculation (${activeLens.name}, δ=${declinationDeg}°, k=${toleranceK}). ${npfResult.evNote}.`,
              })
            }
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] text-xs font-semibold hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Apply Exposure Recipe to Field Log</span>
          </button>
        </aside>

        {/* Main Viewport Stage */}
        <section className="flex-1 min-w-0 w-full space-y-6">
          {/* Primary KPI Telemetry Row */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                NPF Max Shutter
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className="text-3xl font-mono font-bold text-[var(--accent-primary)] tabular-nums">
                  {npfResult.npfSeconds.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-[var(--text-muted)] ml-1.5">SEC</span>
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)] truncate">
                {npfResult.evNote}
              </div>
            </div>

            <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Legacy 500-Rule Ref
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className="text-3xl font-mono font-bold text-[var(--text-primary)] tabular-nums">
                  {npfResult.rule500Seconds.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-[var(--text-muted)] ml-1.5">SEC</span>
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)] truncate">
                {npfResult.rule500Seconds > npfResult.npfSeconds
                  ? `Over-exposes stars by ${(npfResult.rule500Seconds - npfResult.npfSeconds).toFixed(1)}s`
                  : 'Aligned with NPF ceiling'}
              </div>
            </div>

            <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Expert RAW ISO Target
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className="text-3xl font-mono font-bold text-[var(--accent-secondary)] tabular-nums">
                  {npfResult.suggestedIso}
                </span>
                <span className="text-xs font-mono text-[var(--text-muted)] ml-1.5">ISO</span>
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)] truncate">
                f/{activeLens.aperture} · {activeLens.resolutionMp}MP DNG
              </div>
            </div>

            <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Sky Quality (NELM)
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className="text-3xl font-mono font-bold text-[var(--text-primary)] tabular-nums">
                  {bortleInfo.sqmMid.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-[var(--text-muted)] ml-1.5">MAG/″²</span>
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)] truncate">
                Bortle {bortleClass} · Limiting Mag {bortleInfo.nelm}
              </div>
            </div>
          </div>

          {/* Dual-Curve NPF vs 500-Rule Calibration SVG Chart */}
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  NPF Pinpoint Limit vs. 500-Rule Across S24 Ultra Optics
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Hover or tap any optical sensor column to inspect shutter divergence at δ={declinationDeg}° and k={toleranceK}.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="inline-flex items-center gap-1.5 text-[var(--accent-secondary)]">
                  <span className="w-4 h-[2px] bg-[var(--accent-secondary)] inline-block" />
                  <span>NPF Exact</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[var(--accent-primary)]">
                  <span className="w-4 h-[2px] border-t-2 border-dashed border-[var(--accent-primary)] inline-block" />
                  <span>500-Rule</span>
                </span>
              </div>
            </div>

            {/* Interactive SVG Chart */}
            <div className="w-full overflow-x-auto">
              <svg
                viewBox="0 0 760 250"
                className="w-full min-w-[560px] h-auto select-none cursor-crosshair"
                role="img"
                aria-label="NPF vs 500-Rule shutter limit comparison across Galaxy S24 Ultra sensors"
              >
                {/* Horizontal grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                  const y = 200 - frac * 170;
                  const val = Math.round(frac * maxChartSec);
                  return (
                    <g key={frac}>
                      <line
                        x1={56}
                        y1={y}
                        x2={730}
                        y2={y}
                        stroke="var(--chart-grid)"
                        strokeWidth={1}
                      />
                      <text
                        x={46}
                        y={y + 4}
                        textAnchor="end"
                        fill="var(--text-muted)"
                        fontSize={10}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {val}s
                      </text>
                    </g>
                  );
                })}

                {/* 500-Rule Dashed Path */}
                <polyline
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  points={chartData
                    .map((d, idx) => {
                      const x = 96 + idx * 98;
                      const y = 200 - (Math.min(d.rule500, maxChartSec) / maxChartSec) * 170;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />

                {/* NPF Solid Path */}
                <polyline
                  fill="none"
                  stroke="var(--accent-secondary)"
                  strokeWidth={2.5}
                  points={chartData
                    .map((d, idx) => {
                      const x = 96 + idx * 98;
                      const y = 200 - (Math.min(d.npf, maxChartSec) / maxChartSec) * 170;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />

                {/* Data Vertices & Interactive Columns */}
                {chartData.map((d, idx) => {
                  const x = 96 + idx * 98;
                  const yNpf = 200 - (Math.min(d.npf, maxChartSec) / maxChartSec) * 170;
                  const y500 = 200 - (Math.min(d.rule500, maxChartSec) / maxChartSec) * 170;
                  const isFocused = hoveredPoint.lens.id === d.lens.id;
                  const isSelected = d.lens.id === activeLens.id;

                  return (
                    <g
                      key={d.lens.id}
                      onMouseEnter={() => setHoveredOpticId(d.lens.id)}
                      onClick={() => onSelectLensId(d.lens.id)}
                      className="cursor-pointer"
                    >
                      <rect x={x - 42} y={24} width={84} height={180} fill="transparent" />
                      {(isFocused || isSelected) && (
                        <line
                          x1={x}
                          y1={28}
                          x2={x}
                          y2={200}
                          stroke={isSelected ? 'var(--accent-primary)' : 'var(--border-strong)'}
                          strokeWidth={1}
                        />
                      )}
                      <circle
                        cx={x}
                        cy={y500}
                        r={isFocused ? 5 : 3.5}
                        fill="var(--bg-canvas)"
                        stroke="var(--accent-primary)"
                        strokeWidth={2}
                      />
                      <circle
                        cx={x}
                        cy={yNpf}
                        r={isSelected ? 6 : isFocused ? 5 : 4}
                        fill="var(--accent-secondary)"
                        stroke="var(--bg-canvas)"
                        strokeWidth={2}
                      />
                      <text
                        x={x}
                        y={220}
                        textAnchor="middle"
                        fill={isSelected ? 'var(--text-primary)' : 'var(--text-muted)'}
                        fontSize={10}
                        fontWeight={isSelected ? 700 : 500}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {d.lens.zoomLabel} · {d.lens.resolutionMp}MP
                      </text>
                      <text
                        x={x}
                        y={235}
                        textAnchor="middle"
                        fill="var(--text-muted)"
                        fontSize={9}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {d.lens.pixelPitchUm.toFixed(2)}µm
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Compact Crosshair Readout Bar */}
            <div className="mt-3 pt-3 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <span className="text-[var(--text-primary)] font-semibold">
                {hoveredPoint.lens.name}
              </span>
              <div className="flex flex-wrap items-center gap-4 text-[var(--text-secondary)]">
                <span>NPF: {hoveredPoint.npf.toFixed(1)}s</span>
                <span aria-hidden="true">·</span>
                <span>500-Rule: {hoveredPoint.rule500.toFixed(1)}s</span>
                <span aria-hidden="true">·</span>
                <span>Pitch: {hoveredPoint.lens.pixelPitchUm.toFixed(2)} µm</span>
              </div>
            </div>
          </div>

          {/* Lunar Telemetry + Twilight + Live Cloud/Dew Conditions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Lunar Phase & Twilight Card */}
            <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  Lunar & Astronomical Dark Window
                </h2>
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  UTC Ephemeris
                </span>
              </div>

              <div className="flex items-center gap-5">
                <svg
                  width="88"
                  height="88"
                  viewBox="0 0 88 88"
                  className="shrink-0"
                  role="img"
                  aria-label={`Moon phase: ${lunar.phaseName}, ${lunar.illuminationPct}% illuminated`}
                >
                  <circle
                    cx="44"
                    cy="44"
                    r="34"
                    fill="var(--bg-canvas)"
                    stroke="var(--border-strong)"
                    strokeWidth="1.5"
                  />
                  <path d={lunarPath} fill="var(--accent-primary)" opacity="0.88" />
                </svg>

                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    {lunar.phaseName}
                  </div>
                  <div className="text-2xl font-mono font-bold text-[var(--accent-primary)] tabular-nums">
                    {lunar.illuminationPct.toFixed(1)}
                    <span className="text-xs text-[var(--text-muted)] ml-1">% ILLUM</span>
                  </div>
                  <div className="text-xs font-mono text-[var(--text-muted)]">
                    Lunar Age {lunar.ageDays}d · {lunar.isWaxing ? 'Waxing' : 'Waning'}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-hairline)] grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[var(--text-muted)] flex items-center gap-1">
                    <Sun className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>Civil / Nautical Dusk</span>
                  </div>
                  <div className="font-mono text-[var(--text-primary)] mt-1 tabular-nums">
                    {twilight.civilDuskUtc} / {twilight.nauticalDuskUtc}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Astro Dark Window</div>
                  <div className="font-mono text-[var(--accent-secondary)] mt-1 tabular-nums">
                    {twilight.astroDuskUtc} → {twilight.astroDawnUtc}
                  </div>
                </div>
              </div>
            </div>

            {/* Live Open-Meteo Sky Conditions Card */}
            <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                    Local Sky & Lens Dew Telemetry
                  </h2>
                  <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                    {skyConditions
                      ? skyConditions.isCachedFallback
                        ? `Cached Snapshot · ${new Date(skyConditions.fetchedAt).toLocaleTimeString()}`
                        : `Open-Meteo Live · ${new Date(skyConditions.fetchedAt).toLocaleTimeString()}`
                      : 'Awaiting telemetry'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRefreshSky}
                  disabled={skyLoading}
                  className="min-h-[38px] px-3 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${skyLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {skyConditions ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                        <Cloud className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
                        <span>Total Cloud</span>
                      </div>
                      <div className="text-xl font-mono font-bold text-[var(--text-primary)] mt-1 tabular-nums">
                        {skyConditions.cloudCoverPct}%
                      </div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                        L:{skyConditions.lowCloudPct}% M:{skyConditions.midCloudPct}% H:{skyConditions.highCloudPct}%
                      </div>
                    </div>

                    <div className="p-3 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                        <Droplets className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        <span>Dew Spread</span>
                      </div>
                      <div className="text-xl font-mono font-bold text-[var(--text-primary)] mt-1 tabular-nums">
                        {dewSpreadC !== null ? `${dewSpreadC}°C` : '—'}
                      </div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                        {skyConditions.tempC}°C / DP {skyConditions.dewPointC}°C
                      </div>
                    </div>

                    <div className="p-3 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                        <Wind className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                        <span>Wind / Vis</span>
                      </div>
                      <div className="text-xl font-mono font-bold text-[var(--text-primary)] mt-1 tabular-nums">
                        {skyConditions.windKmh}
                        <span className="text-[11px] text-[var(--text-muted)] ml-1">km/h</span>
                      </div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                        Vis {skyConditions.visibilityKm} km · {skyConditions.humidityPct}% RH
                      </div>
                    </div>
                  </div>

                  {dewRisk && (
                    <div className="flex items-center gap-2 text-xs pt-1 text-[var(--text-secondary)]">
                      {dewSpreadC !== null && dewSpreadC <= 2.5 ? (
                        <AlertTriangle className="w-4 h-4 text-[var(--status-warning)] shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-[var(--status-nominal)] shrink-0" />
                      )}
                      <span>
                        {dewRisk} ·{' '}
                        {skyConditions.cloudCoverPct <= 20
                          ? 'Clear window for Expert RAW multi-minute bursts'
                          : skyConditions.cloudCoverPct <= 55
                          ? 'Scattered cloud gaps — watch between frames'
                          : 'Heavy cloud deck — favor wildlife or equipment calibration'}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs text-[var(--text-muted)]">
                  {skyLoading
                    ? 'Fetching cloud layers, dew point, and visibility from Open-Meteo...'
                    : skyError || 'Offline mode active — local astronomical math and Bortle tools remain available.'}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
