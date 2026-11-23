import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Compass, Sparkles } from 'lucide-react';
import { CELESTIAL_EVENTS_CATALOG } from '../data/s24Optics';
import { CelestialEventKind } from '../types/field';
import { formatCountdownParts } from '../utils/astroMath';

type EventFilter = 'all' | 'total' | 'asteroid';

export const CelestialTimersView: React.FC = () => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [filter, setFilter] = useState<EventFilter>('all');
  const [flybyOffsetHours, setFlybyOffsetHours] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const apophis = CELESTIAL_EVENTS_CATALOG[0];
  const apophisCountdown = formatCountdownParts(apophis.isoUtc, nowMs);

  // Interactive Apophis flyby geometry around 21:46 UTC (perigee = 38,012 km, speed ~ 7.4 km/s)
  const flybyState = useMemo(() => {
    const perigeeKm = 38012;
    const speedKmH = 7.4 * 3600; // ~26,640 km/h
    const alongTrackKm = flybyOffsetHours * speedKmH;
    const distanceKm = Math.round(Math.sqrt(perigeeKm * perigeeKm + alongTrackKm * alongTrackKm));
    const lunarDistanceFrac = (distanceKm / 384400).toFixed(2);
    // Map -12h..+12h to SVG path coordinates
    const xPos = 220 + (flybyOffsetHours / 12) * 180;
    const yPos = 68; // Closest approach skims just outside the GEO ring!
    return { distanceKm, lunarDistanceFrac, xPos, yPos };
  }, [flybyOffsetHours]);

  const filteredEvents = useMemo(() => {
    const rest = CELESTIAL_EVENTS_CATALOG.slice().sort(
      (a, b) => new Date(a.isoUtc).getTime() - new Date(b.isoUtc).getTime()
    );
    if (filter === 'total') {
      return rest.filter(
        (e) =>
          e.kind === CelestialEventKind.TotalSolarEclipse ||
          e.kind === CelestialEventKind.TotalLunarEclipse
      );
    }
    if (filter === 'asteroid') {
      return rest.filter((e) => e.kind === CelestialEventKind.AsteroidFlyby);
    }
    return rest;
  }, [filter]);

  const formatKindLabel = (kind: CelestialEventKind) => {
    switch (kind) {
      case CelestialEventKind.AsteroidFlyby:
        return 'Near-Earth Asteroid Flyby';
      case CelestialEventKind.TotalSolarEclipse:
        return 'Total Solar Eclipse';
      case CelestialEventKind.AnnularSolarEclipse:
        return 'Annular Solar Eclipse';
      case CelestialEventKind.PartialSolarEclipse:
        return 'Partial Solar Eclipse';
      case CelestialEventKind.TotalLunarEclipse:
        return 'Total Lunar Eclipse';
      case CelestialEventKind.PartialLunarEclipse:
        return 'Partial Lunar Eclipse';
      case CelestialEventKind.PenumbralLunarEclipse:
        return 'Penumbral Lunar Eclipse';
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 sm:py-6 pb-24 md:pb-12 space-y-6">
      {/* Priority Hero Countdown: 99942 Apophis Flyby */}
      <section className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="text-xs font-mono text-[var(--accent-primary)]">
              Priority Celestial Encounter · April 13, 2029 · 21:46 UTC
            </div>
            <h1 className="font-display text-xl sm:text-3xl font-bold text-[var(--text-primary)]">
              {apophis.title}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              {apophis.subtitle} Passing well inside the Moon&apos;s orbit and skimming near Earth&apos;s geostationary satellite ring (~35,786 km altitude).
            </p>
            <div className="pt-1 text-xs font-mono text-[var(--text-muted)] flex flex-wrap gap-x-3 gap-y-1">
              <span>{apophis.magnitudeOrDistance}</span>
              <span aria-hidden="true">·</span>
              <span>Visibility: {apophis.visibilityRegion}</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 sm:gap-3 w-full lg:w-auto shrink-0">
            {[
              { value: apophisCountdown.days, unit: 'DAYS' },
              { value: apophisCountdown.hours, unit: 'HRS' },
              { value: apophisCountdown.minutes, unit: 'MIN' },
              { value: apophisCountdown.seconds, unit: 'SEC' },
            ].map((cell) => (
              <div
                key={cell.unit}
                className="sm:min-w-[80px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] rounded-md px-1.5 py-2.5 sm:px-3 sm:py-3 text-center"
              >
                <div className="text-xl sm:text-3xl font-mono font-bold text-[var(--accent-primary)] tabular-nums">
                  {String(cell.value).padStart(2, '0')}
                </div>
                <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">
                  {cell.unit}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Interactive Scrubbable Apophis Orbital Encounter Diagram */}
        <div className="border border-[var(--border-hairline)] bg-[var(--bg-canvas)] rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-display font-semibold text-[var(--text-primary)]">
              Interactive Flyby Trajectory (Geocentric Scale)
            </span>
            <span className="font-mono text-[var(--accent-secondary)] tabular-nums">
              {flybyOffsetHours === 0
                ? 'Closest Approach (T+0.0h)'
                : `${flybyOffsetHours > 0 ? '+' : ''}${flybyOffsetHours.toFixed(1)}h`}{' '}
              · {flybyState.distanceKm.toLocaleString()} km ({flybyState.lunarDistanceFrac} LD)
            </span>
          </div>

          <svg
            viewBox="0 0 440 160"
            className="w-full h-36 sm:h-40 select-none"
            role="img"
            aria-label="Interactive Apophis April 2029 flyby diagram relative to Earth and Geostationary orbit"
          >
            {/* GEO Satellite Ring */}
            <circle
              cx={220}
              cy={110}
              r={46}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text
              x={272}
              y={114}
              fill="var(--text-muted)"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
            >
              GEO Ring (35,786 km alt)
            </text>

            {/* Earth */}
            <circle cx={220} cy={110} r={10} fill="var(--accent-secondary)" />
            <text
              x={220}
              y={134}
              textAnchor="middle"
              fill="var(--text-secondary)"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
            >
              Earth
            </text>

            {/* Apophis Hyperbolic Trajectory Line */}
            <line
              x1={30}
              y1={68}
              x2={410}
              y2={68}
              stroke="var(--accent-primary)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              opacity={0.7}
            />

            {/* Perigee Marker */}
            <line
              x1={220}
              y1={68}
              x2={220}
              y2={110}
              stroke="var(--border-hairline)"
              strokeWidth={1}
            />

            {/* Dynamic Apophis Position */}
            <circle
              cx={flybyState.xPos}
              cy={flybyState.yPos}
              r={6}
              fill="var(--accent-primary)"
              stroke="var(--bg-canvas)"
              strokeWidth={2}
            />
            <text
              x={flybyState.xPos}
              y={54}
              textAnchor="middle"
              fill="var(--accent-primary)"
              fontSize={10}
              fontWeight={700}
              fontFamily="JetBrains Mono, monospace"
            >
              99942 Apophis
            </text>
          </svg>

          <div className="space-y-1">
            <input
              type="range"
              aria-label="Scrub Apophis flyby timeline in hours"
              min={-12}
              max={12}
              step={0.5}
              value={flybyOffsetHours}
              onChange={(e) => setFlybyOffsetHours(Number(e.target.value))}
              className="w-full telemetry-slider"
            />
            <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)]">
              <span>T - 12h</span>
              <span>21:46 UTC Perigee</span>
              <span>T + 12h</span>
            </div>
          </div>
        </div>

        <div className="pt-1 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
          <div className="flex items-start sm:items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent-secondary)] shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong className="text-[var(--text-primary)]">S24 Ultra Capture Plan:</strong>{' '}
              {apophis.s24OpticAdvice}
            </span>
          </div>
          <span className="font-mono text-[var(--text-muted)]">JPL Ephemeris Reference</span>
        </div>
      </section>

      {/* Filter Bar & Upcoming Eclipse Schedule */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              2027 – 2029 Eclipses & Flyby Queue
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Live UTC countdowns paired with recommended Galaxy S24 Ultra optics and solar safety notes.
            </p>
          </div>

          <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] w-full sm:w-auto">
            {[
              { id: 'all' as EventFilter, label: 'All Events' },
              { id: 'total' as EventFilter, label: 'Total Eclipses' },
              { id: 'asteroid' as EventFilter, label: 'Asteroid' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`min-h-[42px] sm:min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap truncate ${
                  filter === tab.id
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEvents.map((ev) => {
            const cd = formatCountdownParts(ev.isoUtc, nowMs);
            return (
              <article
                key={ev.id}
                className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4 sm:p-5 flex flex-col justify-between gap-4 hover:border-[var(--border-strong)] transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-mono text-[var(--text-muted)]">
                    <span className={ev.isPriority ? 'text-[var(--accent-primary)] font-medium' : ''}>
                      {formatKindLabel(ev.kind)}
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      {new Date(ev.isoUtc).toISOString().slice(0, 16).replace('T', ' ')} UTC
                    </span>
                  </div>

                  <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                    {ev.title}
                  </h3>

                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {ev.subtitle}
                  </p>

                  <div className="text-xs font-mono text-[var(--text-muted)] pt-1 space-y-1">
                    <div>{ev.magnitudeOrDistance}</div>
                    <div className="flex items-start gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-[var(--accent-secondary)] shrink-0 mt-0.5" />
                      <span>{ev.visibilityRegion}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--border-hairline)] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase text-[var(--text-muted)]">
                      T-Minus
                    </span>
                    <span className="font-mono text-sm font-semibold text-[var(--accent-secondary)] tabular-nums">
                      {cd.isPast
                        ? 'Event Elapsed'
                        : `${cd.days}d ${String(cd.hours).padStart(2, '0')}h ${String(
                            cd.minutes
                          ).padStart(2, '0')}m ${String(cd.seconds).padStart(2, '0')}s`}
                    </span>
                  </div>

                  <div className="text-xs text-[var(--text-muted)]">
                    <span className="text-[var(--text-secondary)] font-medium">S24 Optics: </span>
                    {ev.s24OpticAdvice}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};
