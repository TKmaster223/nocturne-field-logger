import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Aperture, Play, Sparkles } from 'lucide-react';
import { OpticalLensProfile } from '../types/field';

interface SkySimulatorCanvasProps {
  lens: OpticalLensProfile;
  npfSeconds: number;
  rule500Seconds: number;
  effectiveBortle: number;
  cloudLowPct: number;
  cloudMidPct: number;
  cloudHighPct: number;
  lunarIllumPct: number;
  includeMoonGlow: boolean;
}

interface StarSeed {
  x: number;
  y: number;
  mag: number; // 0..1 brightness
  size: number;
  hue: 'warm' | 'cool' | 'white';
}

export const SkySimulatorCanvas: React.FC<SkySimulatorCanvasProps> = ({
  lens,
  npfSeconds,
  rule500Seconds,
  effectiveBortle,
  cloudLowPct,
  cloudMidPct,
  cloudHighPct,
  lunarIllumPct,
  includeMoonGlow,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [simMode, setSimMode] = useState<'npf' | '500rule'>('npf');
  const [burstActive, setBurstActive] = useState<boolean>(false);
  const [burstProgress, setBurstProgress] = useState<number>(0);

  // Deterministic starfield seed so stars stay anchored when sliders move
  const stars = useMemo<StarSeed[]>(() => {
    const out: StarSeed[] = [];
    let s = 42197;
    const rand = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    for (let i = 0; i < 320; i++) {
      const rHue = rand();
      out.push({
        x: rand(),
        y: rand(),
        mag: Math.pow(rand(), 1.8),
        size: 0.7 + rand() * 1.8,
        hue: rHue < 0.2 ? 'warm' : rHue < 0.45 ? 'cool' : 'white',
      });
    }
    return out;
  }, []);

  // Trigger simulated shutter burst animation
  useEffect(() => {
    if (!burstActive) return;
    const durationMs = 2200; // Accelerated burst simulation
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setBurstProgress(p);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          setBurstActive(false);
          setBurstProgress(0);
        }, 500);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [burstActive]);

  // Draw live starfield, Milky Way band, Bortle glow, trailing, and drifting clouds
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const startTime = performance.now();

    const render = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const isRedShift = document.documentElement.classList.contains('red-shift');
      const elapsedSec = (now - startTime) / 1000;

      // Sky background luminance driven by Effective Bortle (1 = pitch black, 9 = urban amber/red wash)
      const bortleNorm = Math.max(0, Math.min(1, (effectiveBortle - 1) / 8));
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      if (isRedShift) {
        const topR = Math.round(6 + bortleNorm * 28);
        const botR = Math.round(14 + bortleNorm * 48);
        grad.addColorStop(0, `rgb(${topR}, 0, 0)`);
        grad.addColorStop(1, `rgb(${botR}, 3, 3)`);
      } else {
        const topR = Math.round(4 + bortleNorm * 22);
        const topG = Math.round(7 + bortleNorm * 26);
        const topB = Math.round(14 + bortleNorm * 42);
        const botR = Math.round(10 + bortleNorm * 42);
        const botG = Math.round(16 + bortleNorm * 44);
        const botB = Math.round(28 + bortleNorm * 58);
        grad.addColorStop(0, `rgb(${topR}, ${topG}, ${topB})`);
        grad.addColorStop(1, `rgb(${botR}, ${botG}, ${botB})`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Milky Way core dust glow (fades out above Bortle 5.5)
      const mwVisibility = Math.max(0, 1 - (effectiveBortle - 1) / 5.2);
      if (mwVisibility > 0.04) {
        ctx.save();
        ctx.translate(width * 0.5, height * 0.5);
        ctx.rotate(-0.42);
        const mwGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, width * 0.52);
        if (isRedShift) {
          mwGrad.addColorStop(0, `rgba(185, 28, 28, ${0.22 * mwVisibility})`);
          mwGrad.addColorStop(0.5, `rgba(127, 29, 29, ${0.1 * mwVisibility})`);
          mwGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
          mwGrad.addColorStop(0, `rgba(56, 189, 248, ${0.16 * mwVisibility})`);
          mwGrad.addColorStop(0.45, `rgba(245, 158, 11, ${0.08 * mwVisibility})`);
          mwGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }
        ctx.fillStyle = mwGrad;
        ctx.scale(1.8, 0.45);
        ctx.beginPath();
        ctx.arc(0, 0, width * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Optical zoom scale from 0.6x (120deg) to 5x (22deg)
      const zoomScale =
        lens.focalLength35EqMm <= 15
          ? 0.85
          : lens.focalLength35EqMm <= 30
          ? 1.0
          : lens.focalLength35EqMm <= 75
          ? 1.35
          : 1.75;

      // Trailing length in px when previewing 500-rule vs NPF
      const overExposureRatio = Math.max(0, rule500Seconds / Math.max(0.5, npfSeconds) - 1);
      const baseTrailPx = simMode === '500rule' ? Math.min(18, 2 + overExposureRatio * 9) : 0.6;
      const trailPx = burstActive ? baseTrailPx * burstProgress : baseTrailPx;

      // Star brightness boost during burst
      const burstGain = burstActive ? 0.65 + burstProgress * 0.55 : 1;

      // Draw stars filtered by Bortle limiting magnitude
      const visibilityFloor = 0.04 + bortleNorm * 0.52;
      stars.forEach((st, idx) => {
        const sx = ((st.x - 0.5) * zoomScale + 0.5) * width;
        const sy = ((st.y - 0.5) * zoomScale + 0.5) * height;
        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) return;

        const effectiveMag = st.mag * 1.15;
        if (effectiveMag < visibilityFloor) return;

        const twinkle = 0.85 + 0.15 * Math.sin(elapsedSec * 2.1 + idx);
        const alpha = Math.min(1, ((effectiveMag - visibilityFloor) / (1 - visibilityFloor)) * twinkle * burstGain);

        let color = `rgba(241, 245, 249, ${alpha})`;
        if (isRedShift) {
          color = `rgba(252, 165, 165, ${alpha * 0.85})`;
        } else if (st.hue === 'warm') {
          color = `rgba(253, 224, 171, ${alpha})`;
        } else if (st.hue === 'cool') {
          color = `rgba(165, 243, 252, ${alpha})`;
        }

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = Math.max(1, st.size * 0.85);
        ctx.lineCap = 'round';

        if (trailPx > 1.2) {
          ctx.beginPath();
          ctx.moveTo(sx - trailPx * 0.5, sy - trailPx * 0.25);
          ctx.lineTo(sx + trailPx * 0.5, sy + trailPx * 0.25);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, st.size * (0.7 + zoomScale * 0.15), 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Drifting Cloud Layers (High, Mid, Low)
      const drawCloudBand = (pct: number, speed: number, yBase: number, tintAlpha: number) => {
        if (pct <= 2) return;
        const density = Math.min(1, pct / 100);
        const puffs = Math.max(3, Math.round(density * 8));
        for (let i = 0; i < puffs; i++) {
          const drift = ((i / puffs) * width + elapsedSec * speed) % (width + 240) - 120;
          const cy = height * (yBase + (i % 3) * 0.11);
          const rx = 95 + (i % 4) * 38;
          const ry = 26 + (i % 2) * 14;
          const cGrad = ctx.createRadialGradient(drift, cy, 4, drift, cy, rx);
          if (isRedShift) {
            cGrad.addColorStop(0, `rgba(90, 12, 12, ${density * tintAlpha})`);
            cGrad.addColorStop(1, 'rgba(20, 0, 0, 0)');
          } else {
            cGrad.addColorStop(0, `rgba(148, 163, 184, ${density * tintAlpha})`);
            cGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
          }
          ctx.save();
          ctx.translate(drift, cy);
          ctx.scale(1, ry / rx);
          ctx.fillStyle = cGrad;
          ctx.beginPath();
          ctx.arc(0, 0, rx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      };

      drawCloudBand(cloudHighPct, 6, 0.16, 0.24);
      drawCloudBand(cloudMidPct, 11, 0.34, 0.36);
      drawCloudBand(cloudLowPct, 17, 0.56, 0.52);

      // Subtle S24 Ultra Viewfinder Framing Reticle
      const pad = 16;
      const corner = 14;
      ctx.strokeStyle = isRedShift ? 'rgba(220, 38, 38, 0.55)' : 'rgba(245, 158, 11, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(pad, pad + corner);
      ctx.lineTo(pad, pad);
      ctx.lineTo(pad + corner, pad);
      // Top-right
      ctx.moveTo(width - pad - corner, pad);
      ctx.lineTo(width - pad, pad);
      ctx.lineTo(width - pad, pad + corner);
      // Bottom-left
      ctx.moveTo(pad, height - pad - corner);
      ctx.lineTo(pad, height - pad);
      ctx.lineTo(pad + corner, height - pad);
      // Bottom-right
      ctx.moveTo(width - pad - corner, height - pad);
      ctx.lineTo(width - pad, height - pad);
      ctx.lineTo(width - pad, height - pad - corner);
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    stars,
    lens,
    npfSeconds,
    rule500Seconds,
    effectiveBortle,
    cloudLowPct,
    cloudMidPct,
    cloudHighPct,
    simMode,
    burstActive,
    burstProgress,
  ]);

  return (
    <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h2 className="font-display text-sm sm:text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
            <span>Live S24 Ultra Sky &amp; Star-Trail Simulator</span>
          </h2>
          <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5 truncate">
            {lens.zoomLabel} ({lens.fieldOfViewDeg}° FOV) · Eff. Bortle {effectiveBortle.toFixed(1)}
            {includeMoonGlow ? ` (+${lunarIllumPct.toFixed(0)}% Moon)` : ' (Moonless)'}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="grid grid-cols-2 p-0.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
            <button
              type="button"
              onClick={() => setSimMode('npf')}
              className={`min-h-[34px] px-2.5 text-[11px] font-mono rounded transition-colors cursor-pointer whitespace-nowrap ${
                simMode === 'npf'
                  ? 'bg-[var(--accent-secondary)] text-[var(--accent-primary-ink)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              NPF ({npfSeconds.toFixed(1)}s)
            </button>
            <button
              type="button"
              onClick={() => setSimMode('500rule')}
              className={`min-h-[34px] px-2.5 text-[11px] font-mono rounded transition-colors cursor-pointer whitespace-nowrap ${
                simMode === '500rule'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              500-Rule ({rule500Seconds.toFixed(1)}s)
            </button>
          </div>

          <button
            type="button"
            disabled={burstActive}
            onClick={() => setBurstActive(true)}
            className="min-h-[36px] px-3 py-1 rounded bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 active:scale-[0.97] transition-all cursor-pointer disabled:opacity-70 whitespace-nowrap"
          >
            {burstActive ? (
              <Aperture className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span>{burstActive ? `${Math.round(burstProgress * 100)}%` : 'Test Shutter'}</span>
          </button>
        </div>
      </div>

      <div className="relative h-48 sm:h-60 w-full bg-[var(--bg-canvas)]">
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Subtle Exposure Status Readout inside Viewfinder */}
        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[11px] font-mono pointer-events-none">
          <span className="px-2 py-0.5 rounded bg-[var(--bg-canvas)]/75 border border-[var(--border-hairline)] text-[var(--text-primary)]">
            {simMode === 'npf'
              ? 'Pinpoint Stars · Zero Trail'
              : rule500Seconds > npfSeconds * 1.15
              ? 'Warning: Elliptical Star Trails Visible'
              : 'Minimal Trailing at Current Optic'}
          </span>
          <span className="px-2 py-0.5 rounded bg-[var(--bg-canvas)]/75 border border-[var(--border-hairline)] text-[var(--text-secondary)] tabular-nums">
            Clouds: L {cloudLowPct}% · M {cloudMidPct}% · H {cloudHighPct}%
          </span>
        </div>
      </div>
    </div>
  );
};
