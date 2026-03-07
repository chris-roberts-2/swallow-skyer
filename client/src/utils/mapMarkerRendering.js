/**
 * Shared marker and popup rendering for Map and Plan pages.
 * Used by PhotoMapLive and PlanMapMarkers for identical marker/popup behavior.
 */

import maplibregl from 'maplibre-gl';
import { toLngLat, parseCoordinate } from './mapDataUtils';

/**
 * Clears all markers and project location popup from refs.
 */
export function clearMarkers(refs) {
  const { markersRef, photoPopupRef, projectLocationPopupRef } = refs || {};
  if (photoPopupRef?.current) {
    try {
      photoPopupRef.current.remove();
    } catch {
      // ignore
    }
    photoPopupRef.current = null;
  }
  if (projectLocationPopupRef?.current) {
    try {
      projectLocationPopupRef.current.remove();
    } catch {
      // ignore
    }
    projectLocationPopupRef.current = null;
  }
  (markersRef?.current || []).forEach(marker => {
    try {
      marker?.remove?.();
    } catch {
      // ignore
    }
  });
  if (markersRef) markersRef.current = [];
}

/**
 * Adds photo markers, cluster markers, and project pin to the map.
 * Returns { bounds, hasProjectPin, pmLat, pmLng } for optional auto-fit by caller.
 *
 * @param {maplibre.Map} map - MapLibre map instance
 * @param {Object} refs - { markersRef, photoPopupRef, projectLocationPopupRef }
 * @param {Object} options - clusters, projectMarker, canManage, selectedProjectName,
 *   openPhotoOptions, closePhotoPopup, closeStack, setActiveStack, onEditProjectLocation,
 *   formatDateTimeParts, isDragMode (optional, default false)
 */
export function addMarkersToMap(map, refs, options) {
  if (!map || !refs)
    return { bounds: null, hasProjectPin: false, pmLat: null, pmLng: null };

  const {
    clusters = [],
    projectMarker = null,
    canManage = false,
    selectedProjectName = '',
    openPhotoOptions = () => {},
    closePhotoPopup = () => {},
    closeStack = () => {},
    setActiveStack = () => {},
    onEditProjectLocation = () => {},
    formatDateTimeParts = () => ({ dateLabel: '', timeLabel: '' }),
    isDragMode = false,
  } = options;

  const { markersRef, photoPopupRef, projectLocationPopupRef } = refs;
  clearMarkers(refs);

  const bounds = new maplibregl.LngLatBounds();

  const applyMarkerRootStyles = (element, sizePx) => {
    element.style.width = `${sizePx}px`;
    element.style.height = `${sizePx}px`;
    element.style.boxSizing = 'border-box';
    element.style.padding = '0';
    element.style.margin = '0';
    element.style.display = 'grid';
    element.style.placeItems = 'center';
    element.style.userSelect = 'none';
    element.style.lineHeight = '0';
    element.style.transition = 'none';
    element.style.animation = 'none';
  };

  const createMarkerInner = sizePx => {
    const inner = document.createElement('div');
    inner.style.width = `${sizePx}px`;
    inner.style.height = `${sizePx}px`;
    inner.style.boxSizing = 'border-box';
    inner.style.position = 'relative';
    inner.style.display = 'grid';
    inner.style.placeItems = 'center';
    inner.style.lineHeight = '0';
    inner.style.transition = 'none';
    inner.style.animation = 'none';
    return inner;
  };

  const createPhotoMarker = photo => {
    const lngLat = toLngLat(photo.mapLongitude, photo.mapLatitude);
    if (!lngLat) return null;
    bounds.extend(lngLat);

    const container = document.createElement('div');
    applyMarkerRootStyles(container, 20);
    container.style.cursor = 'pointer';
    container.title = photo.caption || 'View photo';
    container.setAttribute('role', 'button');
    container.setAttribute('tabindex', '0');

    const inner = createMarkerInner(20);
    inner.style.borderRadius = '50%';
    inner.style.background = 'var(--color-primary)';
    inner.style.border = '2px solid var(--color-surface-primary)';
    inner.style.boxShadow = 'var(--shadow-sm)';
    inner.style.transition = 'transform 150ms ease, box-shadow 150ms ease';

    const innerDot = document.createElement('div');
    innerDot.style.width = '5px';
    innerDot.style.height = '5px';
    innerDot.style.borderRadius = '50%';
    innerDot.style.background = 'var(--color-surface-primary)';
    inner.appendChild(innerDot);
    container.appendChild(inner);

    container.addEventListener('mouseenter', () => {
      inner.style.transform = 'scale(1.07)';
      inner.style.boxShadow = 'var(--shadow-md)';
    });
    container.addEventListener('mouseleave', () => {
      inner.style.transform = 'scale(1)';
      inner.style.boxShadow = 'var(--shadow-sm)';
    });

    const root = document.createElement('div');
    root.style.position = 'relative';
    root.style.maxWidth = '320px';
    root.style.width = '320px';
    root.style.padding = '12px 12px 14px';
    root.style.background = 'var(--color-surface-primary)';
    root.style.borderRadius = 'var(--radius-xl)';
    root.style.boxShadow = 'var(--shadow-lg)';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = '10px';
    root.style.fontFamily = 'var(--font-family-sans)';
    root.addEventListener('click', evt => evt.stopPropagation());

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '8px';
    closeBtn.style.right = '8px';
    closeBtn.style.width = '24px';
    closeBtn.style.height = '24px';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.padding = '0';
    closeBtn.style.display = 'grid';
    closeBtn.style.placeItems = 'center';
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.boxShadow = 'none';
    closeBtn.style.color = 'var(--color-text-primary)';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.borderRadius = 'var(--radius-sm)';
    closeBtn.style.transition = 'background 150ms ease';
    closeBtn.onmouseenter = () => {
      closeBtn.style.background = 'var(--color-background)';
    };
    closeBtn.onmouseleave = () => {
      closeBtn.style.background = 'transparent';
    };
    closeBtn.onclick = evt => {
      evt.stopPropagation();
      closePhotoPopup();
    };

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '12px';

    const thumb = document.createElement('img');
    thumb.alt = photo.caption || 'Photo';
    thumb.crossOrigin = 'anonymous';
    thumb.style.width = '120px';
    thumb.style.height = '120px';
    thumb.style.objectFit = 'cover';
    thumb.style.borderRadius = 'var(--radius-lg)';
    thumb.style.background = 'var(--color-border)';
    thumb.onerror = () => {
      if (photo.fallbackUrl && thumb.src !== photo.fallbackUrl) {
        thumb.src = photo.fallbackUrl;
      } else {
        thumb.style.display = 'none';
      }
    };
    thumb.src =
      photo.thumbnail_url ||
      photo.thumbnailUrl ||
      photo.primaryUrl ||
      photo.url ||
      photo.fallbackUrl ||
      '';
    thumb.style.cursor = 'pointer';
    thumb.onclick = evt => {
      evt.stopPropagation();
      openPhotoOptions(photo);
    };

    const meta = document.createElement('div');
    meta.style.display = 'flex';
    meta.style.flex = '1';
    meta.style.flexDirection = 'column';
    meta.style.alignItems = 'center';
    meta.style.justifyContent = 'center';
    meta.style.gap = '4px';

    const { dateLabel, timeLabel } = formatDateTimeParts(
      photo.timestampIso || photo.createdAt || photo.created_at || ''
    );
    const date = document.createElement('div');
    date.textContent = dateLabel;
    date.style.fontSize = 'var(--font-size-base)';
    date.style.color = 'var(--color-text-primary)';
    date.style.fontWeight = 'var(--font-weight-semibold)';
    date.style.lineHeight = 'var(--line-height-snug)';
    const time = document.createElement('div');
    time.textContent = timeLabel;
    time.style.fontSize = 'var(--font-size-sm)';
    time.style.color = 'var(--color-text-secondary)';
    time.style.fontWeight = 'var(--font-weight-regular)';
    time.style.lineHeight = 'var(--line-height-snug)';

    const dl = document.createElement('a');
    dl.textContent = '⤓';
    dl.setAttribute('aria-label', 'Download photo');
    dl.href = photo.primaryUrl || photo.url || photo.fallbackUrl || '#';
    dl.target = '_blank';
    dl.rel = 'noopener noreferrer';
    dl.style.fontSize = 'var(--font-size-xl)';
    dl.style.color = 'var(--color-primary)';
    dl.style.textDecoration = 'none';
    dl.style.fontWeight = 'var(--font-weight-semibold)';
    dl.style.display = 'inline-flex';
    dl.style.alignItems = 'center';
    dl.style.justifyContent = 'center';
    dl.style.width = '32px';
    dl.style.height = '32px';
    dl.style.borderRadius = 'var(--radius-md)';
    dl.style.border = '1px solid var(--color-border)';
    dl.style.background = 'var(--color-surface-primary)';
    dl.style.boxShadow = 'var(--shadow-xs)';
    dl.style.transition =
      'background 150ms ease, border-color 150ms ease, box-shadow 150ms ease';
    dl.onmouseover = () => {
      dl.style.background = 'var(--color-surface-hover)';
      dl.style.borderColor = 'var(--color-border-hover)';
      dl.style.boxShadow = 'var(--shadow-sm)';
    };
    dl.onmouseout = () => {
      dl.style.background = 'var(--color-surface-primary)';
      dl.style.borderColor = 'var(--color-border)';
      dl.style.boxShadow = 'var(--shadow-xs)';
    };
    dl.onclick = evt => {
      if (dl.href === '#') {
        evt.preventDefault();
        return;
      }
    };

    meta.appendChild(date);
    meta.appendChild(time);
    row.appendChild(thumb);
    row.appendChild(meta);
    row.appendChild(dl);
    root.appendChild(closeBtn);
    root.appendChild(row);

    const popup = new maplibregl.Popup({
      offset: 24,
      closeButton: false,
      closeOnClick: false,
      closeOnMove: false,
      maxWidth: '340px',
    }).setDOMContent(root);

    popup.on('close', () => {
      if (photoPopupRef?.current === popup) {
        photoPopupRef.current = null;
      }
    });

    const marker = new maplibregl.Marker({
      element: container,
      anchor: 'center',
      offset: [0, 0],
    })
      .setLngLat(lngLat)
      .addTo(map);

    const openPopup = evt => {
      evt?.stopPropagation?.();
      closeStack();
      closePhotoPopup();
      if (photoPopupRef) photoPopupRef.current = popup;
      popup.setLngLat(lngLat).addTo(map);
      const el = popup.getElement?.();
      if (el) {
        el.style.background = 'transparent';
        el.style.boxShadow = 'none';
        el.style.padding = '0';
        const tip = el.querySelector('.maplibregl-popup-tip');
        if (tip) tip.style.display = 'none';
        const content = el.querySelector('.maplibregl-popup-content');
        if (content) {
          content.style.background = 'transparent';
          content.style.boxShadow = 'none';
          content.style.padding = '0';
        }
      }
    };

    container.addEventListener('click', openPopup);
    container.addEventListener('keydown', evt => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        openPopup(evt);
      }
    });

    if (markersRef) markersRef.current.push(marker);
    return marker;
  };

  const createClusterMarker = cluster => {
    const lngLat = toLngLat(cluster.longitude, cluster.latitude);
    if (!lngLat) return null;
    const [lng, lat] = lngLat;
    bounds.extend(lngLat);

    const container = document.createElement('div');
    applyMarkerRootStyles(container, 24);
    container.style.cursor = 'pointer';
    container.setAttribute('role', 'button');
    container.setAttribute('tabindex', '0');
    container.setAttribute(
      'aria-label',
      `${cluster.photos.length} photos at this location`
    );

    const inner = createMarkerInner(24);
    inner.style.borderRadius = '50%';
    inner.style.background = 'var(--color-primary-dark)';
    inner.style.border = '2px solid var(--color-surface-primary)';
    inner.style.boxShadow = 'var(--shadow-md)';
    inner.style.transition = 'transform 150ms ease, box-shadow 150ms ease';

    const core = document.createElement('div');
    core.style.width = '5px';
    core.style.height = '5px';
    core.style.borderRadius = '50%';
    core.style.background = 'var(--color-surface-primary)';
    inner.appendChild(core);
    container.appendChild(inner);

    container.addEventListener('mouseenter', () => {
      inner.style.transform = 'scale(1.07)';
      inner.style.boxShadow = 'var(--shadow-lg)';
    });
    container.addEventListener('mouseleave', () => {
      inner.style.transform = 'scale(1)';
      inner.style.boxShadow = 'var(--shadow-md)';
    });

    const openCluster = evt => {
      evt.stopPropagation();
      closePhotoPopup();
      setActiveStack({
        latitude: lat,
        longitude: lng,
        photos: cluster.photos,
      });
      map?.flyTo?.({
        center: [lng, lat],
        zoom: Math.max(map.getZoom?.() ?? 10, 9),
        essential: true,
      });
    };

    container.addEventListener('click', openCluster);
    container.addEventListener('keydown', evt => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        openCluster(evt);
      }
    });

    const marker = new maplibregl.Marker({
      element: container,
      anchor: 'center',
      offset: [0, 0],
    })
      .setLngLat(lngLat)
      .addTo(map);

    if (markersRef) markersRef.current.push(marker);
    return marker;
  };

  clusters.forEach(cluster => {
    if (
      !Number.isFinite(cluster.latitude) ||
      !Number.isFinite(cluster.longitude)
    ) {
      return;
    }
    const isIndividual = (cluster.locationNumber || 0) === 1;
    if (isIndividual && cluster.photos.length > 0) {
      createPhotoMarker(cluster.photos[0]);
    } else if (cluster.photos.length > 0) {
      createClusterMarker(cluster);
    }
  });

  const pmLat = projectMarker ? parseCoordinate(projectMarker.latitude) : null;
  const pmLng = projectMarker ? parseCoordinate(projectMarker.longitude) : null;
  const hasProjectPin =
    Number.isFinite(pmLat) && Number.isFinite(pmLng) && !isDragMode;

  if (hasProjectPin) {
    const pinLngLat = [pmLng, pmLat];
    const pinEl = document.createElement('div');
    pinEl.style.width = '24px';
    pinEl.style.height = '32px';
    pinEl.style.boxSizing = 'border-box';
    pinEl.style.padding = '0';
    pinEl.style.margin = '0';
    pinEl.style.userSelect = 'none';
    pinEl.style.lineHeight = '0';
    pinEl.style.transition = 'none';
    pinEl.style.animation = 'none';
    pinEl.style.cursor = canManage ? 'pointer' : 'default';
    pinEl.style.filter = 'drop-shadow(0 2px 6px rgba(31,58,95,0.35))';
    pinEl.title = selectedProjectName || 'Project location';

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '32');
    svg.setAttribute('viewBox', '0 0 24 32');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const body = document.createElementNS(ns, 'path');
    body.setAttribute(
      'd',
      'M12 1C6.477 1 2 5.477 2 11c0 7.732 10 20 10 20s10-12.268 10-20C22 5.477 17.523 1 12 1z'
    );
    body.setAttribute('fill', 'var(--color-accent)');
    body.setAttribute('stroke', 'var(--color-surface-primary)');
    body.setAttribute('stroke-width', '1.5');
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', '12');
    dot.setAttribute('cy', '11');
    dot.setAttribute('r', '3.5');
    dot.setAttribute('fill', 'var(--color-surface-primary)');
    svg.appendChild(body);
    svg.appendChild(dot);
    pinEl.appendChild(svg);

    pinEl.addEventListener('mouseenter', () => {
      pinEl.style.filter = 'drop-shadow(0 3px 8px rgba(31,58,95,0.5))';
      svg.style.transform = 'scale(1.08)';
      svg.style.transformOrigin = 'center bottom';
    });
    pinEl.addEventListener('mouseleave', () => {
      pinEl.style.filter = 'drop-shadow(0 2px 6px rgba(31,58,95,0.35))';
      svg.style.transform = 'scale(1)';
    });

    const pinMarker = new maplibregl.Marker({
      element: pinEl,
      anchor: 'bottom',
      offset: [0, 0],
    })
      .setLngLat(pinLngLat)
      .addTo(map);

    if (canManage) {
      const popupRoot = document.createElement('div');
      popupRoot.style.padding = '12px 14px';
      popupRoot.style.background = 'var(--color-surface-primary)';
      popupRoot.style.borderRadius = 'var(--radius-xl)';
      popupRoot.style.boxShadow = 'var(--shadow-lg)';
      popupRoot.style.fontFamily = 'var(--font-family-sans)';
      popupRoot.style.border = '1px solid var(--color-border)';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-primary';
      editBtn.textContent = 'Edit Project Location';
      editBtn.style.whiteSpace = 'nowrap';
      editBtn.onclick = evt => {
        evt.stopPropagation();
        if (projectLocationPopupRef?.current) {
          projectLocationPopupRef.current.remove();
          projectLocationPopupRef.current = null;
        }
        onEditProjectLocation(projectMarker);
      };
      popupRoot.appendChild(editBtn);
      const projectPopup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        offset: 12,
        maxWidth: 'none',
        className: 'maplibregl-popup--project-location',
      })
        .setDOMContent(popupRoot)
        .setLngLat(pinLngLat);
      if (projectLocationPopupRef)
        projectLocationPopupRef.current = projectPopup;
      pinMarker.setPopup(projectPopup);
      pinEl.addEventListener('click', evt => {
        evt.stopPropagation();
        pinMarker.togglePopup();
      });
    }

    if (markersRef) markersRef.current.push(pinMarker);
  }

  return {
    bounds,
    hasProjectPin,
    pmLat,
    pmLng,
  };
}

/**
 * Renders the stacked-photos popup on the map. Returns a cleanup function.
 */
export function renderStackPopup(map, activeStack, options) {
  if (!map || !activeStack) return () => {};

  const {
    closeStack = () => {},
    formatDateTimeParts = () => ({ dateLabel: '', timeLabel: '' }),
    openPhotoOptions = () => {},
    downloadPhotos = () => {},
  } = options || {};

  const root = document.createElement('div');
  root.style.maxWidth = '320px';
  root.style.width = '320px';
  root.style.padding = '12px 12px 14px';
  root.style.background = 'var(--color-surface-primary)';
  root.style.borderRadius = 'var(--radius-xl)';
  root.style.boxShadow = 'var(--shadow-lg)';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = '10px';
  root.style.fontFamily = 'var(--font-family-sans)';
  root.addEventListener('click', evt => evt.stopPropagation());

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';

  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.gap = '6px';
  const title = document.createElement('div');
  title.textContent = 'Grouped Photos';
  title.style.fontWeight = 'var(--font-weight-semibold)';
  title.style.fontSize = 'var(--font-size-md)';
  title.style.color = 'var(--color-text-primary)';
  const count = document.createElement('div');
  count.textContent = `${activeStack.photos.length} items`;
  count.style.fontSize = 'var(--font-size-sm)';
  count.style.color = 'var(--color-text-secondary)';
  titleRow.appendChild(title);
  titleRow.appendChild(count);
  header.appendChild(titleRow);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.style.width = '24px';
  closeBtn.style.height = '24px';
  closeBtn.style.fontSize = '18px';
  closeBtn.style.lineHeight = '1';
  closeBtn.style.padding = '0';
  closeBtn.style.display = 'grid';
  closeBtn.style.placeItems = 'center';
  closeBtn.style.background = 'transparent';
  closeBtn.style.border = 'none';
  closeBtn.style.boxShadow = 'none';
  closeBtn.style.color = 'var(--color-text-primary)';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.borderRadius = 'var(--radius-sm)';
  closeBtn.style.transition = 'background 150ms ease';
  closeBtn.onmouseenter = () => {
    closeBtn.style.background = 'var(--color-background)';
  };
  closeBtn.onmouseleave = () => {
    closeBtn.style.background = 'transparent';
  };
  closeBtn.onclick = evt => {
    evt.stopPropagation();
    closeStack();
  };
  header.appendChild(closeBtn);
  root.appendChild(header);

  const headerDivider = document.createElement('div');
  headerDivider.style.height = '1px';
  headerDivider.style.background = 'var(--color-border)';
  headerDivider.style.marginTop = '-2px';
  root.appendChild(headerDivider);

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '8px';
  list.style.height = '288px';
  list.style.overflowY = 'auto';
  list.style.paddingRight = '4px';
  list.style.boxSizing = 'border-box';
  list.style.overscrollBehavior = 'contain';

  activeStack.photos.forEach((photo, index) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '12px';
    row.style.padding = '10px';
    row.style.background = 'var(--color-background)';
    row.style.borderRadius = 'var(--radius-lg)';

    const thumb = document.createElement('img');
    thumb.alt = photo.caption || `Photo ${index + 1}`;
    thumb.src =
      photo.thumbnail_url ||
      photo.thumbnailUrl ||
      photo.primaryUrl ||
      photo.url ||
      photo.fallbackUrl ||
      '';
    thumb.style.width = '120px';
    thumb.style.height = '120px';
    thumb.style.objectFit = 'cover';
    thumb.style.borderRadius = 'var(--radius-lg)';
    thumb.style.background = 'var(--color-border)';
    thumb.style.cursor = 'pointer';
    thumb.onerror = () => {
      thumb.style.display = 'none';
    };
    thumb.onclick = evt => {
      evt.stopPropagation();
      openPhotoOptions(photo);
    };

    const meta = document.createElement('div');
    meta.style.display = 'flex';
    meta.style.flexDirection = 'column';
    meta.style.gap = '4px';
    meta.style.flex = '1';
    const { dateLabel, timeLabel } = formatDateTimeParts(
      photo.timestampIso || photo.createdAt || photo.created_at || ''
    );
    const date = document.createElement('div');
    date.textContent = dateLabel;
    date.style.fontSize = 'var(--font-size-base)';
    date.style.color = 'var(--color-text-primary)';
    date.style.fontWeight = 'var(--font-weight-semibold)';
    date.style.lineHeight = 'var(--line-height-snug)';
    const time = document.createElement('div');
    time.textContent = timeLabel;
    time.style.fontSize = 'var(--font-size-sm)';
    time.style.color = 'var(--color-text-secondary)';
    time.style.fontWeight = 'var(--font-weight-regular)';
    time.style.lineHeight = 'var(--line-height-snug)';
    meta.appendChild(date);
    meta.appendChild(time);

    const dl = document.createElement('a');
    dl.textContent = '⤓';
    dl.setAttribute('aria-label', 'Download photo');
    dl.href = '#';
    dl.style.fontSize = 'var(--font-size-xl)';
    dl.style.color = 'var(--color-primary)';
    dl.style.textDecoration = 'none';
    dl.style.fontWeight = 'var(--font-weight-semibold)';
    dl.style.display = 'inline-flex';
    dl.style.alignItems = 'center';
    dl.style.justifyContent = 'center';
    dl.style.width = '32px';
    dl.style.height = '32px';
    dl.style.borderRadius = 'var(--radius-md)';
    dl.style.border = '1px solid var(--color-border)';
    dl.style.background = 'var(--color-surface-primary)';
    dl.style.boxShadow = 'var(--shadow-xs)';
    dl.style.transition =
      'background 150ms ease, border-color 150ms ease, box-shadow 150ms ease';
    dl.onmouseover = () => {
      dl.style.background = 'var(--color-surface-hover)';
      dl.style.borderColor = 'var(--color-border-hover)';
      dl.style.boxShadow = 'var(--shadow-sm)';
    };
    dl.onmouseout = () => {
      dl.style.background = 'var(--color-surface-primary)';
      dl.style.borderColor = 'var(--color-border)';
      dl.style.boxShadow = 'var(--shadow-xs)';
    };
    dl.onclick = evt => {
      evt.preventDefault();
      evt.stopPropagation();
      downloadPhotos([photo]);
    };

    row.appendChild(thumb);
    row.appendChild(meta);
    row.appendChild(dl);
    list.appendChild(row);
  });

  root.appendChild(list);

  const downloadAll = document.createElement('button');
  downloadAll.type = 'button';
  downloadAll.className = 'btn-primary';
  downloadAll.textContent = `Download all (${activeStack.photos.length})`;
  downloadAll.style.alignSelf = 'flex-end';
  downloadAll.style.marginTop = '2px';
  downloadAll.onclick = async evt => {
    evt.stopPropagation();
    await downloadPhotos(activeStack.photos);
  };
  root.appendChild(downloadAll);

  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    closeOnMove: false,
    anchor: 'left',
    offset: [16, 0],
    maxWidth: '340px',
  })
    .setDOMContent(root)
    .setLngLat([activeStack.longitude, activeStack.latitude])
    .addTo(map);

  const popupEl = popup?.getElement?.();
  if (popupEl) {
    popupEl.style.background = 'transparent';
    popupEl.style.boxShadow = 'none';
    popupEl.style.padding = '0';
    const tip = popupEl.querySelector('.maplibregl-popup-tip');
    if (tip) tip.style.display = 'none';
    const content = popupEl.querySelector('.maplibregl-popup-content');
    if (content) {
      content.style.background = 'transparent';
      content.style.boxShadow = 'none';
      content.style.padding = '0';
    }
  }

  return () => popup.remove();
}
