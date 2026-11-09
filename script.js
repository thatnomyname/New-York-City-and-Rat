const svgNS = 'http://www.w3.org/2000/svg';
const viewBox = { x: -35, y: 40, width: 1275, height: 960 };
let mapView = { ...viewBox };
let suppressMapClick = false;
const project = ([lon, lat]) => [(lon + 74.36) * 1500, (41.02 - lat) * 1500];

const layerStyles = {
  population: {
    label: 'POPULATION DENSITY',
    note: 'Residents per square mile by 2020 census tract',
    colors: ['#e3f2fd', '#90caf9', '#2f80c1', '#0b3c6f'],
    format: (value) => `${Math.round(value).toLocaleString('en-US')}/MI²`,
    zipLabel: 'ZIP POPULATION', zipNote: '2020 census population aggregated to ZIP Code',
    zipFormat: (value) => Math.round(value).toLocaleString('en-US'),
  },
  income: {
    label: 'LOW / MODERATE-INCOME SHARE',
    note: 'Share of tract population classified low/moderate income',
    colors: ['#e5f5e9', '#9bd5a5', '#3b9562', '#14532d'],
    format: (value) => `${Math.round(value)}%`,
    zipLabel: 'ZIP LOW / MODERATE-INCOME SHARE', zipNote: 'Population-weighted share by ZIP Code',
    zipFormat: (value) => `${Math.round(value)}%`,
  },
  housing: {
    label: 'AVERAGE BUILDING AGE',
    note: 'Years, based on a 10,000-building NYC Open Data sample',
    colors: ['#f1e6ff', '#cfadf2', '#8b5cc7', '#4b1d78'],
    format: (value) => `${Math.round(value)} YRS`,
    zipUnavailable: 'Building-age source is published at Community District scale, not ZIP Code.',
  },
  restaurant: {
    label: 'RESTAURANT CONCENTRATION',
    note: 'Unique active restaurant permits by ZIP Code',
    colors: ['#dff7f5', '#87d6cf', '#218c8c', '#07545a'],
    format: (value) => `${Math.round(value).toLocaleString('en-US')}`,
    zipLabel: 'ZIP RESTAURANT CONCENTRATION', zipNote: 'Unique active restaurant permits in each ZIP Code',
    zipFormat: (value) => Math.round(value).toLocaleString('en-US'),
  },
  disease: {
    label: 'RAT-BORNE DISEASE CASES',
    note: 'Leptospirosis + Hantavirus + Plague cases, 2000–2024',
    colors: ['#fde5f1', '#f3a5c6', '#d64d8a', '#7f174d'],
    format: (value) => `${Math.round(value)} CASES`,
    zipUnavailable: 'Selected disease surveillance is published at borough scale, not ZIP Code.',
  },
};

const boroughLabels = {
  Bronx: [-73.86, 40.85], Manhattan: [-73.975, 40.76], Queens: [-73.82, 40.71],
  Brooklyn: [-73.95, 40.64], 'Staten Island': [-74.15, 40.57],
};

function element(tag, attrs = {}) {
  const node = document.createElementNS(svgNS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function polygonPath(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.map((polygon) => polygon.map((ring) => {
    const points = ring.map((point) => project(point).map((number) => number.toFixed(1)).join(' '));
    return `M${points.join('L')}Z`;
  }).join('')).join('');
}

function linePath(geometry) {
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
  return lines.map((line) => `M${line.map((point) => project(point).map((number) => number.toFixed(1)).join(' ')).join('L')}`).join('');
}

function appendText(svg, text, coordinate, className) {
  const [x, y] = project(coordinate);
  const node = element('text', { x, y, class: className });
  node.textContent = text;
  svg.append(node);
}

function colorIndex(value, breaks) {
  if (value <= breaks[1]) return 0;
  if (value <= breaks[2]) return 1;
  if (value <= breaks[3]) return 2;
  return 3;
}

function drawGeometry(ctx, geometry, transform) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  ctx.beginPath();
  polygons.forEach((polygon) => polygon.forEach((ring) => {
    ring.forEach((coordinate, index) => {
      const [projectedX, projectedY] = project(coordinate);
      const x = transform.offsetX + (projectedX - viewBox.x) * transform.scale;
      const y = transform.offsetY + (projectedY - viewBox.y) * transform.scale;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }));
}

let mapData;
let overlayCanvas;
let activeLayer = 'population';
let selectedBorough = null;
let selectedZip = null;
let zipModeActive = false;

const statFormats = {
  complaints: (value) => Math.round(value).toLocaleString('en-US'),
  population: (value) => Math.round(value).toLocaleString('en-US'),
  income: (value) => `${Number(value).toFixed(1)}%`,
  housing: (value) => `${Number(value).toFixed(1)} YRS`,
  restaurants: (value) => Math.round(value).toLocaleString('en-US'),
  disease: (value) => Math.round(value).toLocaleString('en-US'),
};

function formatStat(key, value) {
  return value === null || value === undefined ? 'N/A' : statFormats[key](value);
}

function steppedGradient(colors) {
  return `linear-gradient(90deg,${colors.map((color, index) => {
    const start = (index / colors.length) * 100;
    const end = ((index + 1) / colors.length) * 100;
    return `${color} ${start}%,${color} ${end}%`;
  }).join(',')})`;
}

function showBoroughData(name) {
  const panel = document.querySelector('#borough-data');
  const stats = mapData?.spatial?.boroughStats?.[name];
  if (!panel || !stats) return;
  selectedBorough = name;
  selectedZip = null;
  panel.querySelector('.borough-data-kicker').textContent = 'BOROUGH PROFILE';
  panel.querySelector('#borough-data-title').textContent = name.toUpperCase();
  panel.querySelector('.borough-data-context').textContent = 'Official NYC data summaries for the selected borough.';
  panel.querySelector('#housing-detail').textContent = 'sample average';
  panel.querySelector('#restaurant-detail').textContent = 'active permits';
  panel.style.setProperty('--profile-color', layerStyles[activeLayer].colors[2]);
  panel.querySelectorAll('[data-stat]').forEach((node) => {
    const key = node.dataset.stat;
    node.textContent = formatStat(key, stats[key]);
    const layerStat = activeLayer === 'restaurant' ? 'restaurants' : activeLayer;
    node.closest('div').classList.toggle('is-current', key === layerStat);
  });
  const detail = stats.diseaseDetail;
  if (detail) panel.querySelector('#disease-detail').textContent = `LEPTO ${detail.leptospirosis} · HANTA ${detail.hantavirus} · PLAGUE ${detail.plague}`;
  panel.setAttribute('aria-hidden', 'false');
  document.querySelectorAll('.borough-hit').forEach((path) => path.classList.toggle('is-selected', path.dataset.borough === name));
  document.querySelectorAll('.zip-hit').forEach((path) => path.classList.remove('is-selected'));
}

function showZipData(zip) {
  const panel = document.querySelector('#borough-data');
  const stats = mapData?.spatial?.zipStats?.[zip];
  if (!panel || !stats || suppressMapClick) return;
  selectedBorough = null;
  selectedZip = zip;
  panel.querySelector('.borough-data-kicker').textContent = 'ZIP CODE PROFILE';
  panel.querySelector('#borough-data-title').textContent = `ZIP ${zip}`;
  panel.querySelector('.borough-data-context').textContent = `${stats.borough}, New York · ZIP-level values where officially available.`;
  panel.style.setProperty('--profile-color', layerStyles[activeLayer].colors[2]);
  panel.querySelectorAll('[data-stat]').forEach((node) => {
    const key = node.dataset.stat;
    node.textContent = formatStat(key, stats[key]);
    const layerStat = activeLayer === 'restaurant' ? 'restaurants' : activeLayer;
    node.closest('div').classList.toggle('is-current', key === layerStat);
  });
  panel.querySelector('#housing-detail').textContent = 'Community District scale only';
  panel.querySelector('#restaurant-detail').textContent = 'active permits in this ZIP';
  panel.querySelector('#disease-detail').textContent = 'BOROUGH SCALE ONLY';
  panel.setAttribute('aria-hidden', 'false');
  document.querySelectorAll('.borough-hit').forEach((path) => path.classList.remove('is-selected'));
  document.querySelectorAll('.zip-hit').forEach((path) => path.classList.toggle('is-selected', path.dataset.zip === zip));
}

function hideBoroughData() {
  selectedBorough = null;
  selectedZip = null;
  document.querySelector('#borough-data')?.setAttribute('aria-hidden', 'true');
  document.querySelectorAll('.borough-hit').forEach((path) => path.classList.remove('is-selected'));
  document.querySelectorAll('.zip-hit').forEach((path) => path.classList.remove('is-selected'));
}

function updateLegend(layer) {
  const style = layerStyles[layer];
  const data = mapData.spatial[layer];
  const source = mapData.spatial.sources[layer];
  document.querySelector('.hotspot-section')?.style.setProperty('--layer-accent', style.colors[2]);
  const title = document.querySelector('#layer-key strong');
  const note = document.querySelector('#legend-note');
  const low = document.querySelector('#legend-low');
  const high = document.querySelector('#legend-high');
  const ramp = document.querySelector('#overlay-legend-ramp');
  if (zipModeActive && style.zipUnavailable) {
    title.textContent = `${style.label} · ZIP VIEW`;
    note.textContent = `ZIP DATA NOT PUBLISHED · ${style.zipUnavailable}`;
    low.textContent = 'NO ZIP';
    high.textContent = 'DATA';
    ramp.style.background = 'repeating-linear-gradient(135deg,#d8dddd 0 6px,#f4f1e9 6px 12px)';
  } else {
    const breaks = zipModeActive ? mapData.spatial.zipBreaks[layer] : data.breaks;
    const formatter = zipModeActive ? style.zipFormat : style.format;
    title.textContent = zipModeActive ? style.zipLabel : style.label;
    note.textContent = zipModeActive ? style.zipNote : style.note;
    low.textContent = formatter(breaks[0]);
    high.textContent = formatter(breaks[breaks.length - 1]);
    ramp.style.background = steppedGradient(style.colors);
  }
  const sourceLink = document.querySelector('#legend-source');
  sourceLink.href = source.url;
  sourceLink.textContent = `${source.label || 'NYC OPEN DATA'} · ${source.id.toUpperCase()}`;
}

function renderOverlayCanvas() {
  if (!overlayCanvas || !mapData) return;
  const width = overlayCanvas.clientWidth;
  const height = overlayCanvas.clientHeight;
  if (!width || !height) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  overlayCanvas.width = Math.round(width * ratio);
  overlayCanvas.height = Math.round(height * ratio);
  const ctx = overlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  const scale = Math.min(overlayCanvas.width / mapView.width, overlayCanvas.height / mapView.height);
  const transform = {
    scale,
    offsetX: (overlayCanvas.width - mapView.width * scale) / 2 - (mapView.x - viewBox.x) * scale,
    offsetY: (overlayCanvas.height - mapView.height * scale) / 2 - (mapView.y - viewBox.y) * scale,
  };
  const zipValueKeys = { population: 'population', income: 'income', restaurant: 'restaurants' };
  const zipValueKey = zipValueKeys[activeLayer];
  if (zipModeActive && !zipValueKey) return;
  const data = zipModeActive ? {
    breaks: mapData.spatial.zipBreaks[activeLayer],
    features: mapData.context.features.map((feature) => {
      const stats = mapData.spatial.zipStats[feature.properties.zip];
      return stats ? { geometry: feature.geometry, value: stats[zipValueKey] } : null;
    }).filter((feature) => feature && Number.isFinite(feature.value)),
  } : mapData.spatial[activeLayer];
  const style = layerStyles[activeLayer];
  ctx.globalAlpha = .78;
  ctx.lineWidth = Math.max(.65, ratio * .5);
  ctx.strokeStyle = 'rgba(244,241,233,.72)';
  data.features.forEach((feature) => {
    drawGeometry(ctx, feature.geometry, transform);
    ctx.fillStyle = style.colors[colorIndex(feature.value, data.breaks)];
    ctx.fill('evenodd');
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function applyMapView() {
  const map = document.querySelector('#hotspot-map');
  if (!map) return;
  const value = `${mapView.x} ${mapView.y} ${mapView.width} ${mapView.height}`;
  map.querySelectorAll('svg').forEach((svg) => svg.setAttribute('viewBox', value));
  const detailScale = viewBox.width / mapView.width;
  const nextZipMode = detailScale >= 1.55;
  const modeChanged = nextZipMode !== zipModeActive;
  zipModeActive = nextZipMode;
  map.classList.toggle('is-zip-level', zipModeActive);
  map.querySelectorAll('.zip-hit').forEach((path) => path.setAttribute('tabindex', detailScale >= 1.55 ? '0' : '-1'));
  const zoomIn = document.querySelector('#hotspot-zoom-in');
  const zoomOut = document.querySelector('#hotspot-zoom-out');
  if (zoomIn) zoomIn.disabled = mapView.width <= viewBox.width / 7.9;
  if (zoomOut) zoomOut.disabled = mapView.width >= viewBox.width * .995;
  if (modeChanged && mapData) updateLegend(activeLayer);
  renderOverlayCanvas();
}

function clampMapView(next) {
  const width = Math.max(viewBox.width / 8, Math.min(viewBox.width, next.width));
  const height = width * (viewBox.height / viewBox.width);
  return {
    x: Math.max(viewBox.x, Math.min(viewBox.x + viewBox.width - width, next.x)),
    y: Math.max(viewBox.y, Math.min(viewBox.y + viewBox.height - height, next.y)),
    width, height,
  };
}

function zoomMap(factor, clientX = null, clientY = null) {
  const shell = document.querySelector('.hotspot-map-shell');
  if (!shell) return;
  const bounds = shell.getBoundingClientRect();
  const rx = clientX === null ? .5 : Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
  const ry = clientY === null ? .5 : Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height));
  const anchorX = mapView.x + mapView.width * rx;
  const anchorY = mapView.y + mapView.height * ry;
  const width = mapView.width * factor;
  const height = mapView.height * factor;
  mapView = clampMapView({ x: anchorX - width * rx, y: anchorY - height * ry, width, height });
  applyMapView();
}

function buildHotspotMap() {
  const map = document.querySelector('#hotspot-map');
  if (!map) return;
  try {
    mapData = window.HOTSPOT_MAP_DATA;
    if (!mapData?.spatial) throw new Error('Embedded hotspot spatial data is missing.');
    const { boroughs, context, roads, metro, spatial } = mapData;

    const baseSvg = element('svg', {
      viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
      preserveAspectRatio: 'xMidYMid meet', class: 'base-map', 'aria-hidden': 'true',
    });
    const landGroup = element('g');
    metro.features.forEach((feature) => landGroup.append(element('path', { d: polygonPath(feature.geometry), class: 'metro-land', 'fill-rule': 'evenodd' })));
    const contextGroup = element('g');
    context.features.forEach((feature) => contextGroup.append(element('path', { d: polygonPath(feature.geometry), class: 'context-area', 'fill-rule': 'evenodd' })));
    const boroughGroup = element('g');
    boroughs.features.forEach((feature) => boroughGroup.append(element('path', { d: polygonPath(feature.geometry), class: 'borough-area', 'fill-rule': 'evenodd' })));
    baseSvg.append(landGroup, contextGroup, boroughGroup);

    overlayCanvas = document.createElement('canvas');
    overlayCanvas.className = 'spatial-overlay';
    overlayCanvas.setAttribute('aria-hidden', 'true');

    const referenceSvg = element('svg', {
      viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
      preserveAspectRatio: 'xMidYMid meet', class: 'reference-map', 'aria-hidden': 'true',
    });
    const complaintGroup = element('g');
    const complaintBreaks = spatial.complaints.breaks;
    const complaintColors = ['#ffd7bd', '#f5a06f', '#dc5b3d', '#8f251f'];
    const maximum = complaintBreaks[complaintBreaks.length - 1] || 1;
    document.querySelector('#complaint-low').textContent = `${complaintBreaks[0]}–${complaintBreaks[1]} REPORTS`;
    document.querySelector('#complaint-high').textContent = `${complaintBreaks[3]}+ REPORTS`;
    spatial.complaints.points.forEach((point) => {
      const [x, y] = project([point.lon, point.lat]);
      const radius = 1.8 + Math.sqrt(point.count / maximum) * 8.5;
      complaintGroup.append(element('circle', {
        cx: x.toFixed(1), cy: y.toFixed(1), r: radius.toFixed(1),
        fill: complaintColors[colorIndex(point.count, complaintBreaks)], class: 'complaint-density',
        opacity: (.52 + Math.min(.38, point.count / maximum * .38)).toFixed(2),
      }));
    });

    const roadData = roads.features.map((feature) => linePath(feature.geometry)).join('');
    const roadGroup = element('g');
    roadGroup.append(element('path', { d: roadData, class: 'road-casing' }));
    roadGroup.append(element('path', { d: roadData, class: 'road-line' }));
    referenceSvg.append(complaintGroup, roadGroup);
    Object.entries(boroughLabels).forEach(([name, coordinate]) => appendText(referenceSvg, name, coordinate, 'borough-label'));
    [['New Jersey', [-74.26, 40.76]], ['Westchester', [-73.82, 40.97]], ['Long Island', [-73.6, 40.67]]].forEach(([name, coordinate]) => appendText(referenceSvg, name, coordinate, 'place-label'));
    [['Hudson River', [-74.07, 40.76]], ['East River', [-73.91, 40.79]]].forEach(([name, coordinate]) => appendText(referenceSvg, name, coordinate, 'water-label'));

    const interactionSvg = element('svg', {
      viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
      preserveAspectRatio: 'xMidYMid meet', class: 'interaction-map', 'aria-label': 'Select a New York City borough',
    });
    boroughs.features.forEach((feature) => {
      const name = feature.properties.name;
      const hit = element('path', {
        d: polygonPath(feature.geometry), class: 'borough-hit', 'fill-rule': 'evenodd',
        tabindex: '0', role: 'button', 'aria-label': `Show ${name} data`, 'data-borough': name,
      });
      hit.addEventListener('click', () => { if (!suppressMapClick) showBoroughData(name); });
      hit.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          showBoroughData(name);
        }
      });
      interactionSvg.append(hit);
    });

    const zipGroup = element('g', { class: 'zip-hit-group' });
    context.features.filter((feature) => spatial.zipStats[feature.properties.zip]).forEach((feature) => {
      const zip = feature.properties.zip;
      const hit = element('path', {
        d: polygonPath(feature.geometry), class: 'zip-hit', 'fill-rule': 'evenodd',
        tabindex: '-1', role: 'button', 'aria-label': `Show ZIP ${zip} data`, 'data-zip': zip,
      });
      hit.addEventListener('click', () => showZipData(zip));
      hit.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          showZipData(zip);
        }
      });
      zipGroup.append(hit);
    });
    interactionSvg.append(zipGroup);

    map.replaceChildren(baseSvg, overlayCanvas, referenceSvg, interactionSvg);
    updateLegend(activeLayer);
    renderOverlayCanvas();
    applyMapView();
    const firstButton = document.querySelector('[data-layer="population"]');
    firstButton.classList.add('is-active');
    firstButton.setAttribute('aria-pressed', 'true');
    new ResizeObserver(() => renderOverlayCanvas()).observe(map);
  } catch (error) {
    map.innerHTML = '<div class="map-loading">LOCAL MAP DATA COULD NOT BE LOADED.</div>';
    console.error(error);
  }
}

function initializeLayerControls() {
  const section = document.querySelector('.hotspot-section');
  const shell = document.querySelector('.hotspot-map-shell');
  const divider = document.querySelector('#swipe-divider');
  const buttons = [...document.querySelectorAll('.layer-button')];
  const map = document.querySelector('#hotspot-map');
  if (!section || !shell || !divider) return;
  document.querySelector('.borough-data-close')?.addEventListener('click', hideBoroughData);
  document.querySelector('#hotspot-zoom-in')?.addEventListener('click', () => zoomMap(.72));
  document.querySelector('#hotspot-zoom-out')?.addEventListener('click', () => zoomMap(1.38));
  let pendingClientX = null;
  let swipeFrame = 0;

  function commitSwipe() {
    swipeFrame = 0;
    const bounds = shell.getBoundingClientRect();
    const percentage = Math.max(8, Math.min(92, ((pendingClientX - bounds.left) / bounds.width) * 100));
    section.style.setProperty('--hotspot-swipe', `${percentage}%`);
    divider.setAttribute('aria-valuenow', String(Math.round(percentage)));
  }

  function queueSwipe(clientX) {
    pendingClientX = clientX;
    if (!swipeFrame) swipeFrame = requestAnimationFrame(commitSwipe);
  }

  divider.addEventListener('pointerdown', (event) => {
    shell.classList.add('is-dragging');
    divider.setPointerCapture(event.pointerId);
    queueSwipe(event.clientX);
  });
  divider.addEventListener('pointermove', (event) => {
    if (divider.hasPointerCapture(event.pointerId)) queueSwipe(event.clientX);
  });
  const finishDrag = (event) => {
    shell.classList.remove('is-dragging');
    if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
  };
  divider.addEventListener('pointerup', finishDrag);
  divider.addEventListener('pointercancel', finishDrag);
  divider.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const current = parseFloat(getComputedStyle(section).getPropertyValue('--hotspot-swipe')) || 50;
    section.style.setProperty('--hotspot-swipe', `${Math.max(8, Math.min(92, current + (event.key === 'ArrowRight' ? 4 : -4)))}%`);
  });

  buttons.forEach((button) => button.addEventListener('click', () => {
    buttons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    activeLayer = button.dataset.layer;
    updateLegend(activeLayer);
    if (selectedBorough) showBoroughData(selectedBorough);
    else if (selectedZip) showZipData(selectedZip);
    renderOverlayCanvas();
    section.style.setProperty('--hotspot-swipe', '88%');
    requestAnimationFrame(() => requestAnimationFrame(() => section.style.setProperty('--hotspot-swipe', '50%')));
  }));

  let pan = null;
  let panFrame = 0;
  let pendingView = null;
  const ignorePan = (target) => target.closest('.icon-rail, .map-legends, .borough-data, .swipe-divider');
  map?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || ignorePan(event.target)) return;
    pan = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, start: { ...mapView }, moved: false };
  });
  map?.addEventListener('pointermove', (event) => {
    if (!pan || event.pointerId !== pan.pointerId) return;
    const bounds = shell.getBoundingClientRect();
    const pixelX = event.clientX - pan.clientX;
    const pixelY = event.clientY - pan.clientY;
    if (!pan.moved && Math.hypot(pixelX, pixelY) < 8) return;
    if (!pan.moved) {
      pan.moved = true;
      map.setPointerCapture(event.pointerId);
      map.classList.add('is-panning');
    }
    event.preventDefault();
    const dx = pixelX * pan.start.width / bounds.width;
    const dy = pixelY * pan.start.height / bounds.height;
    pendingView = clampMapView({ ...pan.start, x: pan.start.x - dx, y: pan.start.y - dy });
    if (!panFrame) panFrame = requestAnimationFrame(() => {
      panFrame = 0;
      mapView = pendingView;
      applyMapView();
    });
  });
  const finishPan = (event) => {
    if (!pan) return;
    suppressMapClick = pan.moved;
    if (map.hasPointerCapture(event.pointerId)) map.releasePointerCapture(event.pointerId);
    map.classList.remove('is-panning');
    pan = null;
    setTimeout(() => { suppressMapClick = false; }, 0);
  };
  map?.addEventListener('pointerup', finishPan);
  map?.addEventListener('pointercancel', finishPan);
  map?.addEventListener('pointerleave', () => {
    if (pan && !pan.moved) pan = null;
  });
}

buildHotspotMap();
initializeLayerControls();
