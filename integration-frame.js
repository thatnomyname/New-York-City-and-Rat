(() => {
  const frame = document.body.dataset.frame;
  if (!frame || window.parent === window) return;

  let lastHeight = 0;
  let scheduled = false;

  function measure() {
    scheduled = false;
    const height = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.documentElement.offsetHeight,
      document.body.offsetHeight,
    );
    if (Math.abs(height - lastHeight) < 2) return;
    lastHeight = height;
    window.parent.postMessage({ type: 'rat-city-frame-size', frame, height }, '*');
  }

  function scheduleMeasure() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(measure);
  }

  window.addEventListener('load', scheduleMeasure);
  window.addEventListener('resize', scheduleMeasure);
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[target="_parent"]');
    if (!link) return;
    const target = new URL(link.href, window.location.href).hash.slice(1);
    if (!target) return;
    event.preventDefault();
    window.parent.postMessage({ type: 'rat-city-navigate', target }, '*');
  });
  if ('ResizeObserver' in window) {
    new ResizeObserver(scheduleMeasure).observe(document.documentElement);
  }
  scheduleMeasure();
})();
