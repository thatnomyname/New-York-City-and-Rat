(() => {
  const frames = new Map([
    ['timeline', document.querySelector('#timeline-frame')],
    ['participation', document.querySelector('#participation-frame')],
  ]);

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message) return;

    const sourceFrame = [...frames.values()].find((frame) => frame && event.source === frame.contentWindow);
    if (!sourceFrame) return;

    if (message.type === 'rat-city-navigate') {
      const target = document.getElementById(String(message.target || ''));
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${target.id}`);
      return;
    }

    if (message.type !== 'rat-city-frame-size') return;

    const frame = frames.get(message.frame);
    if (!frame || frame !== sourceFrame) return;

    const height = Number(message.height);
    if (!Number.isFinite(height) || height < 400 || height > 30000) return;
    frame.style.height = `${Math.ceil(height)}px`;
  });
})();
