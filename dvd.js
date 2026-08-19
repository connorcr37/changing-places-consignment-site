const dvdScreen = document.querySelector("#dvd-screen");
const dvdLogo = document.querySelector("#dvd-logo");

if (dvdScreen && dvdLogo) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = {
    x: 0,
    y: 0,
    vx: 1,
    vy: 1,
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    speed: 100,
    frameId: 0,
    previousTime: 0,
    initialized: false,
  };

  const randomDirection = () => {
    const angle = ((28 + Math.random() * 34) * Math.PI) / 180;
    state.vx = Math.cos(angle) * (Math.random() < 0.5 ? -1 : 1);
    state.vy = Math.sin(angle) * (Math.random() < 0.5 ? -1 : 1);
  };

  const positionLogo = () => {
    dvdLogo.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
  };

  const measure = () => {
    const screenWidth = dvdScreen.clientWidth;
    const screenHeight = dvdScreen.clientHeight;
    const edge = Math.max(4, Math.min(screenWidth, screenHeight) * 0.006);
    const logoWidth = dvdLogo.offsetWidth;
    const logoHeight = dvdLogo.offsetHeight;

    state.minX = Math.min(edge, Math.max(0, (screenWidth - logoWidth) / 2));
    state.minY = Math.min(edge, Math.max(0, (screenHeight - logoHeight) / 2));
    state.maxX = Math.max(state.minX, screenWidth - logoWidth - state.minX);
    state.maxY = Math.max(state.minY, screenHeight - logoHeight - state.minY);
    state.speed = Math.min(132, Math.max(76, Math.hypot(screenWidth, screenHeight) * 0.055));

    if (!state.initialized) {
      state.x = state.minX + Math.random() * (state.maxX - state.minX);
      state.y = state.minY + Math.random() * (state.maxY - state.minY);
      randomDirection();
      state.initialized = true;
      dvdLogo.classList.add("is-moving");
    } else {
      state.x = Math.min(state.maxX, Math.max(state.minX, state.x));
      state.y = Math.min(state.maxY, Math.max(state.minY, state.y));
    }

    positionLogo();
  };

  const varyDirection = () => {
    const horizontalSign = Math.sign(state.vx) || 1;
    const verticalSign = Math.sign(state.vy) || 1;
    const currentAngle = Math.atan2(Math.abs(state.vy), Math.abs(state.vx));
    const angle = Math.min(
      (67 * Math.PI) / 180,
      Math.max((23 * Math.PI) / 180, currentAngle + ((Math.random() - 0.5) * Math.PI) / 24),
    );

    state.vx = Math.cos(angle) * horizontalSign;
    state.vy = Math.sin(angle) * verticalSign;
  };

  const animate = (time) => {
    if (!state.previousTime) state.previousTime = time;
    const elapsedSeconds = Math.min((time - state.previousTime) / 1000, 0.05);
    state.previousTime = time;

    state.x += state.vx * state.speed * elapsedSeconds;
    state.y += state.vy * state.speed * elapsedSeconds;

    let bounced = false;

    if (state.x <= state.minX || state.x >= state.maxX) {
      state.x = Math.min(state.maxX, Math.max(state.minX, state.x));
      state.vx *= -1;
      bounced = true;
    }

    if (state.y <= state.minY || state.y >= state.maxY) {
      state.y = Math.min(state.maxY, Math.max(state.minY, state.y));
      state.vy *= -1;
      bounced = true;
    }

    if (bounced) varyDirection();

    positionLogo();
    state.frameId = window.requestAnimationFrame(animate);
  };

  const stopAnimation = () => {
    window.cancelAnimationFrame(state.frameId);
    state.frameId = 0;
    state.previousTime = 0;
  };

  const startAnimation = () => {
    stopAnimation();
    measure();

    if (!reducedMotion.matches) {
      state.frameId = window.requestAnimationFrame(animate);
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      startAnimation();
    } else {
      stopAnimation();
    }
  };

  window.addEventListener("resize", measure);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  reducedMotion.addEventListener("change", startAnimation);

  if (dvdLogo.complete) {
    startAnimation();
  } else {
    dvdLogo.addEventListener("load", startAnimation, { once: true });
  }
}
