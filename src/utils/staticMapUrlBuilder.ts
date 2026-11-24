export interface StaticMapConfig {
  center: string;
  zoom: number;
  size: string;
  maptype?: 'roadmap' | 'satellite' | 'terrain' | 'hybrid';
  markers?: string[];
  paths?: string[];
  style?: string[];
  scale?: 1 | 2;
  format?: 'png' | 'png8' | 'png32' | 'gif' | 'jpg' | 'jpg-baseline';
}

export interface BortleVisualMeta {
  bortle: number;
  label: string;
  hex: string;
  staticHex: string;
  staticFillHex: string;
  sqm: string;
  nelm: string;
}

export const BORTLE_VISUAL_PALETTE: Record<number, BortleVisualMeta> = {
  1: {
    bortle: 1,
    label: 'Excellent Dark',
    hex: '#1e293b',
    staticHex: '0x38bdf8cc',
    staticFillHex: '0x0f172a40',
    sqm: '21.99–22.00',
    nelm: '7.6–8.0',
  },
  2: {
    bortle: 2,
    label: 'Typical Dark',
    hex: '#1d4ed8',
    staticHex: '0x3b82f6cc',
    staticFillHex: '0x1d4ed833',
    sqm: '21.89–21.99',
    nelm: '7.1–7.5',
  },
  3: {
    bortle: 3,
    label: 'Rural Sky',
    hex: '#0284c7',
    staticHex: '0x06b6d4cc',
    staticFillHex: '0x0284c733',
    sqm: '21.69–21.89',
    nelm: '6.6–7.0',
  },
  4: {
    bortle: 4,
    label: 'Rural/Suburban',
    hex: '#10b981',
    staticHex: '0x10b981cc',
    staticFillHex: '0x10b98133',
    sqm: '20.49–21.69',
    nelm: '6.1–6.5',
  },
  5: {
    bortle: 5,
    label: 'Suburban',
    hex: '#eab308',
    staticHex: '0xeab308cc',
    staticFillHex: '0xeab30833',
    sqm: '19.50–20.49',
    nelm: '5.6–6.0',
  },
  6: {
    bortle: 6,
    label: 'Bright Suburban',
    hex: '#f97316',
    staticHex: '0xf97316cc',
    staticFillHex: '0xf9731633',
    sqm: '18.94–19.50',
    nelm: '5.1–5.5',
  },
  7: {
    bortle: 7,
    label: 'Suburban/Urban',
    hex: '#ef4444',
    staticHex: '0xef4444cc',
    staticFillHex: '0xef444438',
    sqm: '18.38–18.94',
    nelm: '4.6–5.0',
  },
  8: {
    bortle: 8,
    label: 'City Sky',
    hex: '#f43f5e',
    staticHex: '0xf43f5ecc',
    staticFillHex: '0xf43f5e3d',
    sqm: '17.80–18.38',
    nelm: '4.1–4.5',
  },
  9: {
    bortle: 9,
    label: 'Inner City',
    hex: '#f8fafc',
    staticHex: '0xf8fafccc',
    staticFillHex: '0xf8fafc44',
    sqm: '< 17.80',
    nelm: '< 4.0',
  },
};

export const DARK_STATIC_MAP_STYLES: string[] = [
  'element:geometry|color:0x0b101b',
  'element:labels.text.fill|color:0x94a3b8',
  'element:labels.text.stroke|color:0x07090e',
  'feature:administrative.locality|element:labels.text.fill|color:0xf59e0b',
  'feature:road|element:geometry|color:0x1e293b',
  'feature:road.highway|element:geometry|color:0x334155',
  'feature:water|element:geometry|color:0x04070d',
  'feature:poi.park|element:geometry|color:0x0f1a18',
];

export function getGoogleMapsApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? '';
}

/**
 * Computes geodesic circle perimeter coordinates around (lat, lng) for Maps Static API paths.
 */
export function buildGeodesicCirclePoints(
  lat: number,
  lng: number,
  radiusKm: number,
  steps = 28
): Array<{ lat: number; lng: number }> {
  const earthRadiusKm = 6371;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angularDist = radiusKm / earthRadiusKm;
  const pts: Array<{ lat: number; lng: number }> = [];

  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const destLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDist) +
        Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearing)
    );
    const destLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDist) * Math.cos(latRad),
        Math.cos(angularDist) - Math.sin(latRad) * Math.sin(destLat)
      );
    pts.push({
      lat: Math.round(((destLat * 180) / Math.PI) * 10000) / 10000,
      lng: Math.round(((destLng * 180) / Math.PI) * 10000) / 10000,
    });
  }
  return pts;
}

/**
 * Haversine distance in kilometers between two GPS coordinates.
 */
export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimates radial Bortle progression away from an urban/suburban light dome using Walker's Law falloff,
 * or skyglow gradient inward from a dark-sky core.
 */
export function estimateBortleInZone(baseBortle: number, distanceKm: number): number {
  if (distanceKm <= 4) return baseBortle;
  if (baseBortle >= 5) {
    // Escaping an urban/suburban skyglow dome drops Bortle faster with distance
    const decay = Math.log2(1 + distanceKm / 12) * 1.35;
    return Math.max(1, Math.min(9, Math.round((baseBortle - decay) * 10) / 10));
  }
  // Moving radially out from an already-dark site approaches regional background ~Class 3-4
  const drift = Math.min(1.8, Math.log2(1 + distanceKm / 20) * 0.7);
  return Math.max(1, Math.min(9, Math.round((baseBortle + drift) * 10) / 10));
}

/**
 * Constructs a Google Maps Static API image URL for <img> embedding.
 */
export function buildStaticMapUrl(config: StaticMapConfig, apiKeyOverride?: string): string {
  const apiKey = apiKeyOverride ?? getGoogleMapsApiKey();
  if (!apiKey) {
    return '';
  }

  const params = new URLSearchParams();
  params.append('center', config.center);
  params.append('zoom', config.zoom.toString());
  params.append('size', config.size);
  params.append('key', apiKey);

  if (config.maptype) {
    params.append('maptype', config.maptype);
  }
  if (config.scale) {
    params.append('scale', config.scale.toString());
  }
  if (config.format) {
    params.append('format', config.format);
  }
  if (config.markers && config.markers.length > 0) {
    config.markers.forEach((marker) => params.append('markers', marker));
  }
  if (config.paths && config.paths.length > 0) {
    config.paths.forEach((p) => params.append('path', p));
  }
  if (config.style && config.style.length > 0) {
    config.style.forEach((s) => params.append('style', s));
  }

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
