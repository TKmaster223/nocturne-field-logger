import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  Circle,
  ColorScheme,
  InfoWindow,
  Map as GoogleMap,
  MapMouseEvent,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Compass,
  Crosshair,
  Image as ImageIcon,
  Layers,
  MapPin,
  Moon,
  Navigation,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { BORTLE_SCALE_REFERENCE, S24_ULTRA_OPTICS } from '../data/s24Optics';
import { FieldCaptureLog, GpsCoordinates, OpticalLensProfile } from '../types/field';
import {
  calculateEffectiveBortle,
  calculateLunarTelemetry,
  calculateNpfExposure,
  getBortleInfo,
} from '../utils/astroMath';
import {
  BORTLE_VISUAL_PALETTE,
  DARK_STATIC_MAP_STYLES,
  buildGeodesicCirclePoints,
  buildStaticMapUrl,
  estimateBortleInZone,
  getGoogleMapsApiKey,
  haversineDistanceKm,
} from '../utils/staticMapUrlBuilder';

interface LightPollutionMapViewProps {
  gps: GpsCoordinates;
  bortleClass: number;
  selectedLensId: string;
  logs: FieldCaptureLog[];
  gpsLocating: boolean;
  isOnline: boolean;
  onLocateGps: () => void;
  onUpdateManualGps: (lat: number, lng: number, label?: string) => void;
  onChangeBortle: (val: number) => void;
  onReturnToNpf: () => void;
}

interface ProbeLocation {
  lat: number;
  lng: number;
  distanceKm: number;
  estimatedBortle: number;
}

const RADIAL_BANDS = [
  { id: 'core', label: 'Site Core', radiusKm: 5, fillOpacity: 0.24, strokeOpacity: 0.78 },
  { id: 'fringe', label: 'Local Halo', radiusKm: 15, fillOpacity: 0.16, strokeOpacity: 0.65 },
  { id: 'transition', label: 'Regional Drift', radiusKm: 35, fillOpacity: 0.11, strokeOpacity: 0.5 },
  { id: 'horizon', label: 'Horizon Dome', radiusKm: 70, fillOpacity: 0.06, strokeOpacity: 0.35 },
];

const MapCenterSync: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.panTo({ lat, lng });
  }, [map, lat, lng]);
  return null;
};

const ApiStatusBanner: React.FC<{ onSwitchStatic: () => void }> = ({ onSwitchStatic }) => {
  const status = useApiLoadingStatus();
  if (status !== APILoadingStatus.FAILED && status !== APILoadingStatus.AUTH_FAILURE) {
    return null;
  }
  return (
    <div className="p-3 rounded border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 text-xs text-[var(--text-primary)] flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" />
        <span>
          Interactive map tiles failed to initialize. Switch to Static Map Tile mode or verify network connectivity.
        </span>
      </div>
      <button
        type="button"
        onClick={onSwitchStatic}
        className="min-h-[36px] px-3 py-1 rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] cursor-pointer whitespace-nowrap"
      >
        Switch to Static Tile
      </button>
    </div>
  );
};

interface CapturePinProps {
  entry: FieldCaptureLog;
  onSelectSite: (lat: number, lng: number, label: string, bortle: number) => void;
}

const CapturePinMarker: React.FC<CapturePinProps> = ({ entry, onSelectSite }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  if (!entry.gps) return null;
  const visual = BORTLE_VISUAL_PALETTE[Math.min(9, Math.max(1, Math.round(entry.bortleAtCapture)))];

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: entry.gps.lat, lng: entry.gps.lng }}
        onClick={() => setOpen((prev) => !prev)}
        title={`${entry.speciesTag} · Bortle ${entry.bortleAtCapture}`}
      >
        <Pin
          background={visual.hex}
          borderColor="#07090e"
          glyphColor="#f8fafc"
          scale={0.85}
        />
      </AdvancedMarker>
      {open && marker && (
        <InfoWindow anchor={marker} maxWidth={240} onCloseClick={() => setOpen(false)}>
          <div className="text-slate-900 space-y-1.5 text-xs">
            <div className="font-semibold text-sm">{entry.speciesTag}</div>
            <div className="font-mono text-[11px] text-slate-700">
              Bortle {entry.bortleAtCapture} · {entry.exif.shutterDisplay} · ISO {entry.exif.iso}
            </div>
            <div className="text-[11px] text-slate-600">
              {entry.gps.lat.toFixed(4)}°, {entry.gps.lng.toFixed(4)}°
            </div>
            <button
              type="button"
              onClick={() => {
                if (entry.gps) {
                  onSelectSite(
                    entry.gps.lat,
                    entry.gps.lng,
                    `${entry.speciesTag} Site`,
                    entry.bortleAtCapture
                  );
                }
                setOpen(false);
              }}
              className="mt-1 w-full px-2.5 py-1.5 rounded bg-slate-900 text-amber-400 text-[11px] font-semibold cursor-pointer"
            >
              Center Site Here
            </button>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface InteractiveBortleCanvasProps {
  gps: GpsCoordinates;
  bortleClass: number;
  probe: ProbeLocation | null;
  logs: FieldCaptureLog[];
  activeLens: OpticalLensProfile;
  effectiveLunarPct: number;
  onMapClick: (lat: number, lng: number) => void;
  onLockProbe: () => void;
  onSelectLogSite: (lat: number, lng: number, label: string, bortle: number) => void;
}

const InteractiveBortleCanvas: React.FC<InteractiveBortleCanvasProps> = ({
  gps,
  bortleClass,
  probe,
  logs,
  activeLens,
  effectiveLunarPct,
  onMapClick,
  onLockProbe,
  onSelectLogSite,
}) => {
  const [siteMarkerRef, siteMarker] = useAdvancedMarkerRef();
  const [probeMarkerRef, probeMarker] = useAdvancedMarkerRef();
  const [siteInfoOpen, setSiteInfoOpen] = useState(false);
  const [probeInfoOpen, setProbeInfoOpen] = useState(true);

  const handleClick = useCallback(
    (ev: MapMouseEvent) => {
      const latLng = ev.detail.latLng;
      if (!latLng) return;
      onMapClick(
        Math.round(latLng.lat * 100000) / 100000,
        Math.round(latLng.lng * 100000) / 100000
      );
      setProbeInfoOpen(true);
    },
    [onMapClick]
  );

  const rings = useMemo(() => {
    return RADIAL_BANDS.map((band) => {
      const est = estimateBortleInZone(bortleClass, band.radiusKm);
      const rounded = Math.min(9, Math.max(1, Math.round(est)));
      const palette = BORTLE_VISUAL_PALETTE[rounded];
      return {
        ...band,
        estimatedBortle: est,
        palette,
      };
    }).reverse(); // Render largest outer ring first so inner zones remain crisp
  }, [bortleClass]);

  const activePalette = BORTLE_VISUAL_PALETTE[Math.min(9, Math.max(1, Math.round(bortleClass)))];
  const probeEff = probe
    ? calculateEffectiveBortle(Math.round(probe.estimatedBortle), effectiveLunarPct, true)
    : null;
  const probeNpf = probeEff
    ? calculateNpfExposure(activeLens, 15, 1, Math.round(probeEff.effectiveBortle))
    : null;

  return (
    <div className="relative w-full h-[380px] sm:h-[460px] rounded-md overflow-hidden border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={{ lat: gps.lat, lng: gps.lng }}
        defaultZoom={9}
        colorScheme={ColorScheme.DARK}
        gestureHandling="greedy"
        disableDefaultUI={false}
        streetViewControl={false}
        fullscreenControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        onClick={handleClick}
        style={{ width: '100%', height: '100%' }}
      >
        <MapCenterSync lat={gps.lat} lng={gps.lng} />

        {/* Concentric Bortle Skyglow Distribution Rings */}
        {rings.map((ring) => (
          <Circle
            key={ring.id}
            center={{ lat: gps.lat, lng: gps.lng }}
            radius={ring.radiusKm * 1000}
            clickable={false}
            strokeColor={ring.palette.hex}
            strokeOpacity={ring.strokeOpacity}
            strokeWeight={1.5}
            fillColor={ring.palette.hex}
            fillOpacity={ring.fillOpacity}
          />
        ))}

        {/* Active Observation Site Marker */}
        <AdvancedMarker
          ref={siteMarkerRef}
          position={{ lat: gps.lat, lng: gps.lng }}
          onClick={() => setSiteInfoOpen((prev) => !prev)}
          title={gps.label || 'Active Observation Site'}
        >
          <Pin
            background={activePalette.hex}
            borderColor="#f59e0b"
            glyphColor="#f8fafc"
            scale={1.15}
          />
        </AdvancedMarker>

        {siteInfoOpen && siteMarker && (
          <InfoWindow anchor={siteMarker} maxWidth={250} onCloseClick={() => setSiteInfoOpen(false)}>
            <div className="text-slate-900 space-y-1 text-xs">
              <div className="font-semibold text-sm">{gps.label || 'Active Site'}</div>
              <div className="font-mono text-[11px] text-slate-700">
                {gps.lat.toFixed(4)}°, {gps.lng.toFixed(4)}°
              </div>
              <div className="text-[11px] text-slate-700">
                Base Bortle {bortleClass} ({activePalette.label}) · SQM {activePalette.sqm}
              </div>
            </div>
          </InfoWindow>
        )}

        {/* Interactive Click Probe Marker */}
        {probe && (
          <>
            <AdvancedMarker
              ref={probeMarkerRef}
              position={{ lat: probe.lat, lng: probe.lng }}
              onClick={() => setProbeInfoOpen((prev) => !prev)}
              title="Probed Sky Location"
            >
              <Pin background="#06b6d4" borderColor="#0f172a" glyphColor="#07090e" scale={1.05} />
            </AdvancedMarker>

            {probeInfoOpen && probeMarker && probeNpf && probeEff && (
              <InfoWindow
                anchor={probeMarker}
                maxWidth={260}
                onCloseClick={() => setProbeInfoOpen(false)}
              >
                <div className="text-slate-900 space-y-1.5 text-xs">
                  <div className="font-semibold text-sm">Probed Sky Coordinate</div>
                  <div className="font-mono text-[11px] text-slate-700">
                    {probe.lat.toFixed(4)}°, {probe.lng.toFixed(4)}° ({probe.distanceKm.toFixed(1)} km away)
                  </div>
                  <div className="text-[11px] text-slate-700">
                    Est. Bortle <span className="font-semibold">{probe.estimatedBortle.toFixed(1)}</span> ·
                    Eff. {probeEff.effectiveBortle.toFixed(1)} w/ Moon
                  </div>
                  <div className="font-mono text-[11px] text-slate-800">
                    {activeLens.zoomLabel} NPF: {probeNpf.npfSeconds.toFixed(1)}s · ISO {probeNpf.suggestedIso}
                  </div>
                  <button
                    type="button"
                    onClick={onLockProbe}
                    className="mt-1 w-full px-2.5 py-1.5 rounded bg-slate-900 text-amber-400 text-[11px] font-semibold cursor-pointer"
                  >
                    Use as Active Site
                  </button>
                </div>
              </InfoWindow>
            )}
          </>
        )}

        {/* Saved Field Log Markers */}
        {logs
          .filter((entry) => Boolean(entry.gps))
          .slice(0, 24)
          .map((entry) => (
            <CapturePinMarker key={entry.id} entry={entry} onSelectSite={onSelectLogSite} />
          ))}
      </GoogleMap>

      {/* Subtle Floating Map Hint */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-12 sm:right-auto bg-[var(--bg-canvas)]/90 border border-[var(--border-hairline)] px-3 py-1.5 rounded text-[11px] font-mono text-[var(--text-secondary)]">
        Tap anywhere on the map to sample radial Bortle shift &amp; NPF target
      </div>
    </div>
  );
};

export const LightPollutionMapView: React.FC<LightPollutionMapViewProps> = ({
  gps,
  bortleClass,
  selectedLensId,
  logs,
  gpsLocating,
  isOnline,
  onLocateGps,
  onUpdateManualGps,
  onChangeBortle,
  onReturnToNpf,
}) => {
  const mapsApiKey = getGoogleMapsApiKey();
  const [mapMode, setMapMode] = useState<'interactive' | 'static'>('interactive');
  const [staticMapType, setStaticMapType] = useState<'roadmap' | 'terrain' | 'hybrid' | 'satellite'>(
    'roadmap'
  );
  const [staticZoom, setStaticZoom] = useState<number>(9);
  const [staticTileError, setStaticTileError] = useState<boolean>(false);
  const [probe, setProbe] = useState<ProbeLocation | null>(null);

  const activeLens: OpticalLensProfile = useMemo(
    () => S24_ULTRA_OPTICS.find((o) => o.id === selectedLensId) ?? S24_ULTRA_OPTICS[1],
    [selectedLensId]
  );

  const lunar = useMemo(() => calculateLunarTelemetry(new Date()), []);
  const effectiveSite = useMemo(
    () => calculateEffectiveBortle(bortleClass, lunar.illuminationPct, true),
    [bortleClass, lunar.illuminationPct]
  );
  const bortleInfo = useMemo(() => getBortleInfo(bortleClass), [bortleClass]);
  const activeVisual = BORTLE_VISUAL_PALETTE[Math.min(9, Math.max(1, Math.round(bortleClass)))];

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      const distanceKm = haversineDistanceKm(gps.lat, gps.lng, lat, lng);
      const estimatedBortle = estimateBortleInZone(bortleClass, distanceKm);
      setProbe({ lat, lng, distanceKm, estimatedBortle });
    },
    [gps.lat, gps.lng, bortleClass]
  );

  const handleLockProbe = useCallback(() => {
    if (!probe) return;
    const roundedBortle = Math.min(9, Math.max(1, Math.round(probe.estimatedBortle)));
    onUpdateManualGps(probe.lat, probe.lng, 'Map Probed Site');
    onChangeBortle(roundedBortle);
    setProbe(null);
  }, [probe, onUpdateManualGps, onChangeBortle]);

  // Build Google Maps Static API URL for low-bandwidth single-tile Bortle snapshot
  const staticTileUrl = useMemo(() => {
    if (!mapsApiKey) return '';
    const innerRingPts = buildGeodesicCirclePoints(gps.lat, gps.lng, 15, 24);
    const outerRingPts = buildGeodesicCirclePoints(gps.lat, gps.lng, 35, 28);

    const innerBortle = Math.min(9, Math.max(1, Math.round(estimateBortleInZone(bortleClass, 15))));
    const outerBortle = Math.min(9, Math.max(1, Math.round(estimateBortleInZone(bortleClass, 35))));
    const innerPalette = BORTLE_VISUAL_PALETTE[innerBortle];
    const outerPalette = BORTLE_VISUAL_PALETTE[outerBortle];

    const formatPath = (pts: Array<{ lat: number; lng: number }>, stroke: string, fill: string) =>
      `color:${stroke}|weight:2|fillcolor:${fill}|${pts.map((p) => `${p.lat},${p.lng}`).join('|')}`;

    const markers: string[] = [`color:orange|label:S|${gps.lat.toFixed(4)},${gps.lng.toFixed(4)}`];
    if (probe) {
      markers.push(`color:cyan|label:P|${probe.lat.toFixed(4)},${probe.lng.toFixed(4)}`);
    }
    logs
      .filter((l) => Boolean(l.gps))
      .slice(0, 5)
      .forEach((l) => {
        if (l.gps) {
          markers.push(`size:small|color:blue|${l.gps.lat.toFixed(4)},${l.gps.lng.toFixed(4)}`);
        }
      });

    return buildStaticMapUrl(
      {
        center: `${gps.lat.toFixed(4)},${gps.lng.toFixed(4)}`,
        zoom: staticZoom,
        size: '640x420',
        scale: 2,
        maptype: staticMapType,
        markers,
        paths: [
          formatPath(outerRingPts, outerPalette.staticHex, outerPalette.staticFillHex),
          formatPath(innerRingPts, innerPalette.staticHex, innerPalette.staticFillHex),
        ],
        style:
          staticMapType === 'roadmap' || staticMapType === 'terrain'
            ? DARK_STATIC_MAP_STYLES
            : undefined,
      },
      mapsApiKey
    );
  }, [mapsApiKey, gps.lat, gps.lng, bortleClass, staticZoom, staticMapType, probe, logs]);

  const radialZoneSummary = useMemo(() => {
    return RADIAL_BANDS.map((band) => {
      const est = estimateBortleInZone(bortleClass, band.radiusKm);
      const rounded = Math.min(9, Math.max(1, Math.round(est)));
      const palette = BORTLE_VISUAL_PALETTE[rounded];
      const eff = calculateEffectiveBortle(rounded, lunar.illuminationPct, true);
      const npf = calculateNpfExposure(activeLens, 15, 1, Math.round(eff.effectiveBortle));
      return {
        ...band,
        est,
        palette,
        effBortle: eff.effectiveBortle,
        npfSeconds: npf.npfSeconds,
        suggestedIso: npf.suggestedIso,
      };
    });
  }, [bortleClass, lunar.illuminationPct, activeLens]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-24 md:pb-10 space-y-5 sm:space-y-6">
      {/* Header & Mode Switcher */}
      <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[var(--accent-secondary)]">
            <Compass className="w-3.5 h-3.5" />
            <span>Geospatial Skyglow &amp; Bortle Distribution</span>
          </div>
          <h1 className="font-display text-lg sm:text-xl font-bold text-[var(--text-primary)]">
            Local Light Pollution &amp; Static Tile Map
          </h1>
          <p className="text-xs text-[var(--text-muted)] max-w-2xl">
            Centered at{' '}
            <span className="font-mono text-[var(--text-secondary)] tabular-nums">
              {gps.lat.toFixed(4)}°, {gps.lng.toFixed(4)}°
            </span>{' '}
            ({gps.label || 'Active Site'}). Visualize radial Walker&apos;s Law skyglow bands, inspect field logs, or fetch a low-bandwidth static map tile.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
            <button
              type="button"
              onClick={() => setMapMode('interactive')}
              className={`min-h-[38px] px-3 py-1.5 rounded text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                mapMode === 'interactive'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Interactive Map</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStaticTileError(false);
                setMapMode('static');
              }}
              className={`min-h-[38px] px-3 py-1.5 rounded text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                mapMode === 'static'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Static Map Tile</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onLocateGps}
            disabled={gpsLocating}
            className="min-h-[42px] px-3.5 py-1.5 rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-secondary)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <Crosshair className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
            <span>{gpsLocating ? 'Locking GPS...' : 'Recenter GPS'}</span>
          </button>

          <button
            type="button"
            onClick={onReturnToNpf}
            className="min-h-[42px] px-3.5 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Sliders className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>Back to NPF</span>
          </button>
        </div>
      </div>

      {/* Main Split: Map Viewport + Controls / Bortle Telemetry */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left/Primary Map Surface */}
        <section className="flex-1 min-w-0 w-full space-y-4">
          {!mapsApiKey ? (
            <div className="border border-[var(--status-warning)]/40 bg-[var(--bg-surface)] rounded-lg p-6 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <AlertTriangle className="w-4 h-4 text-[var(--status-warning)]" />
                <span>Google Maps API Key Not Active in Runtime Environment</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Maps tiles require <code className="text-[var(--text-secondary)]">VITE_GOOGLE_MAPS_API_KEY</code> in the environment. Local Bortle skyglow modeling and NPF calculations remain fully functional below.
              </p>
            </div>
          ) : mapMode === 'interactive' ? (
            <APIProvider apiKey={mapsApiKey} language="en" region="US">
              <div className="space-y-3">
                <ApiStatusBanner onSwitchStatic={() => setMapMode('static')} />
                <InteractiveBortleCanvas
                  gps={gps}
                  bortleClass={bortleClass}
                  probe={probe}
                  logs={logs}
                  activeLens={activeLens}
                  effectiveLunarPct={lunar.illuminationPct}
                  onMapClick={handleMapClick}
                  onLockProbe={handleLockProbe}
                  onSelectLogSite={(lat, lng, label, bortle) => {
                    onUpdateManualGps(lat, lng, label);
                    onChangeBortle(bortle);
                  }}
                />
              </div>
            </APIProvider>
          ) : (
            /* Google Maps Static API Tile Mode */
            <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                    Static Map Tile Snapshot (640×420 · 2× HiDPI)
                  </h2>
                  <p className="text-[11px] font-mono text-[var(--text-muted)]">
                    Single-request Google Maps Static API image with 15 km &amp; 35 km Bortle ring overlays
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Static map layer type"
                    value={staticMapType}
                    onChange={(e) => {
                      setStaticTileError(false);
                      setStaticMapType(
                        e.target.value as 'roadmap' | 'terrain' | 'hybrid' | 'satellite'
                      );
                    }}
                    className="min-h-[38px] px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)] outline-none"
                  >
                    <option value="roadmap">Dark Night Roadmap</option>
                    <option value="terrain">Dark Terrain Relief</option>
                    <option value="hybrid">Satellite Hybrid</option>
                    <option value="satellite">Pure Satellite</option>
                  </select>

                  <select
                    aria-label="Static map zoom level"
                    value={staticZoom}
                    onChange={(e) => {
                      setStaticTileError(false);
                      setStaticZoom(Number(e.target.value));
                    }}
                    className="min-h-[38px] px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)] outline-none"
                  >
                    <option value={8}>Zoom 8 · Regional (70 km)</option>
                    <option value={9}>Zoom 9 · Basin (35 km)</option>
                    <option value={10}>Zoom 10 · Local (15 km)</option>
                    <option value={12}>Zoom 12 · Site (5 km)</option>
                  </select>
                </div>
              </div>

              <div className="relative w-full h-[360px] sm:h-[420px] rounded-md overflow-hidden border border-[var(--border-hairline)] bg-[var(--bg-canvas)] flex items-center justify-center">
                {staticTileError || !isOnline ? (
                  <div className="p-6 text-center space-y-3 max-w-sm">
                    <AlertTriangle className="w-6 h-6 text-[var(--status-warning)] mx-auto" />
                    <div className="text-xs text-[var(--text-secondary)]">
                      {!isOnline
                        ? 'Device is offline — static map tiles require an active connection.'
                        : 'Static map tile could not be loaded for these parameters.'}
                    </div>
                    <button
                      type="button"
                      onClick={() => setStaticTileError(false)}
                      className="min-h-[38px] px-3 py-1.5 rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Static Tile</span>
                    </button>
                  </div>
                ) : (
                  <img
                    src={staticTileUrl}
                    alt={`Static light pollution distribution map centered at ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}`}
                    onError={() => setStaticTileError(true)}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[var(--text-muted)]">
                <span>Pin S = Active Site · Rings = 15 km &amp; 35 km Bortle zones</span>
                <span>Maps Static API · scale=2 · {staticMapType}</span>
              </div>
            </div>
          )}

          {/* Probed Coordinate Comparison Card */}
          {probe && (
            <div className="border border-[var(--accent-secondary)]/50 bg-[var(--bg-surface)] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-secondary)]">
                  <Navigation className="w-3.5 h-3.5" />
                  <span>MAP PROBE ACTIVE · {probe.distanceKm.toFixed(1)} KM FROM SITE</span>
                </div>
                <div className="text-sm font-semibold text-[var(--text-primary)] font-mono tabular-nums">
                  {probe.lat.toFixed(5)}°, {probe.lng.toFixed(5)}° · Est. Bortle {probe.estimatedBortle.toFixed(1)}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  Locking this pin updates GPS coordinates, Open-Meteo sky telemetry, and Bortle class across the workbench.
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setProbe(null)}
                  className="min-h-[40px] px-3 py-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleLockProbe}
                  className="min-h-[40px] px-3.5 py-1.5 rounded bg-[var(--accent-secondary)] text-[#07090e] text-xs font-semibold hover:opacity-90 cursor-pointer whitespace-nowrap"
                >
                  Lock Site &amp; Bortle
                </button>
              </div>
            </div>
          )}

          {/* Radial Skyglow Zone Breakdown & NPF Shutter Impact */}
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  Radial Skyglow Distribution &amp; {activeLens.zoomLabel} NPF Impact
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Modeled radial transition around active site with {lunar.illuminationPct.toFixed(0)}% lunar illumination factored.
                </p>
              </div>
              <span className="text-xs font-mono text-[var(--accent-primary)] tabular-nums">
                Active: Bortle {bortleClass} · Eff. {effectiveSite.effectiveBortle.toFixed(1)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {radialZoneSummary.map((zone) => (
                <div
                  key={zone.id}
                  className="border border-[var(--border-hairline)] bg-[var(--bg-canvas)] rounded-md p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{zone.label}</span>
                    <span className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                      0–{zone.radiusKm} km
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/20"
                      style={{ backgroundColor: zone.palette.hex }}
                    />
                    <span className="text-xs font-mono font-semibold text-[var(--text-secondary)] tabular-nums">
                      Bortle {zone.est.toFixed(1)} ({zone.palette.label})
                    </span>
                  </div>
                  <div className="pt-1 border-t border-[var(--border-hairline)] flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                    <span>NPF {zone.npfSeconds.toFixed(1)}s</span>
                    <span>ISO {zone.suggestedIso}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right Telemetry Sidebar: Bortle 1-9 Selector & Legend */}
        <aside className="w-full lg:w-[340px] shrink-0 border border-[var(--border-hairline)] bg-[var(--bg-surface)] rounded-lg p-4 sm:p-5 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Bortle Class Distribution
              </h2>
              <span className="font-mono text-xs font-semibold text-[var(--accent-primary)] tabular-nums">
                Class {bortleClass}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Tap any class to calibrate the site dome and sync NPF ISO/exposure ceilings.
            </p>
          </div>

          {/* Active Sky Readout Box */}
          <div className="p-3 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                <span
                  className="w-3 h-3 rounded-sm border border-white/20"
                  style={{ backgroundColor: activeVisual.hex }}
                />
                <span>{bortleInfo.name}</span>
              </span>
              <span className="font-mono text-[11px] text-[var(--accent-secondary)] tabular-nums">
                SQM {bortleInfo.sqmRange}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
              <span>NELM {bortleInfo.nelm} mag</span>
              <span className="inline-flex items-center gap-1">
                <Moon className="w-3 h-3 text-[var(--accent-primary)]" />
                <span>Eff. {effectiveSite.effectiveBortle.toFixed(1)}</span>
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed pt-1">
              {bortleInfo.milkyWayNote}
            </p>
          </div>

          {/* Bortle 1-9 Interactive Palette List */}
          <div className="space-y-1.5">
            {BORTLE_SCALE_REFERENCE.map((b) => {
              const palette = BORTLE_VISUAL_PALETTE[b.bortle];
              const isSelected = b.bortle === bortleClass;
              return (
                <button
                  key={b.bortle}
                  type="button"
                  onClick={() => onChangeBortle(b.bortle)}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors cursor-pointer flex items-center justify-between gap-2 min-h-[42px] ${
                    isSelected
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/12 text-[var(--text-primary)]'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/20"
                      style={{ backgroundColor: palette.hex }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">
                        Bortle {b.bortle} · {palette.label}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-[var(--text-muted)] shrink-0 tabular-nums">
                    {b.sqmMid.toFixed(1)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[var(--border-hairline)] flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3 text-[var(--accent-secondary)]" />
              <span>{logs.filter((l) => l.gps).length} GPS captures pinned</span>
            </span>
            <span>Walker&apos;s Law</span>
          </div>
        </aside>
      </div>
    </div>
  );
};
