// Optional decoration: never blocks startup, navigation, or search.
export function initHomeIcons() {
  const home = document.getElementById('home-screen');
  const slots = [...document.querySelectorAll('[data-home-model]')];
  if (!home || !slots.length) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const lostContexts = new Set();
  let scenes = [], loading = false, failed = false, frame = 0, lastFrame = 0;
  let angle = 0, inViewport = true, pageActive = true;
  const visible = () => pageActive && !home.hidden && !document.hidden && inViewport;
  const animated = () => !failed && visible() && !motion.matches && scenes.length > 0;
  const stop = () => { cancelAnimationFrame(frame); frame = 0; lastFrame = 0; };
  function draw() {
    for (const item of scenes) {
      item.turntable.rotation.y = item.initialAngle + (motion.matches ? 0 : angle);
      item.renderer.render(item.scene, item.camera);
    }
  }
  function tick(time) {
    frame = 0;
    if (!animated()) { lastFrame = 0; return; }
    if (!lastFrame || time - lastFrame >= 1000 / 30) {
      if (lastFrame) angle = (angle + Math.min(time - lastFrame, 100) * Math.PI * 2 / 12000) % (Math.PI * 2);
      lastFrame = time; draw();
    }
    frame = requestAnimationFrame(tick);
  }
  function resize() {
    if (failed) return;
    for (const item of scenes) {
      const width = item.slot.clientWidth, height = item.slot.clientHeight;
      if (!width || !height) continue;
      item.renderer.setSize(width, height, false);
      item.resizeCamera(width / height);
    }
    if (visible()) draw();
  }
  async function load() {
    if (loading || failed || scenes.length || !visible() || motion.matches) return;
    loading = true;
    try {
      const [T, models, {createIconScene, batchModel}] = await Promise.all([
        import('../assets/vendor/three-0.170.0.min.js'),
        import('./home-models.js?v=1.7.0'), import('./home-icon-scene.js?v=1.7.0'),
      ]);
      for (const slot of slots) {
        const renderer = new T.WebGLRenderer({alpha: true, antialias: true, powerPreference: 'low-power'});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        const kind = slot.dataset.homeModel;
        const model = batchModel(T, kind === 'goods' ? models.createPhone(T) : models.createRay(T));
        const item = {...createIconScene(T, model, kind), slot, renderer};
        scenes.push(item);
        const canvas = renderer.domElement;
        canvas.setAttribute('aria-hidden', 'true');
        canvas.addEventListener('webglcontextlost', event => {
          event.preventDefault(); stop(); lostContexts.add(renderer); failed = true;
          slots.forEach(element => element.classList.remove('model-ready'));
        });
        canvas.addEventListener('webglcontextrestored', () => {
          lostContexts.delete(renderer); failed = lostContexts.size > 0;
          if (failed) return;
          resize();
          slots.forEach(element => element.classList.add('model-ready'));
          sync();
        });
        slot.append(canvas);
      }
      resize(); draw();
      slots.forEach(slot => slot.classList.add('model-ready'));
    } catch {
      failed = true;
      for (const item of scenes) { item.renderer.dispose(); item.renderer.domElement.remove(); }
      scenes = [];
      slots.forEach(slot => slot.classList.remove('model-ready'));
      // Generated posters remain visible on browsers without WebGL.
    } finally { loading = false; }
    sync();
  }
  function sync() {
    stop();
    if (failed || !visible()) return;
    if (!scenes.length) { void load(); return; }
    resize();
    if (animated()) frame = requestAnimationFrame(tick);
  }
  new MutationObserver(sync).observe(home, {attributes: true, attributeFilter: ['hidden']});
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    inViewport = entries.some(entry => entry.isIntersecting); sync();
  }).observe(slots[0].parentElement.parentElement);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(resize); slots.forEach(slot => observer.observe(slot));
  } else window.addEventListener('resize', resize);
  motion.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => { pageActive = false; stop(); });
  window.addEventListener('pageshow', () => { pageActive = true; sync(); });
  sync();
}
