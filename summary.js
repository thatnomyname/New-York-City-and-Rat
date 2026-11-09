(() => {
  const data = window.HOTSPOT_SUMMARY_DATA;
  if (!data) return;

  const NS = 'http://www.w3.org/2000/svg';
  const colors = {
    ink: '#172833', muted: '#657a80', grid: '#d9dfdc', paper: '#fffdf8',
    complaints: '#dc5b3d', population: '#2f80c1', income: '#3b9366',
    housing: '#8659b6', restaurant: '#218c8c', disease: '#c53f73',
  };
  const boroughColors = {
    Manhattan: '#dc5b3d', Bronx: '#8659b6', Brooklyn: '#2f80c1',
    Queens: '#218c8c', 'Staten Island': '#3b9366',
  };
  const chart = { left: 62, right: 22, top: 24, bottom: 52, width: 560, height: 320 };
  chart.innerWidth = chart.width - chart.left - chart.right;
  chart.innerHeight = chart.height - chart.top - chart.bottom;

  const svgNode = (name, attributes = {}, text = '') => {
    const node = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  };
  const add = (svg, name, attributes, text) => {
    const node = svgNode(name, attributes, text);
    svg.appendChild(node);
    return node;
  };
  const linear = (domainMin, domainMax, rangeMin, rangeMax) => (value) => {
    if (domainMax === domainMin) return (rangeMin + rangeMax) / 2;
    return rangeMin + (value - domainMin) / (domainMax - domainMin) * (rangeMax - rangeMin);
  };
  const extent = (values) => [Math.min(...values), Math.max(...values)];
  const formatCompact = (value) => value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `${Math.round(value)}`;
  const logValue = (value) => Math.log10(value + 1);

  function baseAxes(svg, xTicks, yTicks, xScale, yScale, options = {}) {
    yTicks.forEach((tick) => {
      const y = yScale(tick);
      add(svg, 'line', { x1: chart.left, y1: y, x2: chart.width - chart.right, y2: y, class: 'summary-chart-grid' });
      add(svg, 'text', { x: chart.left - 10, y: y + 4, 'text-anchor': 'end', class: 'summary-chart-label' }, options.yFormat ? options.yFormat(tick) : formatCompact(tick));
    });
    xTicks.forEach((tick) => {
      const x = xScale(tick);
      add(svg, 'line', { x1: x, y1: chart.top, x2: x, y2: chart.height - chart.bottom, class: 'summary-chart-grid' });
      add(svg, 'text', { x, y: chart.height - chart.bottom + 20, 'text-anchor': 'middle', class: 'summary-chart-label' }, options.xFormat ? options.xFormat(tick) : formatCompact(tick));
    });
    add(svg, 'line', { x1: chart.left, y1: chart.height - chart.bottom, x2: chart.width - chart.right, y2: chart.height - chart.bottom, class: 'summary-chart-axis' });
    add(svg, 'line', { x1: chart.left, y1: chart.top, x2: chart.left, y2: chart.height - chart.bottom, class: 'summary-chart-axis' });
    if (options.xLabel) add(svg, 'text', { x: chart.left + chart.innerWidth / 2, y: chart.height - 8, 'text-anchor': 'middle', class: 'summary-chart-title' }, options.xLabel);
    if (options.yLabel) add(svg, 'text', { x: 13, y: chart.top + chart.innerHeight / 2, 'text-anchor': 'middle', transform: `rotate(-90 13 ${chart.top + chart.innerHeight / 2})`, class: 'summary-chart-title' }, options.yLabel);
  }

  function renderRestaurantDensity() {
    const svg = document.querySelector('#restaurant-density-chart');
    if (!svg) return;
    const points = data.restaurantStudy.points;
    const xs = points.map((point) => logValue(point.restaurantDensity));
    const ys = points.map((point) => logValue(point.complaintDensity));
    const [, xMax] = extent(xs);
    const [, yMax] = extent(ys);
    const xScale = linear(0, xMax * 1.04, chart.left, chart.width - chart.right);
    const yScale = linear(0, yMax * 1.04, chart.height - chart.bottom, chart.top);
    const xTicks = [0, xMax / 3, xMax * 2 / 3, xMax];
    const yTicks = [0, yMax / 3, yMax * 2 / 3, yMax];
    baseAxes(svg, xTicks, yTicks, xScale, yScale, {
      xFormat: (value) => formatCompact(10 ** value - 1),
      yFormat: (value) => formatCompact(10 ** value - 1),
      xLabel: 'RESTAURANTS PER SQ. MILE · LOG SCALE',
      yLabel: 'COMPLAINTS PER SQ. MILE · LOG SCALE',
    });
    points.forEach((point) => {
      const circle = add(svg, 'circle', {
        cx: xScale(logValue(point.restaurantDensity)), cy: yScale(logValue(point.complaintDensity)),
        r: 5, fill: colors.complaints, class: 'summary-chart-point',
      });
      circle.appendChild(svgNode('title', {}, `ZIP ${point.zip} · ${point.borough}\n${point.restaurantDensity.toFixed(1)} restaurants / mi²\n${point.complaintDensity.toFixed(1)} complaints / mi²`));
    });
    const trend = data.restaurantStudy.trend;
    const x1 = 0;
    const x2 = xMax;
    add(svg, 'line', {
      x1: xScale(x1), y1: yScale(trend.intercept + trend.slope * x1),
      x2: xScale(x2), y2: yScale(trend.intercept + trend.slope * x2), class: 'summary-chart-trend',
    });
  }

  function renderIncomeExposure() {
    const svg = document.querySelector('#income-exposure-chart');
    if (!svg) return;
    const groups = data.incomeStudy.quartiles;
    const yMax = Math.max(...groups.flatMap((group) => [group.complaintRate, group.positiveRate])) * 1.18;
    const yScale = linear(0, yMax, chart.height - chart.bottom, chart.top);
    const groupWidth = chart.innerWidth / groups.length;
    const ticks = [0, yMax / 4, yMax / 2, yMax * .75, yMax];
    ticks.forEach((tick) => {
      const y = yScale(tick);
      add(svg, 'line', { x1: chart.left, y1: y, x2: chart.width - chart.right, y2: y, class: 'summary-chart-grid' });
      add(svg, 'text', { x: chart.left - 10, y: y + 4, 'text-anchor': 'end', class: 'summary-chart-label' }, tick.toFixed(0));
    });
    groups.forEach((group, index) => {
      const center = chart.left + groupWidth * (index + .5);
      const barWidth = 48;
      const top = yScale(group.complaintRate);
      add(svg, 'rect', { x: center - barWidth / 2, y: top, width: barWidth, height: chart.height - chart.bottom - top, fill: colors.income, opacity: .84 });
      add(svg, 'circle', { cx: center, cy: yScale(group.positiveRate), r: 8, fill: colors.population, stroke: colors.paper, 'stroke-width': 2 });
      add(svg, 'text', { x: center, y: chart.height - chart.bottom + 19, 'text-anchor': 'middle', class: 'summary-chart-title' }, group.group);
      add(svg, 'text', { x: center, y: chart.height - chart.bottom + 33, 'text-anchor': 'middle', class: 'summary-chart-label' }, group.range);
    });
    add(svg, 'line', { x1: chart.left, y1: chart.height - chart.bottom, x2: chart.width - chart.right, y2: chart.height - chart.bottom, class: 'summary-chart-axis' });
    add(svg, 'line', { x1: chart.left, y1: chart.top, x2: chart.left, y2: chart.height - chart.bottom, class: 'summary-chart-axis' });
    add(svg, 'text', { x: 13, y: chart.top + chart.innerHeight / 2, 'text-anchor': 'middle', transform: `rotate(-90 13 ${chart.top + chart.innerHeight / 2})`, class: 'summary-chart-title' }, 'RATE / SHARE (%)');
    add(svg, 'rect', { x: chart.left, y: 5, width: 12, height: 12, fill: colors.income });
    add(svg, 'text', { x: chart.left + 18, y: 15, class: 'summary-chart-label' }, 'COMPLAINTS / 10K');
    add(svg, 'circle', { cx: chart.left + 170, cy: 11, r: 6, fill: colors.population });
    add(svg, 'text', { x: chart.left + 181, y: 15, class: 'summary-chart-label' }, 'CONFIRMED ACTIVITY (%)');
  }

  function renderQuadrants() {
    const svg = document.querySelector('#urban-conditions-chart');
    if (!svg) return;
    const study = data.quadrantStudy;
    const points = study.points;
    const xs = points.map((point) => logValue(point.restaurantDensity));
    const ys = points.map((point) => logValue(point.complaintDensity));
    const xMax = Math.max(...xs) * 1.04;
    const yMax = Math.max(...ys) * 1.04;
    const xScale = linear(0, xMax, chart.left, chart.width - chart.right);
    const yScale = linear(0, yMax, chart.height - chart.bottom, chart.top);
    const xMid = xScale(logValue(study.restaurantMedian));
    const yMid = yScale(logValue(study.complaintMedian));
    const quadrantColors = {
      highComplaint_highRestaurant: colors.complaints,
      highComplaint_lowRestaurant: colors.housing,
      lowComplaint_highRestaurant: colors.restaurant,
      lowComplaint_lowRestaurant: '#9aa8a8',
    };
    add(svg, 'rect', { x: chart.left, y: chart.top, width: xMid - chart.left, height: yMid - chart.top, fill: colors.housing, opacity: .08 });
    add(svg, 'rect', { x: xMid, y: chart.top, width: chart.width - chart.right - xMid, height: yMid - chart.top, fill: colors.complaints, opacity: .08 });
    add(svg, 'rect', { x: chart.left, y: yMid, width: xMid - chart.left, height: chart.height - chart.bottom - yMid, fill: '#9aa8a8', opacity: .08 });
    add(svg, 'rect', { x: xMid, y: yMid, width: chart.width - chart.right - xMid, height: chart.height - chart.bottom - yMid, fill: colors.restaurant, opacity: .08 });
    add(svg, 'line', { x1: xMid, y1: chart.top, x2: xMid, y2: chart.height - chart.bottom, stroke: colors.ink, 'stroke-dasharray': '6 5', opacity: .55 });
    add(svg, 'line', { x1: chart.left, y1: yMid, x2: chart.width - chart.right, y2: yMid, stroke: colors.ink, 'stroke-dasharray': '6 5', opacity: .55 });
    points.forEach((point) => {
      const highComplaint = point.complaintDensity >= study.complaintMedian;
      const highRestaurant = point.restaurantDensity >= study.restaurantMedian;
      const key = `${highComplaint ? 'high' : 'low'}Complaint_${highRestaurant ? 'high' : 'low'}Restaurant`;
      const circle = add(svg, 'circle', { cx: xScale(logValue(point.restaurantDensity)), cy: yScale(logValue(point.complaintDensity)), r: 4.5, fill: quadrantColors[key], class: 'summary-chart-point' });
      circle.appendChild(svgNode('title', {}, `ZIP ${point.zip} · ${study.quadrants[key].label}`));
    });
    add(svg, 'line', { x1: chart.left, y1: chart.height - chart.bottom, x2: chart.width - chart.right, y2: chart.height - chart.bottom, class: 'summary-chart-axis' });
    add(svg, 'line', { x1: chart.left, y1: chart.top, x2: chart.left, y2: chart.height - chart.bottom, class: 'summary-chart-axis' });
    add(svg, 'text', { x: chart.left + chart.innerWidth / 2, y: chart.height - 10, 'text-anchor': 'middle', class: 'summary-chart-title' }, 'RESTAURANT DENSITY →');
    add(svg, 'text', { x: 14, y: chart.top + chart.innerHeight / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${chart.top + chart.innerHeight / 2})`, class: 'summary-chart-title' }, 'COMPLAINT DENSITY →');

    const summary = document.querySelector('#quadrant-summary');
    if (summary) {
      summary.innerHTML = '';
      Object.entries(study.quadrants).forEach(([key, value]) => {
        const item = document.createElement('div');
        item.style.setProperty('--quadrant-color', quadrantColors[key]);
        item.innerHTML = `<span>${value.label}</span><strong>${value.count} ZIPs</strong><small>Examples: ${value.examples.join(', ')}</small>`;
        summary.appendChild(item);
      });
    }
  }

  function renderSeasonality() {
    const svg = document.querySelector('#seasonality-chart');
    if (!svg) return;
    const study = data.seasonalityStudy;
    const max = Math.max(...study.monthlyAverage) * 1.15;
    const yScale = linear(0, max, chart.height - chart.bottom, chart.top);
    const groupWidth = chart.innerWidth / study.months.length;
    const ticks = [0, max / 4, max / 2, max * .75, max];
    ticks.forEach((tick) => {
      const y = yScale(tick);
      add(svg, 'line', { x1: chart.left, y1: y, x2: chart.width - chart.right, y2: y, class: 'summary-chart-grid' });
      add(svg, 'text', { x: chart.left - 10, y: y + 4, 'text-anchor': 'end', class: 'summary-chart-label' }, tick.toFixed(0));
    });
    const linePoints = [];
    study.monthlyAverage.forEach((value, index) => {
      const center = chart.left + groupWidth * (index + .5);
      const top = yScale(value);
      const isPeak = study.months[index] === study.peakMonth;
      add(svg, 'rect', { x: center - groupWidth * .29, y: top, width: groupWidth * .58, height: chart.height - chart.bottom - top, fill: isPeak ? colors.complaints : '#9cafb1' });
      add(svg, 'text', { x: center, y: chart.height - chart.bottom + 18, 'text-anchor': 'middle', class: 'summary-chart-label' }, study.months[index]);
      linePoints.push(`${center},${top}`);
    });
    add(svg, 'polyline', { points: linePoints.join(' '), fill: 'none', stroke: colors.ink, 'stroke-width': 2.5 });
    add(svg, 'line', { x1: chart.left, y1: chart.height - chart.bottom, x2: chart.width - chart.right, y2: chart.height - chart.bottom, class: 'summary-chart-axis' });
    add(svg, 'line', { x1: chart.left, y1: chart.top, x2: chart.left, y2: chart.height - chart.bottom, class: 'summary-chart-axis' });
    add(svg, 'text', { x: 13, y: chart.top + chart.innerHeight / 2, 'text-anchor': 'middle', transform: `rotate(-90 13 ${chart.top + chart.innerHeight / 2})`, class: 'summary-chart-title' }, 'AVERAGE COMPLAINTS');
  }

  function renderInspections() {
    const svg = document.querySelector('#inspection-chart');
    if (!svg) return;
    const points = data.inspectionStudy.points;
    const xs = points.map((point) => logValue(point.complaintRate));
    const ys = points.map((point) => point.positiveRate);
    const xMax = Math.max(...xs) * 1.04;
    const yMax = Math.max(...ys) * 1.08;
    const xScale = linear(0, xMax, chart.left, chart.width - chart.right);
    const yScale = linear(0, yMax, chart.height - chart.bottom, chart.top);
    const xTicks = [0, xMax / 3, xMax * 2 / 3, xMax];
    const yTicks = [0, yMax / 4, yMax / 2, yMax * .75, yMax];
    baseAxes(svg, xTicks, yTicks, xScale, yScale, {
      xFormat: (value) => formatCompact(10 ** value - 1),
      yFormat: (value) => `${value.toFixed(0)}%`,
      xLabel: 'COMPLAINTS PER 10,000 · LOG SCALE',
      yLabel: 'CONFIRMED RAT ACTIVITY',
    });
    points.forEach((point) => {
      const circle = add(svg, 'circle', { cx: xScale(logValue(point.complaintRate)), cy: yScale(point.positiveRate), r: 5, fill: boroughColors[point.borough] || colors.muted, class: 'summary-chart-point' });
      circle.appendChild(svgNode('title', {}, `ZIP ${point.zip} · ${point.borough}\n${point.complaintRate.toFixed(1)} complaints / 10k\n${point.positiveRate.toFixed(1)}% confirmed activity\n${point.inspected.toLocaleString()} inspection outcomes`));
    });
  }

  document.querySelectorAll('[data-summary-stat="restaurant-correlation"]').forEach((node) => { node.textContent = data.restaurantStudy.correlation.toFixed(2); });
  document.querySelectorAll('[data-summary-stat="income-q4-positive"]').forEach((node) => { node.textContent = data.incomeStudy.quartiles[3].positiveRate.toFixed(1); });
  document.querySelectorAll('[data-summary-stat="peak-month"]').forEach((node) => { node.textContent = data.seasonalityStudy.peakMonth; });
  document.querySelectorAll('[data-summary-stat="inspection-correlation"]').forEach((node) => { node.textContent = data.inspectionStudy.correlation.toFixed(2); });

  renderRestaurantDensity();
  renderIncomeExposure();
  renderQuadrants();
  renderSeasonality();
  renderInspections();
})();
