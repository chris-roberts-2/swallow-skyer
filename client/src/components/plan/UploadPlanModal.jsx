import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import apiClient from '../../services/api';
import { configureMaplibreWorker } from '../../utils/maplibreWorker';
import { computePlanCorners } from '../../utils/planGeoreference';

const SATELLITE_RASTER_SOURCE = {
  type: 'raster',
  tiles: [
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
  tileSize: 256,
  attribution:
    'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
};

const SATELLITE_STYLE = {
  version: 8,
  sources: { 'satellite-raster': SATELLITE_RASTER_SOURCE },
  layers: [
    { id: 'satellite-raster', type: 'raster', source: 'satellite-raster' },
  ],
};

const STEP_UPLOAD = 'upload';
const STEP_POINT1_PLAN = 'point1_plan';
const STEP_POINT1_MAP = 'point1_map';
const STEP_POINT2_PLAN = 'point2_plan';
const STEP_POINT2_MAP = 'point2_map';
const STEP_COMPLETE = 'complete';

const ACCEPT_FILES =
  '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';

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

const UploadPlanModal = ({
  open,
  onClose,
  projectId,
  onCalibrationComplete,
  isReplaceMode = false,
}) => {
  const [step, setStep] = useState(STEP_UPLOAD);
  const [file, setFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [preview, setPreview] = useState(null);
  const [point1Pixel, setPoint1Pixel] = useState(null);
  const [point1Geo, setPoint1Geo] = useState(null);
  const [point2Pixel, setPoint2Pixel] = useState(null);
  const [point2Geo, setPoint2Geo] = useState(null);
  const [georeferenceResult, setGeoreferenceResult] = useState(null);
  const [georeferenceError, setGeoreferenceError] = useState('');
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeError, setFinalizeError] = useState('');
  const planImageRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const resetWorkflow = useCallback(() => {
    setStep(STEP_UPLOAD);
    setFile(null);
    setUploadLoading(false);
    setUploadError('');
    setPreview(null);
    setPoint1Pixel(null);
    setPoint1Geo(null);
    setPoint2Pixel(null);
    setPoint2Geo(null);
    setGeoreferenceResult(null);
    setGeoreferenceError('');
    setFinalizeLoading(false);
    setFinalizeError('');
  }, []);

  useEffect(() => {
    if (open) resetWorkflow();
  }, [open, resetWorkflow]);

  useEffect(() => {
    if (
      step !== STEP_COMPLETE ||
      !preview?.imageWidth ||
      !preview?.imageHeight ||
      !point1Pixel ||
      !point2Pixel ||
      !point1Geo ||
      !point2Geo
    ) {
      return;
    }
    const result = computePlanCorners({
      imageWidth: preview.imageWidth,
      imageHeight: preview.imageHeight,
      calibrationPairs: [
        { pixel: point1Pixel, geo: point1Geo },
        { pixel: point2Pixel, geo: point2Geo },
      ],
    });
    if (result.success) {
      setGeoreferenceError('');
      setGeoreferenceResult(result);
    } else {
      setGeoreferenceResult(null);
      setGeoreferenceError(result.error || 'Georeferencing failed.');
    }
  }, [
    step,
    preview?.imageWidth,
    preview?.imageHeight,
    point1Pixel,
    point2Pixel,
    point1Geo,
    point2Geo,
  ]);

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

  const handleRedoCalibration = useCallback(() => {
    setGeoreferenceResult(null);
    setGeoreferenceError('');
    setPoint1Pixel(null);
    setPoint1Geo(null);
    setPoint2Pixel(null);
    setPoint2Geo(null);
    setStep(STEP_POINT1_PLAN);
  }, []);

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
        setStep(STEP_POINT1_PLAN);
      } catch (err) {
        setUploadError(getPlanErrorMessage(err));
        setPreview(null);
      } finally {
        setUploadLoading(false);
      }
    },
    [projectId]
  );

  const handlePlanImageClick = useCallback(
    evt => {
      const img = planImageRef.current;
      const pixel = getPixelFromImageClick(evt, img);
      if (!pixel) return;
      if (step === STEP_POINT1_PLAN) {
        setPoint1Pixel(pixel);
        setStep(STEP_POINT1_MAP);
      } else if (step === STEP_POINT2_PLAN) {
        setPoint2Pixel(pixel);
        setStep(STEP_POINT2_MAP);
      }
    },
    [step]
  );

  const handleMapClick = useCallback(
    evt => {
      const lngLat = evt?.lngLat;
      if (!lngLat) return;
      const lon = lngLat.lng != null ? lngLat.lng : lngLat[0];
      const lat = lngLat.lat != null ? lngLat.lat : lngLat[1];
      if (step === STEP_POINT1_MAP) {
        setPoint1Geo([lon, lat]);
        setStep(STEP_POINT2_PLAN);
      } else if (step === STEP_POINT2_MAP && point1Geo) {
        setPoint2Geo([lon, lat]);
        setStep(STEP_COMPLETE);
      }
    },
    [step, point1Geo]
  );

  useEffect(() => {
    if (step !== STEP_POINT1_MAP && step !== STEP_POINT2_MAP) return;
    const el = mapContainerRef.current;
    if (!el) return;
    configureMaplibreWorker();
    const map = new maplibregl.Map({
      container: el,
      style: SATELLITE_STYLE,
      center: [-98.5, 39.8],
      zoom: 10,
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
    mapInstanceRef.current = map;
    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [step, handleMapClick]);

  const closeMapModal = useCallback(() => {
    if (step === STEP_POINT1_MAP) {
      setPoint1Pixel(null);
      setStep(STEP_POINT1_PLAN);
    } else if (step === STEP_POINT2_MAP) {
      setPoint2Pixel(null);
      setStep(STEP_POINT2_PLAN);
    }
  }, [step]);

  if (!open) return null;

  const showMapModal = step === STEP_POINT1_MAP || step === STEP_POINT2_MAP;
  const pointNumber = step === STEP_POINT1_MAP ? 1 : 2;

  return (
    <>
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
                Choose a plan file (PDF, PNG, or JPEG). It will be uploaded so
                you can place two calibration points on the plan and on the map.
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
                <p className="upload-plan-modal__status">Uploading…</p>
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

          {(step === STEP_POINT1_PLAN || step === STEP_POINT2_PLAN) &&
            preview && (
              <div className="upload-plan-modal__step">
                <p className="upload-plan-modal__instruction">
                  {step === STEP_POINT1_PLAN
                    ? 'Click a recognizable location on the plan (e.g. building corner or intersection).'
                    : 'Click a second recognizable location on the plan.'}
                </p>
                <div
                  className="upload-plan-modal__preview-wrap"
                  style={{
                    maxWidth: preview.imageWidth,
                    maxHeight: 400,
                    overflow: 'auto',
                  }}
                >
                  <div
                    className="upload-plan-modal__preview-inner"
                    style={{
                      position: 'relative',
                      display: 'inline-block',
                      cursor: 'crosshair',
                    }}
                    onClick={handlePlanImageClick}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ')
                        e.preventDefault();
                    }}
                    aria-label="Click to set calibration point"
                  >
                    <img
                      ref={planImageRef}
                      src={preview.imageUrl}
                      alt="Plan preview"
                      style={{
                        display: 'block',
                        maxWidth: '100%',
                        height: 'auto',
                        maxHeight: 400,
                      }}
                      draggable={false}
                    />
                    {point1Pixel && preview && (
                      <span
                        className="upload-plan-modal__marker"
                        style={{
                          left: `${(point1Pixel[0] / preview.imageWidth) * 100}%`,
                          top: `${(point1Pixel[1] / preview.imageHeight) * 100}%`,
                          transform: 'translate(-50%, -100%)',
                        }}
                        aria-hidden
                      />
                    )}
                    {point2Pixel && preview && (
                      <span
                        className="upload-plan-modal__marker upload-plan-modal__marker--second"
                        style={{
                          left: `${(point2Pixel[0] / preview.imageWidth) * 100}%`,
                          top: `${(point2Pixel[1] / preview.imageHeight) * 100}%`,
                          transform: 'translate(-50%, -100%)',
                        }}
                        aria-hidden
                      />
                    )}
                  </div>
                </div>
                <p className="upload-plan-modal__hint">
                  Click on the plan image above to set calibration point{' '}
                  {step === STEP_POINT1_PLAN ? 1 : 2}.
                </p>
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
                    Corners computed. Save the plan to store it with the
                    project.
                  </p>
                  {point1Geo && point2Geo && (
                    <p className="upload-plan-modal__hint">
                      Point 1: {point1Geo[1].toFixed(5)},{' '}
                      {point1Geo[0].toFixed(5)}
                      {' · '}
                      Point 2: {point2Geo[1].toFixed(5)},{' '}
                      {point2Geo[0].toFixed(5)}
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
                </>
              ) : (
                <p className="upload-plan-modal__status">Computing corners…</p>
              )}
            </div>
          )}

          <div className="modal-footer">
            {showMapModal ? null : (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>

      {showMapModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="calibration-map-title"
          className="modal-overlay upload-plan-modal__map-overlay"
          onClick={e => e.target === e.currentTarget && closeMapModal()}
        >
          <div
            className="upload-plan-modal__map-body"
            onClick={e => e.stopPropagation()}
          >
            <h3 id="calibration-map-title" className="modal-header">
              Set real-world location for point {pointNumber}
            </h3>
            <p className="upload-plan-modal__instruction">
              Click the same location on the satellite map below.
            </p>
            <div
              ref={mapContainerRef}
              className="upload-plan-modal__map-container"
              aria-label="Satellite map for calibration"
            />
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeMapModal}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UploadPlanModal;
