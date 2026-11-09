(() => {
  const data = window.NYC_OFFICIAL_CITYGML;
  const mapData = window.NYC_3D_BASEMAP;
  const wasteData = window.WASTE_ROUTE_PROXY;
  const whiteMassing = document.body.classList.contains('white-model-theme');
  const canvas = document.querySelector('#city-model');
  const overlay = document.querySelector('#city-overlay');
  const context = canvas?.getContext('2d');
  const overlayContext = overlay?.getContext('2d');
  if (!data || !mapData || !canvas || !overlay || !context || !overlayContext) return;

  const SQRT_HALF = Math.SQRT1_2;
  const PITCH = 0.34;
  // Visual exaggeration retained for citywide legibility; source roof and wall surfaces are unchanged.
  const HEIGHT_EXAGGERATION = 4.6;
  const HOVER_COLOR = '#2f80c1';
  const origin = data.origin;

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let fitScale = 1;
  let zoom = 1;
  let fullCenterU = 0;
  let fullCenterDepth = 0;
  let viewCenterU = 0;
  let viewCenterDepth = 0;
  let centerZ = 0;
  let groundZ = 0;
  let prepared = false;
  let buildings = [];
  let boroughs = [];
  let contextRings = [];
  let roads = [];
  let labels = [];
  let screenBoroughs = [];
  let hoveredBorough = null;
  let activeBorough = null;
  let wasteZones = [];
  let wasteFacilities = [];
  let ratComplaintPoints = [];
  const wasteLayers = { infrastructure: true, frequency: true, storage: true, routes: true, complaints: true };
  let dragState = null;
  let dragFrame = 0;
  let defaultSceneCache = null;
  let viewTransition = null;
  let viewTransitionTimer = 0;
  let committedRenderTimer = 0;
  const VIEW_TRANSITION_MS = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 180;

  function decodePolygon(encoded, visitor) {
    let x = origin[0] + encoded[0];
    let y = origin[1] + encoded[1];
    let z = origin[2] + encoded[2];
    visitor(x, y, z, 0);
    for (let index = 3, point = 1; index < encoded.length; index += 3, point += 1) {
      x += encoded[index];
      y += encoded[index + 1];
      z += encoded[index + 2];
      visitor(x, y, z, point);
    }
  }

  function decodeLine(encoded) {
    const points = [];
    let x = mapData.origin[0] + encoded[0];
    let y = mapData.origin[1] + encoded[1];
    points.push({ x, y });
    for (let index = 2; index < encoded.length; index += 2) {
      x += encoded[index];
      y += encoded[index + 1];
      points.push({ x, y });
    }
    return points;
  }

  const decodeWastePoint = (point) => ({ x: mapData.origin[0] + point[0], y: mapData.origin[1] + point[1] });

  function wallShadeBin(encoded) {
    let first = null;
    let angle = 0;
    decodePolygon(encoded, (x, y) => {
      if (!first) {
        first = { x, y };
        return;
      }
      const dx = x - first.x;
      const dy = y - first.y;
      if (Math.hypot(dx, dy) > 1 && angle === 0) angle = Math.atan2(dy, dx);
    });
    const light = .5 + .5 * Math.cos(2 * (angle - .72));
    return light < .34 ? 0 : light < .68 ? 1 : 2;
  }

  function cameraPoint(x, y, z) {
    return { u: (x + y) * SQRT_HALF, depth: (x - y) * SQRT_HALF, z };
  }

  function projectCamera(point) {
    const scale = fitScale * zoom;
    return {
      x: width / 2 + (point.u - viewCenterU) * scale,
      y: height / 2 + ((point.depth - viewCenterDepth) * PITCH - (point.z - centerZ) * HEIGHT_EXAGGERATION) * scale,
    };
  }

  const projectMapPoint = (point, elevation = groundZ) => projectCamera(cameraPoint(point.x, point.y, elevation));

  function cameraBounds(rings) {
    let minU = Infinity;
    let maxU = -Infinity;
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    rings.forEach((ring) => ring.forEach((point) => {
      const camera = cameraPoint(point.x, point.y, groundZ);
      minU = Math.min(minU, camera.u);
      maxU = Math.max(maxU, camera.u);
      minDepth = Math.min(minDepth, camera.depth);
      maxDepth = Math.max(maxDepth, camera.depth);
    }));
    return { minU, maxU, minDepth, maxDepth };
  }

  function prepareModel() {
    if (prepared) return;
    let minU = Infinity;
    let maxU = -Infinity;
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    buildings = data.buildings.map((building) => {
      const roofs = building[0];
      const walls = building[1];
      const reference = roofs[0] || walls[0];
      let referencePoint = null;
      let referenceMapPoint = null;
      let buildingMinU = Infinity;
      let buildingMaxU = -Infinity;
      let buildingMinDepth = Infinity;
      let buildingMaxDepth = -Infinity;
      let buildingMinZ = Infinity;
      let buildingMaxZ = -Infinity;
      let baseZ = Infinity;
      let baseX = 0;
      let baseY = 0;
      let basePointCount = 0;
      decodePolygon(reference, (x, y, z, index) => {
        if (index === 0) {
          referencePoint = cameraPoint(x, y, z);
          referenceMapPoint = { x, y };
        }
      });
      [...roofs, ...walls].forEach((surface) => decodePolygon(surface, (x, y, z) => {
        const point = cameraPoint(x, y, z);
        minU = Math.min(minU, point.u);
        maxU = Math.max(maxU, point.u);
        minDepth = Math.min(minDepth, point.depth);
        maxDepth = Math.max(maxDepth, point.depth);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        buildingMinU = Math.min(buildingMinU, point.u);
        buildingMaxU = Math.max(buildingMaxU, point.u);
        buildingMinDepth = Math.min(buildingMinDepth, point.depth);
        buildingMaxDepth = Math.max(buildingMaxDepth, point.depth);
        buildingMinZ = Math.min(buildingMinZ, z);
        if (z < baseZ - .5) {
          baseZ = z;
          baseX = x;
          baseY = y;
          basePointCount = 1;
        } else if (Math.abs(z - baseZ) <= .5) {
          baseX += x;
          baseY += y;
          basePointCount += 1;
        }
        buildingMaxZ = Math.max(buildingMaxZ, z);
      }));
      const wallBins = [[], [], []];
      walls.forEach((surface) => wallBins[wallShadeBin(surface)].push(surface));
      return {
        roofs, walls, wallBins, depth: referencePoint.depth,
        basePoint: basePointCount
          ? { x: baseX / basePointCount, y: baseY / basePointCount }
          : referenceMapPoint,
        bounds: { minU: buildingMinU, maxU: buildingMaxU, minDepth: buildingMinDepth, maxDepth: buildingMaxDepth, minZ: buildingMinZ, maxZ: buildingMaxZ },
      };
    }).sort((a, b) => a.depth - b.depth);

    groundZ = minZ - 8;
    centerZ = minZ - 34;
    contextRings = mapData.context.map(decodeLine);
    roads = mapData.roads.map(decodeLine);
    boroughs = mapData.boroughs.map((borough) => {
      const rings = borough.rings.map(decodeLine);
      return { ...borough, rings, bounds: cameraBounds(rings) };
    });
    buildings = buildings.filter((building) => boroughs.some((borough) =>
      borough.rings.some((ring) => inside(building.basePoint, ring))));
    labels = mapData.labels.map((label) => ({
      ...label,
      point: { x: mapData.origin[0] + label.point[0], y: mapData.origin[1] + label.point[1] },
    }));
    if (wasteData) {
      wasteZones = wasteData.zones.map((zone) => ({
        ...zone,
        polygons: zone.polygons.map((ring) => ring.map(decodeWastePoint)),
        route: zone.route.map(decodeWastePoint),
      })).sort((a, b) => a.percentile - b.percentile);
      wasteFacilities = wasteData.facilities.map((facility) => {
        const point = decodeWastePoint(facility.point);
        const borough = boroughs.find((item) => item.rings.some((ring) => inside(point, ring)));
        return { ...facility, point, borough: borough ? borough.name : null, regional: !borough };
      });
      ratComplaintPoints = wasteData.ratPoints.map(decodeWastePoint);
    }

    fullCenterU = (minU + maxU) / 2;
    fullCenterDepth = (minDepth + maxDepth) / 2;
    viewCenterU = fullCenterU;
    viewCenterDepth = fullCenterDepth;
    data.__viewBounds = { minU, maxU, minDepth, maxDepth, minZ, maxZ };
    prepared = true;
    resize();
  }

  function fitModel() {
    const bounds = data.__viewBounds;
    const horizontal = bounds.maxU - bounds.minU;
    const vertical = (bounds.maxDepth - bounds.minDepth) * PITCH + (bounds.maxZ - bounds.minZ) * HEIGHT_EXAGGERATION;
    fitScale = Math.min((width - 70) / horizontal, (height - 70) / vertical);
  }

  function traceMapRing(ring, elevation = groundZ, target = context) {
    if (!ring.length) return [];
    const screen = [];
    ring.forEach((point, index) => {
      const projected = projectMapPoint(point, elevation);
      screen.push(projected);
      if (index === 0) target.moveTo(projected.x, projected.y);
      else target.lineTo(projected.x, projected.y);
    });
    target.closePath();
    return screen;
  }

  function traceSurface(encoded) {
    let first = true;
    decodePolygon(encoded, (x, y, z) => {
      const point = projectCamera(cameraPoint(x, y, z));
      if (first) {
        context.moveTo(point.x, point.y);
        first = false;
      } else context.lineTo(point.x, point.y);
    });
    context.closePath();
  }

  function drawBasemap() {
    context.save();
    context.lineJoin = 'round';
    context.beginPath();
    contextRings.forEach((ring) => traceMapRing(ring));
    context.fillStyle = '#cfd6d3';
    context.strokeStyle = '#b5c1bf';
    context.lineWidth = .8;
    context.fill();
    context.stroke();

    screenBoroughs = [];
    boroughs.forEach((borough) => {
      context.beginPath();
      const screenRings = borough.rings.map((ring) => traceMapRing(ring, groundZ + .6));
      const highlighted = borough.name === activeBorough;
      context.fillStyle = '#f7f5ee';
      context.strokeStyle = highlighted ? HOVER_COLOR : '#8fa3a4';
      context.lineWidth = highlighted ? 2.2 : 1.05;
      context.fill();
      context.stroke();
      screenBoroughs.push({ name: borough.name, rings: screenRings });
    });

    context.beginPath();
    roads.forEach((road) => {
      road.forEach((point, index) => {
        const projected = projectMapPoint(point, groundZ + 1.2);
        if (index === 0) context.moveTo(projected.x, projected.y);
        else context.lineTo(projected.x, projected.y);
      });
    });
    context.strokeStyle = 'rgba(255,253,248,.82)';
    context.lineWidth = zoom > 1.55 ? 2.1 : 1.25;
    context.stroke();
    context.strokeStyle = zoom > 1.55 ? 'rgba(122,148,151,.9)' : 'rgba(137,158,159,.62)';
    context.lineWidth = zoom > 1.55 ? .78 : .46;
    context.stroke();
    context.restore();
  }

  function drawBuilding(building) {
    if (building.walls.length) {
      const wallColors = whiteMassing
        ? ['rgba(174,181,180,.98)', 'rgba(204,210,207,.98)', 'rgba(231,232,227,.98)']
        : ['rgba(28,48,58,.96)', 'rgba(48,72,81,.94)', 'rgba(78,103,108,.9)'];
      building.wallBins.forEach((surfaces, index) => {
        if (!surfaces.length) return;
        context.beginPath();
        surfaces.forEach(traceSurface);
        context.fillStyle = wallColors[index];
        context.fill();
      });
    }
    if (building.roofs.length) {
      context.beginPath();
      building.roofs.forEach(traceSurface);
      context.fillStyle = whiteMassing ? 'rgba(255,255,252,.995)' : 'rgba(242,231,209,.99)';
      context.strokeStyle = whiteMassing ? 'rgba(102,116,117,.72)' : 'rgba(27,48,57,.86)';
      context.lineWidth = zoom > 1.5 ? .82 : .48;
      context.fill();
      context.stroke();
    }
  }

  function drawBuildingBatch(batch) {
    const wallColors = whiteMassing
      ? ['rgba(174,181,180,.98)', 'rgba(204,210,207,.98)', 'rgba(231,232,227,.98)']
      : ['rgba(28,48,58,.96)', 'rgba(48,72,81,.94)', 'rgba(78,103,108,.9)'];
    for (let shade = 0; shade < 3; shade += 1) {
      context.beginPath();
      let hasWalls = false;
      batch.forEach((building) => building.wallBins[shade].forEach((surface) => {
        traceSurface(surface);
        hasWalls = true;
      }));
      if (hasWalls) {
        context.fillStyle = wallColors[shade];
        context.fill();
      }
    }
    context.beginPath();
    let hasRoofs = false;
    batch.forEach((building) => building.roofs.forEach((surface) => {
      traceSurface(surface);
      hasRoofs = true;
    }));
    if (hasRoofs) {
      context.fillStyle = whiteMassing ? 'rgba(255,255,252,.995)' : 'rgba(242,231,209,.99)';
      context.strokeStyle = whiteMassing ? 'rgba(102,116,117,.72)' : 'rgba(27,48,57,.86)';
      context.lineWidth = zoom > 1.5 ? .82 : .48;
      context.fill();
      context.stroke();
    }
  }

  function drawBoundaryOverlay() {
    boroughs.forEach((borough) => {
      const highlighted = borough.name === hoveredBorough || borough.name === activeBorough;
      if (!highlighted) return;
      overlayContext.beginPath();
      borough.rings.forEach((ring) => traceMapRing(ring, groundZ + 2, overlayContext));
      overlayContext.strokeStyle = HOVER_COLOR;
      overlayContext.lineWidth = borough.name === hoveredBorough ? 3.2 : 2.6;
      overlayContext.stroke();
    });
  }

  function drawWasteLayers() {
    if (!wasteData) return;
    overlayContext.save();
    overlayContext.lineJoin = 'round';
    overlayContext.lineCap = 'round';

    if (wasteLayers.frequency || wasteLayers.storage) {
      wasteZones.forEach((zone) => {
        overlayContext.beginPath();
        zone.polygons.forEach((ring) => traceMapRing(ring, groundZ + 2.4, overlayContext));
        if (wasteLayers.frequency) {
          const frequent = zone.pickups >= 3;
          overlayContext.fillStyle = frequent ? 'rgba(31,126,166,.24)' : 'rgba(43,179,176,.14)';
          overlayContext.fill();
          overlayContext.strokeStyle = frequent ? 'rgba(19,91,129,.68)' : 'rgba(25,129,132,.52)';
          overlayContext.lineWidth = zoom > 1.7 ? 1.15 : .82;
          overlayContext.stroke();
        }
        if (wasteLayers.storage) {
          const alpha = zone.storageDays >= 3 ? .46 : .25;
          overlayContext.strokeStyle = `rgba(230,151,35,${alpha})`;
          overlayContext.lineWidth = zoom > 1.7 ? 1.05 : .62;
          overlayContext.setLineDash(zoom > 1.7 ? [4, 3] : [3, 2]);
          overlayContext.stroke();
          overlayContext.setLineDash([]);
        }
      });
    }

    if (wasteLayers.routes) {
      wasteZones.forEach((zone) => {
        if (zone.route.length < 2) return;
        overlayContext.beginPath();
        zone.route.forEach((point, index) => {
          const projected = projectMapPoint(point, groundZ + 9);
          if (index === 0) overlayContext.moveTo(projected.x, projected.y);
          else overlayContext.lineTo(projected.x, projected.y);
        });
        const intensity = Math.max(0, Math.min(1, zone.percentile / 100));
        overlayContext.strokeStyle = `rgba(${Math.round(218 - intensity * 42)},${Math.round(100 - intensity * 42)},${Math.round(72 - intensity * 26)},${.22 + intensity * .58})`;
        overlayContext.lineWidth = (.55 + intensity * 1.45) * Math.min(1.65, Math.max(.82, zoom ** .22));
        overlayContext.stroke();
      });
    }

    if (wasteLayers.complaints) {
      const size = zoom > 2.2 ? 2.4 : zoom > 1.35 ? 1.9 : 1.35;
      overlayContext.fillStyle = zoom > 1.35 ? 'rgba(126,35,91,.58)' : 'rgba(126,35,91,.38)';
      ratComplaintPoints.forEach((ratPoint) => {
        const point = projectMapPoint(ratPoint, groundZ + 14);
        if (point.x < -3 || point.x > width + 3 || point.y < -3 || point.y > height + 3) return;
        overlayContext.fillRect(point.x - size / 2, point.y - size / 2, size, size);
      });
    }

    if (wasteLayers.infrastructure) {
      wasteFacilities.forEach((facility) => {
        // Facilities use the same ground plane and camera transform as the borough map.
        // This keeps their geographic anchor fixed when the scene is shown obliquely.
        const point = projectMapPoint(facility.point, groundZ + 2.4);
        const radius = Math.max(3.5, Math.min(7, 3.3 + zoom * .75));
        overlayContext.beginPath();
        overlayContext.arc(point.x, point.y, radius + 2.2, 0, Math.PI * 2);
        overlayContext.fillStyle = 'rgba(255,253,248,.96)';
        overlayContext.fill();
        overlayContext.beginPath();
        overlayContext.arc(point.x, point.y, radius, 0, Math.PI * 2);
        overlayContext.fillStyle = facility.type === 'MTS' ? '#2d9997' : '#172833';
        overlayContext.fill();
      });
    }
    overlayContext.restore();
  }

  function drawLabels() {
    overlayContext.save();
    labels.forEach((label) => {
      if (zoom > 2.1 && label.kind !== 'borough') return;
      if (activeBorough && label.kind === 'borough' && label.name !== activeBorough) return;
      const point = projectMapPoint(label.point, groundZ + 4);
      const boroughLabel = label.kind === 'borough';
      overlayContext.font = boroughLabel ? '800 18px Montserrat, Arial' : '700 12px Montserrat, Arial';
      overlayContext.textAlign = 'center';
      overlayContext.textBaseline = 'middle';
      overlayContext.lineJoin = 'round';
      overlayContext.strokeStyle = boroughLabel ? 'rgba(247,245,238,.96)' : 'rgba(225,231,229,.94)';
      overlayContext.lineWidth = boroughLabel ? 5 : 4;
      overlayContext.strokeText(label.name, point.x, point.y);
      overlayContext.fillStyle = boroughLabel ? '#172833' : '#819597';
      overlayContext.fillText(label.name, point.x, point.y);
    });
    overlayContext.restore();
  }

  function renderOverlay() {
    if (!prepared) return;
    overlayContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    overlayContext.clearRect(0, 0, width, height);
    drawWasteLayers();
    drawBoundaryOverlay();
    drawLabels();
  }

  function buildingIsVisible(building) {
    const bounds = building.bounds;
    const scale = fitScale * zoom;
    const minX = width / 2 + (bounds.minU - viewCenterU) * scale;
    const maxX = width / 2 + (bounds.maxU - viewCenterU) * scale;
    const minY = height / 2 + ((bounds.minDepth - viewCenterDepth) * PITCH - (bounds.maxZ - centerZ) * HEIGHT_EXAGGERATION) * scale;
    const maxY = height / 2 + ((bounds.maxDepth - viewCenterDepth) * PITCH - (bounds.minZ - centerZ) * HEIGHT_EXAGGERATION) * scale;
    return maxX >= -36 && minX <= width + 36 && maxY >= -36 && minY <= height + 36;
  }

  function atDefaultView() {
    return Math.abs(zoom - 1) < 1e-6 && Math.abs(viewCenterU - fullCenterU) < 1e-6 && Math.abs(viewCenterDepth - fullCenterDepth) < 1e-6;
  }

  function refreshScreenBoroughs() {
    screenBoroughs = boroughs.map((borough) => ({
      name: borough.name,
      rings: borough.rings.map((ring) => ring.map((point) => projectMapPoint(point, groundZ + .6))),
    }));
  }

  function rememberDefaultScene() {
    if (!atDefaultView()) return;
    if (!defaultSceneCache) defaultSceneCache = document.createElement('canvas');
    defaultSceneCache.width = canvas.width;
    defaultSceneCache.height = canvas.height;
    defaultSceneCache.getContext('2d').drawImage(canvas, 0, 0);
  }

  function render() {
    if (!prepared) return;
    const cachedDefault = atDefaultView() && defaultSceneCache && defaultSceneCache.width === canvas.width && defaultSceneCache.height === canvas.height;
    if (cachedDefault) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(defaultSceneCache, 0, 0);
      refreshScreenBoroughs();
    } else {
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      drawBasemap();
      context.save();
      context.lineJoin = 'round';
      context.lineCap = 'round';
      const visibleBuildings = buildings.filter(buildingIsVisible);
      const batchSize = zoom < 1.35 ? 96 : zoom < 2.2 ? 48 : 24;
      for (let start = 0; start < visibleBuildings.length; start += batchSize) {
        drawBuildingBatch(visibleBuildings.slice(start, start + batchSize));
      }
      context.restore();
      rememberDefaultScene();
    }
    renderOverlay();
    document.querySelector('#loading-state')?.classList.add('is-hidden');
  }

  function resize() {
    if (!prepared) return;
    if (viewTransition) commitViewTransition(false);
    if (committedRenderTimer) {
      clearTimeout(committedRenderTimer);
      committedRenderTimer = 0;
      setCanvasPreview();
    }
    const rectangle = canvas.getBoundingClientRect();
    width = rectangle.width;
    height = rectangle.height;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.15);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    overlay.width = Math.round(width * pixelRatio);
    overlay.height = Math.round(height * pixelRatio);
    defaultSceneCache = null;
    fitModel();
    render();
  }

  function setZoom(nextZoom) {
    prepareModel();
    const centerU = viewTransition?.targetCenterU ?? viewCenterU;
    const centerDepth = viewTransition?.targetCenterDepth ?? viewCenterDepth;
    const targetActive = viewTransition?.targetActive ?? activeBorough;
    transitionView(nextZoom, centerU, centerDepth, targetActive, canvas.getAttribute('aria-label'));
  }

  function resetView() {
    hoveredBorough = null;
    transitionView(1, fullCenterU, fullCenterDepth, null, 'New York City building model viewed from the southeast');
  }

  function focusBorough(name) {
    const borough = boroughs.find((item) => item.name === name);
    if (!borough) return;
    const bounds = borough.bounds;
    const targetCenterU = (bounds.minU + bounds.maxU) / 2;
    const targetCenterDepth = (bounds.minDepth + bounds.maxDepth) / 2;
    const widthScale = (width * .82) / Math.max(1, bounds.maxU - bounds.minU);
    const heightScale = (height * .72) / Math.max(1, (bounds.maxDepth - bounds.minDepth) * PITCH + 1400);
    const targetZoom = Math.max(1.6, Math.min(5.8, Math.min(widthScale, heightScale) / fitScale));
    transitionView(targetZoom, targetCenterU, targetCenterDepth, name, `${name} detailed three-dimensional building model`);
  }

  function inside(point, polygon) {
    let hit = false;
    for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
      const a = polygon[current];
      const b = polygon[previous];
      const crosses = (a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || 1e-9) + a.x;
      if (crosses) hit = !hit;
    }
    return hit;
  }

  function boroughAt(point) {
    return screenBoroughs.find((borough) => borough.rings.some((ring) => inside(point, ring)))?.name || null;
  }

  function setCanvasPreview(x = 0, y = 0, scale = 1) {
    const transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
    canvas.style.transform = transform;
    overlay.style.transform = transform;
  }

  function scheduleCommittedRender(delay = 34) {
    if (committedRenderTimer) clearTimeout(committedRenderTimer);
    committedRenderTimer = window.setTimeout(() => {
      committedRenderTimer = 0;
      setCanvasPreview();
      render();
    }, delay);
  }

  function flushCommittedRender() {
    if (!committedRenderTimer) return;
    clearTimeout(committedRenderTimer);
    committedRenderTimer = 0;
    setCanvasPreview();
    render();
  }

  function commitViewTransition(renderNow = true) {
    if (!viewTransition) return;
    const target = viewTransition;
    viewTransition = null;
    if (viewTransitionTimer) {
      clearTimeout(viewTransitionTimer);
      viewTransitionTimer = 0;
    }
    zoom = target.targetZoom;
    viewCenterU = target.targetCenterU;
    viewCenterDepth = target.targetCenterDepth;
    activeBorough = target.targetActive;
    canvas.setAttribute('aria-label', target.ariaLabel);
    canvas.classList.remove('is-view-transitioning');
    overlay.classList.remove('is-view-transitioning');
    if (renderNow) scheduleCommittedRender();
    else setCanvasPreview();
  }

  function transitionView(nextZoom, targetCenterU, targetCenterDepth, targetActive, ariaLabel) {
    prepareModel();
    const targetZoom = Math.max(.68, Math.min(6.5, nextZoom));
    if (!viewTransition) {
      viewTransition = {
        baseZoom: zoom,
        baseCenterU: viewCenterU,
        baseCenterDepth: viewCenterDepth,
      };
    }
    viewTransition.targetZoom = targetZoom;
    viewTransition.targetCenterU = targetCenterU;
    viewTransition.targetCenterDepth = targetCenterDepth;
    viewTransition.targetActive = targetActive;
    viewTransition.ariaLabel = ariaLabel || canvas.getAttribute('aria-label');

    const ratio = targetZoom / viewTransition.baseZoom;
    const targetScale = fitScale * targetZoom;
    const x = (viewTransition.baseCenterU - targetCenterU) * targetScale;
    const y = (viewTransition.baseCenterDepth - targetCenterDepth) * PITCH * targetScale;
    canvas.classList.add('is-view-transitioning');
    overlay.classList.add('is-view-transitioning');
    requestAnimationFrame(() => {
      if (viewTransition) setCanvasPreview(x, y, ratio);
    });
    if (viewTransitionTimer) clearTimeout(viewTransitionTimer);
    viewTransitionTimer = window.setTimeout(() => commitViewTransition(true), VIEW_TRANSITION_MS + 24);
  }

  function finishDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const state = dragState;
    dragState = null;
    if (dragFrame) {
      cancelAnimationFrame(dragFrame);
      dragFrame = 0;
    }
    overlay.classList.remove('is-dragging');
    if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
    if (state.moved) {
      const scale = fitScale * zoom;
      viewCenterU -= state.dx / scale;
      viewCenterDepth -= state.dy / (PITCH * scale);
      hoveredBorough = null;
      scheduleCommittedRender(42);
      return;
    }
    setCanvasPreview();
    if (state.borough) focusBorough(state.borough);
  }

  overlay.addEventListener('pointerdown', (event) => {
    if (!prepared || event.button !== 0) return;
    flushCommittedRender();
    if (viewTransition) {
      commitViewTransition(true);
      flushCommittedRender();
    }
    const rectangle = overlay.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      borough: boroughAt({ x: event.clientX - rectangle.left, y: event.clientY - rectangle.top }),
    };
    overlay.setPointerCapture(event.pointerId);
    overlay.classList.add('is-dragging');
  });

  overlay.addEventListener('pointermove', (event) => {
    if (!prepared) return;
    if (dragState && event.pointerId === dragState.pointerId) {
      dragState.dx = event.clientX - dragState.startX;
      dragState.dy = event.clientY - dragState.startY;
      if (Math.hypot(dragState.dx, dragState.dy) > 5) dragState.moved = true;
      if (dragState.moved && !dragFrame) {
        dragFrame = requestAnimationFrame(() => {
          dragFrame = 0;
          if (dragState) setCanvasPreview(dragState.dx, dragState.dy);
        });
      }
      event.preventDefault();
      return;
    }
    const rectangle = overlay.getBoundingClientRect();
    const next = boroughAt({ x: event.clientX - rectangle.left, y: event.clientY - rectangle.top });
    if (next === hoveredBorough) return;
    hoveredBorough = next;
    overlay.style.cursor = next ? 'pointer' : 'grab';
    renderOverlay();
  });
  overlay.addEventListener('pointerleave', () => {
    if (dragState) return;
    if (!hoveredBorough) return;
    hoveredBorough = null;
    overlay.style.cursor = 'grab';
    renderOverlay();
  });
  overlay.addEventListener('pointerup', finishDrag);
  overlay.addEventListener('pointercancel', finishDrag);

  document.querySelector('#zoom-in')?.addEventListener('click', () => setZoom(zoom * 1.2));
  document.querySelector('#zoom-out')?.addEventListener('click', () => setZoom(zoom / 1.2));
  document.querySelector('#reset-view')?.addEventListener('click', resetView);
  const dynamicLegend = document.querySelector('#waste-dynamic-legend');
  function updateDynamicLegend() {
    let visibleGroups = 0;
    document.querySelectorAll('[data-legend-layer]').forEach((group) => {
      const visible = Boolean(wasteLayers[group.dataset.legendLayer]);
      group.hidden = !visible;
      if (visible) visibleGroups += 1;
    });
    if (dynamicLegend) dynamicLegend.hidden = visibleGroups === 0;
  }
  document.querySelectorAll('[data-waste-layer]').forEach((input) => input.addEventListener('change', () => {
    wasteLayers[input.dataset.wasteLayer] = input.checked;
    updateDynamicLegend();
    renderOverlay();
  }));
  updateDynamicLegend();
  window.addEventListener('resize', resize);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const startModel = () => prepareModel();
      if ('requestIdleCallback' in window) window.requestIdleCallback(startModel);
      else window.setTimeout(startModel, 120);
    }, { rootMargin: '180px' });
    observer.observe(canvas);
  } else prepareModel();
})();
