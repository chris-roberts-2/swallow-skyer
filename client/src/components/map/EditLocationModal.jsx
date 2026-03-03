import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { getApiOrigin } from '../../utils/apiEnv';

const MODE_ADDRESS = 'address';
const MODE_COORDS = 'coords';
const MODE_DRAG = 'drag';

const MODES = [
  { key: MODE_ADDRESS, label: 'Address' },
  { key: MODE_COORDS, label: 'Coordinates' },
  { key: MODE_DRAG, label: 'Drag Marker' },
];

// User-facing messages keyed by geocode_error type from the backend.
const GEOCODE_MESSAGES = {
  no_results: 'No location found. Check the spelling or try a nearby landmark.',
  ambiguous_address:
    'Multiple locations matched. Select one below or enter coordinates.',
  timeout: 'The geocoding service timed out. Please try again.',
  http_error:
    'The geocoding service is temporarily unavailable. Please try again.',
  unexpected_error:
    'Something went wrong. Please try again or use Drag Marker mode.',
  malformed_response:
    'Unexpected response from the geocoding service. Try again or use Coordinates mode.',
  invalid_input: 'Invalid input. Please check your address or coordinates.',
};

// Mode-specific follow-up suggestions for actionable recovery.
const GEOCODE_SUGGESTIONS = {
  no_results: {
    [MODE_ADDRESS]:
      'Switch to Coordinates or Drag Marker mode to position manually.',
    [MODE_COORDS]:
      'No address resolved, but you can still save the marker using Drag Marker mode.',
    [MODE_DRAG]: 'Move the marker to a different location and try again.',
  },
  timeout:
    'Check your connection and retry, or use Drag Marker mode to position without geocoding.',
  http_error: 'Try again in a moment, or use Drag Marker mode.',
  unexpected_error:
    'Switch to Drag Marker mode to position without an address lookup.',
  malformed_response:
    'Switch to Coordinates mode and enter the values directly.',
  ambiguous_address: null,
};

const getSuggestion = (type, mode) => {
  const entry = GEOCODE_SUGGESTIONS[type];
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  return entry[mode] || entry[MODE_ADDRESS] || null;
};

const createDragPinEl = () => {
  const el = document.createElement('div');
  el.style.cssText =
    'width:24px;height:32px;cursor:grab;filter:drop-shadow(0 3px 8px rgba(31,58,95,0.5));user-select:none;line-height:0;';
  el.innerHTML =
    '<svg width="24" height="32" viewBox="0 0 24 32" fill="none" aria-hidden="true">' +
    '<path d="M12 1C6.477 1 2 5.477 2 11c0 7.732 10 20 10 20s10-12.268 10-20C22 5.477 17.523 1 12 1z"' +
    ' fill="var(--color-accent)" stroke="var(--color-surface-primary)" stroke-width="1.5"/>' +
    '<circle cx="12" cy="11" r="3.5" fill="var(--color-surface-primary)"/>' +
    '</svg>';
  return el;
};

const buildUrl = projectId =>
  `${(getApiOrigin() || '').replace(/\/$/, '')}/api/v1/projects/${projectId}/location`;

// Structured error banner displayed for backend geocoding failures.
const GeoErrorBanner = ({
  errorData,
  mode,
  onCandidateSelect,
  onSwitchMode,
}) => {
  const type = errorData?.type || 'unexpected_error';
  const message =
    GEOCODE_MESSAGES[type] || errorData?.message || 'An error occurred.';
  const suggestion = getSuggestion(type, mode);
  const candidates = errorData?.candidates || [];

  return (
    <div
      role="alert"
      style={{
        padding: '10px 12px',
        background: 'rgba(155,74,47,0.07)',
        border: '1px solid rgba(155,74,47,0.25)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'var(--font-weight-medium)',
          color: 'var(--color-accent)',
          lineHeight: 'var(--line-height-snug)',
        }}
      >
        {message}
      </p>

      {suggestion && (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            lineHeight: 'var(--line-height-relaxed)',
          }}
        >
          {suggestion}
        </p>
      )}

      {type === 'no_results' && mode === MODE_ADDRESS && (
        <div
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}
        >
          <button
            type="button"
            onClick={() => onSwitchMode(MODE_COORDS)}
            style={switchBtnStyle}
          >
            Use Coordinates
          </button>
          <button
            type="button"
            onClick={() => onSwitchMode(MODE_DRAG)}
            style={switchBtnStyle}
          >
            Drag Marker
          </button>
        </div>
      )}

      {candidates.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            marginTop: 4,
          }}
        >
          {candidates.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onCandidateSelect(c)}
              style={candidateBtnStyle}
            >
              {c.address}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const switchBtnStyle = {
  fontSize: 'var(--font-size-xs)',
  fontWeight: 'var(--font-weight-medium)',
  fontFamily: 'var(--font-family-sans)',
  padding: '3px 8px',
  background: 'var(--color-surface-primary)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  color: 'var(--color-text-primary)',
  whiteSpace: 'nowrap',
};

const candidateBtnStyle = {
  fontSize: 'var(--font-size-sm)',
  fontFamily: 'var(--font-family-sans)',
  fontWeight: 'var(--font-weight-regular)',
  padding: '6px 8px',
  background: 'var(--color-surface-primary)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  color: 'var(--color-text-primary)',
  textAlign: 'left',
  lineHeight: 'var(--line-height-snug)',
  transition: 'background 120ms ease',
};

const EditLocationModal = ({
  open,
  onClose,
  onSave,
  projectId,
  projectMarker,
  mapInstance,
  onModeChange,
}) => {
  const [mode, setMode] = useState(MODE_ADDRESS);
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [dragCoords, setDragCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [geocodeError, setGeocodeError] = useState(null);
  const dragMarkerRef = useRef(null);

  const savedLat = projectMarker?.latitude ?? null;
  const savedLng = projectMarker?.longitude ?? null;

  const clearErrors = useCallback(() => {
    setLocalError(null);
    setGeocodeError(null);
  }, []);

  const handleModeChange = useCallback(
    nextMode => {
      clearErrors();
      setMode(nextMode);
      onModeChange?.(nextMode);
    },
    [onModeChange, clearErrors]
  );

  // Initialize fields when modal opens only — intentionally omit deps that
  // would trigger on every render; this effect must only fire on open/close.
  useEffect(() => {
    if (!open) {
      setMode(MODE_ADDRESS);
      clearErrors();
      return;
    }
    setMode(MODE_ADDRESS);
    setAddress('');
    setLat(savedLat != null ? String(savedLat) : '');
    setLng(savedLng != null ? String(savedLng) : '');
    setDragCoords(
      savedLat != null && savedLng != null
        ? { lat: savedLat, lng: savedLng }
        : null
    );
    clearErrors();
    onModeChange?.(MODE_ADDRESS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Create draggable marker when drag mode is active
  useEffect(() => {
    const map = mapInstance?.current;
    const isDragMode = open && mode === MODE_DRAG;

    if (!isDragMode || !map) {
      if (dragMarkerRef.current) {
        dragMarkerRef.current.remove();
        dragMarkerRef.current = null;
      }
      return;
    }

    const initLat = savedLat ?? 39.8;
    const initLng = savedLng ?? -98.5;
    const el = createDragPinEl();

    const marker = new maplibregl.Marker({
      element: el,
      draggable: true,
      anchor: 'bottom',
    })
      .setLngLat([initLng, initLat])
      .addTo(map);

    const onDrag = () => {
      const pos = marker.getLngLat();
      setDragCoords({ lat: pos.lat, lng: pos.lng });
    };

    marker.on('drag', onDrag);
    marker.on('dragend', onDrag);
    dragMarkerRef.current = marker;

    if (savedLat != null && savedLng != null) {
      map.flyTo({
        center: [initLng, initLat],
        zoom: Math.max(map.getZoom?.() ?? 10, 13),
        essential: true,
      });
    }

    return () => {
      if (dragMarkerRef.current) {
        dragMarkerRef.current.remove();
        dragMarkerRef.current = null;
      }
    };
  }, [open, mode, mapInstance, savedLat, savedLng]);

  const handleClose = useCallback(() => {
    if (dragMarkerRef.current) {
      dragMarkerRef.current.remove();
      dragMarkerRef.current = null;
    }
    onModeChange?.(null);
    onClose();
  }, [onClose, onModeChange]);

  // When user selects an ambiguous candidate, switch to Coordinates mode
  // pre-filled with the candidate's resolved coordinates.
  const handleCandidateSelect = useCallback(
    candidate => {
      setLat(String(candidate.lat));
      setLng(String(candidate.lng));
      handleModeChange(MODE_COORDS);
    },
    [handleModeChange]
  );

  const buildBody = useCallback(() => {
    if (mode === MODE_ADDRESS) {
      if (!address.trim())
        return { body: null, validationError: 'Address is required.' };
      return { body: { address: address.trim() }, validationError: null };
    }
    if (mode === MODE_COORDS) {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng))
        return {
          body: null,
          validationError: 'Valid latitude and longitude are required.',
        };
      if (
        parsedLat < -90 ||
        parsedLat > 90 ||
        parsedLng < -180 ||
        parsedLng > 180
      )
        return {
          body: null,
          validationError: 'Coordinates are out of valid range.',
        };
      return {
        body: { lat: parsedLat, lng: parsedLng },
        validationError: null,
      };
    }
    if (mode === MODE_DRAG) {
      if (!dragCoords)
        return {
          body: null,
          validationError: 'Drag the marker to a new location.',
        };
      return {
        body: { lat: dragCoords.lat, lng: dragCoords.lng },
        validationError: null,
      };
    }
    return { body: null, validationError: 'Unknown mode.' };
  }, [mode, address, lat, lng, dragCoords]);

  const handleSave = useCallback(async () => {
    clearErrors();
    const { body, validationError } = buildBody();
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLoading(true);
    const accessToken = localStorage.getItem('access_token') || '';
    try {
      const res = await fetch(buildUrl(projectId), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.geocode_error) {
          setGeocodeError({
            type: data.geocode_error,
            candidates: data.candidates || [],
          });
        } else {
          setLocalError(data.error || 'Failed to update location.');
        }
        return;
      }
      if (dragMarkerRef.current) {
        dragMarkerRef.current.remove();
        dragMarkerRef.current = null;
      }
      onModeChange?.(null);
      onSave(data);
    } catch {
      setLocalError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [buildBody, clearErrors, projectId, onSave, onModeChange]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        height: '100%',
        width: '300px',
        background: 'var(--color-surface-primary)',
        boxShadow: '4px 0 20px rgba(31,58,95,0.18)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-family-sans)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 16px 0',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-md)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-primary)',
          }}
        >
          Edit Project Location
        </span>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          style={{
            width: 28,
            height: 28,
            display: 'grid',
            placeItems: 'center',
            fontSize: 18,
            lineHeight: 1,
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          height: 1,
          background: 'var(--color-border)',
          margin: '12px 0 0',
          flexShrink: 0,
        }}
      />

      <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          {MODES.map(({ key, label }, i) => (
            <button
              key={key}
              type="button"
              onClick={() => handleModeChange(key)}
              style={{
                flex: 1,
                padding: '6px 4px',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                fontFamily: 'var(--font-family-sans)',
                border: 'none',
                borderLeft: i > 0 ? '1px solid var(--color-border)' : 'none',
                borderRadius: 0,
                cursor: 'pointer',
                background:
                  mode === key
                    ? 'var(--color-primary)'
                    : 'var(--color-surface-primary)',
                color:
                  mode === key
                    ? 'var(--color-surface-primary)'
                    : 'var(--color-text-primary)',
                transition: 'background 150ms ease, color 150ms ease',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowY: 'auto',
        }}
      >
        {mode === MODE_ADDRESS && (
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--color-text-primary)',
            }}
          >
            Address
            <input
              type="text"
              value={address}
              onChange={e => {
                setAddress(e.target.value);
                clearErrors();
              }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Street, city, state..."
              className="form-input"
            />
          </label>
        )}

        {mode === MODE_COORDS && (
          <>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text-primary)',
              }}
            >
              Latitude
              <input
                type="number"
                value={lat}
                onChange={e => {
                  setLat(e.target.value);
                  clearErrors();
                }}
                placeholder="e.g. 37.7749"
                step="any"
                className="form-input"
              />
            </label>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text-primary)',
              }}
            >
              Longitude
              <input
                type="number"
                value={lng}
                onChange={e => {
                  setLng(e.target.value);
                  clearErrors();
                }}
                placeholder="e.g. -122.4194"
                step="any"
                className="form-input"
              />
            </label>
          </>
        )}

        {mode === MODE_DRAG && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 12,
              background: 'var(--color-background)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                lineHeight: 'var(--line-height-relaxed)',
              }}
            >
              Drag the marker on the map to reposition it. Changes are not saved
              until you click Save.
            </p>
            {dragCoords && (
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-medium)',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-family-mono)',
                }}
              >
                {dragCoords.lat.toFixed(6)}, {dragCoords.lng.toFixed(6)}
              </p>
            )}
          </div>
        )}

        {geocodeError && (
          <GeoErrorBanner
            errorData={geocodeError}
            mode={mode}
            onCandidateSelect={handleCandidateSelect}
            onSwitchMode={handleModeChange}
          />
        )}

        {localError && !geocodeError && (
          <p
            style={{
              margin: 0,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-accent)',
            }}
          >
            {localError}
          </p>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          padding: '12px 16px 16px',
          borderTop: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <button type="button" onClick={handleClose} className="btn-secondary">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export default EditLocationModal;
