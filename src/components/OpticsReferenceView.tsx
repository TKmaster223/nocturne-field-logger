import React from 'react';
import { ArrowUpRight, CheckCircle2, Cpu } from 'lucide-react';
import { EXPERT_RAW_WORKFLOW_CHECKLISTS, S24_ULTRA_OPTICS } from '../data/s24Optics';

interface OpticsReferenceViewProps {
  onLoadLensInNpf: (lensId: string) => void;
}

export const OpticsReferenceView: React.FC<OpticsReferenceViewProps> = ({ onLoadLensInNpf }) => {
  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12 space-y-6">
      <section className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Samsung Galaxy S24 Ultra Optical & Sensor Matrix
        </h1>
        <p className="text-sm text-[var(--text-secondary)] max-w-3xl">
          Exact physical focal lengths, pixel-binning pitches, and field workflows calibrated for Expert RAW DNG and unedited Pro Mode captures.
        </p>
      </section>

      {/* Optics Spec Table / Grid */}
      <section className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[11px] font-mono uppercase text-[var(--text-muted)]">
                <th className="py-3 px-4">Zoom & Optic</th>
                <th className="py-3 px-4">Sensor</th>
                <th className="py-3 px-4">Aperture</th>
                <th className="py-3 px-4">Actual / 35mm Eq.</th>
                <th className="py-3 px-4">Pixel Pitch (Binning)</th>
                <th className="py-3 px-4">Field Role</th>
                <th className="py-3 px-4 text-right">Calibrate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)] text-xs">
              {S24_ULTRA_OPTICS.map((lens) => (
                <tr key={lens.id} className="hover:bg-[var(--bg-elevated)]/40 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-[var(--text-primary)]">
                      {lens.zoomLabel} · {lens.name}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-muted)]">
                      {lens.fieldOfViewDeg}° FOV
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[var(--text-secondary)]">
                    <div>{lens.sensorName}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{lens.sensorFormat}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-[var(--accent-primary)] tabular-nums">
                    f/{lens.aperture}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[var(--text-primary)] tabular-nums">
                    {lens.focalLengthActualMm} mm / {lens.focalLength35EqMm} mm
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[var(--accent-secondary)] tabular-nums">
                    <div>{lens.pixelPitchUm.toFixed(2)} µm</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{lens.binningLabel}</div>
                  </td>
                  <td className="py-3.5 px-4 text-[var(--text-secondary)] max-w-xs">
                    {lens.recommendedFor}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onLoadLensInNpf(lens.id)}
                      className="min-h-[36px] px-3 py-1.5 rounded border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <span>Load NPF</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Expert RAW & Pro Mode Field Checklists */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[var(--accent-secondary)]" />
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
              Night-Sky Expert RAW Checklist
            </h2>
          </div>
          <ul className="space-y-2.5 text-xs text-[var(--text-secondary)] leading-relaxed">
            {EXPERT_RAW_WORKFLOW_CHECKLISTS.astro.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--accent-secondary)] shrink-0 mt-0.5" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
              Unedited Wildlife & WhatsApp Document Checklist
            </h2>
          </div>
          <ul className="space-y-2.5 text-xs text-[var(--text-secondary)] leading-relaxed">
            {EXPERT_RAW_WORKFLOW_CHECKLISTS.wildlife.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
};
