import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Flashlight,
  Grid3x3,
  RefreshCw,
  Smartphone,
  X,
} from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureFile: (file: File) => Promise<void> | void;
  onTriggerNativeCamera: () => void;
}

interface ZoomCapabilities {
  min: number;
  max: number;
  step: number;
}

interface ExtendedCapabilities extends MediaTrackCapabilities {
  zoom?: ZoomCapabilities;
  torch?: boolean;
}

interface BrowserImageCapture {
  takePhoto: () => Promise<Blob>;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCaptureFile,
  onTriggerNativeCamera,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [zoomRange, setZoomRange] = useState<ZoomCapabilities | null>(null);
  const [zoomValue, setZoomValue] = useState<number>(1);
  const [starting, setStarting] = useState<boolean>(false);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resolutionLabel, setResolutionLabel] = useState<string>('');

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setHasTorch(false);
    setZoomRange(null);
  }, []);

  const startCamera = useCallback(
    async (mode: 'environment' | 'user') => {
      stopStream();
      setErrorMsg(null);
      setStarting(true);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStarting(false);
        setErrorMsg(
          'Live browser camera is unavailable in this browser context. Use Phone Camera below to shoot directly with your native camera app.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 4032 },
            height: { ideal: 3024 },
          },
          audio: false,
        });

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }

        const track = stream.getVideoTracks()[0];
        if (track) {
          const settings = track.getSettings();
          if (settings.width && settings.height) {
            setResolutionLabel(`${settings.width}×${settings.height}`);
          }
          if (typeof track.getCapabilities === 'function') {
            const caps = track.getCapabilities() as ExtendedCapabilities;
            setHasTorch(Boolean(caps.torch));
            if (caps.zoom && caps.zoom.max > caps.zoom.min) {
              setZoomRange({
                min: caps.zoom.min,
                max: caps.zoom.max,
                step: caps.zoom.step || 0.1,
              });
              setZoomValue(caps.zoom.min);
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Camera permission denied';
        setErrorMsg(
          `Could not start live viewfinder (${msg}). Tap Phone Camera below to use your device camera app directly.`
        );
      } finally {
        setStarting(false);
      }
    },
    [stopStream]
  );

  useEffect(() => {
    if (isOpen) {
      void startCamera(facingMode);
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen, facingMode, startCamera, stopStream]);

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !hasTorch) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // Ignore unsupported torch constraint at runtime
    }
  };

  const handleZoomChange = async (val: number) => {
    setZoomValue(val);
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomRange) return;
    try {
      await track.applyConstraints({
        advanced: [{ zoom: val } as MediaTrackConstraintSet],
      });
    } catch {
      // Ignore unsupported zoom constraint
    }
  };

  const handleSnapPhoto = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      let capturedBlob: Blob | null = null;

      // Prefer native full-sensor still capture via ImageCapture API when supported
      if (track && 'ImageCapture' in window) {
        try {
          const ImageCaptureCtor = (
            window as unknown as { ImageCapture: new (t: MediaStreamTrack) => BrowserImageCapture }
          ).ImageCapture;
          const imageCapture = new ImageCaptureCtor(track);
          capturedBlob = await imageCapture.takePhoto();
        } catch {
          capturedBlob = null;
        }
      }

      // Fallback: grab full video frame dimensions onto canvas
      if (!capturedBlob) {
        const video = videoRef.current;
        if (!video || !video.videoWidth || !video.videoHeight) {
          throw new Error('Video frame not ready');
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context unavailable');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        capturedBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95)
        );
      }

      if (!capturedBlob) {
        throw new Error('Failed to encode captured frame');
      }

      const file = new File([capturedBlob], `CAM_${timestamp}.jpg`, {
        type: capturedBlob.type || 'image/jpeg',
      });
      stopStream();
      await onCaptureFile(file);
      onClose();
    } catch {
      setErrorMsg('Capture failed — try again or use Phone Camera below.');
    } finally {
      setCapturing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--bg-canvas)]/95 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Phone Camera Capture"
    >
      <div className="w-full h-full sm:h-auto sm:max-w-2xl bg-[var(--bg-surface)] border-0 sm:border sm:border-[var(--border-hairline)] sm:rounded-lg flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)] truncate">
              Field Camera Viewfinder
            </h2>
            <p className="text-[11px] font-mono text-[var(--text-muted)] truncate">
              {facingMode === 'environment' ? 'Rear Camera' : 'Front Camera'}
              {resolutionLabel ? ` · ${resolutionLabel}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
            }}
            aria-label="Close camera"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Video Stage */}
        <div className="relative flex-1 sm:flex-none sm:aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
          />

          {/* Rule-of-thirds & center framing reticle */}
          {showGrid && !errorMsg && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
              <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 border border-[var(--accent-primary)]/70 rounded-full" />
            </div>
          )}

          {starting && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-xs font-mono text-[var(--accent-secondary)]">
              Initializing camera sensor...
            </div>
          )}

          {errorMsg && (
            <div className="absolute inset-0 bg-[var(--bg-canvas)]/95 p-6 flex flex-col items-center justify-center text-center gap-4">
              <Camera className="w-8 h-8 text-[var(--accent-primary)]" />
              <p className="text-xs text-[var(--text-secondary)] max-w-sm leading-relaxed">
                {errorMsg}
              </p>
              <button
                type="button"
                onClick={() => {
                  stopStream();
                  onClose();
                  onTriggerNativeCamera();
                }}
                className="min-h-[46px] px-4 py-2 rounded bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                <span>Open Native Phone Camera</span>
              </button>
            </div>
          )}
        </div>

        {/* Zoom Slider (when device exposes hardware zoom) */}
        {zoomRange && !errorMsg && (
          <div className="px-4 py-2.5 border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)] flex items-center gap-3">
            <span className="text-[11px] font-mono text-[var(--text-muted)] shrink-0">
              Zoom {zoomValue.toFixed(1)}×
            </span>
            <input
              type="range"
              min={zoomRange.min}
              max={zoomRange.max}
              step={zoomRange.step}
              value={zoomValue}
              onChange={(e) => void handleZoomChange(Number(e.target.value))}
              className="w-full telemetry-slider"
              aria-label="Camera zoom"
            />
          </div>
        )}

        {/* Bottom Thumb-Zone Controls */}
        <div className="px-4 py-3.5 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] flex items-center justify-between gap-2 pb-safe">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGrid((prev) => !prev)}
              aria-label="Toggle framing grid"
              className={`min-h-[44px] min-w-[44px] px-2.5 rounded border text-xs font-mono inline-flex items-center justify-center gap-1 cursor-pointer ${
                showGrid
                  ? 'border-[var(--accent-secondary)] text-[var(--accent-secondary)] bg-[var(--bg-canvas)]'
                  : 'border-[var(--border-hairline)] text-[var(--text-muted)] bg-[var(--bg-canvas)]'
              }`}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>

            {hasTorch && (
              <button
                type="button"
                onClick={() => void handleToggleTorch()}
                aria-label="Toggle flashlight"
                className={`min-h-[44px] min-w-[44px] px-2.5 rounded border text-xs font-mono inline-flex items-center justify-center cursor-pointer ${
                  torchOn
                    ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/15'
                    : 'border-[var(--border-hairline)] text-[var(--text-muted)] bg-[var(--bg-canvas)]'
                }`}
              >
                <Flashlight className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
              aria-label="Switch front or rear camera"
              className="min-h-[44px] px-3 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Flip</span>
            </button>
          </div>

          {/* Primary Capture Shutter Button */}
          <button
            type="button"
            disabled={starting || capturing || Boolean(errorMsg)}
            onClick={() => void handleSnapPhoto()}
            className="min-h-[48px] px-5 py-2 rounded-full bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] text-xs font-semibold inline-flex items-center gap-2 hover:opacity-90 active:scale-[0.97] transition-all cursor-pointer disabled:opacity-45 whitespace-nowrap"
          >
            <Camera className="w-4 h-4" />
            <span>{capturing ? 'Capturing...' : 'Capture Photo'}</span>
          </button>

          {/* Native Camera App Shortcut (ideal for S24 Ultra Expert RAW / Pro Mode) */}
          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
              onTriggerNativeCamera();
            }}
            className="min-h-[44px] px-3 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Use native phone camera app"
          >
            <Smartphone className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
            <span className="hidden sm:inline">Native App</span>
          </button>
        </div>
      </div>
    </div>
  );
};
