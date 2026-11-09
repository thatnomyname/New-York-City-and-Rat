(() => {
  const model = document.querySelector('#city-model');
  if (!model) return;
  let started = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error(`Unable to load ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  function start() {
    if (started) return;
    started = true;
    Promise.all([
      loadScript('0.processed data/nyc-official-citygml-mesh.js'),
      loadScript('0.processed data/nyc-3d-basemap-data.js'),
      loadScript('data/waste-route-proxy.js'),
    ]).then(() => loadScript('2.1 3D/app.js')).catch((error) => {
      const loading = document.querySelector('#loading-state');
      if (loading) loading.textContent = 'NYC MODEL COULD NOT BE LOADED';
      console.error(error);
    });
  }

  function startWhenIdle() {
    if ('requestIdleCallback' in window) window.requestIdleCallback(start);
    else window.setTimeout(start, 80);
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      startWhenIdle();
    }, { rootMargin: '1200px 0px' });
    observer.observe(model);
  } else startWhenIdle();
})();
