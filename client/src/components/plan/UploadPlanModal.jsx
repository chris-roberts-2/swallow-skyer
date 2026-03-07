import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import apiClient from '../../services/api';
import { computePlanCorners } from '../../utils/planGeoreference';

const STANDARD_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    'satellite-raster': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution:
        'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    },
  },
  layers: [
    { id: 'satellite-raster', type: 'raster', source: 'satellite-raster' },
  ],
};

const STEP_UPLOAD = 'upload';
const STEP_CALIBRATE = 'calibrate';
const STEP_COMPLETE = 'complete';

const ACCEPT_FILES =
  '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';

const PIN_EMPTY = { pixel: null, geo: null };

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.5;

const PLAN_ERROR_MESSAGES = {
  rasterization_failed:
    'The file could not be processed as an image. Try a different file or format.',
  invalid_metadata:
    'Invalid plan data. Check that all required fields are provided.',
  invalid_geometry:
    'Calibration points produced invalid geometry. Choose two points farther apart and try again.',
  invalid_file: 'The uploaded file could not be used. Try a different file.',
  upload_failed: 'Upload failed. Please try again.',
  database_error: 'Failed to save the plan. Please try again.',
  storage_not_configured: 'Storage is not configured. Contact support.',
  database_not_configured: 'Database is not configured. Contact support.',
  plan_already_exists:
    'This project already has a plan. Use Replace plan to overwrite.',
  not_found: 'No plan found for this project.',
};

function getPlanErrorMessage(err) {
  const msg = err?.payload?.message;
  if (msg && typeof msg === 'string') return msg;
  const code = err?.payload?.error;
  if (code && PLAN_ERROR_MESSAGES[code]) return PLAN_ERROR_MESSAGES[code];
  return err?.message || 'Something went wrong. Please try again.';
}

function getPixelFromImageClick(evt, imgEl) {
  if (!imgEl) return null;
  const rect = imgEl.getBoundingClientRect();
  const scaleX = (imgEl.naturalWidth || imgEl.width) / rect.width;
  const scaleY = (imgEl.naturalHeight || imgEl.height) / rect.height;
  const x = Math.round((evt.clientX - rect.left) * scaleX);
  const y = Math.round((evt.clientY - rect.top) * scaleY);
  return [x, y];
}

const PIN_A_FILL = '#1F3A5F';
const PIN_B_FILL = '#3F6FA0';

function createMapMarkerEl(pin) {
  const el = document.createElement('div');
  el.className = `calib-map-marker calib-map-marker--${pin}`;
  el.textContent = pin.toUpperCase();
  el.title = `Pin ${pin.toUpperCase()} — drag to reposition`;
  const fill = pin.toUpperCase() === 'A' ? PIN_A_FILL : PIN_B_FILL;
  el.style.cssText = `
    width: 28px; height: 28px; border-radius: 50%;
    border: 2.5px solid white; background: ${fill};
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: white;
    cursor: grab; box-shadow: 0 2px 6px rgba(0,0,0,0.35);
  `;
  return el;
}

const UploadPlanModal = ({
  open,
  onClose,
  projectId,
  onCalibrationComplete,
  isReplaceMode = false,
  projectCenter = null,
}) => {
  const [step, setStep] = useState(STEP_UPLOAD);
  const [file, setFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [preview, setPreview] = useState(null);
  const [pinA, setPinA] = useState(PIN_EMPTY);
  const [pinB, setPinB] = useState(PIN_EMPTY);
  const [activePin, setActivePin] = useState('A');
  const [planZoom, setPlanZoom] = useState(1);
  const [basemap, setBasemap] = useState('labeled');
  const [georeferenceResult, setGeoreferenceResult] = useState(null);
  const [georeferenceError, setGeoreferenceError] = useState('');
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeError, setFinalizeError] = useState('');

  const planImageRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerARef = useRef(null);
  const markerBRef = useRef(null);

  // Keep a ref to activePin so the stable map click handler always sees the current value.
  const activePinRef = useRef(activePin);
  useEffect(() => {
    activePinRef.current = activePin;
  }, [activePin]);

  const bothPinsSet = pinA.pixel && pinA.geo && pinB.pixel && pinB.geo;

  const resetWorkflow = useCallback(() => {
    setStep(STEP_UPLOAD);
    setFile(null);
    setUploadLoading(false);
    setUploadError('');
    setPreview(null);
    setPinA(PIN_EMPTY);
    setPinB(PIN_EMPTY);
    setActivePin('A');
    setPlanZoom(1);
    setBasemap('labeled');
    setGeoreferenceResult(null);
    setGeoreferenceError('');
    setFinalizeLoading(false);
    setFinalizeError('');
  }, []);

  useEffect(() => {
    if (open) resetWorkflow();
  }, [open, resetWorkflow]);

  // File upload → rasterize → enter calibration
  const handleFileChange = useCallback(
    async e => {
      const chosen = e?.target?.files?.[0];
      if (!chosen || !projectId) return;
      setUploadError('');
      setFile(chosen);
      setPreview(null);
      setUploadLoading(true);
      const formData = new FormData();
      formData.append('file', chosen);
      try {
        const resp = await apiClient.request(
          `/v1/projects/${projectId}/plan/calibration`,
          { method: 'POST', body: formData }
        );
        setPreview({
          imageUrl: resp?.image_url,
          imageWidth: resp?.image_width,
          imageHeight: resp?.image_height,
        });
        setStep(STEP_CALIBRATE);
      } catch (err) {
        setUploadError(getPlanErrorMessage(err));
        setPreview(null);
      } finally {
        setUploadLoading(false);
      }
    },
    [projectId]
  );

  // MapLibre calibration map — created once when STEP_CALIBRATE is active.
  useEffect(() => {
    if (step !== STEP_CALIBRATE) return;
    const el = mapContainerRef.current;
    if (!el) return;

    const center = projectCenter
      ? [projectCenter.lng ?? projectCenter.lon ?? 0, projectCenter.lat]
      : [-98.5, 39.8];
    const zoom = projectCenter ? 15 : 3.5;

    const map = new maplibregl.Map({
      container: el,
      style: STANDARD_STYLE_URL,
      center,
      zoom,
      transformRequest: (url, resourceType) => {
        if (
          resourceType === 'Style' ||
          resourceType === 'Source' ||
          resourceType === 'Tile'
        ) {
          return { url, headers: {}, credentials: 'omit' };
        }
      },
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapInstanceRef.current = map;

    const handleClick = evt => {
      const { lng, lat } = evt.lngLat;
      const geo = [lng, lat];
      const pin = activePinRef.current;

      const placeOrMoveMarker = (markerRef, setPinFn) => {
        if (markerRef.current) {
          markerRef.current.setLngLat(geo);
        } else {
          const el2 = createMapMarkerEl(pin);
          const m = new maplibregl.Marker({ element: el2, draggable: true })
            .setLngLat(geo)
            .addTo(map);
          m.on('dragend', () => {
            const { lng: mLng, lat: mLat } = m.getLngLat();
            setPinFn(p => ({ ...p, geo: [mLng, mLat] }));
          });
          markerRef.current = m;
        }
        setPinFn(p => ({ ...p, geo }));
      };

      if (pin === 'A') {
        placeOrMoveMarker(markerARef, setPinA);
      } else {
        placeOrMoveMarker(markerBRef, setPinB);
      }
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
      if (markerARef.current) {
        markerARef.current.remove();
        markerARef.current = null;
      }
      if (markerBRef.current) {
        markerBRef.current.remove();
        markerBRef.current = null;
      }
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [step, projectCenter]);

  // Basemap toggle
  const handleBasemapToggle = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (basemap === 'labeled') {
      map.setStyle(SATELLITE_STYLE);
      setBasemap('satellite');
    } else {
      map.setStyle(STANDARD_STYLE_URL);
      setBasemap('labeled');
    }
  }, [basemap]);

  // Plan image click → set active pin's pixel position
  const handlePlanImageClick = useCallback(
    evt => {
      const img = planImageRef.current;
      const pixel = getPixelFromImageClick(evt, img);
      if (!pixel) return;
      if (activePin === 'A') {
        setPinA(p => ({ ...p, pixel }));
      } else {
        setPinB(p => ({ ...p, pixel }));
      }
    },
    [activePin]
  );

  // Confirm calibration: compute corners and advance to STEP_COMPLETE
  const handleConfirmCalibration = useCallback(() => {
    if (!bothPinsSet || !preview?.imageWidth || !preview?.imageHeight) return;
    const result = computePlanCorners({
      imageWidth: preview.imageWidth,
      imageHeight: preview.imageHeight,
      calibrationPairs: [
        { pixel: pinA.pixel, geo: pinA.geo },
        { pixel: pinB.pixel, geo: pinB.geo },
      ],
    });
    if (result.success) {
      setGeoreferenceError('');
      setGeoreferenceResult(result);
    } else {
      setGeoreferenceResult(null);
      setGeoreferenceError(result.error || 'Georeferencing failed.');
    }
    setStep(STEP_COMPLETE);
  }, [bothPinsSet, preview, pinA, pinB]);

  // Redo calibration: clear pins and return to STEP_CALIBRATE
  const handleRedoCalibration = useCallback(() => {
    setGeoreferenceResult(null);
    setGeoreferenceError('');
    setPinA(PIN_EMPTY);
    setPinB(PIN_EMPTY);
    setActivePin('A');
    setStep(STEP_CALIBRATE);
  }, []);

  // Finalize: submit plan to backend
  const handleFinalizeUpload = useCallback(async () => {
    if (!georeferenceResult?.bbox || !file || !projectId) return;
    setFinalizeError('');
    setFinalizeLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('min_lat', String(georeferenceResult.bbox.min_lat));
    formData.append('min_lng', String(georeferenceResult.bbox.min_lng));
    formData.append('max_lat', String(georeferenceResult.bbox.max_lat));
    formData.append('max_lng', String(georeferenceResult.bbox.max_lng));
    try {
      await apiClient.request(`/v1/projects/${projectId}/plan`, {
        method: isReplaceMode ? 'PATCH' : 'POST',
        body: formData,
      });
      onCalibrationComplete?.({ planCreated: true });
      onClose();
    } catch (err) {
      setFinalizeError(getPlanErrorMessage(err));
    } finally {
      setFinalizeLoading(false);
    }
  }, [
    georeferenceResult,
    file,
    projectId,
    isReplaceMode,
    onCalibrationComplete,
    onClose,
  ]);

  if (!open) return null;

  // ── Side-by-side calibration screen ───────────────────────────────────────
  if (step === STEP_CALIBRATE && preview) {
    const pinStatus = (pin, label) => {
      const hasPlan = !!pin.pixel;
      const hasMap = !!pin.geo;
      return (
        <span className="calib-pin-status">
          <span
            className={`calib-pin-status__tag ${hasPlan ? 'calib-pin-status__tag--set' : ''}`}
          >
            Plan {hasPlan ? '✓' : '–'}
          </span>
          <span
            className={`calib-pin-status__tag ${hasMap ? 'calib-pin-status__tag--set' : ''}`}
          >
            Map {hasMap ? '✓' : '–'}
          </span>
        </span>
      );
    };

    return (
      <div
        className="calib-screen"
        role="dialog"
        aria-modal="true"
        aria-label={
          isReplaceMode
            ? 'Replace and georeference plan'
            : 'Upload and georeference plan'
        }
      >
        {/* ── Header (platform page-header structure) ─────────────────────── */}
        <header className="calib-screen__header page-header">
          <div className="page-header__left" />
          <div className="page-header__center calib-screen__header-center">
            <h2 className="page-header__title">
              {isReplaceMode
                ? 'Replace and georeference plan'
                : 'Upload and georeference plan'}
            </h2>
            <p className="calib-screen__instructions">
              Select Pin A and Pin B, then click the same location on both the
              plan and the map. Choose identifiable features like building
              corners, road intersections, or site entrances.
            </p>
          </div>
          <div className="page-header__right calib-screen__pin-controls">
            <button
              type="button"
              className={`calib-pin-btn calib-pin-btn--a ${activePin === 'A' ? 'calib-pin-btn--active' : ''}`}
              onClick={() => setActivePin('A')}
              aria-pressed={activePin === 'A'}
            >
              <span className="calib-pin-btn__label">Pin A</span>
              {pinStatus(pinA, 'A')}
            </button>
            <button
              type="button"
              className={`calib-pin-btn calib-pin-btn--b ${activePin === 'B' ? 'calib-pin-btn--active' : ''}`}
              onClick={() => setActivePin('B')}
              aria-pressed={activePin === 'B'}
            >
              <span className="calib-pin-btn__label">Pin B</span>
              {pinStatus(pinB, 'B')}
            </button>
          </div>
        </header>

        {/* ── Panels ─────────────────────────────────────────────────────── */}
        <div className="calib-screen__panels">
          {/* LEFT — Plan image */}
          <div className="calib-panel calib-panel--plan">
            <div className="calib-panel__toolbar">
              <span className="calib-panel__toolbar-label">
                Plan — click to place <strong>Pin {activePin}</strong>
              </span>
              <span className="calib-panel__zoom-controls">
                <button
                  type="button"
                  className="calib-zoom-btn"
                  onClick={() =>
                    setPlanZoom(z =>
                      Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(1))
                    )
                  }
                  aria-label="Zoom in"
                >
                  +
                </button>
                <span className="calib-zoom-level">
                  {Math.round(planZoom * 100)}%
                </span>
                <button
                  type="button"
                  className="calib-zoom-btn"
                  onClick={() =>
                    setPlanZoom(z =>
                      Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(1))
                    )
                  }
                  aria-label="Zoom out"
                >
                  −
                </button>
                <button
                  type="button"
                  className="calib-zoom-btn calib-zoom-btn--reset"
                  onClick={() => setPlanZoom(1)}
                  aria-label="Reset zoom"
                >
                  Reset
                </button>
              </span>
            </div>

            <div className="calib-plan-viewer">
              <div
                className="calib-plan-viewer__inner"
                style={{ width: `${planZoom * 100}%` }}
                onClick={handlePlanImageClick}
                role="button"
                tabIndex={0}
                aria-label="Click to place calibration pin on the plan"
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
                }}
              >
                <img
                  ref={planImageRef}
                  src={preview.imageUrl}
                  alt="Plan preview"
                  className="calib-plan-viewer__img"
                  draggable={false}
                />
                {pinA.pixel && preview && (
                  <span
                    className="calib-pin-overlay calib-pin-overlay--a"
                    style={{
                      left: `${(pinA.pixel[0] / preview.imageWidth) * 100}%`,
                      top: `${(pinA.pixel[1] / preview.imageHeight) * 100}%`,
                    }}
                    aria-hidden
                  >
                    A
                  </span>
                )}
                {pinB.pixel && preview && (
                  <span
                    className="calib-pin-overlay calib-pin-overlay--b"
                    style={{
                      left: `${(pinB.pixel[0] / preview.imageWidth) * 100}%`,
                      top: `${(pinB.pixel[1] / preview.imageHeight) * 100}%`,
                    }}
                    aria-hidden
                  >
                    B
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — MapLibre map */}
          <div className="calib-panel calib-panel--map">
            <div className="calib-panel__toolbar">
              <span className="calib-panel__toolbar-label">
                Map — click to place <strong>Pin {activePin}</strong>
              </span>
              <button
                type="button"
                className="calib-basemap-btn"
                onClick={handleBasemapToggle}
              >
                {basemap === 'labeled'
                  ? 'Switch to Satellite'
                  : 'Switch to Labeled'}
              </button>
            </div>
            <div
              ref={mapContainerRef}
              className="calib-map-container"
              aria-label="Calibration map — click to place pin"
            />
          </div>
        </div>

        {/* ── Footer (platform modal-footer convention) ─────────────────── */}
        <footer className="calib-screen__footer modal-footer">
          <p className="calib-screen__footer-hint">
            {!bothPinsSet
              ? 'Place both Pin A and Pin B on the plan and the map to continue.'
              : 'Both pins are set. Confirm to compute the plan corners.'}
          </p>
          <div className="calib-screen__footer-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                resetWorkflow();
                onClose();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirmCalibration}
              disabled={!bothPinsSet}
              title={
                !bothPinsSet
                  ? 'Place both pins on the plan and map to continue'
                  : undefined
              }
            >
              Confirm calibration
            </button>
          </div>
        </footer>
      </div>
    );
  }

  // ── Upload step + completion step (normal modal) ───────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-plan-title"
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-body upload-plan-modal__body"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="upload-plan-title" className="modal-header">
          {isReplaceMode
            ? 'Replace and georeference plan'
            : 'Upload and georeference plan'}
        </h3>

        {step === STEP_UPLOAD && (
          <div className="upload-plan-modal__step modal-form">
            <p className="upload-plan-modal__instruction">
              Choose a plan file (PDF, PNG, or JPEG). After uploading you will
              place two calibration pins on both the plan and a real-world map
              to georeference it.
            </p>
            <label className="form-label">
              Plan file
              <input
                type="file"
                accept={ACCEPT_FILES}
                onChange={handleFileChange}
                disabled={uploadLoading}
                className="form-input"
              />
            </label>
            {uploadLoading && (
              <p className="upload-plan-modal__status">Processing…</p>
            )}
            {uploadError && (
              <p
                role="alert"
                className="upload-plan-modal__message upload-plan-modal__message--error"
              >
                {uploadError}
              </p>
            )}
          </div>
        )}

        {step === STEP_COMPLETE && (
          <div className="upload-plan-modal__step">
            {georeferenceError ? (
              <>
                <p
                  role="alert"
                  className="upload-plan-modal__message upload-plan-modal__message--error"
                >
                  {georeferenceError}
                </p>
                <p className="upload-plan-modal__hint">
                  Choose two calibration points farther apart and try again.
                </p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRedoCalibration}
                >
                  Redo calibration
                </button>
              </>
            ) : georeferenceResult ? (
              <>
                <p className="upload-plan-modal__message upload-plan-modal__message--success">
                  Corners computed. Save the plan to store it with the project.
                </p>
                {pinA.geo && pinB.geo && (
                  <p className="upload-plan-modal__hint">
                    Pin A: {pinA.geo[1].toFixed(5)}, {pinA.geo[0].toFixed(5)}
                    {' · '}
                    Pin B: {pinB.geo[1].toFixed(5)}, {pinB.geo[0].toFixed(5)}
                  </p>
                )}
                {finalizeError && (
                  <p
                    role="alert"
                    className="upload-plan-modal__message upload-plan-modal__message--error"
                  >
                    {finalizeError}
                  </p>
                )}
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-sm)',
                    marginTop: 'var(--space-sm)',
                  }}
                >
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleRedoCalibration}
                    disabled={finalizeLoading}
                  >
                    Redo calibration
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleFinalizeUpload}
                    disabled={finalizeLoading}
                  >
                    {finalizeLoading
                      ? 'Saving…'
                      : isReplaceMode
                        ? 'Replace plan'
                        : 'Save plan'}
                  </button>
                </div>
              </>
            ) : (
              <p className="upload-plan-modal__status">Computing corners…</p>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              resetWorkflow();
              onClose();
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadPlanModal;
