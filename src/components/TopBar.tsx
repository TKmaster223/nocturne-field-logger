import React from 'react';
import { Compass, Eye, Moon, Plus, Radio, Timer, Camera, SlidersHorizontal } from 'lucide-react';
import { GpsCoordinates, WorkbenchTab } from '../types/field';

interface TopBarProps {
  activeTab: WorkbenchTab;
  onSelectTab: (tab: WorkbenchTab) => void;
  onQuickLogClick: () => void;
  redShift: boolean;
  onToggleRedShift: () => void;
  gps: GpsCoordinates;
  gpsLocating: boolean;
  onLocateGps: () => void;
  isOnline: boolean;
  logCount: number;
}

const NAV_ITEMS: Array<{ id: WorkbenchTab; label: string; mobileLabel: string }> = [
  { id: WorkbenchTab.SkyNpf, label: 'Sky & NPF', mobileLabel: 'Sky/NPF' },
  { id: WorkbenchTab.Timers, label: 'Timers', mobileLabel: 'Timers' },
  { id: WorkbenchTab.FieldLog, label: 'Field Log', mobileLabel: 'Logbook' },
  { id: WorkbenchTab.Optics, label: 'S24 Optics', mobileLabel: 'Optics' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onQuickLogClick,
  redShift,
  onToggleRedShift,
  gps,
  gpsLocating,
  onLocateGps,
  isOnline,
  logCount,
}) => {
  const renderMobileIcon = (id: WorkbenchTab) => {
    switch (id) {
      case WorkbenchTab.SkyNpf:
        return <Moon className="w-5 h-5" />;
      case WorkbenchTab.Timers:
        return <Timer className="w-5 h-5" />;
      case WorkbenchTab.FieldLog:
        return <Camera className="w-5 h-5" />;
      case WorkbenchTab.Optics:
        return <SlidersHorizontal className="w-5 h-5" />;
    }
  };

  return (
    <>
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)]/95 backdrop-blur-sm">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-12 md:h-14 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => onSelectTab(WorkbenchTab.SkyNpf)}
            className="font-display text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] rounded-sm min-h-[40px] inline-flex items-center"
          >
            Nocturne Field
          </button>

          {/* Zone 2: 4 single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] ${
                    isActive
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>
                    {item.label}
                    {item.id === WorkbenchTab.FieldLog && logCount > 0 ? ` (${logCount})` : ''}
                  </span>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 right-0 -bottom-[11px] h-[2px] bg-[var(--accent-primary)]"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={onQuickLogClick}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 sm:px-4 py-1.5 text-xs font-semibold rounded-md bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:opacity-90 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Capture</span>
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Telemetry Ribbon (separate from Top Bar Contract) */}
      <div className="border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-xs">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              type="button"
              onClick={onLocateGps}
              disabled={gpsLocating}
              className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <Compass className="w-3.5 h-3.5 text-[var(--accent-secondary)] shrink-0" />
              <span className="font-mono tabular-nums text-[11px] sm:text-xs">
                {gpsLocating
                  ? 'GPS...'
                  : `${gps.lat.toFixed(2)}°, ${gps.lng.toFixed(2)}°`}
              </span>
            </button>

            <span className="text-[var(--text-muted)] font-mono hidden lg:inline truncate max-w-[180px]">
              {gps.label || 'Active Site'}
            </span>

            <span aria-hidden="true" className="text-[var(--border-strong)] hidden lg:inline">
              /
            </span>

            <span
              className="inline-flex items-center gap-1.5 font-mono text-[var(--text-secondary)] whitespace-nowrap text-[11px] sm:text-xs"
              title={
                isOnline
                  ? 'Online: Live Open-Meteo sky conditions available'
                  : 'Offline: Running local celestial math and IndexedDB storage'
              }
            >
              <Radio
                className={`w-3.5 h-3.5 shrink-0 ${
                  isOnline ? 'text-[var(--status-nominal)]' : 'text-[var(--status-warning)]'
                }`}
              />
              <span className="sm:hidden">{isOnline ? 'Live Sync' : 'Offline'}</span>
              <span className="hidden sm:inline">
                {isOnline ? 'Online · Live Sky Sync' : 'Offline · Local Math & Storage'}
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleRedShift}
            aria-pressed={redShift}
            className={`inline-flex items-center gap-1.5 sm:gap-2 min-h-[40px] sm:min-h-[36px] px-2.5 sm:px-3 py-1 rounded border text-[11px] sm:text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              redShift
                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/15 text-[var(--text-primary)]'
                : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
            <span className="sm:hidden">{redShift ? 'Red Night: On' : 'Red Night'}</span>
            <span className="hidden sm:inline">
              {redShift ? '660nm Red Night: On' : '660nm Red Night: Off'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (<= 15% combined viewport height, >= 44px touch targets) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)]/95 backdrop-blur-md grid grid-cols-4 pb-[env(safe-area-inset-bottom)]"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`min-h-[52px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
              }`}
            >
              {renderMobileIcon(item.id)}
              <span className="truncate max-w-full px-1">
                {item.mobileLabel}
                {item.id === WorkbenchTab.FieldLog && logCount > 0 ? ` (${logCount})` : ''}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
