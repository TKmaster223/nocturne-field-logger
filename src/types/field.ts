export enum WorkbenchTab {
  SkyNpf = 'sky-npf',
  LightMap = 'light-map',
  Timers = 'timers',
  FieldLog = 'field-log',
  Optics = 'optics',
}

export enum CaptureCategory {
  Wildlife = 'wildlife',
  Astro = 'astro',
}

export enum CelestialEventKind {
  AsteroidFlyby = 'asteroid-flyby',
  TotalSolarEclipse = 'total-solar-eclipse',
  AnnularSolarEclipse = 'annular-solar-eclipse',
  PartialSolarEclipse = 'partial-solar-eclipse',
  TotalLunarEclipse = 'total-lunar-eclipse',
  PartialLunarEclipse = 'partial-lunar-eclipse',
  PenumbralLunarEclipse = 'penumbral-lunar-eclipse',
}

export interface OpticalLensProfile {
  id: string;
  zoomLabel: string;
  name: string;
  sensorName: string;
  sensorFormat: string;
  aperture: number;
  focalLengthActualMm: number;
  focalLength35EqMm: number;
  resolutionMp: number;
  binningLabel: string;
  pixelPitchUm: number;
  fieldOfViewDeg: number;
  recommendedFor: string;
  isAstroPrimary?: boolean;
}

export interface NpfCalculationResult {
  npfSeconds: number;
  rule500Seconds: number;
  suggestedIso: number;
  evNote: string;
  maxDeclinationFactor: number;
}

export interface GpsCoordinates {
  lat: number;
  lng: number;
  altitudeM?: number | null;
  accuracyM?: number | null;
  label?: string;
}

export interface ExifMetadata {
  cameraMake?: string;
  cameraModel: string;
  lensName: string;
  shutterSec: number;
  shutterDisplay: string;
  iso: number;
  aperture: number;
  focalLengthMm: number;
  focalLength35Mm: number;
  resolutionMode: string;
  whiteBalance?: string;
  capturedAt: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  isRawDng: boolean;
  isUneditedOriginal: boolean;
  parsedFromFile: boolean;
  rawWidth?: number;
  rawHeight?: number;
}

export interface FieldCaptureLog {
  id: string;
  createdAt: string;
  category: CaptureCategory;
  speciesTag: string;
  notes: string;
  gps: GpsCoordinates | null;
  bortleAtCapture: number;
  exif: ExifMetadata;
  hasOriginalBlob: boolean;
  previewDataUrl?: string;
}

export interface SkyConditions {
  cloudCoverPct: number;
  lowCloudPct: number;
  midCloudPct: number;
  highCloudPct: number;
  visibilityKm: number;
  tempC: number;
  dewPointC: number;
  humidityPct: number;
  windKmh: number;
  fetchedAt: string;
  isCachedFallback: boolean;
  lat: number;
  lng: number;
}

export interface LunarTelemetry {
  ageDays: number;
  illuminationPct: number;
  phaseName: string;
  phaseFraction: number;
  isWaxing: boolean;
}

export interface TwilightSchedule {
  civilDuskUtc: string;
  nauticalDuskUtc: string;
  astroDuskUtc: string;
  astroDawnUtc: string;
  darkWindowHours: number;
  polarStatus: 'normal' | 'midnight-sun' | 'polar-night';
}

export interface BortleScaleInfo {
  bortle: number;
  name: string;
  sqmRange: string;
  sqmMid: number;
  nelm: string;
  milkyWayNote: string;
  recommendedIso: number;
}

export interface CelestialEvent {
  id: string;
  title: string;
  kind: CelestialEventKind;
  isoUtc: string;
  subtitle: string;
  visibilityRegion: string;
  magnitudeOrDistance: string;
  s24OpticAdvice: string;
  isPriority?: boolean;
}

export interface PrefilledAstroDraft {
  lensId: string;
  shutterSec: number;
  iso: number;
  bortle: number;
  notes: string;
}
