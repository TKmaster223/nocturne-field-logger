import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TopBar } from './components/TopBar';
import { SkyNpfWorkbench } from './components/SkyNpfWorkbench';
import { CelestialTimersView } from './components/CelestialTimersView';
import { WildlifeFieldLogger } from './components/WildlifeFieldLogger';
import { OpticsReferenceView } from './components/OpticsReferenceView';
import {
  FieldCaptureLog,
  GpsCoordinates,
  PrefilledAstroDraft,
  SkyConditions,
  WorkbenchTab,
} from './types/field';
import { fetchLiveSkyConditions, getCachedSkyConditions } from './utils/astroMath';
import { deleteCaptureLog, getAllCaptureLogs, saveCaptureLog } from './utils/exifAndStorage';

const PREF_REDSHIFT_KEY = 'nocturne_red_shift_v1';
const PREF_BORTLE_KEY = 'nocturne_bortle_v1';
const PREF_GPS_KEY = 'nocturne_gps_v1';

const DEFAULT_GPS: GpsCoordinates = {
  lat: 33.8734,
  lng: -115.901,
  label: 'Joshua Tree Dark Sky',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(WorkbenchTab.SkyNpf);
  const [selectedLensId, setSelectedLensId] = useState<string>('wide-24-12mp');
  const [redShift, setRedShift] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PREF_REDSHIFT_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [bortleClass, setBortleClass] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(PREF_BORTLE_KEY));
      return saved >= 1 && saved <= 9 ? saved : 3;
    } catch {
      return 3;
    }
  });
  const [gps, setGps] = useState<GpsCoordinates>(() => {
    try {
      const raw = localStorage.getItem(PREF_GPS_KEY);
      return raw ? (JSON.parse(raw) as GpsCoordinates) : DEFAULT_GPS;
    } catch {
      return DEFAULT_GPS;
    }
  });

  const [gpsLocating, setGpsLocating] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [skyConditions, setSkyConditions] = useState<SkyConditions | null>(() =>
    getCachedSkyConditions()
  );
  const [skyLoading, setSkyLoading] = useState<boolean>(false);
  const [skyError, setSkyError] = useState<string | null>(null);
  const [logs, setLogs] = useState<FieldCaptureLog[]>([]);
  const [prefilledDraft, setPrefilledDraft] = useState<PrefilledAstroDraft | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const notify = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3800);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Apply 660nm red-shift class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (redShift) {
      root.classList.add('red-shift');
    } else {
      root.classList.remove('red-shift');
    }
    try {
      localStorage.setItem(PREF_REDSHIFT_KEY, String(redShift));
    } catch {
      // Ignore storage error
    }
  }, [redShift]);

  // Persist Bortle & GPS
  useEffect(() => {
    try {
      localStorage.setItem(PREF_BORTLE_KEY, String(bortleClass));
    } catch {
      // Ignore
    }
  }, [bortleClass]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_GPS_KEY, JSON.stringify(gps));
    } catch {
      // Ignore
    }
  }, [gps]);

  // Online / Offline listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load IndexedDB Field Logs on mount
  useEffect(() => {
    void (async () => {
      try {
        const stored = await getAllCaptureLogs();
        setLogs(stored);
      } catch {
        notify('IndexedDB storage unavailable in this browser context.');
      }
    })();
  }, [notify]);

  const refreshSky = useCallback(
    async (lat: number, lng: number) => {
      setSkyLoading(true);
      setSkyError(null);
      try {
        const result = await fetchLiveSkyConditions(lat, lng);
        setSkyConditions(result);
      } catch {
        setSkyError('Offline or Open-Meteo unreachable — local ephemeris math remains active.');
      } finally {
        setSkyLoading(false);
      }
    },
    []
  );

  // Fetch initial weather snapshot when GPS coords change & online
  useEffect(() => {
    if (isOnline) {
      void refreshSky(gps.lat, gps.lng);
    }
  }, [gps.lat, gps.lng, isOnline, refreshSky]);

  const handleLocateGps = useCallback(() => {
    if (!navigator.geolocation) {
      notify('Geolocation API is not supported in this browser.');
      return;
    }
    setGpsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next: GpsCoordinates = {
          lat: Math.round(pos.coords.latitude * 100000) / 100000,
          lng: Math.round(pos.coords.longitude * 100000) / 100000,
          altitudeM: pos.coords.altitude ? Math.round(pos.coords.altitude) : null,
          accuracyM: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
          label: 'Device GPS Lock',
        };
        setGps(next);
        setGpsLocating(false);
        notify(`GPS locked at ${next.lat.toFixed(4)}°, ${next.lng.toFixed(4)}°.`);
      },
      (err) => {
        setGpsLocating(false);
        notify(`GPS lock failed (${err.message}); using active site coordinates.`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [notify]);

  const handleSaveLog = useCallback(
    async (entry: FieldCaptureLog, file?: File | null) => {
      await saveCaptureLog(entry, file);
      const updated = await getAllCaptureLogs();
      setLogs(updated);
      notify(`Saved ${entry.speciesTag} capture to offline field logbook.`);
    },
    [notify]
  );

  const handleDeleteLog = useCallback(
    async (id: string) => {
      await deleteCaptureLog(id);
      const updated = await getAllCaptureLogs();
      setLogs(updated);
      notify('Removed entry from field logbook.');
    },
    [notify]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onQuickLogClick={() => setActiveTab(WorkbenchTab.FieldLog)}
        redShift={redShift}
        onToggleRedShift={() => setRedShift((prev) => !prev)}
        gps={gps}
        gpsLocating={gpsLocating}
        onLocateGps={handleLocateGps}
        isOnline={isOnline}
        logCount={logs.length}
      />

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {activeTab === WorkbenchTab.SkyNpf && (
              <SkyNpfWorkbench
                selectedLensId={selectedLensId}
                onSelectLensId={setSelectedLensId}
                bortleClass={bortleClass}
                onChangeBortle={setBortleClass}
                gps={gps}
                onUpdateManualGps={(lat, lng, label) =>
                  setGps({ lat, lng, label: label || 'Custom Site' })
                }
                onLocateGps={handleLocateGps}
                gpsLocating={gpsLocating}
                skyConditions={skyConditions}
                skyLoading={skyLoading}
                skyError={skyError}
                onRefreshSky={() => void refreshSky(gps.lat, gps.lng)}
                onApplyToFieldLog={(draft) => {
                  setPrefilledDraft(draft);
                  setActiveTab(WorkbenchTab.FieldLog);
                }}
              />
            )}

            {activeTab === WorkbenchTab.Timers && <CelestialTimersView />}

            {activeTab === WorkbenchTab.FieldLog && (
              <WildlifeFieldLogger
                logs={logs}
                gps={gps}
                bortleClass={bortleClass}
                prefilledDraft={prefilledDraft}
                onConsumeDraft={() => setPrefilledDraft(null)}
                onSaveLog={handleSaveLog}
                onDeleteLog={handleDeleteLog}
                onNotify={notify}
              />
            )}

            {activeTab === WorkbenchTab.Optics && (
              <OpticsReferenceView
                onLoadLensInNpf={(lensId) => {
                  setSelectedLensId(lensId);
                  setActiveTab(WorkbenchTab.SkyNpf);
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Non-intrusive bottom toast feedback */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            role="status"
            aria-live="polite"
            className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 md:bottom-6 z-50 sm:max-w-sm px-4 py-2.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)] shadow-lg"
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
