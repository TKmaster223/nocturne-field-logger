import { BORTLE_SCALE_REFERENCE } from '../data/s24Optics';
import {
  BortleScaleInfo,
  LunarTelemetry,
  NpfCalculationResult,
  OpticalLensProfile,
  SkyConditions,
  TwilightSchedule,
} from '../types/field';

const SKY_CACHE_KEY = 'nocturne_sky_conditions_cache_v1';

/**
 * Full NPF Rule formula for pinpoint stars:
 * t = k * (16.9 * N + 0.10 * f_actual + 13.7 * p_um) / (f_actual * cos(declination))
 */
export function calculateNpfExposure(
  lens: OpticalLensProfile,
  declinationDeg: number,
  toleranceK: number,
  bortleClass: number
): NpfCalculationResult {
  const clampedDec = Math.min(85, Math.max(0, declinationDeg));
  const cosDec = Math.cos((clampedDec * Math.PI) / 180);
  const numerator = 16.9 * lens.aperture + 0.1 * lens.focalLengthActualMm + 13.7 * lens.pixelPitchUm;
  const rawNpf = (toleranceK * numerator) / (lens.focalLengthActualMm * Math.max(0.087, cosDec));
  const npfSeconds = Math.min(60, Math.round(rawNpf * 10) / 10);
  const rule500Seconds = Math.round((500 / lens.focalLength35EqMm) * 10) / 10;

  const bortleInfo = getBortleInfo(bortleClass);
  const isoAdjust = lens.aperture > 2.5 ? 2 : 1;
  const suggestedIso = Math.min(3200, Math.max(200, bortleInfo.recommendedIso * isoAdjust));

  let evNote = 'Pinpoint stars across full frame';
  if (toleranceK >= 2) {
    evNote = 'Slight 2px star elongation acceptable for landscape foregrounds';
  } else if (lens.pixelPitchUm <= 0.7) {
    evNote = 'High-density unbinned sensor — strict shutter ceiling enforced';
  }

  return {
    npfSeconds,
    rule500Seconds,
    suggestedIso,
    evNote,
    maxDeclinationFactor: Math.round((1 / Math.max(0.087, cosDec)) * 100) / 100,
  };
}

export function getBortleInfo(bortle: number): BortleScaleInfo {
  const clamped = Math.min(9, Math.max(1, Math.round(bortle)));
  return BORTLE_SCALE_REFERENCE.find((b) => b.bortle === clamped) ?? BORTLE_SCALE_REFERENCE[3];
}

export function calculateEffectiveBortle(
  baseBortle: number,
  lunarIlluminationPct: number,
  includeMoonGlow: boolean
): { effectiveBortle: number; moonPenalty: number; skyglowCapSec: number | null } {
  const moonFactor = includeMoonGlow ? Math.max(0, Math.min(1, lunarIlluminationPct / 100)) : 0;
  // Dark sites lose more Bortle steps under a bright moon than already-bright urban skies
  const headroom = Math.max(0, (9 - baseBortle) / 8);
  const moonPenalty = Math.round(moonFactor * 2.6 * headroom * 10) / 10;
  const effectiveBortle = Math.min(9, Math.round((baseBortle + moonPenalty) * 10) / 10);

  let skyglowCapSec: number | null = null;
  if (effectiveBortle >= 7.5) skyglowCapSec = 4;
  else if (effectiveBortle >= 6) skyglowCapSec = 6;

  return { effectiveBortle, moonPenalty, skyglowCapSec };
}

export function calculateLunarTelemetry(date: Date = new Date()): LunarTelemetry {
  // Known new moon reference: 2000-01-06 18:14 UTC
  const synodicMonth = 29.53058867;
  const refNewMoonMs = Date.UTC(2000, 0, 6, 18, 14, 0);
  const daysSinceRef = (date.getTime() - refNewMoonMs) / 86400000;
  const cyclePos = ((daysSinceRef % synodicMonth) + synodicMonth) % synodicMonth;
  const phaseFraction = cyclePos / synodicMonth;
  const illuminationPct = Math.round(((1 - Math.cos(2 * Math.PI * phaseFraction)) / 2) * 1000) / 10;
  const isWaxing = phaseFraction < 0.5;

  let phaseName = 'New Moon';
  if (cyclePos < 1.5 || cyclePos > 28.0) phaseName = 'New Moon';
  else if (cyclePos < 6.4) phaseName = 'Waxing Crescent';
  else if (cyclePos < 8.4) phaseName = 'First Quarter';
  else if (cyclePos < 13.8) phaseName = 'Waxing Gibbous';
  else if (cyclePos < 15.8) phaseName = 'Full Moon';
  else if (cyclePos < 21.1) phaseName = 'Waning Gibbous';
  else if (cyclePos < 23.1) phaseName = 'Last Quarter';
  else phaseName = 'Waning Crescent';

  return {
    ageDays: Math.round(cyclePos * 10) / 10,
    illuminationPct,
    phaseName,
    phaseFraction,
    isWaxing,
  };
}

function formatUtcHHMM(hoursDecimal: number): string {
  const wrapped = ((hoursDecimal % 24) + 24) % 24;
  const hrs = Math.floor(wrapped);
  const mins = Math.floor((wrapped - hrs) * 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')} UTC`;
}

export function calculateTwilightSchedule(lat: number, lng: number, date: Date = new Date()): TwilightSchedule {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86400000);
  const declRad = (23.44 * Math.PI) / 180 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const latRad = (Math.max(-89, Math.min(89, lat)) * Math.PI) / 180;
  const solarNoonUtc = 12 - lng / 15;

  const solveSunCrossing = (sunAltDeg: number): number | null => {
    const zenRad = ((90 - sunAltDeg) * Math.PI) / 180;
    const cosH =
      (Math.cos(zenRad) - Math.sin(latRad) * Math.sin(declRad)) /
      (Math.cos(latRad) * Math.cos(declRad));
    if (cosH > 1) return -1; // Always below altitude (polar night)
    if (cosH < -1) return -2; // Always above altitude (midnight sun)
    const hourAngleHours = ((Math.acos(cosH) * 180) / Math.PI) / 15;
    return hourAngleHours;
  };

  const civilH = solveSunCrossing(-6);
  const nauticalH = solveSunCrossing(-12);
  const astroH = solveSunCrossing(-18);

  if (astroH === -2) {
    return {
      civilDuskUtc: civilH && civilH > 0 ? formatUtcHHMM(solarNoonUtc + civilH) : 'Continuous Twilight',
      nauticalDuskUtc: 'No Astronomical Dark',
      astroDuskUtc: 'No Astronomical Dark',
      astroDawnUtc: 'No Astronomical Dark',
      darkWindowHours: 0,
      polarStatus: 'midnight-sun',
    };
  }

  if (astroH === -1) {
    return {
      civilDuskUtc: '24h Polar Night',
      nauticalDuskUtc: '24h Polar Night',
      astroDuskUtc: 'Continuous Dark',
      astroDawnUtc: 'Continuous Dark',
      darkWindowHours: 24,
      polarStatus: 'polar-night',
    };
  }

  const duskAstro = solarNoonUtc + (astroH ?? 7.5);
  const dawnAstro = solarNoonUtc + 24 - (astroH ?? 7.5);
  const darkWindowHours = Math.round(((dawnAstro - duskAstro + 24) % 24) * 10) / 10;

  return {
    civilDuskUtc: civilH && civilH > 0 ? formatUtcHHMM(solarNoonUtc + civilH) : 'N/A',
    nauticalDuskUtc: nauticalH && nauticalH > 0 ? formatUtcHHMM(solarNoonUtc + nauticalH) : 'N/A',
    astroDuskUtc: formatUtcHHMM(duskAstro),
    astroDawnUtc: formatUtcHHMM(dawnAstro),
    darkWindowHours,
    polarStatus: 'normal',
  };
}

export function getCachedSkyConditions(): SkyConditions | null {
  try {
    const raw = localStorage.getItem(SKY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SkyConditions;
    return { ...parsed, isCachedFallback: true };
  } catch {
    return null;
  }
}

export async function fetchLiveSkyConditions(lat: number, lng: number): Promise<SkyConditions> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(
    4
  )}&current=temperature_2m,relative_humidity_2m,dew_point_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m&timezone=UTC`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP ${response.status}`);
    }

    const data = await response.json();
    const current = data?.current;
    if (!current) {
      throw new Error('Missing current telemetry payload');
    }

    const snapshot: SkyConditions = {
      cloudCoverPct: Number(current.cloud_cover ?? 0),
      lowCloudPct: Number(current.cloud_cover_low ?? 0),
      midCloudPct: Number(current.cloud_cover_mid ?? 0),
      highCloudPct: Number(current.cloud_cover_high ?? 0),
      visibilityKm: Math.round((Number(current.visibility ?? 24000) / 1000) * 10) / 10,
      tempC: Math.round(Number(current.temperature_2m ?? 15) * 10) / 10,
      dewPointC: Math.round(Number(current.dew_point_2m ?? 8) * 10) / 10,
      humidityPct: Number(current.relative_humidity_2m ?? 50),
      windKmh: Math.round(Number(current.wind_speed_10m ?? 0) * 10) / 10,
      fetchedAt: new Date().toISOString(),
      isCachedFallback: false,
      lat,
      lng,
    };

    try {
      localStorage.setItem(SKY_CACHE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage quota errors for cache
    }
    return snapshot;
  } catch (err) {
    const cached = getCachedSkyConditions();
    if (cached) {
      return cached;
    }
    throw err;
  }
}

export function formatCountdownParts(targetIsoUtc: string, nowMs: number) {
  const diff = Math.max(0, new Date(targetIsoUtc).getTime() - nowMs);
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return {
    isPast: diff === 0,
    days,
    hours,
    minutes,
    seconds,
  };
}
