import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Gauge, OctagonAlert, RotateCcw } from 'lucide-react';
import { OpticalLensProfile } from '../types/field';

interface TrailRiskGaugeProps {
  lens: OpticalLensProfile;
  declinationDeg: number;
  toleranceK: number;
  npfSeconds: number;
  rule500Seconds: number;
  selectedExposureSec: number;
  onChangeExposureSec: (sec: number) => void;
  skyglowCapSec: number | null;
}

type RiskLevel = 'safe' | 'optimal' | 'caution' | 'danger';

interface RiskAssessment {
  level: RiskLevel;
  label: string;
  guidance: string;
  colorVar: string;
  ratio: number;
  deltaSec: number;
  starDriftPx: number;
  starDriftArcsec: number;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, radius: number, startDeg: number, endDeg: number): string {
  const start = polarToCartesian(cx, cy, radius, startDeg);
  const end = polarToCartesian(cx, cy, radius, endDeg);
  const largeArcFlag = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export const TrailRiskGauge: React.FC<TrailRiskGaugeProps> = ({
  lens,
  declinationDeg,
  toleranceK,
  npfSeconds,
  rule500Seconds,
  selectedExposureSec,
  onChangeExposureSec,
  skyglowCapSec,
}) => {
  // Gauge scale spans from 0s up to at least 2.2x NPF (or 30s / selected+2s), keeping NPF cutoff clearly centered-left
  const maxGaugeSec = useMemo(() => {
    const base = Math.max(npfSeconds * 2.2, 12);
    return Math.min(60, Math.ceil(Math.max(base, selectedExposureSec * 1.05, rule500Seconds * 1.1)));
  }, [npfSeconds, selectedExposureSec, rule500Seconds]);

  const assessment = useMemo<RiskAssessment>(() => {
    const safeNpf = Math.max(0.2, npfSeconds);
    const ratio = selectedExposureSec / safeNpf;
    const deltaSec = Math.round((selectedExposureSec - npfSeconds) * 10) / 10;

    // Sidereal drift on sensor: 15.041"/s * cos(dec) -> pixels via plate scale (206.265 * p_um / f_mm)
    const cosDec = Math.max(0.087, Math.cos((Math.min(85, Math.max(0, declinationDeg)) * Math.PI) / 180));
    const starDriftArcsec = Math.round(selectedExposureSec * 15.041 * cosDec * 10) / 10;
    const plateScaleArcsecPerPx = (206.265 * lens.pixelPitchUm) / lens.focalLengthActualMm;
    const starDriftPx = Math.round((starDriftArcsec / plateScaleArcsecPerPx) * 100) / 100;

    if (ratio <= 0.85) {
      return {
        level: 'safe',
        label: 'Pinpoint Safe',
        guidance: 'Well inside NPF limit — stars remain circular with margin for wind or tripod settling.',
        colorVar: 'var(--status-nominal)',
        ratio,
        deltaSec,
        starDriftPx,
        starDriftArcsec,
      };
    }
    if (ratio <= 1.05) {
      return {
        level: 'optimal',
        label: 'NPF Sweet Spot',
        guidance: 'Peak photon capture right at the pinpoint NPF threshold for this optic and declination.',
        colorVar: 'var(--accent-secondary)',
        ratio,
        deltaSec,
        starDriftPx,
        starDriftArcsec,
      };
    }
    if (ratio <= 1.45) {
      return {
        level: 'caution',
        label: 'Marginal Elongation',
        guidance: 'Slight oval star elongation at 100% DNG crop; shorten shutter or frame closer to the pole.',
        colorVar: 'var(--status-warning)',
        ratio,
        deltaSec,
        starDriftPx,
        starDriftArcsec,
      };
    }
    return {
      level: 'danger',
      label: 'Trail Danger Zone',
      guidance: 'Visible star streaking across multiple photosites. Reduce shutter toward the NPF limit.',
      colorVar: 'var(--status-critical)',
      ratio,
      deltaSec,
      starDriftPx,
      starDriftArcsec,
    };
  }, [selectedExposureSec, npfSeconds, declinationDeg, lens]);

  // Map seconds to angle on upper semicircle: 180° (left) -> 360° (right)
  const secToAngle = (sec: number) => {
    const frac = Math.max(0, Math.min(1, sec / maxGaugeSec));
    return 180 + frac * 180;
  };

  const cx = 160;
  const cy = 148;
  const radius = 112;

  const tSafeEnd = Math.min(maxGaugeSec, npfSeconds * 0.85);
  const tOptEnd = Math.min(maxGaugeSec, npfSeconds * 1.05);
  const tCautionEnd = Math.min(maxGaugeSec, npfSeconds * 1.45);

  const aStart = 180;
  const aSafeEnd = secToAngle(tSafeEnd);
  const aOptEnd = secToAngle(tOptEnd);
  const aCautionEnd = secToAngle(tCautionEnd);
  const aEnd = 360;

  const npfAngle = secToAngle(npfSeconds);
  const rule500Angle = secToAngle(rule500Seconds);
  const needleAngle = secToAngle(selectedExposureSec);

  const npfMarkerOuter = polarToCartesian(cx, cy, radius + 12, npfAngle);
  const npfMarkerInner = polarToCartesian(cx, cy, radius - 11, npfAngle);

  const r500MarkerOuter = polarToCartesian(cx, cy, radius + 9, rule500Angle);
  const r500MarkerInner = polarToCartesian(cx, cy, radius - 8, rule500Angle);

  const skyglowExceeded = skyglowCapSec !== null && selectedExposureSec > skyglowCapSec;

  const presets = [
    { label: '0.5× NPF', sec: Math.max(0.5, Math.round(npfSeconds * 0.5 * 10) / 10) },
    { label: `NPF ${npfSeconds.toFixed(1)}s`, sec: npfSeconds },
    { label: `500R ${rule500Seconds.toFixed(1)}s`, sec: Math.min(60, rule500Seconds) },
    { label: '15s', sec: 15 },
    { label: '30s', sec: 30 },
  ];

  const renderStatusIcon = () => {
    if (assessment.level === 'safe' || assessment.level === 'optimal') {
      return <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: assessment.colorVar }} />;
    }
    if (assessment.level === 'caution') {
      return <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: assessment.colorVar }} />;
    }
    return <OctagonAlert className="w-4 h-4 shrink-0" style={{ color: assessment.colorVar }} />;
  };

  return (
    <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-hairline)]">
        <div className="min-w-0">
          <h2 className="font-display text-sm sm:text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Gauge className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
            <span>Star-Trail Risk Gauge</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Selected shutter vs. NPF limit ({npfSeconds.toFixed(1)}s at {lens.zoomLabel}, δ={declinationDeg}°, k={toleranceK})
          </p>
        </div>

        <button
          type="button"
          onClick={() => onChangeExposureSec(npfSeconds)}
          className="min-h-[36px] px-3 py-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--accent-secondary)] hover:border-[var(--accent-secondary)] inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Snap to NPF ({npfSeconds.toFixed(1)}s)</span>
        </button>
      </div>

      <div className="pt-4 flex flex-col md:flex-row items-center md:items-stretch gap-5 sm:gap-6">
        {/* Semicircular SVG Gauge */}
        <div className="w-full max-w-[320px] shrink-0 flex flex-col items-center justify-center bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-md px-3 pt-3 pb-4">
          <svg
            viewBox="0 0 320 176"
            className="w-full h-auto overflow-visible select-none"
            role="img"
            aria-label={`Star-trail risk gauge: ${selectedExposureSec.toFixed(1)} seconds selected against ${npfSeconds.toFixed(1)} seconds NPF limit, status ${assessment.label}`}
          >
            {/* Base Muted Track */}
            <path
              d={describeArc(cx, cy, radius, aStart, aEnd)}
              fill="none"
              stroke="var(--border-hairline)"
              strokeWidth={16}
              strokeLinecap="butt"
            />

            {/* Zone 1: Safe (Green / Nominal) */}
            {aSafeEnd > aStart + 0.5 && (
              <path
                d={describeArc(cx, cy, radius, aStart, aSafeEnd)}
                fill="none"
                stroke="var(--status-nominal)"
                strokeWidth={14}
                strokeOpacity={assessment.level === 'safe' ? 0.95 : 0.42}
              />
            )}

            {/* Zone 2: Optimal NPF Window (Cyan / Secondary) */}
            {aOptEnd > aSafeEnd + 0.5 && (
              <path
                d={describeArc(cx, cy, radius, aSafeEnd, aOptEnd)}
                fill="none"
                stroke="var(--accent-secondary)"
                strokeWidth={14}
                strokeOpacity={assessment.level === 'optimal' ? 0.98 : 0.52}
              />
            )}

            {/* Zone 3: Marginal Elongation (Amber / Warning) */}
            {aCautionEnd > aOptEnd + 0.5 && (
              <path
                d={describeArc(cx, cy, radius, aOptEnd, aCautionEnd)}
                fill="none"
                stroke="var(--status-warning)"
                strokeWidth={14}
                strokeOpacity={assessment.level === 'caution' ? 0.95 : 0.45}
              />
            )}

            {/* Zone 4: Trail Danger Zone (Crimson / Critical) */}
            {aEnd > aCautionEnd + 0.5 && (
              <path
                d={describeArc(cx, cy, radius, aCautionEnd, aEnd)}
                fill="none"
                stroke="var(--status-critical)"
                strokeWidth={14}
                strokeOpacity={assessment.level === 'danger' ? 0.98 : 0.48}
              />
            )}

            {/* Subtle tick marks every 25% of gauge range */}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => {
              const ang = 180 + f * 180;
              const p1 = polarToCartesian(cx, cy, radius - 10, ang);
              const p2 = polarToCartesian(cx, cy, radius - 16, ang);
              return (
                <line
                  key={f}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="var(--text-muted)"
                  strokeWidth={1}
                  opacity={0.55}
                />
              );
            })}

            {/* 500-Rule Reference Tick (if inside gauge domain) */}
            {rule500Seconds <= maxGaugeSec && (
              <g>
                <line
                  x1={r500MarkerInner.x}
                  y1={r500MarkerInner.y}
                  x2={r500MarkerOuter.x}
                  y2={r500MarkerOuter.y}
                  stroke="var(--accent-primary)"
                  strokeWidth={1.75}
                  strokeDasharray="2 2"
                />
              </g>
            )}

            {/* Exact NPF Limit Pin */}
            <line
              x1={npfMarkerInner.x}
              y1={npfMarkerInner.y}
              x2={npfMarkerOuter.x}
              y2={npfMarkerOuter.y}
              stroke="var(--text-primary)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            {(() => {
              const lbl = polarToCartesian(cx, cy, radius + 22, npfAngle);
              const anchor = npfAngle < 202 ? 'start' : npfAngle > 338 ? 'end' : 'middle';
              return (
                <text
                  x={lbl.x}
                  y={lbl.y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fill="var(--text-primary)"
                  fontSize={9.5}
                  fontWeight={600}
                  fontFamily="JetBrains Mono, monospace"
                >
                  NPF {npfSeconds.toFixed(1)}s
                </text>
              );
            })()}

            {/* Animated Needle anchored at (cx, cy) */}
            <g
              style={{
                transform: `rotate(${needleAngle - 180}deg)`,
                transformOrigin: `${cx}px ${cy}px`,
                transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <line
                x1={cx}
                y1={cy}
                x2={cx - (radius - 18)}
                y2={cy}
                stroke={assessment.colorVar}
                strokeWidth={3}
                strokeLinecap="round"
              />
              <circle cx={cx - (radius - 18)} cy={cy} r={3.5} fill={assessment.colorVar} />
            </g>
            <circle
              cx={cx}
              cy={cy}
              r={6}
              fill="var(--bg-surface)"
              stroke={assessment.colorVar}
              strokeWidth={2.5}
            />

            {/* Min / Max Axis Labels */}
            <text
              x={cx - radius}
              y={cy + 16}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize={9.5}
              fontFamily="JetBrains Mono, monospace"
            >
              0s
            </text>
            <text
              x={cx + radius}
              y={cy + 16}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize={9.5}
              fontFamily="JetBrains Mono, monospace"
            >
              {maxGaugeSec}s
            </text>

            {/* Primary Center Readout */}
            <text
              x={cx}
              y={cy - 34}
              textAnchor="middle"
              fill="var(--text-primary)"
              fontSize={28}
              fontWeight={700}
              fontFamily="JetBrains Mono, monospace"
            >
              {selectedExposureSec.toFixed(1)}s
            </text>
            <text
              x={cx}
              y={cy - 16}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize={10}
              fontFamily="JetBrains Mono, monospace"
            >
              {assessment.ratio.toFixed(2)}× NPF LIMIT
            </text>
          </svg>

          {/* Non-Hue-Only Explicit Verdict Row */}
          <div className="mt-1 flex items-center justify-center gap-1.5 text-xs font-mono font-semibold">
            {renderStatusIcon()}
            <span style={{ color: assessment.colorVar }}>{assessment.label}</span>
          </div>
        </div>

        {/* Right Controls & Quantitative Trail Telemetry */}
        <div className="flex-1 min-w-0 w-full flex flex-col justify-between gap-4">
          {/* Interactive Shutter Time Scrubber */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <label htmlFor="exposure-risk-slider" className="font-medium text-[var(--text-secondary)]">
                Selected Shutter Exposure Time
              </label>
              <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                {selectedExposureSec.toFixed(1)}s{' '}
                <span className="text-[var(--text-muted)]">
                  ({assessment.deltaSec > 0 ? `+${assessment.deltaSec.toFixed(1)}s over NPF` : `${assessment.deltaSec.toFixed(1)}s vs NPF`})
                </span>
              </span>
            </div>

            <input
              id="exposure-risk-slider"
              type="range"
              min={0.5}
              max={30}
              step={0.1}
              value={Math.min(30, selectedExposureSec)}
              onChange={(e) => onChangeExposureSec(Number(e.target.value))}
              className="w-full telemetry-slider"
            />

            {/* Quick Expert RAW Shutter Presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {presets.map((p) => {
                const active = Math.abs(selectedExposureSec - p.sec) < 0.06;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => onChangeExposureSec(p.sec)}
                    className={`min-h-[36px] px-2.5 py-1 rounded border text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/15 text-[var(--text-primary)] font-semibold'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color-Coded Zone Legend + Guidance */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
              {[
                { key: 'safe', title: 'Safe', range: '≤ 0.85× NPF', color: 'var(--status-nominal)' },
                { key: 'optimal', title: 'NPF Sweet', range: '0.85–1.05×', color: 'var(--accent-secondary)' },
                { key: 'caution', title: 'Marginal', range: '1.05–1.45×', color: 'var(--status-warning)' },
                { key: 'danger', title: 'Danger', range: '> 1.45× NPF', color: 'var(--status-critical)' },
              ].map((z) => {
                const isCurrent = assessment.level === z.key;
                return (
                  <div
                    key={z.key}
                    className={`px-2.5 py-1.5 rounded border ${
                      isCurrent
                        ? 'bg-[var(--bg-canvas)] border-[var(--border-strong)]'
                        : 'bg-[var(--bg-canvas)]/40 border-[var(--border-hairline)] opacity-75'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: z.color }}
                      />
                      <span className="text-[var(--text-primary)] font-semibold truncate">{z.title}</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5 tabular-nums">{z.range}</div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {assessment.guidance}
            </p>
          </div>

          {/* Quantitative Telemetry Strip */}
          <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-[var(--border-hairline)] text-xs font-mono">
            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase">Sensor Drift</div>
              <div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums mt-0.5">
                {assessment.starDriftPx.toFixed(2)} px
              </div>
              <div className="text-[10px] text-[var(--text-muted)] tabular-nums">
                {assessment.starDriftArcsec.toFixed(1)}″ arc
              </div>
            </div>

            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase">NPF Ceiling</div>
              <div className="text-sm font-semibold text-[var(--accent-secondary)] tabular-nums mt-0.5">
                {npfSeconds.toFixed(1)}s
              </div>
              <div className="text-[10px] text-[var(--text-muted)] tabular-nums">
                Pitch {lens.pixelPitchUm.toFixed(2)} µm
              </div>
            </div>

            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase">500-Rule Ref</div>
              <div className="text-sm font-semibold text-[var(--accent-primary)] tabular-nums mt-0.5">
                {rule500Seconds.toFixed(1)}s
              </div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">
                {skyglowExceeded ? `Cap ${skyglowCapSec}s glow` : `${lens.focalLength35EqMm}mm eq.`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
