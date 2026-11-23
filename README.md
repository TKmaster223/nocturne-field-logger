# Nocturne Field

An offline-first **Samsung Galaxy S24 Ultra** astrophotography exposure calculator, celestial event timer, and unedited RAW/JPEG wildlife field logger designed for zero-signal night-sky and field sessions.

**Live App:** [https://ais-pre-wtch3xvkj24bejmz5gezfc-839980037716.europe-west2.run.app](https://ais-pre-wtch3xvkj24bejmz5gezfc-839980037716.europe-west2.run.app)

---

## Core Features

- **S24 Ultra NPF Exposure Console**: Computes pinpoint star shutter limits using the full NPF rule ($t = k \cdot \frac{16.9N + 0.10f + 13.7p}{f \cdot \cos\delta}$) across all rear Galaxy S24 Ultra optics and Expert RAW pixel-binning modes (`12.5MP`, `50MP`, `200MP`), compared directly against the legacy 500-Rule.
- **660nm Red-Light Night Mode**: One-tap deep-crimson night vision mode that preserves scotopic dark adaptation during astrophotography sessions.
- **Offline Ephemeris & Live Sky Telemetry**: Built-in Julian-date calculations for lunar phase, illumination %, and astronomical twilight windows, paired with live cloud layers, visibility, and lens dew-point spread from Open-Meteo (with automatic offline caching).
- **Celestial Event Timers**: Live UTC countdowns to the **April 13, 2029 (21:46 UTC) 99942 Apophis Flyby** and the **2027–2029 Total Solar & Lunar Eclipse** schedule with S24 Ultra capture recommendations.
- **DNG / JPEG EXIF Parser & Wildlife Field Logger**: Client-side binary EXIF, GPS, and embedded DNG thumbnail extraction (`exifr`) with quick species presets (**Frog**, **Chicken**, **Duck**, **Night Sky**), zero-filter integrity verification, and offline IndexedDB storage for full-size files.
- **Uncompressed WhatsApp Document Export**: Shares untouched `.dng`/`.jpg` files via the mobile Web Share sheet (`navigator.share`) or downloads the original file alongside a copied formatted EXIF/GPS telemetry caption for WhatsApp Document sending.
- **Full Field Log Export**: Export logged sessions to **CSV** or **JSON**.

---

## Galaxy S24 Ultra Optics Matrix

| Zoom | Optic | Sensor | Aperture | Actual / 35mm Eq. | Pixel Pitch (Modes) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `0.6×` | Ultra-Wide 13mm | Sony IMX564 | `f/2.2` | `2.2mm` / `13mm` | `1.40 µm` (12MP) |
| `1×` | Main Wide 24mm | Samsung ISOCELL HP2 | `f/1.7` | `6.3mm` / `24mm` | `2.40 µm` (12.5MP) · `1.20 µm` (50MP) · `0.60 µm` (200MP) |
| `3×` | Telephoto 67mm | Sony IMX754 | `f/2.4` | `7.9mm` / `67mm` | `1.12 µm` (10MP) |
| `5×` | Periscope 111mm | Sony IMX854 | `f/3.4` | `18.6mm` / `111mm` | `1.40 µm` (12.5MP) · `0.70 µm` (50MP) |

---

## Local Development

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Type-check and build for production
npm run lint
npm run build
```

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
- **EXIF & Storage**: `exifr` (client-side DNG/TIFF/JPEG/GPS parser), IndexedDB, `localStorage`
- **Telemetry**: Browser Geolocation API, Web Share API, Open-Meteo Forecast API
