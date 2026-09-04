document.querySelectorAll("[data-current-year]").forEach((year) => {
  year.textContent = String(new Date().getFullYear());
});

const instagramFrame = document.querySelector("[data-lightwidget-src]");

const loadInstagramWidget = () => {
  if (!instagramFrame || !instagramFrame.dataset.lightwidgetSrc) return;

  instagramFrame.src = instagramFrame.dataset.lightwidgetSrc;
  delete instagramFrame.dataset.lightwidgetSrc;

  const widgetScript = document.createElement("script");
  widgetScript.src = "https://cdn.lightwidget.com/widgets/lightwidget.js";
  widgetScript.async = true;
  widgetScript.dataset.lightwidgetLoader = "";
  document.body.append(widgetScript);
};

if (instagramFrame) {
  if ("IntersectionObserver" in window) {
    const instagramObserver = new IntersectionObserver(
      (entries, observer) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        loadInstagramWidget();
      },
      { rootMargin: "0px" },
    );

    instagramObserver.observe(instagramFrame);
  } else {
    loadInstagramWidget();
  }
}

const carouselControllers = new WeakMap();

const setupCarousel = (carousel) => {
  const existingController = carouselControllers.get(carousel);
  if (existingController) return existingController;

  const track = carousel.querySelector("[data-carousel-track]");
  const showcase = carousel.closest(".facebook-showcase");
  const previousButton = showcase?.querySelector("[data-carousel-previous]");
  const nextButton = showcase?.querySelector("[data-carousel-next]");
  const status = showcase?.querySelector("[data-carousel-status]");

  if (!track || !previousButton || !nextButton || !status) {
    return null;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let cards = [];
  let carouselUpdateQueued = false;
  let hasInteracted = false;

  const nearestCardIndex = () => {
    if (!cards.length) return 0;

    const trackLeft = track.getBoundingClientRect().left;
    return cards.reduce(
      (nearest, card, index) => {
        const distance = Math.abs(card.getBoundingClientRect().left - trackLeft);
        return distance < nearest.distance ? { index, distance } : nearest;
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    ).index;
  };

  const updateCarousel = () => {
    carouselUpdateQueued = false;

    if (!cards.length) {
      previousButton.disabled = true;
      nextButton.disabled = true;
      status.textContent = "No replays";
      return;
    }

    const currentIndex = nearestCardIndex();
    const atStart = track.scrollLeft <= 2;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    const trackBounds = track.getBoundingClientRect();
    const mostlyVisibleCards = cards
      .map((card, index) => {
        const bounds = card.getBoundingClientRect();
        const visibleWidth = Math.max(
          0,
          Math.min(bounds.right, trackBounds.right) -
            Math.max(bounds.left, trackBounds.left),
        );
        return { index, visibleRatio: visibleWidth / bounds.width };
      })
      .filter(({ visibleRatio }) => visibleRatio >= 0.5);
    const firstVisible = mostlyVisibleCards[0]?.index ?? currentIndex;
    const lastVisible =
      mostlyVisibleCards[mostlyVisibleCards.length - 1]?.index ?? currentIndex;

    previousButton.disabled = atStart;
    nextButton.disabled = atEnd;
    status.textContent =
      firstVisible === lastVisible
        ? `${firstVisible + 1} of ${cards.length}`
        : `${firstVisible + 1}\u2013${lastVisible + 1} of ${cards.length}`;
  };

  const queueCarouselUpdate = () => {
    if (carouselUpdateQueued) return;
    carouselUpdateQueued = true;
    window.requestAnimationFrame(updateCarousel);
  };

  const scrollToNeighbor = (direction) => {
    hasInteracted = true;
    const currentIndex = nearestCardIndex();
    const targetIndex = Math.max(
      0,
      Math.min(cards.length - 1, currentIndex + direction),
    );

    track.scrollTo({
      left: cards[targetIndex].offsetLeft - track.offsetLeft,
      behavior: reducedMotion.matches ? "auto" : "smooth",
    });
  };

  previousButton.addEventListener("click", () => scrollToNeighbor(-1));
  nextButton.addEventListener("click", () => scrollToNeighbor(1));
  track.addEventListener("scroll", () => {
    hasInteracted = true;
    queueCarouselUpdate();
  }, { passive: true });

  for (const eventName of ["focusin", "keydown"]) {
    track.addEventListener(eventName, () => {
      hasInteracted = true;
    });
  }

  track.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") hasInteracted = true;
  }, { passive: true });

  track.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) hasInteracted = true;
  }, { passive: true });

  if ("ResizeObserver" in window) {
    new ResizeObserver(queueCarouselUpdate).observe(track);
  } else {
    window.addEventListener("resize", queueCarouselUpdate);
  }

  const controller = {
    hasInteracted: () => hasInteracted,
    refresh: ({ reset = false } = {}) => {
      cards = [...track.querySelectorAll("[data-carousel-card]")];
      cards.forEach((card, index) => {
        card.setAttribute("aria-label", `${index + 1} of ${cards.length}`);
      });

      if (reset) {
        track.scrollTo({ left: 0, behavior: "auto" });
      }

      updateCarousel();
    },
  };

  carouselControllers.set(carousel, controller);
  controller.refresh();
  return controller;
};

const facebookDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "America/Chicago",
});

const facebookLinkDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "America/Chicago",
});

const facebookVideoHubUrl = "https://www.facebook.com/ChangingPlacesDSM/videos";
const FACEBOOK_REPLAY_FALLBACK_MAX_AGE_MS = 29 * 24 * 60 * 60 * 1000;

const isAllowedFacebookUrl = (value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com"))
    );
  } catch {
    return false;
  }
};

const isAllowedFacebookImageUrl = (value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "fbcdn.net" || url.hostname.endsWith(".fbcdn.net"))
    );
  } catch {
    return false;
  }
};

const formatVideoDuration = (value) => {
  const totalSeconds = Math.round(Number(value));
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0 || totalSeconds > 86400) {
    return "";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const normalizeFacebookFeed = (payload) => {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.videos)) {
    return null;
  }

  if (!payload.videos.length || payload.videos.length > 5) return null;

  const videos = payload.videos.map((video) => {
    if (!video || typeof video !== "object") return null;

    const id = typeof video.id === "string" ? video.id.trim() : "";
    const createdTime =
      typeof video.createdTime === "string"
        ? new Date(video.createdTime)
        : new Date(Number.NaN);
    const duration = formatVideoDuration(video.durationSeconds);

    if (
      !/^\d{5,30}$/.test(id) ||
      !isAllowedFacebookUrl(video.permalinkUrl) ||
      !isAllowedFacebookImageUrl(video.thumbnailUrl) ||
      Number.isNaN(createdTime.getTime())
    ) {
      return null;
    }

    return {
      id,
      permalinkUrl: video.permalinkUrl,
      thumbnailUrl: video.thumbnailUrl,
      createdTime,
      duration,
    };
  });

  if (videos.some((video) => !video)) return null;
  if (new Set(videos.map((video) => video.id)).size !== videos.length) return null;
  return videos;
};

const preloadFacebookThumbnails = (videos) =>
  Promise.all(
    videos.map(
      (video) =>
        new Promise((resolve) => {
          const image = new Image();
          let settled = false;
          const finish = (loaded) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            image.onload = null;
            image.onerror = null;
            resolve(loaded);
          };
          const timeout = window.setTimeout(() => finish(false), 4000);

          image.decoding = "async";
          image.referrerPolicy = "no-referrer";
          image.onload = () => finish(image.naturalWidth > 0);
          image.onerror = () => finish(false);
          image.src = video.thumbnailUrl;

          if (image.complete) finish(image.naturalWidth > 0);
        }),
    ),
  ).then((results) => results.every(Boolean));

const makeFacebookFallbackDurable = (showcase) => {
  const expirationThreshold = Date.now() - FACEBOOK_REPLAY_FALLBACK_MAX_AGE_MS;

  showcase
    .querySelectorAll("[data-facebook-created-time]")
    .forEach((card) => {
      const createdTime = Date.parse(card.dataset.facebookCreatedTime || "");
      if (!Number.isFinite(createdTime) || createdTime > expirationThreshold) return;

      const link = card.querySelector(".facebook-card__link");
      if (!link) return;
      link.href = facebookVideoHubUrl;
      link.setAttribute(
        "aria-label",
        "Browse recent Changing Places videos on Facebook; opens in a new tab",
      );

      const meta = card.querySelector(".facebook-card__meta");
      const label = meta?.querySelector("span");
      if (meta && label) {
        label.textContent = "Facebook";
        meta.replaceChildren(label);
      }

      const title = card.querySelector(".facebook-card__title");
      if (title) title.textContent = "Browse recent videos";
      card.querySelector(".facebook-card__play")?.remove();
    });
};

const createFacebookCard = (video, index, total) => {
  const article = document.createElement("article");
  article.className = "facebook-card";
  article.dataset.carouselCard = "";
  article.dataset.facebookVideoId = video.id;
  article.setAttribute("role", "group");
  article.setAttribute("aria-roledescription", "slide");
  article.setAttribute("aria-label", `${index + 1} of ${total}`);

  const link = document.createElement("a");
  link.className = "facebook-card__link";
  link.href = video.permalinkUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.setAttribute(
    "aria-label",
    `Watch the ${facebookLinkDateFormatter.format(video.createdTime)} live floor walk on Facebook; opens in a new tab`,
  );

  const media = document.createElement("span");
  media.className = "facebook-card__media";

  const image = document.createElement("img");
  image.src = video.thumbnailUrl;
  image.alt = "";
  image.width = 640;
  image.height = 640;
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";

  const play = document.createElement("span");
  play.className = "facebook-card__play";
  play.setAttribute("aria-hidden", "true");

  const svgNamespace = "http://www.w3.org/2000/svg";
  const playIcon = document.createElementNS(svgNamespace, "svg");
  playIcon.setAttribute("viewBox", "0 0 24 24");
  playIcon.setAttribute("focusable", "false");
  const playPath = document.createElementNS(svgNamespace, "path");
  playPath.setAttribute("d", "m9 7 8 5-8 5Z");
  playIcon.append(playPath);
  play.append(playIcon);
  media.append(image, play);

  const body = document.createElement("span");
  body.className = "facebook-card__body";
  const meta = document.createElement("span");
  meta.className = "facebook-card__meta";
  const replay = document.createElement("span");
  replay.textContent = "Replay";
  meta.append(replay);

  if (video.duration) {
    const duration = document.createElement("span");
    duration.textContent = video.duration;
    meta.append(duration);
  }

  const title = document.createElement("span");
  title.className = "facebook-card__title";
  title.textContent = facebookDateFormatter.format(video.createdTime);
  body.append(meta, title);
  link.append(media, body);
  article.append(link);
  return article;
};

const hydrateFacebookFeed = async (showcase, controller) => {
  if (showcase.dataset.facebookFeedState) return;

  const feedUrl = showcase.dataset.facebookFeedUrl;
  const track = showcase.querySelector("[data-carousel-track]");
  if (!feedUrl || !track) return;

  showcase.dataset.facebookFeedState = "loading";
  const useFallback = () => {
    showcase.dataset.facebookFeedState = "fallback";
    makeFacebookFallbackDurable(showcase);
  };
  const abortController = new AbortController();
  const timeout = window.setTimeout(() => abortController.abort(), 6000);

  try {
    const response = await fetch(feedUrl, {
      headers: { Accept: "application/json" },
      signal: abortController.signal,
    });
    if (!response.ok) throw new Error("Facebook feed unavailable");

    const normalizedVideos = normalizeFacebookFeed(await response.json());
    const freshVideoThreshold = Date.now() - FACEBOOK_REPLAY_FALLBACK_MAX_AGE_MS;
    const videos = normalizedVideos?.filter(
      (video) => video.createdTime.getTime() > freshVideoThreshold,
    );
    if (!videos?.length || controller.hasInteracted()) {
      useFallback();
      return;
    }

    const currentIds = [...track.querySelectorAll("[data-facebook-video-id]")]
      .map((card) => card.dataset.facebookVideoId)
      .filter(Boolean);
    const nextIds = videos.map((video) => video.id);

    if (
      currentIds.length === nextIds.length &&
      currentIds.every((id, index) => id === nextIds[index])
    ) {
      showcase.dataset.facebookFeedState = "current";
      return;
    }

    const thumbnailsReady = await preloadFacebookThumbnails(videos);
    if (!thumbnailsReady || controller.hasInteracted()) {
      useFallback();
      return;
    }

    const fragment = document.createDocumentFragment();
    videos.forEach((video, index) => {
      fragment.append(createFacebookCard(video, index, videos.length));
    });

    track.replaceChildren(fragment);
    controller.refresh({ reset: true });
    showcase.dataset.facebookFeedState = "updated";
  } catch {
    useFallback();
  } finally {
    window.clearTimeout(timeout);
  }
};

document.querySelectorAll("[data-carousel]").forEach((carousel) => {
  const controller = setupCarousel(carousel);
  const showcase = carousel.closest("[data-facebook-feed-url]");
  if (!controller || !showcase) return;

  const loadFeed = () => hydrateFacebookFeed(showcase, controller);

  if ("IntersectionObserver" in window) {
    const feedObserver = new IntersectionObserver(
      (entries, observer) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        loadFeed();
      },
      { rootMargin: "600px 0px" },
    );
    feedObserver.observe(showcase);
  } else {
    loadFeed();
  }
});

const desktop = window.matchMedia("(min-width: 48.01rem)");
const toggle = document.getElementById("menu-toggle");
const menu = document.getElementById("primary-navigation");
const siteHeader = document.querySelector("header");

const setMenuState = (isOpen) => {
  menu?.classList.toggle("show", isOpen);
  toggle?.setAttribute("aria-expanded", String(isOpen));
  toggle?.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
};

const closeMenu = ({ returnFocus = false } = {}) => {
  setMenuState(false);
  if (returnFocus) toggle?.focus();
};

if (toggle && menu) {
  toggle.addEventListener("click", () => {
    setMenuState(!menu.classList.contains("show"));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("show")) {
      closeMenu({ returnFocus: true });
    }
  });

  document.addEventListener("click", (event) => {
    if (
      menu.classList.contains("show") &&
      event.target instanceof Node &&
      !siteHeader?.contains(event.target)
    ) {
      closeMenu();
    }
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });
}

const faqButtons = [...document.querySelectorAll(".faq-question")];

const setFaqState = (button, isOpen) => {
  const answer = document.getElementById(button.getAttribute("aria-controls"));

  button.classList.toggle("active", isOpen);
  button.setAttribute("aria-expanded", String(isOpen));
  if (answer) answer.hidden = !isOpen;
};

faqButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const willOpen = !button.classList.contains("active");

    if (willOpen) {
      button
        .closest(".faq-group")
        ?.querySelectorAll(".faq-question.active")
        .forEach((openButton) => setFaqState(openButton, false));
    }

    setFaqState(button, willOpen);
  });
});

const footerMobile = window.matchMedia("(max-width: 48rem)");
const footerColumns = [...document.querySelectorAll(".footer-column")];
let footerWasMobile;

const updateFooterColumns = () => {
  const isMobile = footerMobile.matches;

  footerColumns.forEach((column) => {
    const heading = column.querySelector(".footer-heading");
    if (heading) heading.tabIndex = isMobile ? 0 : -1;
    column.open = isMobile ? footerWasMobile === true && column.open : true;
  });

  footerWasMobile = isMobile;
};

footerColumns.forEach((column) => {
  const heading = column.querySelector(".footer-heading");

  heading?.addEventListener("click", (event) => {
    if (!footerMobile.matches) event.preventDefault();
  });

  column.addEventListener("toggle", () => {
    if (!footerMobile.matches || !column.open) return;

    footerColumns.forEach((otherColumn) => {
      if (otherColumn !== column) otherColumn.open = false;
    });
  });
});

const listenForMediaChange = (mediaQuery, listener) => {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
  } else {
    mediaQuery.addListener(listener);
  }
};

listenForMediaChange(footerMobile, updateFooterColumns);
updateFooterColumns();

const logo = document.querySelector(".logo-img");
const navLinks = [...document.querySelectorAll('nav a[href^="#"]')];
const sections = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

const setActiveNavLink = (current) => {
  navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${current}`;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "location");
    } else {
      link.removeAttribute("aria-current");
    }
  });
};

if ("IntersectionObserver" in window && sections.length) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const activeSection = entries
        .filter((entry) => entry.isIntersecting)
        .sort(
          (first, second) =>
            first.boundingClientRect.top - second.boundingClientRect.top,
        )[0];

      if (activeSection) setActiveNavLink(activeSection.target.id);
    },
    { rootMargin: "-120px 0px -60% 0px" },
  );

  sections.forEach((section) => sectionObserver.observe(section));
}

let logoUpdateQueued = false;

const updateLogo = () => {
  logoUpdateQueued = false;
  logo?.classList.toggle(
    "logo-scrolled",
    desktop.matches && window.scrollY > 80,
  );
};

const queueLogoUpdate = () => {
  if (logoUpdateQueued) return;
  logoUpdateQueued = true;
  window.requestAnimationFrame(updateLogo);
};

listenForMediaChange(desktop, () => {
  if (desktop.matches) closeMenu();
  queueLogoUpdate();
});

window.addEventListener("scroll", queueLogoUpdate, { passive: true });
updateLogo();
