// Short, inclusive holiday windows, using the store's date in Central time.
const occasions = [
  { id: "new-year", effect: "confetti", start: 1231, end: 102 },
  { id: "valentines-day", effect: "hearts", start: 212, end: 214 },
  { id: "st-patricks-day", effect: "clovers", start: 315, end: 317 },
  { id: "earth-day", effect: "green-leaves", start: 422, end: 422 },
  { id: "independence-day", effect: "fireworks", start: 701, end: 705 },
  { id: "halloween", effect: "bats", start: 1029, end: 1031 },
  { id: "winter-holidays", effect: "snow", start: 1220, end: 1226 },
];

const nthWeekday = (year, monthIndex, weekday, occurrence) => {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const day = 1 + (weekday - firstWeekday + 7) % 7 + (occurrence - 1) * 7;
  return new Date(Date.UTC(year, monthIndex, day));
};

const easterSunday = (year) => {
  // Gregorian Easter: Oudin's integer algorithm, as published by the USNO.
  // https://aa.usno.navy.mil/faq/easter
  const century = Math.trunc(year / 100);
  const cycle = year % 19;
  const correction = Math.trunc((century - 17) / 25);
  let epact = (century - Math.trunc(century / 4) -
    Math.trunc((century - correction) / 3) + 19 * cycle + 15) % 30;
  epact -= Math.trunc(epact / 28) * (1 - Math.trunc(epact / 28) *
    Math.trunc(29 / (epact + 1)) * Math.trunc((21 - cycle) / 11));
  const weekday = (year + Math.trunc(year / 4) + epact + 2 - century +
    Math.trunc(century / 4)) % 7;
  const offset = epact - weekday;
  const month = 3 + Math.trunc((offset + 40) / 44);
  const day = offset + 28 - 31 * Math.trunc(month / 4);
  return new Date(Date.UTC(year, month - 1, day));
};

const occasionAround = (id, effect, holiday, before, after = 0) => {
  const start = new Date(holiday);
  const end = new Date(holiday);
  start.setUTCDate(start.getUTCDate() - before);
  end.setUTCDate(end.getUTCDate() + after);
  const monthDay = (date) => (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  return {
    id, effect,
    // Civil-date arithmetic keeps windows correct across month boundaries.
    start: monthDay(start),
    end: monthDay(end),
  };
};

const movableOccasions = (year) => [
  occasionAround("easter", "eggs", easterSunday(year), 2),
  occasionAround("mothers-day", "flowers", nthWeekday(year, 4, 0, 2), 2),
  occasionAround("fathers-day", "ties", nthWeekday(year, 5, 0, 3), 2),
  occasionAround("thanksgiving", "leaves", nthWeekday(year, 10, 4, 4), 3, 3),
];

const storeDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export const getSeasonalOccasion = (date = new Date(), preview = null) => {
  if (preview === "off" || !Number.isFinite(date.getTime())) return null;

  const parts = Object.fromEntries(
    storeDate.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  const day = Number(parts.month) * 100 + Number(parts.day);
  // Fixed dates have priority: Earth Day gets April 22 if Easter overlaps.
  const calendar = [...occasions, ...movableOccasions(Number(parts.year))];
  const forced = calendar.find(({ id }) => id === preview);
  const occasion = forced ?? calendar.find(({ start, end }) =>
    start > end ? day >= start || day <= end : day >= start && day <= end,
  );
  if (!occasion) return null;

  // Dec 31 and Jan 1 belong to the same celebration for once-per-visit playback.
  const year = Number(parts.year) +
    (occasion.start > occasion.end && day >= occasion.start ? 1 : 0);
  return { ...occasion, year, preview: Boolean(forced) };
};

const TAU = Math.PI * 2;
const DURATION = 4200;

const symbolEffects = {
  hearts: {
    icon: "heart", colors: ["#c45466", "#9f4058", "#e9a2ad"],
    accent: "#cf9c67", size: 18, count: 26,
  },
  clovers: {
    icon: "clover", colors: ["#358064", "#2e5c50", "#80a965"],
    accent: "#c69850", size: 19, count: 26,
  },
  bats: {
    icon: "bat", colors: ["#64516f", "#443852", "#937ca4"],
    accent: "#d69c4d", size: 27, count: 18,
  },
  leaves: {
    icon: "leaf", colors: ["#bb633b", "#c6963e", "#914b39"],
    accent: "#d2ac64", size: 23, count: 26,
  },
  eggs: {
    icon: "egg", colors: ["#d6a358", "#93b79a", "#b094be", "#df98b0"],
    accent: "#c7aa69", size: 25, count: 24,
  },
  "green-leaves": {
    icon: "leaf", colors: ["#39765b", "#81a45d", "#64a094"],
    accent: "#b4bc65", size: 24, count: 26,
  },
  flowers: {
    icon: "flower", colors: ["#c67180", "#d49372", "#af83a8"],
    accent: "#d0a45a", size: 25, count: 22,
  },
  ties: {
    icon: "tie", colors: ["#496a87", "#497c79", "#b38357"],
    accent: "#c9a56b", size: 29, count: 24,
  },
};

const makeParticles = (effect, radius, padding) => {
  if (effect === "fireworks") {
    const colors = ["#d25545", "#f0d59a", "#548ec5"];
    const count = radius < 50 ? 12 : 20;
    // Favor the space above, below, and to the right of the page-edge logo.
    return [-0.22, 0.02, 0.2, 0.34, 0.66].flatMap((turn, burst) =>
      Array.from({ length: count }, (_, index) => ({
        x: Math.cos(turn * TAU) * (radius + padding * 0.32),
        y: Math.sin(turn * TAU) * (radius + padding * 0.32),
        angle: index / count * TAU,
        reach: index % 2 ? 0.72 : 1,
        delay: burst * 0.6,
        life: 1.65,
        color: index % 5 === 0 ? colors[1] : colors[burst % colors.length],
      })),
    );
  }

  const symbol = symbolEffects[effect];
  if (symbol) {
    const count = radius < 50 ? Math.round(symbol.count * 0.65) : symbol.count;
    const particleScale = radius < 50 ? 0.75 : 1;
    return Array.from({ length: count }, (_, index) => {
      const side = index % 2 ? 1 : -1;
      const accent = index % 4 === 0;
      return {
        x: index % 5 === 0
          ? (Math.random() * 2 - 1) * radius
          : side * (radius + padding * (0.18 + Math.random() * 0.36)),
        drift: side * padding * 0.1,
        angle: Math.random() * TAU,
        orbit: index / count * TAU,
        direction: side,
        variant: index % 3,
        delay: index * 0.025,
        life: 3.3 + Math.random() * 0.15,
        size: particleScale * (accent ? 2.2 : symbol.size * (0.75 + Math.random() * 0.35)),
        color: accent ? symbol.accent : symbol.colors[index % symbol.colors.length],
        accent,
      };
    });
  }

  const colors = effect === "snow"
    ? ["#f4f5ed", "#b3cdd5", "#7e9fa7"]
    : ["#bc832f", "#e9bc62", "#416d5b", "#d08f74"];
  const count = radius < 50 ? 24 : 42;
  const particleScale = radius < 50 ? 0.8 : 1;
  return Array.from({ length: count }, (_, index) => {
    const side = index % 2 ? 1 : -1;
    return {
      x: index % 4 === 0
        ? (Math.random() * 2 - 1) * radius
        : side * (radius + padding * (0.15 + Math.random() * 0.5)),
      y: -radius - padding * (0.45 + Math.random() * 0.3),
      drift: side * padding * 0.15,
      angle: Math.random() * TAU,
      delay: index * 0.014,
      life: (effect === "snow" ? 3.4 : 3.1) + Math.random() * 0.15,
      size: particleScale * (effect === "snow" ? 1.7 + Math.random() * 1.6 : 3 + Math.random() * 2),
      color: colors[index % colors.length],
    };
  });
};

const drawSymbol = (context, particle, effect, progress, radius, padding, icon) => {
  let x = particle.x + Math.sin(progress * 5 + particle.angle) * padding * 0.16 + particle.drift * progress;
  let y = (progress - 0.5) * (radius * 2 + padding * 1.4);
  let rotation = particle.angle + progress * 2;
  let width = 1;
  let scale = 1;

  if (effect === "hearts") {
    y = -y;
    rotation = Math.sin(progress * 4 + particle.angle) * 0.3;
  } else if (effect === "bats") {
    const angle = particle.orbit + progress * particle.direction * 0.9;
    x = padding * 0.11 + Math.cos(angle) * (radius + padding * 0.3);
    y = Math.sin(angle) * (radius + padding * 0.38) + Math.sin(progress * 14 + particle.angle) * 3;
    rotation = Math.sin(angle) * 0.22;
    width = 0.76 + Math.sin(progress * TAU * 3 + particle.angle) * 0.22;
  } else if (effect === "leaves") {
    x += Math.sin(progress * 7 + particle.angle) * padding * 0.1;
    rotation = particle.angle + progress * 4;
    width = 0.75 + Math.sin(progress * 9 + particle.angle) * 0.25;
  } else if (effect === "eggs") {
    y -= Math.abs(Math.sin(progress * Math.PI * 3)) * padding * 0.35;
    rotation = Math.sin(progress * 9 + particle.angle) * 0.25;
  } else if (effect === "green-leaves") {
    y = -y;
    x += Math.sin(progress * 6 + particle.angle) * padding * 0.12;
    rotation = -Math.PI / 4 + Math.sin(progress * 5 + particle.angle) * 0.65;
    width = 0.85 + Math.sin(progress * 5 + particle.angle) * 0.15;
  } else if (effect === "flowers") {
    x = padding * 0.11 + Math.cos(particle.orbit) * (radius + padding * 0.3);
    y = Math.sin(particle.orbit) * (radius + padding * 0.38) - progress * padding * 0.12;
    rotation = particle.angle + progress * 0.6;
    scale = 0.45 + Math.min(1, progress * 4) * 0.55;
  } else if (effect === "ties") {
    rotation = Math.sin(particle.angle + progress * TAU * 1.3) * 0.25;
    width = 0.9 + Math.cos(progress * 5 + particle.angle) * 0.1;
  }

  context.save();
  context.translate(x, y);
  if (particle.accent) {
    context.beginPath();
    context.arc(0, 0, particle.size, 0, TAU);
    context.fill();
  } else {
    context.rotate(rotation);
    context.scale(particle.size / 24 * width * scale, particle.size / 24 * scale);
    context.translate(-12, -12);
    context.fill(icon);

    // Small color details on the sourced silhouettes, in their 24 × 24 space.
    if (effect === "flowers") {
      context.fillStyle = "#e0b651";
      context.beginPath();
      context.arc(12, 12, 2.5, 0, TAU);
      context.fill();
    } else if (effect === "eggs" || effect === "ties") {
      context.clip(icon);
      context.fillStyle = "#fff1d4";
      context.strokeStyle = "#f1e4c5";
      context.lineWidth = 1.5;
      if (effect === "ties") {
        for (const row of [9, 15]) {
          context.beginPath();
          context.moveTo(6, row);
          context.lineTo(18, row + 6);
          context.stroke();
        }
        context.fillRect(9, 6, 6, 1.2);
      } else if (particle.variant === 0) {
        for (const [dotX, dotY] of [[9, 7], [14, 11], [8, 15], [14, 19]]) {
          context.beginPath();
          context.arc(dotX, dotY, 1.5, 0, TAU);
          context.fill();
        }
      } else {
        context.fillRect(0, 8, 24, 2.5);
        context.fillRect(0, 15, 24, 2.5);
      }
    }
  }
  context.restore();
};

const drawParticles = (context, particles, effect, elapsed, radius, padding, size, icon) => {
  context.clearRect(0, 0, size, size);
  context.save();
  context.translate(size / 2, size / 2);

  // Keep every particle outside the logo, including its lettering.
  context.beginPath();
  context.rect(-size / 2, -size / 2, size, size);
  context.moveTo(radius + 2, 0);
  context.arc(0, 0, radius + 2, 0, TAU);
  context.clip("evenodd");

  for (const particle of particles) {
    const progress = (elapsed - particle.delay) / particle.life;
    if (progress <= 0 || progress >= 1) continue;

    context.globalAlpha = Math.min(1, progress * 7, (1 - progress) * 4) * 0.95;
    context.fillStyle = particle.color;
    context.strokeStyle = particle.color;

    if (icon) {
      drawSymbol(context, particle, effect, progress, radius, padding, icon);
    } else if (effect === "fireworks") {
      const distance = (2 + (1 - (1 - progress) ** 2.5) * padding * 0.57) * particle.reach;
      const tail = Math.max(1.5, (radius < 50 ? 5 : 7) * (1 - progress));
      const x = particle.x + Math.cos(particle.angle) * distance;
      const y = particle.y + Math.sin(particle.angle) * distance + progress * progress * 10;
      context.lineWidth = radius < 50 ? 1.6 : 2.1;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - Math.cos(particle.angle) * tail, y - Math.sin(particle.angle) * tail);
      context.stroke();
      context.beginPath();
      context.arc(x, y, context.lineWidth * 0.65, 0, TAU);
      context.fill();
    } else {
      const x = particle.x + Math.sin(progress * 5 + particle.angle) * padding * 0.18 + particle.drift * progress;
      const y = particle.y + progress * (radius * 2 + padding * 1.5);
      if (effect === "snow") {
        context.beginPath();
        context.arc(x, y, particle.size, 0, TAU);
        context.fill();
      } else {
        context.save();
        context.translate(x, y);
        context.rotate(particle.angle + progress * 6);
        context.scale(0.6 + Math.cos(particle.angle + progress * 10) * 0.4, 1);
        context.fillRect(-particle.size / 2, -particle.size, particle.size, particle.size * 2);
        context.restore();
      }
    }
  }
  context.restore();
};

export const setupSeasonalLogo = async (logo) => {
  const occasion = getSeasonalOccasion(
    new Date(), new URLSearchParams(window.location.search).get("logo-flair"),
  );
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const header = logo.closest(".header-flex");
  if (!occasion || motion.matches || !header) return;

  const storageKey = `changing-places:logo-flair:${occasion.id}:${occasion.year}`;
  try {
    if (!occasion.preview && window.sessionStorage.getItem(storageKey)) return;
  } catch {
    // Decorations still work when browser storage is unavailable.
  }

  const listeners = new AbortController();
  const { signal } = listeners;
  let canvas;
  let frame;
  let delay;
  let icon;
  let stopped = false;
  const stop = () => {
    stopped = true;
    window.clearTimeout(delay);
    window.cancelAnimationFrame(frame);
    canvas?.remove();
    listeners.abort();
  };

  // Stop when the visitor moves on, and remove all temporary work afterward.
  window.addEventListener("scroll", stop, { passive: true, signal });
  window.addEventListener("resize", stop, { passive: true, signal });
  window.addEventListener("pagehide", stop, { signal });
  document.addEventListener("visibilitychange", stop, { signal });
  motion.addEventListener("change", stop, { signal });

  const start = () => {
    if (stopped || motion.matches || document.hidden || window.scrollY > 80 || !logo.naturalWidth) {
      stop();
      return;
    }

    const bounds = logo.getBoundingClientRect();
    const headerBounds = header.getBoundingClientRect();
    if (!bounds.width || bounds.bottom <= 0 || bounds.top >= window.innerHeight) {
      stop();
      return;
    }
    const radius = bounds.width / 2;
    const padding = Math.max(34, bounds.width * 0.42);
    const size = bounds.width + padding * 2;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas = document.createElement("canvas");
    canvas.className = "seasonal-logo-flair";
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = Math.ceil(size * scale);
    canvas.height = Math.ceil(size * scale);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.style.left = `${bounds.left - headerBounds.left - padding}px`;
    canvas.style.top = `${bounds.top - headerBounds.top - padding}px`;
    const context = canvas.getContext("2d");
    if (!context) {
      stop();
      return;
    }
    context.scale(scale, scale);
    const particles = makeParticles(occasion.effect, radius, padding);
    header.append(canvas);

    try {
      if (!occasion.preview) window.sessionStorage.setItem(storageKey, "seen");
    } catch {
      // Storage is optional; no cookie or network request is needed.
    }

    const started = performance.now();
    const animate = (now) => {
      if (stopped) return;
      if (now - started >= DURATION) {
        stop();
        return;
      }
      drawParticles(context, particles, occasion.effect, (now - started) / 1000, radius, padding, size, icon);
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
  };

  // Only symbol effects need this small, locally served icon module.
  const symbol = symbolEffects[occasion.effect];
  if (symbol) {
    try {
      const { seasonalIcons } = await import("./seasonal-icons.js?v=20260907-2");
      if (stopped) return;
      icon = new Path2D(seasonalIcons[symbol.icon]);
    } catch {
      stop();
      return;
    }
  }

  const schedule = () => { delay = window.setTimeout(start, 350); };
  if (logo.complete) {
    schedule();
  } else {
    logo.addEventListener("load", schedule, { once: true, signal });
    logo.addEventListener("error", stop, { once: true, signal });
  }
};
