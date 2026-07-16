(() => {
  const canvas = document.getElementById("game");
  const W = canvas.width;
  const H = canvas.height;
  const compactRender = window.matchMedia("(max-width: 38rem), (max-height: 32rem)").matches;
  const renderScale = compactRender ? 0.7 : 1;
  if (renderScale < 1) {
    canvas.width = Math.round(W * renderScale);
    canvas.height = Math.round(H * renderScale);
  }
  const ctx = canvas.getContext("2d", { alpha: false });
  if (renderScale < 1) ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  const startButton = document.getElementById("start-button");
  const jumpButton = document.getElementById("jump-button");
  const fullscreenButton = document.getElementById("fullscreen-button");
  const soundButton = document.getElementById("sound-button");
  const crewOpenButton = document.getElementById("crew-open");
  const crewModal = document.getElementById("crew-modal");
  const crewCloseButton = document.getElementById("crew-close");
  const gameCard = document.querySelector(".game-card");
  const message = document.getElementById("game-message");
  const messageKicker = document.getElementById("message-kicker");
  const messageTitle = document.getElementById("message-title");
  const messageCopy = document.getElementById("message-copy");
  const scoreBreakdown = document.getElementById("score-breakdown");
  const finalScoreNode = document.getElementById("final-score");
  const scoreRowsNode = document.getElementById("score-rows");
  const scoreNode = document.getElementById("score");
  const tagsNode = document.getElementById("tags");
  const couchConditionNode = document.getElementById("couch-condition");
  const bestNode = document.getElementById("best");
  const boostStatusNode = document.getElementById("boost-status");
  const gameToast = document.getElementById("game-toast");
  const gameToastTitle = document.getElementById("game-toast-title");
  const gameToastCopy = document.getElementById("game-toast-copy");
  const testPanel = document.getElementById("test-panel");
  const testPanelMinimizeButton = document.getElementById("test-panel-minimize");
  const testPanelCloseButton = document.getElementById("test-panel-close");
  const tierTestButtons = document.getElementById("tier-test-buttons");
  const testStatus = document.getElementById("test-status");
  const characterTestStatus = document.getElementById("character-test-status");
  const radioTestStatus = document.getElementById("radio-test-status");
  const testMode = new URLSearchParams(location.search).has("test");
  const laserHeroImage = new Image();
  const vortexHeroImage = new Image();
  const willFinaleImage = new Image();

  const ground = 330;
  const laserHeroW = 335;
  const laserHeroH = 223;
  const vortexHeroW = 270;
  const vortexHeroH = 180;
  let laserHeroSprite = null;
  let vortexHeroSprite = null;
  let willFinaleSprite = null;
  let laserLeagueAssetsPromise = null;
  let laserLeagueAssetsReady = false;
  let cosmicOverdrivePromise = null;
  let cosmicOverdriveReady = false;

  function prepareSprite(image, source, width, height) {
    image.decoding = "async";
    image.fetchPriority = "low";
    image.src = source;
    const decoded = image.complete && image.naturalWidth
      ? Promise.resolve()
      : typeof image.decode === "function"
        ? image.decode()
        : new Promise((resolve, reject) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", reject, { once: true });
        });
    return decoded.then(() => runIdlePreparation(() => {
      if (!image.naturalWidth) return null;
      const sprite = document.createElement("canvas");
      sprite.width = width;
      sprite.height = height;
      const spriteContext = sprite.getContext("2d");
      spriteContext.drawImage(image, 0, 0, width, height);
      return sprite;
    })).catch(() => null).finally(() => {
      image.removeAttribute("src");
    });
  }

  function prepareLaserLeagueAssets() {
    if (laserLeagueAssetsPromise) return laserLeagueAssetsPromise;
    laserLeagueAssetsPromise = Promise.all([
      prepareSprite(laserHeroImage, "images/laser-hero.png", laserHeroW, laserHeroH),
      prepareSprite(vortexHeroImage, "images/vortex-hero.png", vortexHeroW, vortexHeroH),
    ]).then(([laserSprite, vortexSprite]) => {
      laserHeroSprite = laserSprite;
      vortexHeroSprite = vortexSprite;
      laserLeagueAssetsReady = true;
    });
    return laserLeagueAssetsPromise;
  }

  function runIdlePreparation(task) {
    return new Promise((resolve, reject) => {
      const run = () => {
        try {
          resolve(task());
        } catch (error) {
          reject(error);
        }
      };
      if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 1200 });
      else window.setTimeout(run, 0);
    });
  }

  function prepareCosmicOverdrive() {
    if (cosmicOverdrivePromise) return cosmicOverdrivePromise;
    const finaleSpritePromise = prepareSprite(willFinaleImage, "images/will-finale.png", 760, 507)
      .then((sprite) => { willFinaleSprite = sprite; });
    const cachePromise = runIdlePreparation(buildShowroomWallDamageTile)
      .then(() => runIdlePreparation(buildShowroomFloorDamageTile))
      .then(() => runIdlePreparation(buildDamagedShowroomWallTile))
      .then(() => runIdlePreparation(buildCosmicBackdropLayers))
      .then(() => runIdlePreparation(buildCosmicOrbitLayer))
      .then(() => runIdlePreparation(buildCosmicGridLayer));
    cosmicOverdrivePromise = Promise.all([prepareLaserLeagueAssets(), finaleSpritePromise, cachePromise])
      .then(() => { cosmicOverdriveReady = true; });
    return cosmicOverdrivePromise;
  }
  const superKidsRestingX = 28;
  const superKidsRestingY = 44;
  const superKidsFrontX = superKidsRestingX + 455;
  const maxCouchCondition = 3;
  const recoveryDuration = 1.8;
  const jumpVelocity = -820;
  const gravity = 1550;
  const clearanceItemTypes = new Set(["chair", "lamp", "showroom"]);
  const showroomItemVariants = [
    { variant: "bar-stool", w: 46, h: 74, minElapsed: 0 },
    { variant: "end-table", w: 60, h: 55, minElapsed: 0 },
    { variant: "floor-mirror", w: 58, h: 92, minElapsed: 8 },
    { variant: "plant-stand", w: 54, h: 82, minElapsed: 0 },
    { variant: "bookcase", w: 78, h: 88, minElapsed: 10 },
    { variant: "entryway-bench", w: 100, h: 48, minElapsed: 6 },
    { variant: "folding-screen", w: 105, h: 92, minElapsed: 20 },
    { variant: "coat-rack", w: 54, h: 94, minElapsed: 10 },
    { variant: "rolled-rug", w: 92, h: 28, minElapsed: 4 },
  ];
  const colors = {
    forest: "#2e5c50",
    dark: "#244b42",
    clay: "#8a4c36",
    peach: "#f5c7aa",
    cream: "#fcfbfa",
    sand: "#e9dfd3",
    charcoal: "#2b2b2b",
  };
  const sandyPropTiers = [
    ["lamp", "art"],
    ["chair", "plant"],
    ["pillows", "clock"],
    ["goose", "throne", "bathtub"],
    ["piano", "canoe", "giraffe"],
    ["aquarium", "jukebox", "wedding-cake"],
    ["dining-table", "carousel", "t-rex"],
    ["grandfather-clock", "four-poster-bed"],
    ["hot-tub"],
    ["motorcycle"],
    ["food-truck"],
    ["sailboat"],
    ["monster-truck"],
    ["helicopter"],
    ["submarine"],
    ["steam-locomotive"],
    ["hot-air-balloon"],
    ["rocket"],
    ["flying-saucer"],
    ["space-shuttle"],
    ["moon-rover"],
    ["satellite"],
    ["starship"],
    ["space-station", "moon-base", "alien-mothership", "galaxy-cruiser"],
    ["school-bus"],
    ["fire-truck"],
    ["tiny-house"],
    ["wind-turbine"],
    ["ferris-wheel"],
    ["lighthouse"],
    ["castle"],
    ["whale-aquarium"],
    ["cruise-ship"],
    ["dinosaur-skeleton"],
    ["volcano-dolly"],
    ["tornado-jar"],
    ["thundercloud"],
    ["time-machine"],
    ["portal"],
    ["mini-sun"],
    ["saturn"],
    ["black-hole-cart"],
    ["friendly-kaiju"],
    ["solar-system-mobile", "black-hole-cart", "friendly-kaiju", "saturn", "mini-sun", "portal"],
    ["parade-float"],
    ["roller-coaster"],
    ["iceberg-penguins"],
    ["fire-breathing-dragon"],
    ["floating-city"],
    ["universe-snow-globe", "floating-city", "fire-breathing-dragon", "iceberg-penguins", "roller-coaster", "parade-float"],
  ];
  const sandyPropWidths = {
    throne: 108, bathtub: 118, piano: 125, canoe: 140, giraffe: 105,
    aquarium: 122, jukebox: 108, "wedding-cake": 112, "dining-table": 142,
    carousel: 128, "t-rex": 150, "grandfather-clock": 112,
    "four-poster-bed": 150, "hot-tub": 152, motorcycle: 142,
    "food-truck": 180, sailboat: 182, "monster-truck": 184,
    helicopter: 194, submarine: 190, "steam-locomotive": 204,
    "hot-air-balloon": 164, rocket: 154, "flying-saucer": 184,
    "space-shuttle": 204, "moon-rover": 178, satellite: 184,
    starship: 220, "space-station": 220, "moon-base": 212,
    "alien-mothership": 230, "galaxy-cruiser": 230,
    "school-bus": 210, "fire-truck": 220, "tiny-house": 190,
    "wind-turbine": 150, "ferris-wheel": 210, lighthouse: 150,
    castle: 230, "whale-aquarium": 230, "cruise-ship": 240,
    "dinosaur-skeleton": 230, "volcano-dolly": 190, "tornado-jar": 170,
    thundercloud: 190, "time-machine": 185, portal: 175,
    "mini-sun": 160, saturn: 200, "black-hole-cart": 180,
    "friendly-kaiju": 190, "solar-system-mobile": 220,
    "parade-float": 225, "roller-coaster": 235, "iceberg-penguins": 230,
    "fire-breathing-dragon": 225, "floating-city": 240, "universe-snow-globe": 235,
  };
  const hoveringSandyProps = new Set([
    "helicopter", "hot-air-balloon", "rocket", "flying-saucer",
    "space-shuttle", "satellite", "starship", "space-station",
    "alien-mothership", "galaxy-cruiser",
    "thundercloud", "portal", "mini-sun", "saturn", "floating-city",
  ]);
  const illuminatedSandyProps = new Set([
    "flying-saucer", "space-shuttle", "moon-rover", "satellite",
    "starship", "space-station", "moon-base", "alien-mothership",
    "galaxy-cruiser", "floating-city", "universe-snow-globe",
  ]);
  const reactiveSandyProps = new Set(sandyPropTiers.slice(7).flat());
  const absurdSandyProps = new Set(sandyPropTiers.slice(24).flat());
  const absurdPropScale = {
    "school-bus": 1.12, "fire-truck": 1.08, "tiny-house": 1.24,
    "wind-turbine": 1.55, "ferris-wheel": 1.12, lighthouse: 1.53,
    castle: 1.08, "whale-aquarium": 1.1, "cruise-ship": 1.08,
    "dinosaur-skeleton": 1.1, "volcano-dolly": 1.28, "tornado-jar": 1.32,
    thundercloud: 1.25, "time-machine": 1.25, portal: 1.36,
    "mini-sun": 1.45, saturn: 1.2, "black-hole-cart": 1.35,
    "friendly-kaiju": 1.28, "solar-system-mobile": 1.18,
    "parade-float": 1.18, "roller-coaster": 1.16, "iceberg-penguins": 1.2,
    "fire-breathing-dragon": 1.22, "floating-city": 1.16, "universe-snow-globe": 1.2,
  };

  function sandyItemScale(tier, prop) {
    if (tier < 24 || !absurdSandyProps.has(prop)) return 1;
    const tierGrowth = 1 + Math.min(19, tier - 24) * 0.006;
    return (absurdPropScale[prop] || 1) * tierGrowth;
  }

  let state = "ready";
  let last = 0;
  let elapsed = 0;
  let distance = 0;
  let tagCount = 0;
  let tagPoints = 0;
  let brendaBonusPoints = 0;
  let laserLeagueTagBonusPoints = 0;
  let clearancePoints = 0;
  let heroPoints = 0;
  let couchCondition = maxCouchCondition;
  let recoveryGrace = 0;
  let conditionStatusTime = 0;
  let sandyEncounters = 0;
  let superKidsTriggered = false;
  let superKidsTwoTriggered = false;
  let superKidsPending = 0;
  let superKidsPendingVariant = 1;
  let laserLeagueAppearances = 0;
  let firstLaserLeagueEndElapsed = 0;
  let laserLeagueFinale = null;
  let laserAftermathFlash = 0;
  let laserAftermathGrace = 0;
  let showroomDamaged = false;
  let selectedSandyTestTier = null;
  let lastSandyProp = null;
  let speed = 270;
  let spawnIn = 1.7;
  let tagIn = 2.2;
  let helperIn = 4.5;
  let brendaIn = 10;
  let kamdenIn = 16;
  let brenda = null;
  let brendaBoost = 0;
  let kamden = null;
  let superKids = null;
  let obstacles = [];
  let collectibles = [];
  let dust = [];
  let wallHelpers = [];
  let best = Number(localStorage.getItem("couchDashBest") || 0);
  const player = { x: 112, y: ground - 88, w: 190, h: 88, vy: 0, grounded: true };
  const playerCollisionBox = { x: 0, y: 0, w: 0, h: 0 };
  const clearanceCollisionBox = { x: 0, y: 0, w: 0, h: 0 };
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const musicSilence = 0.00001;
  const musicScheduleAhead = 0.34;
  const musicPumpInterval = 150;
  let soundEnabled = localStorage.getItem("couchDashSound") !== "off";
  let audioContext = null;
  let audioMasterGain = null;
  let audioLimiter = null;
  let noiseBuffer = null;
  let musicEngine = null;
  let musicTimer = null;
  let musicSessionStarted = false;
  let musicStep = 0;
  let nextMusicTime = 0;
  let displayedScore = -1;
  let displayedTags = "";
  let displayedCouchCondition = -1;
  let activeToastKey = "";
  let toastTime = 0;
  const shopRadios = {
    boardwalk: {
      name: "Boardwalk Beat",
      tempo: 116,
      chords: [[60, 64, 67, 69], [57, 60, 64, 67], [53, 57, 60, 62], [55, 59, 62, 65]],
      bass: [36, 33, 29, 31],
      melody: [72, null, 76, 79, null, 76, 74, null, 69, null, 72, 76, 74, null, 72, null, 69, 72, null, 74, 72, 69, 67, null, 71, null, 74, 77, 76, 74, 71, null],
      plucks: [1, 3, 5, 7], kick: [0, 4], snare: [2, 6],
      chordType: "triangle", bassType: "triangle", melodyType: "sine",
      chordVolume: 0.0034, bassVolume: 0.009, melodyVolume: 0.0046,
    },
    gogo: {
      name: "Go-Go Showroom",
      tempo: 124,
      chords: [[57, 61, 64, 66], [54, 57, 61, 64], [50, 54, 57, 59], [52, 56, 59, 62]],
      bass: [33, 30, 26, 28],
      melody: [73, 76, null, 78, 76, 73, 71, null, 69, 73, 76, null, 78, 76, 73, 69, 69, null, 73, 74, 76, 74, 73, null, 71, 74, 78, 76, 74, 71, 69, null],
      plucks: [1, 3, 5, 7], kick: [0, 3, 4, 7], snare: [2, 6],
      chordType: "square", bassType: "triangle", melodyType: "triangle",
      chordVolume: 0.0024, bassVolume: 0.0095, melodyVolume: 0.0048,
    },
    garage: {
      name: "Garage Sale Stomp",
      tempo: 132,
      chords: [[64, 67, 71, 73], [62, 67, 71, 74], [57, 61, 64, 69], [64, 67, 71, 73]],
      bass: [40, 38, 33, 40],
      melody: [76, null, 79, 81, 79, null, 76, 74, 76, 79, null, 83, 81, 79, 76, null, 73, 76, 78, null, 81, 78, 76, 73, 76, null, 79, 81, 83, 81, 79, null],
      plucks: [0, 2, 4, 6], kick: [0, 2, 4, 6], snare: [2, 6],
      chordType: "sawtooth", bassType: "square", melodyType: "square",
      chordVolume: 0.0018, bassVolume: 0.0065, melodyVolume: 0.0028,
    },
    sunset: {
      name: "Sunset Stereo",
      tempo: 108,
      chords: [[55, 59, 62, 64], [52, 55, 59, 62], [48, 52, 55, 57], [50, 54, 57, 60]],
      bass: [31, 28, 24, 26],
      melody: [71, 74, 79, null, 78, 74, 71, null, 67, 71, 74, 76, 74, null, 71, 69, 67, 69, 71, 74, null, 71, 69, 67, 69, 72, 74, 78, 76, 74, 72, null],
      plucks: [1, 5], kick: [0, 4], snare: [2, 6],
      chordType: "sine", bassType: "triangle", melodyType: "triangle",
      chordVolume: 0.004, bassVolume: 0.008, melodyVolume: 0.0042,
    },
  };
  let activeRadio = localStorage.getItem("couchDashRadio") || "boardwalk";
  if (!shopRadios[activeRadio]) activeRadio = "boardwalk";

  function updateSoundButton() {
    soundButton.textContent = `Sound: ${soundEnabled ? "On" : "Off"}`;
    soundButton.setAttribute("aria-pressed", String(soundEnabled));
  }

  function ensureAudio() {
    if (!soundEnabled || !AudioContextClass) return null;
    if (!audioContext) {
      audioContext = new AudioContextClass();
      audioMasterGain = audioContext.createGain();
      audioLimiter = audioContext.createDynamicsCompressor();
      audioMasterGain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      audioMasterGain.gain.linearRampToValueAtTime(0.78, audioContext.currentTime + 0.018);
      audioLimiter.threshold.setValueAtTime(-18, audioContext.currentTime);
      audioLimiter.knee.setValueAtTime(16, audioContext.currentTime);
      audioLimiter.ratio.setValueAtTime(6, audioContext.currentTime);
      audioLimiter.attack.setValueAtTime(0.006, audioContext.currentTime);
      audioLimiter.release.setValueAtTime(0.16, audioContext.currentTime);
      audioMasterGain.connect(audioLimiter);
      audioLimiter.connect(audioContext.destination);
      noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
      const noise = noiseBuffer.getChannelData(0);
      for (let index = 0; index < noise.length; index++) noise[index] = Math.random() * 2 - 1;
    }
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }

  function audioOutput(audio) {
    return audioMasterGain && audioMasterGain.context === audio ? audioMasterGain : audio.destination;
  }

  function retireAudioContext() {
    if (!audioContext) return;
    const closingAudio = audioContext;
    const closingMaster = audioMasterGain;
    audioContext = null;
    audioMasterGain = null;
    audioLimiter = null;
    noiseBuffer = null;
    musicEngine = null;
    if (!closingMaster) {
      closingAudio.close().catch(() => {});
      return;
    }
    const now = closingAudio.currentTime;
    closingMaster.gain.cancelScheduledValues(now);
    closingMaster.gain.setValueAtTime(closingMaster.gain.value, now);
    closingMaster.gain.linearRampToValueAtTime(0, now + 0.04);
    window.setTimeout(() => closingAudio.close().catch(() => {}), 60);
  }

  function scheduleToneAt(audio, startAt, frequency, endFrequency, duration, type, volume) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, endFrequency), startAt + duration);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + Math.min(0.015, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(audioOutput(audio));
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  function tone(frequency, endFrequency, duration, type = "sine", volume = 0.035, delay = 0) {
    const audio = ensureAudio();
    if (!audio) return;
    scheduleToneAt(audio, audio.currentTime + delay, frequency, endFrequency, duration, type, volume);
  }

  function noteFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function createMusicVoice(audio, type) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(440, audio.currentTime);
    gain.gain.setValueAtTime(musicSilence, audio.currentTime);
    oscillator.connect(gain);
    gain.connect(audioOutput(audio));
    oscillator.start();
    return { oscillator, gain };
  }

  function createMusicNoiseChannel(audio, source, highpass) {
    const gain = audio.createGain();
    const highpassFilter = audio.createBiquadFilter();
    const lowpassFilter = audio.createBiquadFilter();
    gain.gain.setValueAtTime(0, audio.currentTime);
    highpassFilter.type = "highpass";
    highpassFilter.frequency.setValueAtTime(highpass, audio.currentTime);
    highpassFilter.Q.setValueAtTime(0.7, audio.currentTime);
    lowpassFilter.type = "lowpass";
    lowpassFilter.frequency.setValueAtTime(6500, audio.currentTime);
    lowpassFilter.Q.setValueAtTime(0.55, audio.currentTime);
    source.connect(gain);
    gain.connect(highpassFilter);
    highpassFilter.connect(lowpassFilter);
    lowpassFilter.connect(audioOutput(audio));
    return { gain };
  }

  function ensureMusicEngine(audio) {
    if (musicEngine?.audio === audio) return musicEngine;
    if (!noiseBuffer) return null;
    const station = shopRadios[activeRadio];
    const noiseSource = audio.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    musicEngine = {
      audio,
      bass: createMusicVoice(audio, station.bassType),
      chords: [
        createMusicVoice(audio, station.chordType),
        createMusicVoice(audio, station.chordType),
        createMusicVoice(audio, station.chordType),
      ],
      melody: createMusicVoice(audio, station.melodyType),
      kick: createMusicVoice(audio, "sine"),
      noiseSource,
      hat: null,
      snare: null,
    };
    musicEngine.hat = createMusicNoiseChannel(audio, noiseSource, 3200);
    musicEngine.snare = createMusicNoiseChannel(audio, noiseSource, 1200);
    noiseSource.start(audio.currentTime, Math.random() * 0.7);
    return musicEngine;
  }

  function scheduleMusicToneAt(voice, startAt, frequency, endFrequency, duration, volume) {
    voice.oscillator.frequency.setValueAtTime(frequency, startAt);
    voice.oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, endFrequency), startAt + duration);
    voice.gain.gain.setValueAtTime(musicSilence, startAt);
    voice.gain.gain.exponentialRampToValueAtTime(volume, startAt + Math.min(0.015, duration * 0.2));
    voice.gain.gain.exponentialRampToValueAtTime(musicSilence, startAt + duration);
  }

  function scheduleMusicNoiseAt(channel, startAt, duration, volume) {
    const attack = Math.min(0.012, duration * 0.3);
    channel.gain.gain.setValueAtTime(0, startAt);
    channel.gain.gain.linearRampToValueAtTime(volume, startAt + attack);
    channel.gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    channel.gain.gain.linearRampToValueAtTime(0, startAt + duration + 0.008);
  }

  function silenceMusicEngine() {
    if (!musicEngine) return;
    const now = musicEngine.audio.currentTime;
    const voices = [musicEngine.bass, ...musicEngine.chords, musicEngine.melody, musicEngine.kick];
    for (let index = 0; index < voices.length; index++) {
      const voice = voices[index];
      voice.oscillator.frequency.cancelScheduledValues(now);
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(musicSilence, now, 0.006);
    }
    [musicEngine.hat, musicEngine.snare].forEach((channel) => {
      channel.gain.gain.cancelScheduledValues(now);
      channel.gain.gain.setTargetAtTime(0, now, 0.006);
    });
  }

  function scheduleMusicStep(audio, step, startAt) {
    const engine = ensureMusicEngine(audio);
    if (!engine) return;
    const station = shopRadios[activeRadio];
    const bar = Math.floor(step / 8);
    const beat = step % 8;
    const chord = station.chords[bar];
    if (beat % 2 === 0) {
      const bassNote = station.bass[bar] + (beat === 4 ? 7 : 0);
      const bassFrequency = noteFrequency(bassNote);
      scheduleMusicToneAt(engine.bass, startAt, bassFrequency, bassFrequency * 0.985, 0.3, station.bassVolume);
    }
    if (station.plucks.includes(beat)) {
      for (let index = 0; index < 3; index++) {
        const frequency = noteFrequency(chord[index] + 12);
        scheduleMusicToneAt(engine.chords[index], startAt + index * 0.012, frequency, frequency * 0.995, 0.18, station.chordVolume);
      }
    }
    if (beat % 2 === 1) {
      scheduleMusicNoiseAt(engine.hat, startAt, 0.055, 0.00075);
    }
    if (station.kick.includes(beat)) scheduleMusicToneAt(engine.kick, startAt, 82, 44, 0.12, 0.013);
    if (station.snare.includes(beat)) scheduleMusicNoiseAt(engine.snare, startAt, 0.11, 0.0038);
    const melodyNote = station.melody[step];
    if (melodyNote) {
      const melodyFrequency = noteFrequency(melodyNote);
      scheduleMusicToneAt(engine.melody, startAt, melodyFrequency, melodyFrequency * 1.006, 0.19, station.melodyVolume);
    }
  }

  function pumpMusic() {
    const audio = ensureAudio();
    if (!audio || audio.state !== "running") return;
    const eighthNote = 60 / shopRadios[activeRadio].tempo / 2;
    const safeStart = audio.currentTime + 0.025;
    if (nextMusicTime < safeStart) {
      if (nextMusicTime < audio.currentTime) {
        const missedSteps = Math.ceil((audio.currentTime - nextMusicTime) / eighthNote);
        musicStep = (musicStep + missedSteps) % 32;
      }
      nextMusicTime = safeStart;
    }
    while (nextMusicTime < audio.currentTime + musicScheduleAhead) {
      scheduleMusicStep(audio, musicStep, nextMusicTime);
      musicStep = (musicStep + 1) % 32;
      nextMusicTime += eighthNote;
    }
  }

  function startMusic() {
    const audio = ensureAudio();
    if (!audio) return;
    musicSessionStarted = true;
    if (musicTimer || document.hidden) return;
    if (audio.state !== "running") {
      audio.resume().then(() => {
        if (audio === audioContext && soundEnabled && !document.hidden && !musicTimer) startMusic();
      }).catch(() => {});
      return;
    }
    musicStep = 0;
    nextMusicTime = audio.currentTime + 0.06;
    pumpMusic();
    musicTimer = setInterval(pumpMusic, musicPumpInterval);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    silenceMusicEngine();
  }

  function updateRadioTestControls() {
    radioTestStatus.textContent = `Playing: ${shopRadios[activeRadio].name}`;
    testPanel.querySelectorAll("[data-test-radio]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.testRadio === activeRadio));
    });
  }

  function updateCharacterTestControls(activeCharacter = null) {
    testPanel.querySelectorAll("[data-test-character]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.testCharacter === activeCharacter));
    });
  }

  function updateSandyTestControls() {
    testPanel.querySelectorAll("[data-test-tier]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.testTier) - 1 === selectedSandyTestTier));
    });
  }

  function selectShopRadio(stationKey) {
    if (!shopRadios[stationKey]) return;
    activeRadio = stationKey;
    localStorage.setItem("couchDashRadio", stationKey);
    soundEnabled = true;
    localStorage.setItem("couchDashSound", "on");
    updateSoundButton();
    stopMusic();
    retireAudioContext();
    playSound("enabled");
    startMusic();
    updateRadioTestControls();
  }

  function playSound(kind, item = null) {
    if (!soundEnabled) return;
    if (kind === "enabled") {
      tone(440, 660, 0.11, "sine", 0.025);
      tone(660, 880, 0.12, "sine", 0.02, 0.08);
    } else if (kind === "jump") {
      tone(210, 510, 0.15, "triangle", 0.026);
    } else if (kind === "tag") {
      tone(720, 920, 0.12, "sine", 0.035);
      tone(960, 1180, 0.13, "sine", 0.025, 0.07);
    } else if (kind === "brenda") {
      [0, 0.1, 0.2].forEach((delay, index) => tone(440 + index * 180, 520 + index * 210, 0.16, "triangle", 0.032, delay));
    } else if (kind === "kamden") {
      tone(392, 523, 0.13, "triangle", 0.022);
      tone(523, 784, 0.16, "sine", 0.019, 0.09);
    } else if (kind === "clearance") {
      tone(659, 988, 0.13, "sine", 0.027);
      tone(784, 1175, 0.15, "triangle", 0.02, 0.07);
    } else if (kind === "super-kids") {
      [392, 523, 659, 784].forEach((frequency, index) => tone(frequency, frequency * 1.5, 0.2, "sine", 0.022, index * 0.065));
    } else if (kind === "laser") {
      tone(1180, 420, 0.11, "sawtooth", 0.014);
      tone(840, 1260, 0.09, "sine", 0.012, 0.035);
    } else if (kind === "will-power") {
      [392, 587, 784, 1047].forEach((frequency, index) => {
        tone(frequency, frequency * 1.42, 0.19, index < 2 ? "triangle" : "sine", 0.018, index * 0.055);
      });
    } else if (kind === "will-finale") {
      tone(72, 196, 1.3, "sawtooth", 0.03);
      [196, 294, 440, 659].forEach((frequency, index) => tone(frequency, frequency * 1.8, 0.7, "sine", 0.018, index * 0.16));
    } else if (kind === "will-mega-blast") {
      tone(1400, 52, 1.05, "sawtooth", 0.055);
      tone(880, 74, 1.2, "square", 0.03, 0.04);
      tone(68, 34, 1.4, "sine", 0.045, 0.08);
    } else if (kind === "hero-combo") {
      tone(130, 58, 0.72, "sawtooth", 0.035);
      [262, 392, 523, 659, 880].forEach((frequency, index) => {
        tone(frequency, frequency * 1.55, 0.34, index % 2 ? "triangle" : "sine", 0.025, index * 0.085);
      });
    } else if (kind === "crash") {
      tone(145, 48, 0.38, "sawtooth", 0.052);
      tone(88, 42, 0.3, "square", 0.025, 0.05);
    } else if (kind === "couch-damage") {
      tone(330, 125, 0.24, "triangle", 0.035);
      tone(220, 165, 0.18, "square", 0.018, 0.08);
    } else if (kind === "sandy" && item) {
      if (item.prop === "parade-float") {
        [0, 0.08, 0.16].forEach((delay, index) => tone(523 + index * 136, 590 + index * 146, 0.13, "triangle", 0.018, delay));
      } else if (item.prop === "roller-coaster") {
        tone(210, 470, 0.3, "square", 0.014);
        tone(470, 190, 0.34, "triangle", 0.013, 0.12);
      } else if (item.prop === "iceberg-penguins") {
        tone(980, 1320, 0.31, "sine", 0.013);
      } else if (item.prop === "fire-breathing-dragon") {
        tone(118, 48, 0.48, "sawtooth", 0.027);
      } else if (item.prop === "floating-city") {
        tone(185, 370, 0.42, "sine", 0.014);
        tone(277, 554, 0.42, "sine", 0.011, 0.08);
      } else if (item.prop === "universe-snow-globe") {
        [196, 294, 440, 659].forEach((frequency, index) => tone(frequency, frequency * 1.5, 0.55, "sine", 0.01, index * 0.07));
      } else if (item.prop === "steam-locomotive") {
        tone(105, 78, 0.2, "square", 0.03);
        tone(132, 92, 0.18, "square", 0.022, 0.14);
      } else if (item.prop === "thundercloud") {
        tone(92, 38, 0.45, "sawtooth", 0.04);
      } else if (item.prop === "friendly-kaiju") {
        tone(78, 34, 0.52, "sawtooth", 0.04);
      } else if (item.tier >= 17 && item.tier < 24) {
        tone(290, 760, 0.28, "sine", 0.025);
        tone(620, 380, 0.22, "triangle", 0.018, 0.1);
      } else if (item.tier >= 24) {
        tone(185, 118, 0.24, "triangle", 0.025);
        tone(370, 530, 0.18, "sine", 0.018, 0.09);
      }
    }
  }

  function toggleSound() {
    if (!AudioContextClass) return;
    soundEnabled = !soundEnabled;
    localStorage.setItem("couchDashSound", soundEnabled ? "on" : "off");
    updateSoundButton();
    if (soundEnabled) {
      playSound("enabled");
      startMusic();
    } else {
      stopMusic();
      retireAudioContext();
    }
  }

  bestNode.textContent = String(best).padStart(5, "0");
  if (!AudioContextClass) soundButton.hidden = true;
  updateSoundButton();

  function showGameToast(key, title, copy, kind = "damage", duration = 0) {
    if (activeToastKey === key && gameToast.classList.contains("is-visible")) return;
    activeToastKey = key;
    toastTime = duration;
    gameToastTitle.textContent = title;
    gameToastCopy.textContent = copy;
    gameToast.dataset.kind = kind;
    gameToast.classList.add("is-visible");
  }

  function hideGameToast(key = "") {
    if (key && activeToastKey !== key) return;
    gameToast.classList.remove("is-visible");
    activeToastKey = "";
    toastTime = 0;
  }

  function pulseCouchCondition() {
    couchConditionNode.classList.remove("condition-hit");
    void couchConditionNode.offsetWidth;
    couchConditionNode.classList.add("condition-hit");
  }

  function reset() {
    elapsed = selectedSandyTestTier === null ? 0 : selectedSandyTestTier * 4;
    distance = 0;
    tagCount = 0;
    tagPoints = 0;
    brendaBonusPoints = 0;
    laserLeagueTagBonusPoints = 0;
    clearancePoints = 0;
    heroPoints = 0;
    couchCondition = maxCouchCondition;
    recoveryGrace = 0;
    conditionStatusTime = 0;
    sandyEncounters = selectedSandyTestTier === null ? 0 : selectedSandyTestTier;
    superKidsTriggered = false;
    superKidsTwoTriggered = false;
    superKidsPending = 0;
    superKidsPendingVariant = 1;
    laserLeagueAppearances = 0;
    firstLaserLeagueEndElapsed = 0;
    laserLeagueFinale = null;
    laserAftermathFlash = 0;
    laserAftermathGrace = 0;
    showroomDamaged = false;
    lastSandyProp = null;
    speed = 270;
    spawnIn = 1.65;
    tagIn = 2;
    helperIn = 3.5 + Math.random() * 4;
    brendaIn = 9 + Math.random() * 4;
    kamdenIn = 15 + Math.random() * 5;
    brenda = null;
    brendaBoost = 0;
    kamden = null;
    superKids = null;
    gameCard.classList.remove("laser-league-active");
    message.classList.remove("has-results");
    boostStatusNode.textContent = "";
    scoreBreakdown.hidden = true;
    messageCopy.hidden = false;
    hideGameToast();
    obstacles = [];
    collectibles = [];
    dust = [];
    wallHelpers = [];
    player.y = ground - player.h;
    player.vy = 0;
    player.grounded = true;
    couchConditionNode.classList.remove("condition-hit");
    updateCouchCondition();
    updateScore();
  }

  function start() {
    reset();
    ensureAudio();
    startMusic();
    state = "running";
    message.hidden = true;
    if (selectedSandyTestTier !== null) {
      const obstacle = spawnSandy(selectedSandyTestTier);
      spawnIn = 2.2;
      testStatus.textContent = `Tier ${selectedSandyTestTier + 1}: ${obstacle.prop.replaceAll("-", " ")} (${obstacle.w}px)`;
      updateSandyTestControls();
    }
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function jump() {
    if (state === "ready" || state === "over") {
      start();
      return;
    }
    if (state === "paused") {
      resume();
      return;
    }
    if (state === "running" && player.grounded) {
      player.vy = brendaBoost > 0 ? jumpVelocity * 1.12 : jumpVelocity;
      player.grounded = false;
      playSound("jump");
      for (let puff = 0; puff < 6; puff++) {
        const coreyPuff = puff % 2 === 1;
        dust.push({
          x: player.x + (coreyPuff ? 182 : 8) + (Math.random() - 0.5) * 12,
          y: ground - 4,
          life: 0.4 + Math.random() * 0.08,
          vx: -(coreyPuff ? 38 : 52) - Math.random() * 68,
          size: 3.5 + Math.random() * 2,
        });
      }
    }
  }

  function pause() {
    if (state !== "running") return;
    state = "paused";
    hideGameToast();
    messageKicker.textContent = "Hold that couch!";
    messageTitle.textContent = "Quick breather";
    messageCopy.textContent = "Press P, Space, or tap continue when you’re ready.";
    startButton.textContent = "Keep moving";
    message.hidden = false;
  }

  function resume() {
    if (state !== "paused") return;
    state = "running";
    message.hidden = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function couchConditionLabel(value = couchCondition) {
    if (value >= 3) return "sturdy";
    if (value === 2) return "scuffed";
    if (value === 1) return "critical";
    return "destroyed";
  }

  function updateCouchCondition() {
    if (couchCondition === displayedCouchCondition) return;
    displayedCouchCondition = couchCondition;
    const conditionLabel = couchConditionLabel();
    couchConditionNode.textContent = "▰".repeat(couchCondition) + "▱".repeat(maxCouchCondition - couchCondition);
    couchConditionNode.dataset.condition = conditionLabel;
    couchConditionNode.setAttribute("aria-label", `Couch condition: ${conditionLabel}, ${couchCondition} of ${maxCouchCondition}`);
  }

  function damageCouch(collidedItem) {
    couchCondition = Math.max(0, couchCondition - 1);
    updateCouchCondition();
    pulseCouchCondition();
    if (couchCondition === 0) {
      gameOver();
      return;
    }

    recoveryGrace = recoveryDuration;
    conditionStatusTime = recoveryDuration;
    const recoveryLeft = player.x - 90;
    const recoveryRight = player.x + player.w + 240;
    for (let index = 0; index < obstacles.length; index++) {
      const item = obstacles[index];
      const nearPlayer = item === collidedItem || (item.x < recoveryRight && item.x + item.w > recoveryLeft);
      if (!nearPlayer) continue;
      if (item.clearance) {
        item.clearance = false;
        item.clearanceAwarded = true;
        if (kamden?.target === item) kamden.target = null;
      }
      item.x = -item.w - 40;
    }
    spawnIn = Math.max(spawnIn, 1.35);
    boostStatusNode.textContent = couchCondition === 1
      ? "Couch frame critical! One hit left."
      : "The couch is scuffed, but still moving.";
    showGameToast(
      `damage-${couchCondition}`,
      couchCondition === 1 ? "Couch critical!" : "Couch scuffed!",
      couchCondition === 1 ? "One hit left." : "Two hits left.",
      "damage",
      1.45,
    );
    playSound("couch-damage");
  }

  function appendScoreRow(label, points, detail = "", bonus = false) {
    const row = document.createElement("div");
    row.className = "score-row";
    const labelNode = document.createElement("span");
    labelNode.className = "score-row-label";
    labelNode.textContent = label;
    if (detail) {
      const detailNode = document.createElement("small");
      detailNode.textContent = ` · ${detail}`;
      labelNode.append(detailNode);
    }
    const pointsNode = document.createElement("strong");
    pointsNode.className = "score-row-points";
    pointsNode.textContent = `${bonus ? "+" : ""}${points.toLocaleString("en-US")}`;
    row.append(labelNode, pointsNode);
    scoreRowsNode.append(row);
  }

  function renderScoreBreakdown(score) {
    const distancePoints = Math.floor(distance);
    const baseTagPoints = tagCount * 50;
    const laserLeaguePoints = heroPoints + laserLeagueTagBonusPoints;
    finalScoreNode.textContent = score.toLocaleString("en-US");
    scoreRowsNode.replaceChildren();
    appendScoreRow("Distance", distancePoints, `${distancePoints.toLocaleString("en-US")} ft`);
    appendScoreRow("Price tags", baseTagPoints, `${tagCount.toLocaleString("en-US")} collected`);
    if (brendaBonusPoints > 0) appendScoreRow("Brenda Boost", brendaBonusPoints, "", true);
    if (clearancePoints > 0) appendScoreRow("Kamden Clearance", clearancePoints, "", true);
    if (laserLeaguePoints > 0) appendScoreRow("Laser League", laserLeaguePoints, "", true);
    messageCopy.hidden = true;
    scoreBreakdown.hidden = false;
  }

  function gameOver() {
    state = "over";
    hideGameToast();
    playSound("crash");
    const score = Math.floor(distance) + tagPoints + clearancePoints + heroPoints;
    if (score > best) {
      best = score;
      localStorage.setItem("couchDashBest", String(best));
      bestNode.textContent = String(best).padStart(5, "0");
      messageKicker.textContent = "New showroom record!";
      messageTitle.textContent = "What a run!";
    } else {
      messageKicker.textContent = "Delivery delayed!";
      messageTitle.textContent = "Couch down!";
    }
    renderScoreBreakdown(score);
    message.classList.add("has-results");
    startButton.textContent = "Try again";
    message.hidden = false;
  }

  function spawnSandy(tierIndex = Math.min(sandyEncounters, sandyPropTiers.length - 1), x = W + 40) {
    const safeTierIndex = Math.max(0, Math.min(tierIndex, sandyPropTiers.length - 1));
    if (safeTierIndex >= 39) prepareLaserLeagueAssets();
    const isFirstFinaleEncounter = safeTierIndex === sandyPropTiers.length - 1 && sandyEncounters === sandyPropTiers.length - 1;
    const tier = isFirstFinaleEncounter ? [sandyPropTiers[safeTierIndex][0]] : sandyPropTiers[safeTierIndex];
    const nonRepeatingChoices = tier.filter((candidate) => candidate !== lastSandyProp);
    const propChoices = nonRepeatingChoices.length ? nonRepeatingChoices : tier;
    const prop = propChoices[Math.floor(Math.random() * propChoices.length)];
    lastSandyProp = prop;
    sandyEncounters = Math.max(sandyEncounters, safeTierIndex + 1);
    const obstacle = {
      type: "sandy",
      prop,
      x,
      y: ground - 84,
      w: Math.round((sandyPropWidths[prop] || 98) * sandyItemScale(safeTierIndex, prop)),
      h: 84,
      tier: safeTierIndex,
      phase: Math.random() * 6,
    };
    obstacles.push(obstacle);
    playSound("sandy", obstacle);
    return obstacle;
  }

  function spawnObstacle() {
    const roll = Math.random();
    const customerKinds = ["old-man", "young-man", "old-woman", "young-woman", "child"];
    if (roll < 0.07 && elapsed > 12) {
      obstacles.push({
        type: "family",
        x: W + 40,
        y: ground - 70,
        w: 92,
        h: 70,
        palette: Math.floor(Math.random() * 4),
        phase: Math.random() * 6,
      });
    } else if (roll < 0.38) {
      const variant = customerKinds[Math.floor(Math.random() * customerKinds.length)];
      const isChild = variant === "child";
      obstacles.push({
        type: "shopper",
        variant,
        palette: Math.floor(Math.random() * 4),
        x: W + 40,
        y: ground - (isChild ? 56 : 78),
        w: isChild ? 38 : 48,
        h: isChild ? 56 : 78,
        phase: Math.random() * 6,
      });
    } else if (roll < 0.7 && !obstacles.some((item) => item.type === "sandy")) {
      spawnSandy();
    } else {
      const itemRoll = Math.random();
      if (itemRoll < 0.28) {
        const lampKinds = ["floor", "table", "arc", "tripod"];
        const variant = lampKinds[Math.floor(Math.random() * lampKinds.length)];
        const lampSizes = {
          floor: [46, 86],
          table: [48, 50],
          arc: [70, 90],
          tripod: [52, 82],
        };
        const [w, h] = lampSizes[variant];
        obstacles.push({ type: "lamp", variant, color: ["#d5a856", "#d77a61", "#77958d", "#8e6f91"][Math.floor(Math.random() * 4)], x: W + 40, y: ground - h, w, h, phase: 0 });
      } else if (itemRoll < 0.56) {
        const chairKinds = ["office", "dining", "armchair", "rocker"];
        const variant = chairKinds[Math.floor(Math.random() * chairKinds.length)];
        const chairSizes = {
          office: [60, 64],
          dining: [48, 68],
          armchair: [72, 60],
          rocker: [72, 64],
        };
        const [w, h] = chairSizes[variant];
        obstacles.push({ type: "chair", variant, color: ["#668aa0", "#b56f58", "#62806f", "#8e6f91", "#d5a856"][Math.floor(Math.random() * 5)], x: W + 40, y: ground - h, w, h, phase: 0 });
      } else {
        const availableItems = showroomItemVariants.filter((item) => elapsed >= item.minElapsed);
        const selected = availableItems[Math.floor(Math.random() * availableItems.length)];
        obstacles.push({
          type: "showroom",
          variant: selected.variant,
          color: ["#668aa0", "#b56f58", "#62806f", "#8e6f91", "#d5a856"][Math.floor(Math.random() * 5)],
          x: W + 40,
          y: ground - selected.h,
          w: selected.w,
          h: selected.h,
          phase: Math.random() * 6,
        });
      }
    }
  }

  function spawnTag() {
    collectibles.push({ x: W + 40, y: ground - 135 - Math.random() * 80, w: 30, h: 42, phase: Math.random() * 6 });
  }

  function activateKamden(forceTarget = false) {
    if (kamden || brenda || superKids) return false;
    let target = null;
    const targetFloor = player.x + player.w + 150;
    for (let index = 0; index < obstacles.length; index++) {
      const item = obstacles[index];
      if (
        clearanceItemTypes.has(item.type)
        && !item.clearance
        && item.x > targetFloor
        && (!target || item.x < target.x)
      ) target = item;
    }
    if (!target && forceTarget) {
      target = {
        type: "chair", variant: "armchair", color: "#62806f",
        x: Math.min(W * 0.68, W - 220), y: ground - 60, w: 72, h: 60, phase: 0,
      };
      obstacles.push(target);
    }
    if (!target) return false;
    target.clearance = true;
    kamden = { life: 5.5, total: 5.5, phase: 0, target };
    playSound("kamden");
    brendaIn = Math.max(brendaIn, 7);
    kamdenIn = 23 + Math.random() * 8;
    boostStatusNode.textContent = "Kamden Clearance Run active. The marked item has a smaller collision area.";
    return true;
  }

  function activateBrenda() {
    if (brenda || kamden || superKids) return false;
    brenda = { life: 6, total: 6, phase: 0 };
    playSound("brenda");
    brendaBoost = 6;
    kamdenIn = Math.max(kamdenIn, 7);
    boostStatusNode.textContent = "Brenda Boost active. Price tags are worth double and jumps are stronger.";
    tagIn = Math.min(tagIn, 0.55);
    brendaIn = 20 + Math.random() * 8;
    return true;
  }

  function spawnLaserLeagueWave() {
    const wave = [
      { type: "showroom", variant: "folding-screen", color: "#5b5f98", x: W + 110, y: ground - 92, w: 105, h: 92 },
      { type: "chair", variant: "armchair", color: "#744f8f", x: W + 310, y: ground - 60, w: 72, h: 60 },
      { type: "lamp", variant: "arc", color: "#5578a8", x: W + 500, y: ground - 90, w: 70, h: 90 },
      { type: "shopper", variant: "young-man", palette: 3, x: W + 690, y: ground - 78, w: 48, h: 78 },
      { type: "showroom", variant: "bookcase", color: "#684f88", x: W + 860, y: ground - 88, w: 78, h: 88 },
      {
        type: "sandy",
        prop: "fire-breathing-dragon",
        tier: sandyPropTiers.length - 1,
        x: W + 1080,
        y: ground - 84,
        w: Math.round((sandyPropWidths["fire-breathing-dragon"] || 112) * sandyItemScale(sandyPropTiers.length - 1, "fire-breathing-dragon")),
        h: 84,
      },
    ];
    wave.forEach((item, index) => obstacles.push({ ...item, phase: index * 0.9, heroWave: true }));
  }

  function activateSuperKids(variant = 1) {
    if (superKids || laserLeagueFinale) return false;
    const assetsReady = laserLeagueAssetsReady && (variant !== 2 || cosmicOverdriveReady);
    if (!assetsReady) {
      prepareLaserLeagueAssets();
      if (variant === 2) prepareCosmicOverdrive();
      superKidsPendingVariant = variant;
      superKidsPending = 0.12;
      boostStatusNode.textContent = variant === 2
        ? "Cosmic Overdrive is chargingâ€¦"
        : "Laser League is approachingâ€¦";
      return false;
    }
    brenda = null;
    brendaBoost = 0;
    kamden = null;
    superKids = {
      variant,
      life: 16,
      total: 16,
      phase: 0,
      laserCooldown: 0.12,
      laserLife: 0,
      laserTarget: null,
      comboTriggered: false,
      comboLife: 0,
      comboTotal: 2.2,
      overdrive: 0,
      powerStage: 1,
      stageDwell: 0,
      stageFlashLife: 1.35,
      captures: 0,
      waveLabelLife: 2.6,
    };
    if (variant === 1) superKidsTriggered = true;
    else superKidsTwoTriggered = true;
    superKidsPending = 0;
    superKidsPendingVariant = 1;
    brendaIn = Math.max(brendaIn, 19);
    kamdenIn = Math.max(kamdenIn, 19);
    tagIn = Math.min(tagIn, 0.3);
    spawnLaserLeagueWave();
    gameCard.classList.add("laser-league-active");
    boostStatusNode.textContent = variant === 2
      ? "Laser League 2: Cosmic Overdrive! Will is pushing WILLPOWER beyond the showroom."
      : "Will enters with power hands. Every blast and vortex catch charges WILLPOWER.";
    playSound("super-kids");
    return true;
  }

  function clearCharacterMoments() {
    brenda = null;
    brendaBoost = 0;
    kamden = null;
    superKids = null;
    superKidsPending = 0;
    superKidsPendingVariant = 1;
    laserLeagueFinale = null;
    laserAftermathFlash = 0;
    laserAftermathGrace = 0;
    gameCard.classList.remove("laser-league-active");
    obstacles.forEach((item) => { item.clearance = false; });
    boostStatusNode.textContent = "";
    updateScore();
  }

  function intersects(a, b, inset = 0) {
    return a.x + inset < b.x + b.w && a.x + a.w - inset > b.x && a.y + inset < b.y + b.h && a.y + a.h - inset > b.y;
  }

  function visibleToLaserLeague(item) {
    const requiredVisibleWidth = item.w * 0.8;
    return item.x <= W - requiredVisibleWidth && item.x + item.w > 0;
  }

  function willPowerStage(value) {
    if (value >= 100) return 4;
    if (value >= 75) return 3;
    if (value >= 50) return 2;
    if (value > 0) return 1;
    return 0;
  }

  function chargeWillPower(amount) {
    if (!superKids) return;
    superKids.overdrive = Math.min(100, superKids.overdrive + amount);
  }

  function superKidsAnchors() {
    const pose = superKidsPose();
    const laserX = pose.x + 128;
    const laserY = pose.y + 6 + Math.sin(superKids.phase * 0.92) * 7;
    const vortexSpriteX = pose.x + 4;
    const vortexSpriteY = pose.y + 126 + Math.cos(superKids.phase * 0.68) * 5;
    return {
      ...pose,
      laserX,
      laserY,
      vortexSpriteX,
      vortexSpriteY,
      eyeX: laserX + laserHeroW * 0.615,
      eyeY: laserY + laserHeroH * 0.29,
      handX: laserX + laserHeroW * 0.865,
      handY: laserY + laserHeroH * 0.4,
      handTwoX: laserX + laserHeroW * 0.36,
      handTwoY: laserY + laserHeroH * 0.36,
      vortexX: vortexSpriteX + vortexHeroW * 0.79,
      vortexY: vortexSpriteY + vortexHeroH * 0.19,
      gravityBallX: vortexSpriteX + vortexHeroW * 0.19,
      gravityBallY: vortexSpriteY + vortexHeroH * 0.36,
    };
  }

  function update(dt) {
    elapsed += dt;
    const lateIntensity = Math.max(0, Math.min(1, (sandyEncounters - 24) / 20));
    const speedCap = 500 + lateIntensity * 15;
    speed = Math.min(speedCap, 270 + elapsed * 3.3 + Math.min(sandyEncounters, sandyPropTiers.length) * 1.1);
    distance += speed * dt / 34;
    spawnIn -= dt;
    tagIn -= dt;
    helperIn -= dt;
    brendaIn -= dt;
    kamdenIn -= dt;
    if (superKidsPending > 0) {
      superKidsPending -= dt;
      if (superKidsPending <= 0) activateSuperKids(superKidsPendingVariant);
    }
    laserAftermathFlash = Math.max(0, laserAftermathFlash - dt);
    laserAftermathGrace = Math.max(0, laserAftermathGrace - dt);
    recoveryGrace = Math.max(0, recoveryGrace - dt);
    conditionStatusTime = Math.max(0, conditionStatusTime - dt);
    if (toastTime > 0) {
      toastTime = Math.max(0, toastTime - dt);
      if (toastTime === 0) hideGameToast();
    }
    if (laserLeagueFinale) {
      laserLeagueFinale.life -= dt;
      laserLeagueFinale.phase += dt * 5;
      const finaleProgress = 1 - laserLeagueFinale.life / laserLeagueFinale.total;
      if (!laserLeagueFinale.blastPlayed && finaleProgress >= 0.62) {
        laserLeagueFinale.blastPlayed = true;
        playSound("will-mega-blast");
      }
      if (laserLeagueFinale.life <= 0) {
        laserLeagueFinale = null;
        laserAftermathFlash = 1.35;
        laserAftermathGrace = 4;
        showroomDamaged = true;
        for (let index = 0; index < obstacles.length; index++) {
          heroPoints += obstacles[index].type === "sandy" ? 250 : 100;
        }
        obstacles = [];
        spawnIn = Math.max(spawnIn, 2.2);
        brendaIn = Math.max(brendaIn, 8);
        kamdenIn = Math.max(kamdenIn, 8);
        gameCard.classList.remove("laser-league-active");
        boostStatusNode.textContent = "Laser League 2 complete. The showroom survived… technically.";
      }
    }
    brendaBoost = Math.max(0, brendaBoost - dt);
    if (brendaBoost === 0 && !kamden && !superKids && !superKidsPending && !laserLeagueFinale && !laserAftermathFlash && !laserAftermathGrace && !conditionStatusTime && boostStatusNode.textContent) boostStatusNode.textContent = "";

    if (spawnIn <= 0) {
      spawnObstacle();
      const tierPressure = Math.min(sandyEncounters, sandyPropTiers.length) * 0.0035;
      const spawnFloor = 0.94 - lateIntensity * 0.01;
      const spawnVariation = 0.7 - lateIntensity * 0.08;
      spawnIn = Math.max(spawnFloor, 1.65 - elapsed * 0.0035 - tierPressure) + Math.random() * spawnVariation;
    }
    if (tagIn <= 0) {
      spawnTag();
      tagIn = brendaBoost > 0 || superKids ? 0.65 + Math.random() * 0.55 : 2.1 + Math.random() * 2.1;
    }
    if (helperIn <= 0 && wallHelpers.length < 2) {
      const helperProps = ["art", "pillow", "vase", "basket", "plant", "mirror", "table-lamp"];
      wallHelpers.push({
        x: W + 80,
        kind: Math.random() < 0.5 ? "man" : "woman",
        shirt: ["#708c84", "#9b6b5d", "#6d7e95", "#8b7890"][Math.floor(Math.random() * 4)],
        art: ["#d9b69e", "#97b1aa", "#d6bd72", "#9d829e"][Math.floor(Math.random() * 4)],
        prop: helperProps[Math.floor(Math.random() * helperProps.length)],
        phase: Math.random() * 6,
      });
      helperIn = 6 + Math.random() * 8;
    }
    if (kamdenIn <= 0 && !kamden && !brenda && !superKids && !superKidsPending && !laserLeagueFinale && !laserAftermathFlash && !laserAftermathGrace) {
      if (!activateKamden()) kamdenIn = 0.5;
    }
    if (brendaIn <= 0 && !brenda && !kamden && !superKids && !superKidsPending && !laserLeagueFinale && !laserAftermathFlash && !laserAftermathGrace) {
      activateBrenda();
    }

    player.vy += gravity * dt;
    player.y += player.vy * dt;
    if (player.y >= ground - player.h) {
      player.y = ground - player.h;
      player.vy = 0;
      player.grounded = true;
    }

    if (superKids) {
      superKids.life -= dt;
      superKids.phase += dt * 6;
      superKids.laserCooldown -= dt;
      superKids.laserLife = Math.max(0, superKids.laserLife - dt);
      superKids.waveLabelLife = Math.max(0, superKids.waveLabelLife - dt);
      superKids.stageFlashLife = Math.max(0, superKids.stageFlashLife - dt);
      superKids.stageDwell += dt;
      const desiredPowerStage = Math.max(1, willPowerStage(superKids.overdrive));
      if (desiredPowerStage > superKids.powerStage && superKids.stageDwell >= 1.15) {
        superKids.powerStage++;
        superKids.stageDwell = 0;
        superKids.stageFlashLife = superKids.powerStage === 4 ? 2 : 1.35;
        playSound("will-power");
      }
      const comboWasActive = superKids.comboLife > 0;
      superKids.comboLife = Math.max(0, superKids.comboLife - dt);
      if (comboWasActive && superKids.comboLife === 0) {
        boostStatusNode.textContent = "WILLPOWER unleashed! Laser League is finishing the showroom siege.";
      }
      const heroAge = superKids.total - superKids.life;
      const overdriveReady = superKids.overdrive >= 100 && heroAge >= 6.2;
      if (!superKids.comboTriggered && (overdriveReady || heroAge >= 11.4)) {
        superKids.comboTriggered = true;
        chargeWillPower(100 - superKids.overdrive);
        superKids.comboLife = superKids.comboTotal;
        superKids.laserLife = 0;
        superKids.laserTarget = null;
        superKids.laserCooldown = superKids.comboTotal + 0.2;
        boostStatusNode.textContent = "WILLPOWER: MAX! Will is charging the Gravity Alley-Oop.";
        for (let index = 0; index < obstacles.length; index++) {
          const item = obstacles[index];
          if (item.heroBlast || !visibleToLaserLeague(item)) continue;
          item.heroBlast = 0.85;
          item.heroBlastTotal = 0.85;
          heroPoints += item.type === "sandy" ? 250 : 100;
        }
        for (let tag = 0; tag < 4; tag++) {
          collectibles.push({ x: W + 35 + tag * 68, y: 82 + tag % 2 * 84, w: 30, h: 42, phase: tag * 1.3 });
        }
        playSound("hero-combo");
      }
      if (superKids.comboLife <= 0 && superKids.laserCooldown <= 0) {
        let target = null;
        for (let index = 0; index < obstacles.length; index++) {
          const item = obstacles[index];
          const centerX = item.x + item.w / 2;
          if (
            !item.heroBlast
            && centerX > superKidsFrontX
            && visibleToLaserLeague(item)
            && (!target || item.x < target.x)
          ) target = item;
        }
        if (target) {
          target.heroBlast = 0.28;
          target.heroBlastTotal = 0.28;
          superKids.laserTarget = target;
          superKids.laserLife = 0.22;
          superKids.laserCooldown = 0.42;
          chargeWillPower(target.heroWave ? 14 : 10);
          heroPoints += target.type === "sandy" ? 250 : 100;
          playSound("laser");
        } else {
          superKids.laserCooldown = 0.08;
        }
      }
      if (superKids.life <= 0) {
        const completedVariant = superKids.variant;
        superKids = null;
        laserLeagueAppearances = Math.max(laserLeagueAppearances, completedVariant);
        if (completedVariant === 2) {
          laserLeagueFinale = { life: 3.8, total: 3.8, phase: 0, blastPlayed: false };
          boostStatusNode.textContent = "Will is going beyond maximum. Brace for one final blast!";
          playSound("will-finale");
        } else {
          firstLaserLeagueEndElapsed = elapsed;
          prepareCosmicOverdrive();
          gameCard.classList.remove("laser-league-active");
          boostStatusNode.textContent = "Laser League complete. Cosmic Overdrive may return later…";
        }
      }
    }

    const heroWorldScale = laserLeagueFinale ? 0 : superKids?.comboLife > 0 ? 0.32 : 1;
    let writeIndex = 0;
    for (let index = 0; index < obstacles.length; index++) {
      const item = obstacles[index];
      if (item.heroBlast) {
        item.heroBlast -= dt;
        item.phase += dt * 15;
        item.x -= speed * 0.12 * heroWorldScale * dt;
        if (item.heroBlast > 0) obstacles[writeIndex++] = item;
        continue;
      }
      item.x -= speed * (item.clearance ? 0.88 : 1) * heroWorldScale * dt;
      item.phase += dt * 8;
      if (item.clearance && !item.clearanceAwarded && item.x + item.w < player.x + 36) {
        item.clearanceAwarded = true;
        item.clearance = false;
        clearancePoints += 75;
        playSound("clearance");
        if (kamden?.target === item) kamden.target = null;
      }
      if (item.x + item.w > -20) {
        obstacles[writeIndex++] = item;
      } else if (item.type === "sandy" && item.tier === sandyPropTiers.length - 1) {
        if (!superKidsTriggered) {
          superKidsTriggered = true;
          superKidsPendingVariant = 1;
          superKidsPending = 0.65;
          boostStatusNode.textContent = "Level 50 cleared. Something super is approaching…";
        } else if (
          laserLeagueAppearances >= 1
          && !superKidsTwoTriggered
          && !superKids
          && !laserLeagueFinale
          && elapsed >= firstLaserLeagueEndElapsed + 28
        ) {
          superKidsTwoTriggered = true;
          superKidsPendingVariant = 2;
          superKidsPending = 0.8;
          boostStatusNode.textContent = "The portal is reopening. Cosmic Overdrive is inbound!";
        }
      }
    }
    obstacles.length = writeIndex;

    const vortexAnchor = superKids ? superKidsAnchors() : null;
    writeIndex = 0;
    for (let index = 0; index < collectibles.length; index++) {
      const item = collectibles[index];
      item.x -= speed * heroWorldScale * dt;
      item.phase += dt * 5;
      let vortexCaught = false;
      if (vortexAnchor && item.x + item.w / 2 > player.x + player.w) {
        const { vortexX, vortexY } = vortexAnchor;
        const distanceToVortex = Math.hypot(item.x + item.w / 2 - vortexX, item.y + item.h / 2 - vortexY);
        const orbitRadius = Math.min(30, distanceToVortex * 0.12);
        const orbitX = vortexX + Math.cos(item.phase * 0.72) * orbitRadius;
        const orbitY = vortexY + Math.sin(item.phase * 0.72) * orbitRadius * 0.7;
        const magnetStrength = Math.min(1, dt * 3.6);
        item.x += (orbitX - item.w / 2 - item.x) * magnetStrength;
        item.y += (orbitY - item.h / 2 - item.y) * magnetStrength;
        vortexCaught = distanceToVortex < 38;
      }
      if (intersects(player, item, 18) || vortexCaught) {
        tagCount++;
        const brendaBoosted = brendaBoost > 0;
        const laserLeagueBoosted = Boolean(superKids);
        tagPoints += brendaBoosted || laserLeagueBoosted ? 100 : 50;
        if (brendaBoosted) brendaBonusPoints += 50;
        else if (laserLeagueBoosted) laserLeagueTagBonusPoints += 50;
        if (superKids && vortexCaught) {
          superKids.captures++;
          chargeWillPower(6);
        }
        playSound("tag");
      } else if (item.x + item.w > -20) {
        collectibles[writeIndex++] = item;
      }
    }
    collectibles.length = writeIndex;
    writeIndex = 0;
    for (let index = 0; index < dust.length; index++) {
      const particle = dust[index];
      particle.x += particle.vx * dt;
      particle.life -= dt;
      if (particle.life > 0) dust[writeIndex++] = particle;
    }
    dust.length = writeIndex;

    writeIndex = 0;
    for (let index = 0; index < wallHelpers.length; index++) {
      const helper = wallHelpers[index];
      helper.x -= speed * 0.32 * dt;
      helper.phase += dt * 4;
      if (helper.x > -100) wallHelpers[writeIndex++] = helper;
    }
    wallHelpers.length = writeIndex;
    if (brenda) {
      brenda.life -= dt;
      brenda.phase += dt * 8;
      if (brenda.life <= 0) brenda = null;
    }
    if (kamden) {
      kamden.life -= dt;
      kamden.phase += dt * 7;
      if (kamden.life <= 0) kamden = null;
    }
    // Keep collisions centered on the couch instead of its decorative edges and
    // movers. This gives the long sprite a fair, readable clearance window.
    playerCollisionBox.x = player.x + 36;
    playerCollisionBox.y = player.y + 14;
    playerCollisionBox.w = player.w - 72;
    playerCollisionBox.h = 56;
    for (let index = 0; index < obstacles.length; index++) {
      const item = obstacles[index];
      let collided;
      if (!item.clearance) {
        collided = intersects(playerCollisionBox, item, 10);
      } else {
        const shrinkX = item.w * 0.1;
        const shrinkY = item.h * 0.1;
        clearanceCollisionBox.x = item.x + shrinkX;
        clearanceCollisionBox.y = item.y + shrinkY;
        clearanceCollisionBox.w = item.w - shrinkX * 2;
        clearanceCollisionBox.h = item.h - shrinkY * 2;
        collided = intersects(playerCollisionBox, clearanceCollisionBox, 10);
      }
      if (collided && recoveryGrace <= 0 && !superKids && !laserLeagueFinale && laserAftermathFlash <= 0 && laserAftermathGrace <= 0) {
        damageCouch(item);
        break;
      }
    }
    updateScore();
  }

  function updateScore() {
    const score = Math.floor(distance) + tagPoints + clearancePoints + heroPoints;
    const tags = brendaBoost > 0 || superKids ? `${tagCount} ×2` : String(tagCount);
    if (score !== displayedScore) {
      displayedScore = score;
      scoreNode.textContent = String(score).padStart(5, "0");
    }
    if (tags !== displayedTags) {
      displayedTags = tags;
      tagsNode.textContent = tags;
    }
  }

  function fillRoundedRect(targetContext, x, y, w, h, r, fill) {
    targetContext.beginPath();
    targetContext.roundRect(x, y, w, h, r);
    targetContext.fillStyle = fill;
    targetContext.fill();
  }

  function roundedRect(x, y, w, h, r, fill) {
    fillRoundedRect(ctx, x, y, w, h, r, fill);
  }

  function drawSpeechBubble(x, y, w, h, tailX, tailY) {
    const r = 16;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + w - 14, y + h);
    ctx.lineTo(tailX, tailY);
    ctx.lineTo(x + w - 40, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = "#fffdf6";
    ctx.fill();
    ctx.strokeStyle = colors.clay;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  function drawWallHelper(helper) {
    const x = helper.x;
    const base = ground;
    const bob = Math.sin(helper.phase) * 1.5;
    const headY = base - 60 + bob;
    const isWoman = helper.kind === "woman";

    ctx.save();
    ctx.globalAlpha = 0.62;

    if (isWoman) {
      roundedRect(x + 18, headY - 10, 24, 34, 10, "#5b4035");
    }
    ctx.fillStyle = "#d6a582";
    ctx.beginPath();
    ctx.arc(x + 30, headY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isWoman ? "#5b4035" : "#74503a";
    ctx.beginPath();
    ctx.arc(x + 30, headY - 4, 10, Math.PI, Math.PI * 2);
    ctx.fill();

    roundedRect(x + 17, base - 49 + bob, 26, 31, 8, helper.shirt);
    ctx.strokeStyle = "#596069";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + 24, base - 20);
    ctx.lineTo(x + 20, base);
    ctx.moveTo(x + 36, base - 20);
    ctx.lineTo(x + 41, base);
    ctx.stroke();

    ctx.strokeStyle = "#d6a582";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";

    if (helper.prop === "art") {
      // The art carrier is reaching up as if deciding where to hang it.
      ctx.beginPath();
      ctx.moveTo(x + 20, base - 43 + bob);
      ctx.lineTo(x + 12, base - 91 + bob);
      ctx.moveTo(x + 40, base - 43 + bob);
      ctx.lineTo(x + 48, base - 91 + bob);
      ctx.stroke();

      const frameY = base - 124 + bob;
      ctx.save();
      ctx.translate(x + 30, frameY + 17);
      ctx.rotate(Math.sin(helper.phase * 0.7) * 0.035);
      ctx.translate(-(x + 30), -(frameY + 17));
      ctx.fillStyle = "#8a6449";
      ctx.fillRect(x + 4, frameY, 52, 38);
      ctx.fillStyle = "#f7f1e8";
      ctx.fillRect(x + 9, frameY + 5, 42, 28);
      ctx.fillStyle = helper.art;
      ctx.fillRect(x + 13, frameY + 9, 34, 20);
      ctx.fillStyle = "rgba(255,255,255,.38)";
      ctx.beginPath();
      ctx.arc(x + 30, frameY + 19, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // All other accessories are carried at chest height with both hands.
      const cy = base - 39 + bob;
      ctx.beginPath();
      ctx.moveTo(x + 20, base - 42 + bob);
      ctx.lineTo(x + 11, cy);
      ctx.moveTo(x + 40, base - 42 + bob);
      ctx.lineTo(x + 49, cy);
      ctx.stroke();

      if (helper.prop === "pillow") {
        roundedRect(x + 8, cy - 13, 44, 27, 8, helper.art);
        ctx.fillStyle = "rgba(255,255,255,.34)";
        ctx.beginPath();
        ctx.arc(x + 30, cy, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (helper.prop === "vase") {
        ctx.fillStyle = helper.art;
        ctx.beginPath();
        ctx.moveTo(x + 24, cy - 15);
        ctx.lineTo(x + 36, cy - 15);
        ctx.lineTo(x + 39, cy + 11);
        ctx.quadraticCurveTo(x + 30, cy + 17, x + 21, cy + 11);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#527a72";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 27, cy - 15);
        ctx.lineTo(x + 22, cy - 27);
        ctx.moveTo(x + 32, cy - 15);
        ctx.lineTo(x + 36, cy - 28);
        ctx.stroke();
      } else if (helper.prop === "basket") {
        ctx.strokeStyle = "#9a6d3f";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + 30, cy - 4, 14, Math.PI, 0);
        ctx.stroke();
        roundedRect(x + 12, cy - 4, 36, 20, 5, "#b98b55");
        ctx.strokeStyle = "rgba(91,61,37,.4)";
        ctx.lineWidth = 1.5;
        for (let line = 18; line < 48; line += 7) {
          ctx.beginPath();
          ctx.moveTo(x + line, cy - 2);
          ctx.lineTo(x + line, cy + 14);
          ctx.stroke();
        }
      } else if (helper.prop === "plant") {
        ctx.fillStyle = "#557b65";
        [[30, -25, 7], [21, -18, 6], [39, -17, 6]].forEach(([dx, dy, radius]) => {
          ctx.beginPath();
          ctx.arc(x + dx, cy + dy, radius, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = "#a76f4e";
        ctx.beginPath();
        ctx.moveTo(x + 18, cy - 10);
        ctx.lineTo(x + 42, cy - 10);
        ctx.lineTo(x + 38, cy + 14);
        ctx.lineTo(x + 22, cy + 14);
        ctx.closePath();
        ctx.fill();
      } else if (helper.prop === "mirror") {
        ctx.fillStyle = "#b28a55";
        ctx.beginPath();
        ctx.ellipse(x + 30, cy - 4, 17, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#dce8e5";
        ctx.beginPath();
        ctx.ellipse(x + 30, cy - 4, 13, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.72)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 23, cy - 14);
        ctx.lineTo(x + 34, cy - 21);
        ctx.stroke();
      } else {
        // A small table lamp reads clearly against the pale showroom wall.
        ctx.fillStyle = helper.art;
        ctx.beginPath();
        ctx.moveTo(x + 18, cy - 21);
        ctx.lineTo(x + 42, cy - 21);
        ctx.lineTo(x + 47, cy - 5);
        ctx.lineTo(x + 13, cy - 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#6f655a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 30, cy - 5);
        ctx.lineTo(x + 30, cy + 12);
        ctx.moveTo(x + 21, cy + 13);
        ctx.lineTo(x + 39, cy + 13);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  let showroomWallDamageTile = null;
  let showroomFloorDamageTile = null;
  let showroomWallTile = null;
  let showroomDamagedWallTile = null;
  let showroomFloorTile = null;
  let cosmicBackdropLayer = null;
  let cosmicNebulaLayer = null;
  let cosmicStarsLayer = null;
  let cosmicOrbitLayer = null;
  let cosmicGridLayer = null;
  let laserFinaleBackdropLayer = null;

  function createCanvasLayer(width, height) {
    const layer = document.createElement("canvas");
    layer.width = width;
    layer.height = height;
    return layer;
  }

  function buildShowroomWallTile(damaged = false) {
    const layer = createCanvasLayer(960, ground);
    const layerContext = layer.getContext("2d", { alpha: false });
    layerContext.fillStyle = "#f8f1e8";
    layerContext.fillRect(0, 0, layer.width, layer.height);
    layerContext.fillStyle = "#fffaf4";
    layerContext.fillRect(0, 0, layer.width, 240);

    for (let frameIndex = 0; frameIndex < 4; frameIndex++) {
      const centerX = frameIndex * 240 + 120;
      const crookedAngle = damaged ? Math.sin(frameIndex * 2.3 + 0.7) * 0.11 : 0;
      layerContext.save();
      layerContext.translate(centerX, 96);
      layerContext.rotate(crookedAngle);
      layerContext.strokeStyle = "#d8cec2";
      layerContext.lineWidth = 8;
      layerContext.strokeRect(-75, -54, 150, 108);
      layerContext.fillStyle = frameIndex % 2 ? "#d9b69e" : "#97b1aa";
      layerContext.fillRect(-63, -42, 126, 84);
      layerContext.fillStyle = "rgba(255,255,255,.36)";
      layerContext.beginPath();
      layerContext.arc(0, -3, 26, 0, Math.PI * 2);
      layerContext.fill();
      if (damaged && frameIndex % 3 === 0) {
        layerContext.strokeStyle = "rgba(38,31,29,.62)";
        layerContext.lineWidth = 2;
        layerContext.beginPath();
        layerContext.moveTo(-56, -35);
        layerContext.lineTo(42, 32);
        layerContext.moveTo(12, -38);
        layerContext.lineTo(-32, 36);
        layerContext.stroke();
      }
      layerContext.restore();
    }

    const signCenter = 720;
    fillRoundedRect(layerContext, signCenter - 82, 166, 164, 46, 9, "#d8cec2");
    fillRoundedRect(layerContext, signCenter - 77, 171, 154, 36, 6, "#fffdf6");
    layerContext.fillStyle = colors.forest;
    layerContext.font = "700 14px Poppins, sans-serif";
    layerContext.textAlign = "center";
    layerContext.fillText("LOADING BAY", signCenter - 9, 195);
    layerContext.strokeStyle = colors.forest;
    layerContext.lineWidth = 3;
    layerContext.lineCap = "round";
    layerContext.beginPath();
    layerContext.moveTo(signCenter + 47, 189);
    layerContext.lineTo(signCenter + 66, 189);
    layerContext.lineTo(signCenter + 59, 183);
    layerContext.moveTo(signCenter + 66, 189);
    layerContext.lineTo(signCenter + 59, 195);
    layerContext.stroke();
    return layer;
  }

  function buildShowroomFloorTile() {
    const layer = createCanvasLayer(900, H - ground);
    const layerContext = layer.getContext("2d", { alpha: false });
    layerContext.fillStyle = colors.sand;
    layerContext.fillRect(0, 0, layer.width, layer.height);
    layerContext.fillStyle = "#cfc0b0";
    layerContext.fillRect(0, 0, layer.width, 7);
    layerContext.strokeStyle = "rgba(138,76,54,.13)";
    layerContext.lineWidth = 2;
    for (let x = 0; x <= layer.width; x += 90) {
      layerContext.beginPath();
      layerContext.moveTo(x, 7);
      layerContext.lineTo(x - 25, layer.height);
      layerContext.stroke();
    }
    return layer;
  }

  function buildBaseShowroomLayers() {
    if (!showroomWallTile) showroomWallTile = buildShowroomWallTile(false);
    if (!showroomFloorTile) showroomFloorTile = buildShowroomFloorTile();
  }

  function buildDamagedShowroomWallTile() {
    if (!showroomDamagedWallTile) showroomDamagedWallTile = buildShowroomWallTile(true);
  }

  function buildShowroomWallDamageTile() {
    if (showroomWallDamageTile) return;
    showroomWallDamageTile = createCanvasLayer(960, ground);
    const wallContext = showroomWallDamageTile.getContext("2d");
    for (let scorch = 0; scorch < 5; scorch++) {
      const x = 82 + scorch * 202 + Math.sin(scorch * 4.2) * 29;
      const y = 72 + (scorch % 2) * 94;
      const soot = wallContext.createRadialGradient(x, y, 3, x, y, 58 + scorch % 3 * 13);
      soot.addColorStop(0, "rgba(29,27,31,.48)");
      soot.addColorStop(0.48, "rgba(61,52,53,.22)");
      soot.addColorStop(1, "rgba(42,37,42,0)");
      wallContext.fillStyle = soot;
      wallContext.fillRect(x - 85, y - 85, 170, 170);
    }
    wallContext.strokeStyle = "rgba(74,57,53,.72)";
    wallContext.lineWidth = 2.2;
    for (let crack = 0; crack < 8; crack++) {
      const rootX = 54 + crack * 124;
      const rootY = 31 + crack % 3 * 61;
      for (let branch = 0; branch < 4; branch++) {
        const angle = branch * 1.45 + crack * 0.7;
        wallContext.beginPath();
        wallContext.moveTo(rootX, rootY);
        wallContext.lineTo(rootX + Math.cos(angle) * 19, rootY + Math.sin(angle) * 18);
        wallContext.lineTo(rootX + Math.cos(angle + 0.24) * 37, rootY + Math.sin(angle + 0.24) * 34);
        wallContext.stroke();
      }
    }
  }

  function buildShowroomFloorDamageTile() {
    if (showroomFloorDamageTile) return;
    showroomFloorDamageTile = createCanvasLayer(960, H);
    const floorContext = showroomFloorDamageTile.getContext("2d");
    for (let debris = 0; debris < 13; debris++) {
      const x = 35 + debris * 76 + Math.sin(debris * 2.7) * 14;
      const y = ground + 12 + (debris * 31 % 68);
      floorContext.fillStyle = debris % 3 === 0 ? "#6a5e5b" : debris % 2 ? "#9b765f" : "#4f5965";
      floorContext.save();
      floorContext.translate(x, y);
      floorContext.rotate(debris * 0.83);
      floorContext.fillRect(-5 - debris % 4, -2, 10 + debris % 8, 4 + debris % 5);
      floorContext.restore();
    }
    floorContext.strokeStyle = "rgba(60,51,49,.8)";
    floorContext.lineWidth = 5;
    floorContext.beginPath();
    floorContext.moveTo(20, ground + 5);
    floorContext.quadraticCurveTo(230, ground - 18, 420, ground + 7);
    floorContext.quadraticCurveTo(650, ground + 26, 940, ground - 2);
    floorContext.stroke();
  }

  function buildCosmicBackdropLayers() {
    if (cosmicBackdropLayer && cosmicNebulaLayer && cosmicStarsLayer && laserFinaleBackdropLayer) return;
    cosmicBackdropLayer = createCanvasLayer(W, H);
    const backdropContext = cosmicBackdropLayer.getContext("2d");
    const arenaGradient = backdropContext.createLinearGradient(0, 0, 0, H);
    arenaGradient.addColorStop(0, "#05041d");
    arenaGradient.addColorStop(0.55, "#15105a");
    arenaGradient.addColorStop(1, "#030615");
    backdropContext.fillStyle = arenaGradient;
    backdropContext.fillRect(0, 0, W, H);
    cosmicNebulaLayer = createCanvasLayer(W, H);
    const nebulaContext = cosmicNebulaLayer.getContext("2d");
    const nebula = nebulaContext.createRadialGradient(480, 150, 20, 480, 150, 390);
    nebula.addColorStop(0, "rgba(57,230,255,.34)");
    nebula.addColorStop(0.45, "rgba(111,45,255,.24)");
    nebula.addColorStop(1, "rgba(4,2,24,0)");
    nebulaContext.fillStyle = nebula;
    nebulaContext.fillRect(0, 0, W, H);

    cosmicStarsLayer = createCanvasLayer(W, H);
    const starsContext = cosmicStarsLayer.getContext("2d");
    for (let star = 0; star < 56; star++) {
      const x = (star * 157 + 43) % W;
      const y = (star * 83 + 29) % 252;
      starsContext.globalAlpha = 0.35 + Math.sin(star) * 0.25;
      starsContext.fillStyle = star % 5 ? "#9fefff" : "#ffffff";
      starsContext.beginPath();
      starsContext.arc(x, y, 1 + star % 3 * 0.65, 0, Math.PI * 2);
      starsContext.fill();
    }
    starsContext.globalAlpha = 1;

    laserFinaleBackdropLayer = createCanvasLayer(W, H);
    const finaleContext = laserFinaleBackdropLayer.getContext("2d", { alpha: false });
    const finaleGradient = finaleContext.createLinearGradient(0, 0, W, H);
    finaleGradient.addColorStop(0, "#06031d");
    finaleGradient.addColorStop(0.55, "#15126a");
    finaleGradient.addColorStop(1, "#03020d");
    finaleContext.fillStyle = finaleGradient;
    finaleContext.fillRect(0, 0, W, H);
  }

  function buildCosmicOrbitLayer() {
    if (cosmicOrbitLayer) return;
    cosmicOrbitLayer = createCanvasLayer(W, H);
    const orbitContext = cosmicOrbitLayer.getContext("2d");
    orbitContext.strokeStyle = "#8b6dff";
    orbitContext.lineWidth = 2.5;
    for (let ring = 0; ring < 4; ring++) {
      orbitContext.beginPath();
      orbitContext.ellipse(480, 150, 210 + ring * 76, 56 + ring * 25, -0.08 + ring * 0.035, 0, Math.PI * 2);
      orbitContext.stroke();
    }
  }

  function buildCosmicGridLayer() {
    if (cosmicGridLayer) return;
    cosmicGridLayer = createCanvasLayer(W, H);
    const gridContext = cosmicGridLayer.getContext("2d");
    const horizon = 262;
    gridContext.strokeStyle = "#36dfff";
    gridContext.lineWidth = 2;
    for (let line = 0; line < 9; line++) {
      const y = horizon + Math.pow(line / 8, 1.55) * (H - horizon);
      gridContext.beginPath();
      gridContext.moveTo(0, y);
      gridContext.lineTo(W, y);
      gridContext.stroke();
    }
    for (let line = -8; line <= 8; line++) {
      gridContext.beginPath();
      gridContext.moveTo(480, horizon);
      gridContext.lineTo(480 + line * 105, H);
      gridContext.stroke();
    }
  }

  function drawRepeatingLayer(layer, scroll, y) {
    for (let x = -scroll; x < W; x += layer.width) ctx.drawImage(layer, x, y);
  }

  function drawShowroom() {
    const wallLayer = showroomDamaged && showroomDamagedWallTile ? showroomDamagedWallTile : showroomWallTile;
    const wallScroll = (distance * 6) % 960;
    drawRepeatingLayer(wallLayer, wallScroll, 0);

    wallHelpers.forEach(drawWallHelper);
    const floorScroll = (distance * 10) % showroomFloorTile.width;
    drawRepeatingLayer(showroomFloorTile, floorScroll, ground);

    if (showroomDamaged && showroomWallDamageTile && showroomFloorDamageTile) {
      const wallDamageScroll = (distance * 6) % 960;
      drawRepeatingLayer(showroomWallDamageTile, wallDamageScroll, 0);
      const floorDamageScroll = (distance * 10) % 960;
      drawRepeatingLayer(showroomFloorDamageTile, floorDamageScroll, 0);
    }

  }

  function drawBrenda() {
    if (!brenda) return;
    const enter = Math.min(1, (brenda.total - brenda.life) / 0.45);
    const exit = brenda.life < 0.55 ? 1 - brenda.life / 0.55 : 0;
    const eased = 1 - Math.pow(1 - enter, 3);
    const x = W - 72 + (1 - eased) * 120 + exit * 125;
    const base = ground;
    const bob = Math.sin(brenda.phase) * 2;
    const wave = Math.sin(brenda.phase * 1.35) * 5;

    ctx.save();
    ctx.globalAlpha = Math.min(1, enter * 1.5, brenda.life * 2);

    // A connected comic bubble keeps the callout visually attached to Brenda.
    drawSpeechBubble(x - 250, 130, 232, 66, x - 8, base - 88);
    ctx.fillStyle = colors.clay;
    ctx.font = "800 16px Poppins, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("LET'S MOVE THAT COUCH!", x - 134, 158);
    ctx.fillStyle = colors.dark;
    ctx.font = "700 11px Poppins, sans-serif";
    ctx.fillText("BRENDA BOOST · TAGS ×2", x - 134, 180);

    // Her smaller scale makes the short, high-energy silhouette intentional.
    ctx.save();
    ctx.translate(x, base);
    ctx.scale(0.84, 0.84);
    ctx.translate(-x, -base);

    // Sound-wave marks sell her big voice without requiring audio.
    ctx.strokeStyle = "#d5a856";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    [
      [-28, -4, -52, -18], [-31, 7, -58, 7], [-28, 18, -52, 32],
      [28, -4, 52, -18], [31, 7, 58, 7], [28, 18, 52, 32],
    ].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x + x1, base - 93 + y1);
      ctx.lineTo(x + x2, base - 93 + y2);
      ctx.stroke();
    });

    // Wavy highlighted hair, expressive hands, and a yellow striped top echo
    // the supplied photos while staying in the game's illustrated style.
    ctx.fillStyle = "#8b654b";
    [[-12, -75], [-15, -65], [-9, -84], [8, -84], [14, -74], [15, -63]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(x + dx, base + dy + bob, 9, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#e8c6a6";
    ctx.beginPath();
    ctx.arc(x, base - 70 + bob, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#332b28";
    ctx.beginPath();
    ctx.arc(x - 5, base - 72 + bob, 1.5, 0, Math.PI * 2);
    ctx.arc(x + 5, base - 72 + bob, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a4c36";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, base - 66 + bob, 6, 0.15, Math.PI - 0.15);
    ctx.stroke();

    roundedRect(x - 18, base - 55 + bob, 36, 36, 9, "#e5b82f");
    ctx.fillStyle = "#fffdf6";
    ctx.fillRect(x - 17, base - 48 + bob, 34, 6);
    ctx.fillRect(x - 17, base - 34 + bob, 34, 6);

    ctx.strokeStyle = "#e8c6a6";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x - 14, base - 48 + bob);
    ctx.lineTo(x - 29, base - 68 + wave);
    ctx.moveTo(x + 14, base - 48 + bob);
    ctx.lineTo(x + 31, base - 72 - wave);
    ctx.stroke();
    [x - 30, x + 32].forEach((handX) => {
      ctx.fillStyle = "#e8c6a6";
      ctx.beginPath();
      ctx.arc(handX, base - 72 + (handX < x ? wave : -wave), 5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = "#315f91";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x - 8, base - 20);
    ctx.lineTo(x - 10 + wave * 0.2, base - 2);
    ctx.moveTo(x + 8, base - 20);
    ctx.lineTo(x + 11 - wave * 0.2, base - 2);
    ctx.stroke();
    roundedRect(x - 16 + wave * 0.2, base - 5, 12, 6, 2, "#e8c6a6");
    roundedRect(x + 6 - wave * 0.2, base - 5, 12, 6, 2, "#e8c6a6");
    ctx.restore();
    ctx.restore();
  }

  function drawKamden() {
    if (!kamden) return;
    const enter = Math.min(1, (kamden.total - kamden.life) / 0.45);
    const exit = kamden.life < 0.55 ? 1 - kamden.life / 0.55 : 0;
    const eased = 1 - Math.pow(1 - enter, 3);
    const x = W - 82 + (1 - eased) * 125 + exit * 130;
    const base = ground;
    const bob = Math.sin(kamden.phase) * 1.5;

    ctx.save();
    ctx.globalAlpha = Math.min(1, enter * 1.5, kamden.life * 2);

    drawSpeechBubble(x - 264, 130, 242, 66, x - 9, base - 83);
    ctx.fillStyle = colors.clay;
    ctx.font = "800 15px Poppins, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("I'LL MAKE SOME ROOM!", x - 143, 158);
    ctx.fillStyle = colors.dark;
    ctx.font = "700 11px Poppins, sans-serif";
    ctx.fillText("KAMDEN CLEARANCE · +75", x - 143, 180);

    // Long dark hair and a black shirt echo Kamden's portrait while the bright
    // green pricing gun gives her an unmistakable gameplay silhouette.
    ctx.fillStyle = "#181719";
    ctx.beginPath();
    ctx.arc(x, base - 71 + bob, 18, Math.PI, Math.PI * 2);
    ctx.fill();
    roundedRect(x - 18, base - 73 + bob, 8, 42, 4, "#181719");
    roundedRect(x + 10, base - 73 + bob, 8, 42, 4, "#181719");

    ctx.fillStyle = "#efc5a6";
    ctx.beginPath();
    ctx.arc(x, base - 67 + bob, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#332b28";
    ctx.beginPath();
    ctx.arc(x - 5, base - 69 + bob, 1.4, 0, Math.PI * 2);
    ctx.arc(x + 5, base - 69 + bob, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a4c36";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(x, base - 63 + bob, 5, 0.15, Math.PI - 0.15);
    ctx.stroke();

    roundedRect(x - 17, base - 52 + bob, 34, 35, 8, "#202124");
    ctx.strokeStyle = "#315f91";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 7, base - 18);
    ctx.lineTo(x - 10, base - 2);
    ctx.moveTo(x + 7, base - 18);
    ctx.lineTo(x + 11, base - 2);
    ctx.stroke();

    // Kamden aims the pricing gun toward the marked obstacle.
    ctx.strokeStyle = "#efc5a6";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - 13, base - 44 + bob);
    ctx.lineTo(x - 34, base - 50 + bob);
    ctx.stroke();
    ctx.save();
    ctx.translate(x - 43, base - 52 + bob);
    ctx.rotate(-0.08);
    ctx.scale(0.8, 0.8);
    roundedRect(-14, -8, 27, 16, 4, "#3f8a5b");
    ctx.fillStyle = "#2e6f48";
    ctx.fillRect(-20, -4, 8, 8);
    ctx.beginPath();
    ctx.moveTo(1, 7);
    ctx.lineTo(10, 7);
    ctx.lineTo(6, 19);
    ctx.lineTo(-2, 19);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d9f0df";
    ctx.fillRect(-7, -3, 12, 6);
    ctx.restore();
    ctx.restore();
  }

  function drawKamdenClearanceSticker(item) {
    if (!item.clearance) return;
    const stickerX = item.x + item.w * 0.58;
    const stickerY = Math.max(45, item.y + 13);
    const stickerAge = kamden ? kamden.total - kamden.life : 1;
    const land = Math.min(1, stickerAge / 0.38);
    const easedLand = 1 - Math.pow(1 - land, 3);
    const landingWobble = Math.sin(land * Math.PI * 3) * (1 - land) * 0.24;
    ctx.save();
    ctx.translate(stickerX, stickerY - (1 - easedLand) * 28);
    ctx.rotate(-0.16 - (1 - easedLand) * 0.34 + landingWobble);
    roundedRect(-31, -11, 62, 22, 5, "#3f8a5b");
    ctx.fillStyle = "#fffdf6";
    ctx.font = "800 8px Poppins, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CLEARANCE", 0, 3);
    ctx.restore();
  }

  function drawMover(x, y, shirt, hair, step, pants = colors.charcoal, beard = false, tall = false, longHair = false, shoes = "#242424", baldStubble = false, smiling = true) {
    if (longHair && hair) {
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(x, y - 1, 17, 0, Math.PI * 2);
      ctx.fill();
      roundedRect(x - 17, y - 2, 8, 36, 4, hair);
      roundedRect(x + 9, y - 2, 8, 36, 4, hair);
    }
    ctx.fillStyle = "#efbf9d";
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    if (hair) {
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(x, y - 5, 14, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    if (baldStubble) {
      ctx.fillStyle = "#181818";
      [[-10, -8], [-6, -11], [-2, -12], [2, -12], [6, -11], [10, -8], [-12, -4], [-8, -7], [-4, -9], [0, -10], [4, -9], [8, -7], [12, -4]].forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, 0.8, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.fillStyle = "#332b28";
    ctx.beginPath();
    ctx.arc(x - 4.5, y - 1.5, 1.4, 0, Math.PI * 2);
    ctx.arc(x + 4.5, y - 1.5, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6a4740";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (smiling) {
      ctx.arc(x, y + 3, 4.5, 0.25, Math.PI - 0.25);
    } else {
      ctx.moveTo(x - 4, y + 5);
      ctx.lineTo(x + 4, y + 5);
    }
    ctx.stroke();
    if (beard) {
      ctx.fillStyle = "#181818";
      [[-9, 5], [9, 5], [-8, 7], [-5, 8], [-2, 9], [2, 9], [5, 8], [8, 7], [-5, 11], [-2, 12], [2, 12], [5, 11]].forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, 0.9, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    roundedRect(x - 14, y + 12, 28, tall ? 39 : 35, 8, shirt);
    ctx.strokeStyle = pants;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 6, y + (tall ? 49 : 45));
    ctx.lineTo(x - 10 + step, y + (tall ? 76 : 68));
    ctx.moveTo(x + 6, y + (tall ? 49 : 45));
    ctx.lineTo(x + 12 - step, y + (tall ? 76 : 68));
    ctx.stroke();
    const footY = y + (tall ? 76 : 68);
    roundedRect(x - 15 + step, footY - 3, 11, 5, 2, shoes);
    roundedRect(x + 7 - step, footY - 3, 11, 5, 2, shoes);
  }

  function drawCarrierGrip(shoulderX, shoulderY, handX, handY, sleeve) {
    const elbowX = shoulderX + (handX - shoulderX) * 0.55;
    const elbowY = shoulderY + (handY - shoulderY) * 0.55;
    ctx.strokeStyle = sleeve;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.stroke();
    ctx.strokeStyle = "#efbf9d";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(handX, handY);
    ctx.stroke();
    ctx.fillStyle = "#efbf9d";
    ctx.beginPath();
    ctx.arc(handX, handY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCouchDamage(x, y) {
    const damageStage = maxCouchCondition - couchCondition;
    if (damageStage < 1) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#31564f";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + 70, y + 18);
    ctx.lineTo(x + 76, y + 23);
    ctx.lineTo(x + 72, y + 29);
    ctx.lineTo(x + 82, y + 33);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,240,218,.72)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 53, y + 45);
    ctx.lineTo(x + 67, y + 42);
    ctx.moveTo(x + 57, y + 51);
    ctx.lineTo(x + 72, y + 48);
    ctx.stroke();

    if (damageStage >= 2) {
      ctx.save();
      ctx.translate(x + 118, y + 45);
      ctx.rotate(0.13);
      roundedRect(-29, -10, 58, 22, 7, "#466f67");
      ctx.strokeStyle = "#31564f";
      ctx.lineWidth = 2;
      ctx.strokeRect(-22, 7, 42, 1);
      ctx.restore();

      ctx.fillStyle = "#f5e1c3";
      [[137, 46, 5], [143, 49, 4], [138, 53, 4], [147, 54, 3]].forEach(([offsetX, offsetY, radius]) => {
        ctx.beginPath();
        ctx.arc(x + offsetX, y + offsetY, radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.strokeStyle = "#46555a";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x + 137, y + 55);
      ctx.lineTo(x + 141, y + 59);
      ctx.lineTo(x + 137, y + 63);
      ctx.lineTo(x + 142, y + 67);
      ctx.stroke();

      const springPeek = Math.max(0, (Math.sin(elapsed * 1.7) - 0.74) / 0.26);
      if (springPeek > 0) {
        const springHeight = 4 + springPeek * 15;
        ctx.save();
        ctx.translate(x + 143, y + 52);
        ctx.rotate(0.38);
        ctx.strokeStyle = "#5d6264";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let coil = 1; coil <= 6; coil++) {
          ctx.lineTo((coil % 2 ? -3 : 3), -springHeight * coil / 7);
        }
        ctx.lineTo(0, -springHeight);
        ctx.stroke();
        ctx.fillStyle = "#d5a856";
        ctx.beginPath();
        ctx.arc(0, -springHeight - 2, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (damageStage >= 3) {
      ctx.strokeStyle = "#283f3b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 96, y + 30);
      ctx.lineTo(x + 91, y + 40);
      ctx.lineTo(x + 99, y + 49);
      ctx.lineTo(x + 93, y + 62);
      ctx.stroke();
      ctx.fillStyle = "#f5e1c3";
      for (let tuft = 0; tuft < 5; tuft++) {
        ctx.beginPath();
        ctx.arc(x + 86 + tuft * 6, y + 57 + (tuft % 2) * 4, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPlayer() {
    const bounce = player.grounded ? Math.sin(elapsed * 13) * 2 : 0;
    const y = player.y + bounce;
    const step = player.grounded ? Math.sin(elapsed * 13) * 5 : 0;
    drawMover(player.x + 8, y + 20, "#202124", "#4a332b", step, "#4a505a", false, false, true);
    drawMover(player.x + 182, y + 20, "#c7c9cb", null, -step, "#315f91", false, false, false, "#b98d62", false, true);

    const couchCenterX = player.x + 96;
    const couchCenterY = y + 42;
    ctx.save();
    ctx.translate(couchCenterX, couchCenterY);
    ctx.rotate(0.055 + (couchCondition === 0 ? 0.12 : 0));
    ctx.translate(-couchCenterX, -couchCenterY);
    roundedRect(player.x + 30, y + 23, 130, 49, 13, "#6f998f");
    roundedRect(player.x + 43, y + 8, 104, 43, 15, "#527a72");
    roundedRect(player.x + 21, y + 32, 24, 42, 10, "#527a72");
    roundedRect(player.x + 147, y + 32, 24, 42, 10, "#527a72");
    ctx.fillStyle = colors.dark;
    ctx.fillRect(player.x + 44, y + 70, 9, 10);
    ctx.fillRect(player.x + 139, y + 70, 9, 10);
    ctx.fillStyle = colors.cream;
    ctx.beginPath();
    ctx.arc(player.x + 95, y + 38, 5, 0, Math.PI * 2);
    ctx.fill();
    drawCouchDamage(player.x, y);
    ctx.restore();
    drawCarrierGrip(player.x + 18, y + 45, player.x + 28, y + 49, "#202124");
    drawCarrierGrip(player.x + 172, y + 45, player.x + 164, y + 51, "#c7c9cb");
  }

  function drawGlasses(x, y, scale = 1) {
    ctx.strokeStyle = "#202124";
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath();
    ctx.arc(x - 6 * scale, y, 5 * scale, 0, Math.PI * 2);
    ctx.moveTo(x + 11 * scale, y);
    ctx.arc(x + 6 * scale, y, 5 * scale, 0, Math.PI * 2);
    ctx.moveTo(x - scale, y);
    ctx.lineTo(x + scale, y);
    ctx.stroke();
  }

  function drawCustomer(item) {
    const isChild = item.variant === "child";
    const scale = isChild ? 0.72 : 1;
    const bob = Math.sin(item.phase) * 2;
    const base = item.y + item.h;
    const x = item.x + item.w / 2;
    const headY = base - 63 * scale + bob;
    const shirtColors = ["#668aa0", "#b56f58", "#62806f", "#8e6f91"];
    const pantColors = ["#334d67", "#4c4a48", "#6c5745", "#374f47"];
    const skinTones = ["#efbf9d", "#d99b74", "#9b684e", "#f0c9ad"];
    const shirt = shirtColors[item.palette];
    const pants = pantColors[item.palette];
    const skin = skinTones[item.palette];
    const isOld = item.variant.startsWith("old");
    const isWoman = item.variant.endsWith("woman");
    const hair = isOld ? "#d7d2ca" : ["#6b3a25", "#30251f", "#b47a42", "#7a4a2b"][item.palette];

    if (isWoman) {
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(x, headY - 2 * scale, 14 * scale, Math.PI, Math.PI * 2);
      ctx.fill();
      if (isOld) {
        ctx.beginPath();
        ctx.arc(x + 10 * scale, headY - 10 * scale, 6 * scale, 0, Math.PI * 2);
        ctx.fill();
      } else {
        roundedRect(x + 9 * scale, headY - 5 * scale, 7 * scale, 25 * scale, 3 * scale, hair);
      }
    }

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x, headY, 13 * scale, 0, Math.PI * 2);
    ctx.fill();

    if (!isWoman) {
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(x, headY - 5 * scale, 13 * scale, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    if (isChild) {
      ctx.fillStyle = "#d5a856";
      ctx.beginPath();
      ctx.arc(x, headY - 5 * scale, 14 * scale, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x, headY - 6 * scale, 14 * scale, 4 * scale);
    }
    if (isOld) drawGlasses(x, headY, scale);

    roundedRect(x - 16 * scale, base - 49 * scale + bob, 32 * scale, 34 * scale, 9 * scale, shirt);
    ctx.strokeStyle = pants;
    ctx.lineWidth = 6 * scale;
    ctx.lineCap = "round";
    const step = Math.sin(item.phase) * 5 * scale;
    ctx.beginPath();
    ctx.moveTo(x - 7 * scale, base - 17 * scale);
    ctx.lineTo(x - 10 * scale + step, base);
    ctx.moveTo(x + 7 * scale, base - 17 * scale);
    ctx.lineTo(x + 10 * scale - step, base);
    ctx.stroke();

    if (isOld && !isChild) {
      ctx.strokeStyle = "#8a6449";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 20, base - 34);
      ctx.lineTo(x + 23, base);
      ctx.stroke();
    }
  }

  function drawFamily(item) {
    const basePalette = item.palette % 4;
    drawCustomer({
      x: item.x,
      y: item.y,
      w: 34,
      h: 70,
      variant: "young-man",
      palette: basePalette,
      phase: item.phase,
    });
    drawCustomer({
      x: item.x + 58,
      y: item.y,
      w: 34,
      h: 70,
      variant: "young-woman",
      palette: (basePalette + 2) % 4,
      phase: item.phase + 0.9,
    });
    drawCustomer({
      x: item.x + 31,
      y: item.y + 18,
      w: 30,
      h: 52,
      variant: "child",
      palette: (basePalette + 1) % 4,
      phase: item.phase + 1.8,
    });
  }

  function drawSandySpectacle(prop, x, y) {
    const wheel = (cx, cy, r = 8) => {
      ctx.fillStyle = colors.dark;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b9c5c8";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
    };
    const window = (cx, cy, r = 6) => {
      ctx.fillStyle = "#bfe2e6";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#315f68";
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    const flame = (fx, fy) => {
      ctx.fillStyle = "#f1c15b";
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx - 8, fy + 15);
      ctx.lineTo(fx + 8, fy + 15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#d66c57";
      ctx.beginPath();
      ctx.moveTo(fx, fy + 3);
      ctx.lineTo(fx - 4, fy + 13);
      ctx.lineTo(fx + 4, fy + 13);
      ctx.closePath();
      ctx.fill();
    };

    switch (prop) {
      case "grandfather-clock":
        roundedRect(x + 8, y + 2, 49, 76, 7, "#7d5136");
        roundedRect(x + 14, y + 9, 37, 28, 18, "#fff4d7");
        ctx.strokeStyle = colors.dark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 32, y + 23, 11, 0, Math.PI * 2);
        ctx.moveTo(x + 32, y + 23);
        ctx.lineTo(x + 32, y + 15);
        ctx.moveTo(x + 32, y + 23);
        ctx.lineTo(x + 39, y + 27);
        ctx.stroke();
        ctx.fillStyle = "#d5a856";
        ctx.beginPath();
        ctx.arc(x + 32, y + 58, 7, 0, Math.PI * 2);
        ctx.fill();
        return true;
      case "four-poster-bed":
        roundedRect(x + 5, y + 39, 112, 31, 8, "#8e6f91");
        roundedRect(x + 12, y + 29, 105, 24, 9, "#fff5df");
        ctx.fillStyle = "#7d5136";
        [4, 112].forEach((px) => ctx.fillRect(x + px, y + 6, 7, 73));
        ctx.fillRect(x + 4, y + 7, 115, 6);
        ctx.fillStyle = "rgba(229,184,47,.35)";
        ctx.fillRect(x + 12, y + 13, 99, 18);
        return true;
      case "hot-tub":
        roundedRect(x + 2, y + 35, 120, 40, 14, "#83a7aa");
        roundedRect(x + 8, y + 28, 108, 28, 14, "#bfe2e6");
        ctx.fillStyle = "rgba(255,255,255,.8)";
        [23, 47, 72, 96].forEach((bx, i) => {
          ctx.beginPath();
          ctx.arc(x + bx, y + 39 + (i % 2) * 5, 4, 0, Math.PI * 2);
          ctx.fill();
        });
        return true;
      case "motorcycle":
        wheel(x + 25, y + 67, 12);
        wheel(x + 101, y + 67, 12);
        ctx.strokeStyle = "#b54f3f";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(x + 25, y + 67);
        ctx.lineTo(x + 55, y + 43);
        ctx.lineTo(x + 76, y + 67);
        ctx.lineTo(x + 101, y + 67);
        ctx.moveTo(x + 55, y + 43);
        ctx.lineTo(x + 87, y + 38);
        ctx.stroke();
        roundedRect(x + 45, y + 32, 39, 17, 8, "#d66c57");
        return true;
      case "food-truck":
        roundedRect(x - 2, y + 19, 143, 52, 8, "#d77a61");
        roundedRect(x + 12, y + 28, 65, 27, 4, "#fff5df");
        roundedRect(x + 90, y + 28, 36, 23, 4, "#bfe2e6");
        ctx.fillStyle = "#fffdf6";
        ctx.font = "700 11px Poppins, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("SNACKS", x + 45, y + 46);
        wheel(x + 29, y + 73, 9);
        wheel(x + 116, y + 73, 9);
        return true;
      case "sailboat":
        ctx.fillStyle = "#315f91";
        ctx.beginPath();
        ctx.moveTo(x - 4, y + 57);
        ctx.lineTo(x + 139, y + 57);
        ctx.quadraticCurveTo(x + 113, y + 80, x + 27, y + 77);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#7d5136";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x + 68, y + 7);
        ctx.lineTo(x + 68, y + 59);
        ctx.stroke();
        ctx.fillStyle = "#fff5df";
        ctx.beginPath();
        ctx.moveTo(x + 64, y + 10);
        ctx.lineTo(x + 13, y + 53);
        ctx.lineTo(x + 64, y + 53);
        ctx.closePath();
        ctx.fill();
        return true;
      case "monster-truck":
        wheel(x + 31, y + 66, 17);
        wheel(x + 125, y + 66, 17);
        roundedRect(x + 7, y + 31, 138, 31, 8, "#5f8f64");
        roundedRect(x + 50, y + 14, 69, 31, 8, "#47714e");
        roundedRect(x + 60, y + 20, 24, 17, 4, "#bfe2e6");
        roundedRect(x + 89, y + 20, 22, 17, 4, "#bfe2e6");
        return true;
      case "helicopter":
        ctx.fillStyle = "#d66c57";
        ctx.beginPath();
        ctx.ellipse(x + 73, y + 45, 52, 25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 25, y + 42);
        ctx.lineTo(x - 4, y + 25);
        ctx.lineTo(x + 8, y + 53);
        ctx.closePath();
        ctx.fill();
        roundedRect(x + 67, y + 28, 31, 22, 10, "#bfe2e6");
        ctx.strokeStyle = colors.dark;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x + 70, y + 19);
        ctx.lineTo(x + 70, y + 8);
        ctx.moveTo(x + 15, y + 7);
        ctx.lineTo(x + 126, y + 7);
        ctx.moveTo(x + 38, y + 67);
        ctx.lineTo(x + 107, y + 67);
        ctx.stroke();
        return true;
      case "submarine":
        ctx.fillStyle = "#d5a856";
        ctx.beginPath();
        ctx.ellipse(x + 78, y + 49, 76, 28, 0, 0, Math.PI * 2);
        ctx.fill();
        roundedRect(x + 65, y + 16, 37, 23, 7, "#c3973f");
        ctx.fillRect(x + 83, y + 7, 7, 16);
        [42, 72, 103].forEach((px) => window(x + px, y + 48, 6));
        ctx.fillStyle = "#c3973f";
        ctx.beginPath();
        ctx.moveTo(x + 150, y + 48);
        ctx.lineTo(x + 168, y + 32);
        ctx.lineTo(x + 168, y + 64);
        ctx.closePath();
        ctx.fill();
        return true;
      case "steam-locomotive":
        roundedRect(x + 26, y + 25, 118, 46, 8, "#374f47");
        roundedRect(x + 8, y + 43, 42, 28, 8, "#2f403b");
        roundedRect(x + 96, y + 9, 46, 42, 6, "#b54f3f");
        ctx.fillStyle = colors.dark;
        ctx.fillRect(x + 30, y + 7, 17, 34);
        ctx.beginPath();
        ctx.moveTo(x + 24, y + 8);
        ctx.lineTo(x + 54, y + 8);
        ctx.lineTo(x + 48, y + 1);
        ctx.lineTo(x + 30, y + 1);
        ctx.closePath();
        ctx.fill();
        [31, 75, 122].forEach((px) => wheel(x + px, y + 72, 10));
        return true;
      case "hot-air-balloon":
        ctx.fillStyle = "#d66c57";
        ctx.beginPath();
        ctx.ellipse(x + 63, y + 28, 42, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f1c15b";
        ctx.fillRect(x + 56, y + 1, 14, 55);
        ctx.strokeStyle = "#7d5136";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 43, y + 49);
        ctx.lineTo(x + 50, y + 68);
        ctx.moveTo(x + 82, y + 49);
        ctx.lineTo(x + 75, y + 68);
        ctx.stroke();
        roundedRect(x + 48, y + 65, 29, 16, 4, "#9b6b45");
        return true;
      case "rocket":
        ctx.fillStyle = "#e8ecec";
        ctx.beginPath();
        ctx.moveTo(x + 65, y + 1);
        ctx.quadraticCurveTo(x + 99, y + 25, x + 83, y + 68);
        ctx.lineTo(x + 47, y + 68);
        ctx.quadraticCurveTo(x + 31, y + 25, x + 65, y + 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#d66c57";
        ctx.beginPath();
        ctx.moveTo(x + 47, y + 52);
        ctx.lineTo(x + 31, y + 72);
        ctx.lineTo(x + 50, y + 68);
        ctx.moveTo(x + 83, y + 52);
        ctx.lineTo(x + 99, y + 72);
        ctx.lineTo(x + 80, y + 68);
        ctx.fill();
        window(x + 65, y + 33, 8);
        flame(x + 65, y + 66);
        return true;
      case "flying-saucer":
        ctx.fillStyle = "#8fa6aa";
        ctx.beginPath();
        ctx.ellipse(x + 80, y + 51, 79, 23, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#bfe2e6";
        ctx.beginPath();
        ctx.arc(x + 80, y + 42, 29, Math.PI, Math.PI * 2);
        ctx.fill();
        [24, 52, 80, 108, 136].forEach((px, i) => {
          ctx.fillStyle = i % 2 ? "#d66c57" : "#f1c15b";
          ctx.beginPath();
          ctx.arc(x + px, y + 58, 4, 0, Math.PI * 2);
          ctx.fill();
        });
        return true;
      case "space-shuttle":
        ctx.fillStyle = "#f0f2f2";
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 53);
        ctx.lineTo(x + 144, y + 20);
        ctx.quadraticCurveTo(x + 170, y + 31, x + 146, y + 48);
        ctx.lineTo(x + 55, y + 68);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#315f91";
        ctx.beginPath();
        ctx.moveTo(x + 72, y + 52);
        ctx.lineTo(x + 42, y + 78);
        ctx.lineTo(x + 112, y + 59);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#d66c57";
        ctx.fillRect(x + 17, y + 48, 20, 15);
        [127, 139, 151].forEach((px) => window(x + px, y + 34, 3));
        return true;
      case "moon-rover":
        roundedRect(x + 23, y + 33, 116, 35, 8, "#d9dddd");
        roundedRect(x + 68, y + 17, 48, 28, 7, "#bfe2e6");
        [37, 71, 112, 141].forEach((px) => wheel(x + px, y + 70, 10));
        ctx.strokeStyle = "#7b8f93";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + 34, y + 34);
        ctx.lineTo(x + 20, y + 12);
        ctx.stroke();
        ctx.fillStyle = "#315f91";
        ctx.beginPath();
        ctx.ellipse(x + 16, y + 9, 13, 5, -0.5, 0, Math.PI * 2);
        ctx.fill();
        return true;
      case "satellite":
        roundedRect(x + 63, y + 26, 48, 35, 7, "#d9dddd");
        ctx.fillStyle = "#315f91";
        ctx.fillRect(x + 3, y + 19, 55, 48);
        ctx.fillRect(x + 116, y + 19, 55, 48);
        ctx.strokeStyle = "#86b7c1";
        ctx.lineWidth = 2;
        [16, 30, 44, 129, 143, 157].forEach((px) => {
          ctx.beginPath();
          ctx.moveTo(x + px, y + 20);
          ctx.lineTo(x + px, y + 66);
          ctx.stroke();
        });
        ctx.strokeStyle = "#7b8f93";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + 87, y + 26);
        ctx.lineTo(x + 87, y + 8);
        ctx.stroke();
        return true;
      case "starship":
        ctx.fillStyle = "#cad4d6";
        ctx.beginPath();
        ctx.moveTo(x - 4, y + 47);
        ctx.lineTo(x + 176, y + 19);
        ctx.lineTo(x + 202, y + 42);
        ctx.lineTo(x + 176, y + 61);
        ctx.lineTo(x + 35, y + 68);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#6f4775";
        ctx.beginPath();
        ctx.moveTo(x + 70, y + 43);
        ctx.lineTo(x + 34, y + 76);
        ctx.lineTo(x + 131, y + 55);
        ctx.closePath();
        ctx.fill();
        [150, 163, 176].forEach((px) => window(x + px, y + 39, 3));
        return true;
      case "space-station":
        ctx.strokeStyle = "#a9b8bb";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(x + 27, y + 43);
        ctx.lineTo(x + 189, y + 43);
        ctx.moveTo(x + 108, y + 8);
        ctx.lineTo(x + 108, y + 78);
        ctx.stroke();
        ctx.fillStyle = "#315f91";
        ctx.fillRect(x + 2, y + 23, 54, 40);
        ctx.fillRect(x + 160, y + 23, 54, 40);
        ctx.fillStyle = "#d9dddd";
        ctx.beginPath();
        ctx.arc(x + 108, y + 43, 26, 0, Math.PI * 2);
        ctx.fill();
        [98, 108, 118].forEach((px) => window(x + px, y + 43, 3));
        return true;
      case "moon-base":
        ctx.fillStyle = "#d9dddd";
        ctx.beginPath();
        ctx.arc(x + 54, y + 61, 43, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 131, y + 61, 56, Math.PI, Math.PI * 2);
        ctx.fill();
        roundedRect(x + 82, y + 48, 26, 26, 4, "#7b8f93");
        [29, 52, 77, 112, 137, 161].forEach((px) => window(x + px, y + 54, 4));
        ctx.fillStyle = "#9b9f9f";
        ctx.fillRect(x + 5, y + 66, 181, 10);
        return true;
      case "alien-mothership":
        ctx.fillStyle = "#6f7f83";
        ctx.beginPath();
        ctx.ellipse(x + 109, y + 49, 108, 28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#9fc7c9";
        ctx.beginPath();
        ctx.ellipse(x + 109, y + 38, 61, 27, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        [20, 48, 76, 109, 142, 170, 198].forEach((px, i) => {
          ctx.fillStyle = i % 2 ? "#85e0a3" : "#d5a856";
          ctx.beginPath();
          ctx.arc(x + px, y + 59, 5, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = "rgba(133,224,163,.25)";
        ctx.beginPath();
        ctx.moveTo(x + 85, y + 66);
        ctx.lineTo(x + 65, y + 82);
        ctx.lineTo(x + 153, y + 82);
        ctx.lineTo(x + 133, y + 66);
        ctx.closePath();
        ctx.fill();
        return true;
      case "galaxy-cruiser":
        roundedRect(x + 13, y + 27, 186, 43, 20, "#4f6680");
        ctx.fillStyle = "#7f96ac";
        ctx.beginPath();
        ctx.moveTo(x + 199, y + 27);
        ctx.lineTo(x + 222, y + 48);
        ctx.lineTo(x + 199, y + 70);
        ctx.closePath();
        ctx.fill();
        roundedRect(x + 55, y + 12, 87, 27, 12, "#9fc7c9");
        [39, 67, 95, 123, 151, 179].forEach((px) => window(x + px, y + 48, 4));
        ctx.fillStyle = "#d66c57";
        ctx.fillRect(x + 3, y + 34, 17, 11);
        ctx.fillStyle = "#f1c15b";
        ctx.fillRect(x - 5, y + 52, 25, 9);
        return true;
      default:
        return false;
    }
  }

  function drawSandyAbsurdity(prop, x, y, phase) {
    ctx.save();
    const done = () => { ctx.restore(); return true; };
    const wheel = (cx, cy, r = 9) => {
      ctx.fillStyle = colors.dark;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b9c5c8";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    };
    const windowPane = (px, py, w = 22, h = 16) => roundedRect(px, py, w, h, 3, "#bfe2e6");
    const orbitDot = (cx, cy, radius, angle, size, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * 0.42, size, 0, Math.PI * 2);
      ctx.fill();
    };

    switch (prop) {
      case "school-bus": {
        roundedRect(x, y + 25, 174, 46, 8, "#e1b34f");
        ctx.fillStyle = "#c89432";
        ctx.fillRect(x + 7, y + 57, 165, 8);
        [14, 42, 70, 98, 126].forEach((px, index) => {
          windowPane(x + px, y + 32, 22, 17);
          ctx.fillStyle = ["#6f4775", "#d66c57", "#527861"][index % 3];
          ctx.beginPath();
          ctx.arc(x + px + 11, y + 47, 4, Math.PI, Math.PI * 2);
          ctx.fill();
        });
        roundedRect(x + 151, y + 31, 17, 28, 3, "#f6e5c9");
        wheel(x + 35, y + 72, 11);
        wheel(x + 139, y + 72, 11);
        ctx.save();
        ctx.translate(x + 8, y + 43);
        ctx.rotate(Math.sin(phase * 0.7) * 0.25 - 0.35);
        roundedRect(-19, -8, 21, 16, 3, "#b54f3f");
        ctx.fillStyle = "#fff";
        ctx.font = "700 7px Poppins";
        ctx.textAlign = "center";
        ctx.fillText("STOP", -9, 2);
        ctx.restore();
        return done();
      }
      case "fire-truck": {
        roundedRect(x, y + 31, 181, 40, 7, "#c84f43");
        roundedRect(x + 125, y + 18, 52, 46, 7, "#d66c57");
        windowPane(x + 136, y + 25, 28, 18);
        ctx.fillStyle = "#d9dddd";
        ctx.fillRect(x + 14, y + 39, 91, 20);
        ctx.strokeStyle = "#f5ead8";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x + 15, y + 27);
        ctx.lineTo(x + 118, y + 3 + Math.sin(phase) * 2);
        ctx.stroke();
        for (let rung = 0; rung < 6; rung++) {
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 28 + rung * 15, y + 23);
          ctx.lineTo(x + 30 + rung * 15, y + 31);
          ctx.stroke();
        }
        wheel(x + 38, y + 72, 12);
        wheel(x + 145, y + 72, 12);
        ["#e8f8ff", "#d66c57"].forEach((fill, index) => {
          ctx.globalAlpha = Math.sin(phase * 1.8 + index * Math.PI) > 0 ? 1 : 0.25;
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.arc(x + 140 + index * 20, y + 14, 5, 0, Math.PI * 2);
          ctx.fill();
        });
        return done();
      }
      case "tiny-house": {
        roundedRect(x + 8, y + 27, 138, 49, 4, "#d7a687");
        ctx.fillStyle = "#6f4775";
        ctx.beginPath();
        ctx.moveTo(x - 2, y + 31);
        ctx.lineTo(x + 76, y - 2);
        ctx.lineTo(x + 157, y + 31);
        ctx.closePath();
        ctx.fill();
        roundedRect(x + 62, y + 47, 29, 29, 3, "#7d5136");
        windowPane(x + 18, y + 40, 29, 22);
        windowPane(x + 105, y + 40, 27, 22);
        ctx.fillStyle = "#efc5a6";
        ctx.beginPath();
        ctx.arc(x + 118, y + 53, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#efc5a6";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 122, y + 55);
        ctx.lineTo(x + 134 + Math.sin(phase) * 5, y + 45);
        ctx.stroke();
        wheel(x + 31, y + 78, 7);
        wheel(x + 124, y + 78, 7);
        return done();
      }
      case "wind-turbine": {
        ctx.fillStyle = "#d9dddd";
        ctx.beginPath();
        ctx.moveTo(x + 60, y + 78);
        ctx.lineTo(x + 71, y + 19);
        ctx.lineTo(x + 79, y + 78);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.translate(x + 72, y + 20);
        ctx.rotate(phase * 0.38);
        ctx.fillStyle = "#f5ead8";
        for (let blade = 0; blade < 3; blade++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(18, -9, 44, -4);
          ctx.lineTo(12, 7);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = "#7b8f93";
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return done();
      }
      case "ferris-wheel": {
        const cx = x + 91;
        const cy = y + 39;
        ctx.strokeStyle = "#527861";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(cx, cy, 48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 2;
        for (let spoke = 0; spoke < 8; spoke++) {
          const angle = phase * 0.12 + spoke * Math.PI / 4;
          const sx = cx + Math.cos(angle) * 46;
          const sy = cy + Math.sin(angle) * 46;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          roundedRect(sx - 7, sy - 2, 14, 12, 3, spoke % 2 ? "#d66c57" : "#d5a856");
        }
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x + 59, y + 80);
        ctx.moveTo(cx, cy);
        ctx.lineTo(x + 124, y + 80);
        ctx.stroke();
        return done();
      }
      case "lighthouse": {
        const sweep = Math.sin(phase * 0.45) * 55;
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#f8e082";
        ctx.beginPath();
        ctx.moveTo(x + 65, y + 18);
        ctx.lineTo(x + 65 + sweep, y - 7);
        ctx.lineTo(x + 65 + sweep * 1.3, y + 34);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#f5ead8";
        ctx.beginPath();
        ctx.moveTo(x + 42, y + 77);
        ctx.lineTo(x + 51, y + 18);
        ctx.lineTo(x + 79, y + 18);
        ctx.lineTo(x + 90, y + 77);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#c84f43";
        [30, 54].forEach((stripe) => ctx.fillRect(x + 46 + (stripe - 30) * 0.15, y + stripe, 38 - (stripe - 30) * 0.3, 10));
        roundedRect(x + 47, y + 7, 36, 18, 5, "#315f68");
        ctx.fillStyle = "#7d5136";
        ctx.beginPath();
        ctx.moveTo(x + 42, y + 8);
        ctx.lineTo(x + 65, y - 4);
        ctx.lineTo(x + 88, y + 8);
        ctx.closePath();
        ctx.fill();
        return done();
      }
      case "castle": {
        roundedRect(x + 31, y + 31, 139, 47, 3, "#a9a6a0");
        [5, 74, 154].forEach((tower, index) => {
          roundedRect(x + tower, y + 18 + (index % 2) * 7, 43, 60 - (index % 2) * 7, 3, "#b9b5ad");
          ctx.fillStyle = "#8b8780";
          for (let tooth = 0; tooth < 3; tooth++) ctx.fillRect(x + tower + tooth * 16, y + 10 + (index % 2) * 7, 11, 12);
        });
        ctx.fillStyle = "#6f4775";
        ctx.beginPath();
        ctx.arc(x + 101, y + 78, 20, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(x + 101, y + 66);
        ctx.rotate(Math.abs(Math.sin(phase * 0.45)) * 0.35);
        roundedRect(-20, 0, 40, 12, 2, "#7d5136");
        ctx.strokeStyle = "#5e3d2b";
        ctx.lineWidth = 2;
        [-12, 0, 12].forEach((plank) => {
          ctx.beginPath();
          ctx.moveTo(plank, 1);
          ctx.lineTo(plank, 11);
          ctx.stroke();
        });
        ctx.restore();
        ctx.strokeStyle = "#7d5136";
        ctx.lineWidth = 3;
        [x + 26, x + 175].forEach((flagX, index) => {
          ctx.beginPath();
          ctx.moveTo(flagX, y + 12);
          ctx.lineTo(flagX, y - 7);
          ctx.stroke();
          ctx.fillStyle = index ? "#d5a856" : "#d66c57";
          ctx.beginPath();
          ctx.moveTo(flagX, y - 7);
          ctx.quadraticCurveTo(flagX + 14, y - 12 + Math.sin(phase) * 3, flagX + 24, y - 4);
          ctx.lineTo(flagX, y + 2);
          ctx.closePath();
          ctx.fill();
        });
        return done();
      }
      case "whale-aquarium": {
        roundedRect(x, y + 13, 189, 61, 10, "rgba(126,190,201,.48)");
        ctx.strokeStyle = "#315f68";
        ctx.lineWidth = 5;
        ctx.strokeRect(x, y + 13, 189, 61);
        ctx.fillStyle = "#547c96";
        ctx.beginPath();
        ctx.ellipse(x + 91, y + 48 + Math.sin(phase * 0.5) * 3, 52, 20, -0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 42, y + 48);
        ctx.lineTo(x + 18, y + 31);
        ctx.lineTo(x + 22, y + 61);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#f5ead8";
        ctx.beginPath();
        ctx.arc(x + 121, y + 43, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#8fc9d2";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 119, y + 28);
        ctx.quadraticCurveTo(x + 125, y + 4 - Math.abs(Math.sin(phase)) * 8, x + 132, y + 17);
        ctx.moveTo(x + 125, y + 19);
        ctx.quadraticCurveTo(x + 138, y + 1, x + 145, y + 15);
        ctx.stroke();
        wheel(x + 35, y + 78, 7);
        wheel(x + 155, y + 78, 7);
        return done();
      }
      case "cruise-ship": {
        ctx.fillStyle = "#315f91";
        ctx.beginPath();
        ctx.moveTo(x - 4, y + 55);
        ctx.lineTo(x + 208, y + 55);
        ctx.lineTo(x + 184, y + 78);
        ctx.lineTo(x + 32, y + 78);
        ctx.closePath();
        ctx.fill();
        roundedRect(x + 34, y + 20, 142, 38, 5, "#f0f2f2");
        roundedRect(x + 65, y + 4, 83, 23, 5, "#f5ead8");
        [50, 74, 98, 122, 146].forEach((px) => windowPane(x + px, y + 30, 12, 10));
        ctx.fillStyle = "#d66c57";
        ctx.fillRect(x + 83, y - 6, 17, 16);
        ctx.fillRect(x + 119, y - 6, 17, 16);
        ctx.strokeStyle = "rgba(143,201,210,.7)";
        ctx.lineWidth = 3;
        for (let wave = 0; wave < 4; wave++) {
          ctx.beginPath();
          ctx.arc(x + 30 + wave * 50 + Math.sin(phase) * 5, y + 80, 15, Math.PI, 0);
          ctx.stroke();
        }
        return done();
      }
      case "dinosaur-skeleton": {
        ctx.strokeStyle = "#e7dcc5";
        ctx.lineCap = "round";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(x + 24, y + 39);
        ctx.quadraticCurveTo(x + 99, y + 19, x + 171, y + 39);
        ctx.lineTo(x + 199, y + 29);
        ctx.moveTo(x + 88, y + 33);
        ctx.lineTo(x + 72, y + 77);
        ctx.moveTo(x + 119, y + 33);
        ctx.lineTo(x + 137, y + 77);
        ctx.stroke();
        ctx.lineWidth = 3;
        for (let rib = 0; rib < 6; rib++) {
          const rx = x + 68 + rib * 16;
          ctx.beginPath();
          ctx.arc(rx, y + 41, 12 + (rib % 2) * 3, 0, Math.PI);
          ctx.stroke();
        }
        ctx.fillStyle = "#e7dcc5";
        ctx.beginPath();
        ctx.ellipse(x + 187, y + 27, 24, 13, -0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = colors.dark;
        ctx.beginPath();
        ctx.arc(x + 196, y + 23, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#7d5136";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + 18, y + 78);
        ctx.lineTo(x + 205, y + 78);
        ctx.stroke();
        return done();
      }
      case "volcano-dolly": {
        ctx.fillStyle = "#6d5a4b";
        ctx.beginPath();
        ctx.moveTo(x + 24, y + 68);
        ctx.lineTo(x + 70, y + 4);
        ctx.lineTo(x + 119, y + 68);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#d66c57";
        ctx.beginPath();
        ctx.moveTo(x + 57, y + 20);
        ctx.lineTo(x + 70, y + 5);
        ctx.lineTo(x + 83, y + 20);
        ctx.lineTo(x + 75, y + 44);
        ctx.lineTo(x + 65, y + 30);
        ctx.lineTo(x + 55, y + 51);
        ctx.closePath();
        ctx.fill();
        roundedRect(x + 7, y + 69, 132, 8, 3, "#7d5136");
        wheel(x + 29, y + 78, 7);
        wheel(x + 117, y + 78, 7);
        [0, 1, 2].forEach((puff) => {
          const rise = (phase * 2 + puff * 12) % 31;
          ctx.globalAlpha = 0.5 - rise / 85;
          ctx.fillStyle = "#8b8780";
          ctx.beginPath();
          ctx.arc(x + 69 + Math.sin(phase + puff) * 7, y + 1 - rise, 7 + rise * 0.13, 0, Math.PI * 2);
          ctx.fill();
        });
        return done();
      }
      case "tornado-jar": {
        ctx.fillStyle = "rgba(191,226,230,.28)";
        roundedRect(x + 11, y + 1, 112, 76, 14, "rgba(191,226,230,.28)");
        ctx.strokeStyle = "#7b8f93";
        ctx.lineWidth = 5;
        ctx.strokeRect(x + 11, y + 1, 112, 76);
        ctx.fillStyle = "#315f68";
        ctx.fillRect(x + 5, y - 3, 124, 8);
        ctx.strokeStyle = "#a9b8bb";
        ctx.lineWidth = 5;
        for (let swirl = 0; swirl < 5; swirl++) {
          const sy = y + 13 + swirl * 12;
          const width = 46 - swirl * 6;
          ctx.beginPath();
          ctx.ellipse(x + 67 + Math.sin(phase * 0.8 + swirl) * 7, sy, width, 7, 0, 0, Math.PI * 1.7);
          ctx.stroke();
        }
        ctx.save();
        ctx.translate(x + 67 + Math.cos(phase) * 25, y + 39 + Math.sin(phase) * 19);
        ctx.rotate(phase);
        roundedRect(-8, -5, 16, 10, 2, "#8e6f91");
        ctx.restore();
        wheel(x + 31, y + 79, 6);
        wheel(x + 105, y + 79, 6);
        return done();
      }
      case "thundercloud": {
        ctx.fillStyle = "#68777d";
        [[31, 38, 27], [61, 27, 33], [95, 37, 29], [122, 42, 23], [65, 49, 39]].forEach(([cx, cy, r]) => {
          ctx.beginPath();
          ctx.arc(x + cx, y + cy, r, 0, Math.PI * 2);
          ctx.fill();
        });
        const flash = Math.sin(phase * 1.7) > 0.62;
        ctx.globalAlpha = flash ? 1 : 0.35;
        ctx.fillStyle = "#f1c15b";
        ctx.beginPath();
        ctx.moveTo(x + 65, y + 50);
        ctx.lineTo(x + 49, y + 70);
        ctx.lineTo(x + 63, y + 69);
        ctx.lineTo(x + 53, y + 84);
        ctx.lineTo(x + 83, y + 61);
        ctx.lineTo(x + 69, y + 62);
        ctx.closePath();
        ctx.fill();
        [27, 103, 128].forEach((drop, index) => {
          ctx.globalAlpha = 0.45;
          ctx.strokeStyle = "#8fc9d2";
          ctx.lineWidth = 3;
          const drift = (phase * 5 + index * 13) % 22;
          ctx.beginPath();
          ctx.moveTo(x + drop, y + 55 + drift);
          ctx.lineTo(x + drop - 4, y + 63 + drift);
          ctx.stroke();
        });
        return done();
      }
      case "time-machine": {
        roundedRect(x + 19, y + 3, 119, 73, 11, "#6f4775");
        roundedRect(x + 29, y + 12, 99, 55, 7, "#d9dddd");
        ctx.fillStyle = "#bfe2e6";
        ctx.beginPath();
        ctx.arc(x + 78, y + 38, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = colors.dark;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + 78, y + 38, 19, 0, Math.PI * 2);
        ctx.moveTo(x + 78, y + 38);
        ctx.lineTo(x + 78 + Math.cos(-phase) * 15, y + 38 + Math.sin(-phase) * 15);
        ctx.moveTo(x + 78, y + 38);
        ctx.lineTo(x + 78 + Math.cos(-phase * 0.22) * 11, y + 38 + Math.sin(-phase * 0.22) * 11);
        ctx.stroke();
        [37, 119].forEach((px, index) => {
          ctx.fillStyle = index ? "#85e0a3" : "#d66c57";
          ctx.globalAlpha = 0.4 + (Math.sin(phase + index * Math.PI) + 1) * 0.3;
          ctx.beginPath();
          ctx.arc(x + px, y + 61, 5, 0, Math.PI * 2);
          ctx.fill();
        });
        wheel(x + 40, y + 78, 7);
        wheel(x + 119, y + 78, 7);
        return done();
      }
      case "portal": {
        ctx.save();
        ctx.translate(x + 75, y + 39);
        ctx.rotate(Math.sin(phase * 0.4) * 0.08);
        for (let ring = 5; ring > 0; ring--) {
          ctx.strokeStyle = ["#6f4775", "#8fc9d2", "#85e0a3"][ring % 3];
          ctx.globalAlpha = 0.38 + ring * 0.1;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.ellipse(0, 0, 12 + ring * 9 + Math.sin(phase + ring) * 2, 8 + ring * 6, phase * 0.08 + ring, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(36,24,54,.72)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 31, 23, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(245,234,216,.46)";
        if (Math.floor(phase / 6) % 2) {
          roundedRect(-12, -1, 24, 16, 5, "rgba(245,234,216,.46)");
          roundedRect(-8, -15, 17, 18, 5, "rgba(245,234,216,.46)");
        } else {
          ctx.fillRect(-2, -13, 4, 27);
          ctx.beginPath();
          ctx.moveTo(-13, -11);
          ctx.lineTo(13, -11);
          ctx.lineTo(8, -24);
          ctx.lineTo(-8, -24);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        return done();
      }
      case "mini-sun": {
        ctx.save();
        ctx.translate(x + 68, y + 39);
        ctx.rotate(phase * 0.16);
        ctx.strokeStyle = "rgba(241,193,91,.72)";
        ctx.lineWidth = 6;
        for (let ray = 0; ray < 12; ray++) {
          ctx.rotate(Math.PI / 6);
          const reach = 43 + Math.sin(phase + ray) * 7;
          ctx.beginPath();
          ctx.moveTo(32, 0);
          ctx.lineTo(reach, 0);
          ctx.stroke();
        }
        ctx.restore();
        const gradient = ctx.createRadialGradient(x + 68, y + 39, 4, x + 68, y + 39, 35);
        gradient.addColorStop(0, "#fff5bd");
        gradient.addColorStop(0.45, "#f1c15b");
        gradient.addColorStop(1, "#df8f43");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x + 68, y + 39, 33 + Math.sin(phase * 0.7) * 2, 0, Math.PI * 2);
        ctx.fill();
        return done();
      }
      case "saturn": {
        ctx.save();
        ctx.translate(x + 88, y + 39);
        ctx.rotate(-0.22);
        ctx.strokeStyle = "#d5a856";
        ctx.lineWidth = 11;
        ctx.beginPath();
        ctx.ellipse(0, 0, 77, 22, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#d7a687";
        ctx.beginPath();
        ctx.arc(0, 0, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(138,76,54,.38)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, 24, -1, 1.7);
        ctx.stroke();
        orbitDot(0, 0, 87, phase * 0.35, 6, "#bfe2e6");
        ctx.restore();
        return done();
      }
      case "black-hole-cart": {
        ctx.save();
        ctx.translate(x + 84, y + 35);
        for (let ring = 4; ring > 0; ring--) {
          ctx.strokeStyle = ["#6f4775", "#315f91", "#d66c57", "#d5a856"][ring - 1];
          ctx.lineWidth = 6;
          ctx.globalAlpha = 0.45 + ring * 0.1;
          ctx.beginPath();
          ctx.ellipse(0, 0, ring * 15 + 9, ring * 7 + 5, phase * 0.11 + ring * 0.45, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = "#17131f";
        ctx.beginPath();
        ctx.arc(0, 0, 21, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = "#7b8f93";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x + 19, y + 61);
        ctx.lineTo(x + 140, y + 61);
        ctx.lineTo(x + 129, y + 76);
        ctx.lineTo(x + 45, y + 76);
        ctx.stroke();
        wheel(x + 48, y + 79, 7);
        wheel(x + 126, y + 79, 7);
        return done();
      }
      case "friendly-kaiju": {
        ctx.fillStyle = "#527861";
        ctx.beginPath();
        ctx.moveTo(x + 29, y + 70);
        ctx.quadraticCurveTo(x + 12, y + 34, x + 61, y + 19);
        ctx.quadraticCurveTo(x + 106, y + 4, x + 120, y + 51);
        ctx.lineTo(x + 151, y + 69);
        ctx.lineTo(x + 98, y + 63);
        ctx.lineTo(x + 89, y + 79);
        ctx.lineTo(x + 58, y + 79);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#85a079";
        for (let spike = 0; spike < 5; spike++) {
          ctx.beginPath();
          ctx.moveTo(x + 42 + spike * 14, y + 25 - Math.sin(spike) * 8);
          ctx.lineTo(x + 48 + spike * 14, y + 6 - Math.sin(spike) * 8);
          ctx.lineTo(x + 56 + spike * 14, y + 25 - Math.sin(spike) * 8);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = "#fffdf6";
        ctx.beginPath();
        ctx.arc(x + 94, y + 25, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = colors.dark;
        ctx.beginPath();
        ctx.arc(x + 96 + Math.sin(phase) * 1.5, y + 25, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#d66c57";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + 107, y + 37, 10, 0.1, 1.1);
        ctx.stroke();
        return done();
      }
      case "solar-system-mobile": {
        ctx.strokeStyle = "#7b8f93";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x + 102, y - 3);
        ctx.lineTo(x + 102, y + 77);
        ctx.moveTo(x + 11, y + 14);
        ctx.lineTo(x + 194, y + 14);
        ctx.stroke();
        const planets = [
          [24, 10, 6, "#8fc9d2", 0.8], [55, 25, 9, "#d66c57", 1.2],
          [91, 37, 12, "#315f91", 0.65], [129, 21, 8, "#df8f43", 1.5],
          [169, 34, 15, "#d7a687", 0.5], [194, 47, 7, "#6f4775", 1.1],
        ];
        planets.forEach(([px, drop, radius, fill, sway], index) => {
          const planetX = x + px + Math.sin(phase * sway + index) * 6;
          ctx.strokeStyle = "#7b8f93";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + px, y + 15);
          ctx.lineTo(planetX, y + drop + 18);
          ctx.stroke();
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.arc(planetX, y + drop + 18, radius, 0, Math.PI * 2);
          ctx.fill();
        });
        roundedRect(x + 79, y + 75, 48, 6, 3, "#7d5136");
        return done();
      }
      case "parade-float": {
        roundedRect(x + 4, y + 52, 195, 24, 8, "#6f4775");
        ctx.fillStyle = "#f1c15b";
        for (let scallop = 0; scallop < 9; scallop++) {
          ctx.beginPath();
          ctx.arc(x + 17 + scallop * 22, y + 72, 8, 0, Math.PI * 2);
          ctx.fill();
        }
        const bloomX = x + 101;
        const bloomY = y + 33 + Math.sin(phase * 0.7) * 2;
        ["#d66c57", "#f1c15b", "#8fc9d2", "#85a079", "#d77aa4", "#fff5df"].forEach((fill, petal) => {
          const angle = phase * 0.08 + petal * Math.PI / 3;
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.ellipse(bloomX + Math.cos(angle) * 25, bloomY + Math.sin(angle) * 18, 19, 10, angle, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = "#d5a856";
        ctx.beginPath();
        ctx.arc(bloomX, bloomY, 15, 0, Math.PI * 2);
        ctx.fill();
        wheel(x + 37, y + 78, 7);
        wheel(x + 169, y + 78, 7);
        return done();
      }
      case "roller-coaster": {
        ctx.strokeStyle = "#b54f3f";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 58);
        ctx.bezierCurveTo(x + 42, y - 5, x + 68, y + 8, x + 100, y + 49);
        ctx.bezierCurveTo(x + 137, y + 84, x + 160, y + 5, x + 207, y + 31);
        ctx.stroke();
        ctx.strokeStyle = "#7d5136";
        ctx.lineWidth = 4;
        [27, 68, 112, 157, 194].forEach((support, index) => {
          ctx.beginPath();
          ctx.moveTo(x + support, y + 30 + (index % 2) * 17);
          ctx.lineTo(x + support, y + 78);
          ctx.stroke();
        });
        [0, 1, 2].forEach((car) => {
          const carX = x + 48 + car * 39;
          const carY = y + 25 + Math.sin(phase * 1.2 + car) * 8;
          ctx.save();
          ctx.translate(carX, carY);
          ctx.rotate(Math.sin(phase * 0.7 + car) * 0.12);
          roundedRect(-17, -7, 34, 19, 5, car % 2 ? "#d5a856" : "#315f91");
          ctx.fillStyle = "#efbf9d";
          [-8, 8].forEach((rider) => {
            ctx.beginPath();
            ctx.arc(rider, -10, 5, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.restore();
        });
        return done();
      }
      case "iceberg-penguins": {
        ctx.fillStyle = "#cfe9ec";
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 68);
        ctx.lineTo(x + 31, y + 40);
        ctx.lineTo(x + 57, y + 44);
        ctx.lineTo(x + 91, y + 4);
        ctx.lineTo(x + 120, y + 38);
        ctx.lineTo(x + 155, y + 28);
        ctx.lineTo(x + 204, y + 68);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#8fc9d2";
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 68);
        ctx.lineTo(x + 204, y + 68);
        ctx.lineTo(x + 181, y + 79);
        ctx.lineTo(x + 25, y + 79);
        ctx.closePath();
        ctx.fill();
        [[54, 43], [119, 45], [155, 51]].forEach(([penguinX, penguinY], index) => {
          ctx.fillStyle = "#202124";
          ctx.beginPath();
          ctx.ellipse(x + penguinX, y + penguinY + Math.sin(phase + index) * 2, 8, 13, index === 2 ? 0.25 : 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fffdf6";
          ctx.beginPath();
          ctx.ellipse(x + penguinX, y + penguinY + 3, 4, 7, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#df8f43";
          ctx.beginPath();
          ctx.moveTo(x + penguinX - 2, y + penguinY - 5);
          ctx.lineTo(x + penguinX + 5, y + penguinY - 2);
          ctx.lineTo(x + penguinX - 2, y + penguinY + 1);
          ctx.closePath();
          ctx.fill();
        });
        return done();
      }
      case "fire-breathing-dragon": {
        const flap = Math.sin(phase * 0.9) * 9;
        ctx.fillStyle = "#527861";
        ctx.beginPath();
        ctx.moveTo(x + 42, y + 58);
        ctx.quadraticCurveTo(x + 72, y + 15, x + 127, y + 35);
        ctx.quadraticCurveTo(x + 158, y + 45, x + 182, y + 25);
        ctx.lineTo(x + 199, y + 35);
        ctx.lineTo(x + 179, y + 49);
        ctx.lineTo(x + 141, y + 53);
        ctx.lineTo(x + 115, y + 72);
        ctx.lineTo(x + 54, y + 72);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#85a079";
        ctx.beginPath();
        ctx.moveTo(x + 92, y + 38);
        ctx.lineTo(x + 49, y + 2 + flap);
        ctx.lineTo(x + 105, y + 23);
        ctx.moveTo(x + 121, y + 39);
        ctx.lineTo(x + 145, y + 1 - flap);
        ctx.lineTo(x + 139, y + 47);
        ctx.fill();
        ctx.strokeStyle = "#374f47";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(x + 70, y + 66);
        ctx.lineTo(x + 58, y + 79);
        ctx.moveTo(x + 125, y + 65);
        ctx.lineTo(x + 139, y + 79);
        ctx.stroke();
        ctx.fillStyle = "#fffdf6";
        ctx.beginPath();
        ctx.arc(x + 180, y + 32, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = colors.dark;
        ctx.beginPath();
        ctx.arc(x + 181, y + 32, 2, 0, Math.PI * 2);
        ctx.fill();
        return done();
      }
      case "floating-city": {
        ctx.fillStyle = "#6f7779";
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 55);
        ctx.lineTo(x + 207, y + 55);
        ctx.lineTo(x + 162, y + 78);
        ctx.lineTo(x + 54, y + 78);
        ctx.closePath();
        ctx.fill();
        const towers = [[18, 29, 28, 27], [51, 15, 31, 40], [87, 3, 35, 52], [127, 22, 27, 33], [160, 9, 32, 46]];
        towers.forEach(([tx, ty, tw, th], index) => {
          roundedRect(x + tx, y + ty, tw, th, 3, index % 2 ? "#8fa6aa" : "#b9c5c8");
          ctx.fillStyle = index % 2 ? "#85e0a3" : "#f1c15b";
          for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 2; col++) ctx.fillRect(x + tx + 6 + col * 10, y + ty + 8 + row * 12, 4, 5);
          }
        });
        ctx.fillStyle = "#85a079";
        ctx.fillRect(x + 4, y + 50, 201, 7);
        return done();
      }
      case "universe-snow-globe": {
        const cx = x + 105;
        const cy = y + 36;
        const gradient = ctx.createRadialGradient(cx - 16, cy - 17, 4, cx, cy, 51);
        gradient.addColorStop(0, "rgba(143,201,210,.72)");
        gradient.addColorStop(0.45, "rgba(67,57,104,.78)");
        gradient.addColorStop(1, "rgba(20,18,35,.94)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, 51, 0, Math.PI * 2);
        ctx.fill();
        for (let star = 0; star < 18; star++) {
          const angle = star * 2.41 + phase * (0.03 + (star % 3) * 0.012);
          const radius = 7 + (star * 17) % 41;
          ctx.globalAlpha = 0.45 + (Math.sin(phase + star) + 1) * 0.25;
          ctx.fillStyle = star % 4 ? "#fff5df" : "#85e0a3";
          ctx.beginPath();
          ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 1.2 + star % 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = "#d77aa4";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 38, 14, phase * 0.12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(255,255,255,.62)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, 50, 3.55, 5.1);
        ctx.stroke();
        roundedRect(x + 52, y + 68, 106, 12, 5, "#7d5136");
        roundedRect(x + 66, y + 61, 78, 12, 4, "#9b6b45");
        return done();
      }
      default:
        ctx.restore();
        return false;
    }
  }

  function drawSandyEffectUnderlay(item, x, y) {
    ctx.save();
    if (hoveringSandyProps.has(item.prop)) {
      const pulse = 0.72 + Math.sin(item.phase * 0.7) * 0.12;
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "#315f68";
      ctx.beginPath();
      ctx.ellipse(x + (item.w - 52) / 2, ground - 3, (item.w - 54) * pulse / 2, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (item.prop === "alien-mothership") {
      const beamPulse = 0.17 + (Math.sin(item.phase * 0.55) + 1) * 0.06;
      ctx.globalAlpha = beamPulse;
      ctx.fillStyle = "#85e0a3";
      ctx.beginPath();
      ctx.moveTo(x + 83, y + 59);
      ctx.lineTo(x + 48, ground);
      ctx.lineTo(x + 170, ground);
      ctx.lineTo(x + 135, y + 59);
      ctx.closePath();
      ctx.fill();
    }
    if (["space-shuttle", "starship", "galaxy-cruiser"].includes(item.prop)) {
      const flicker = 8 + Math.abs(Math.sin(item.phase * 1.8)) * 10;
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = "#f1c15b";
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 47);
      ctx.lineTo(x - flicker, y + 40);
      ctx.lineTo(x + 5, y + 59);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "#d66c57";
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 49);
      ctx.lineTo(x - flicker * 0.55, y + 46);
      ctx.lineTo(x + 4, y + 56);
      ctx.closePath();
      ctx.fill();
    }
    if (item.prop === "rocket") {
      const flicker = 13 + Math.abs(Math.sin(item.phase * 1.8)) * 11;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = "#f1c15b";
      ctx.beginPath();
      ctx.moveTo(x + 55, y + 66);
      ctx.lineTo(x + 65, y + 66 + flicker);
      ctx.lineTo(x + 75, y + 66);
      ctx.closePath();
      ctx.fill();
    }
    if (item.prop === "iceberg-penguins") {
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = "#8fc9d2";
      ctx.beginPath();
      ctx.ellipse(x + 71, ground - 2, 94, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.32;
      for (let crystal = 0; crystal < 5; crystal++) {
        const drift = (item.phase * 4 + crystal * 27) % 112;
        ctx.fillStyle = "#cfe9ec";
        ctx.beginPath();
        ctx.arc(x - 70 + drift, ground - 4 - (crystal % 2) * 3, 2 + crystal % 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (item.prop === "floating-city") {
      ctx.globalAlpha = 0.12 + (Math.sin(item.phase * 0.55) + 1) * 0.04;
      ctx.fillStyle = "#f1c15b";
      [[87, 47], [151, 111]].forEach(([top, bottom]) => {
        ctx.beginPath();
        ctx.moveTo(x + top, y + 48);
        ctx.lineTo(x + bottom - 25, ground);
        ctx.lineTo(x + bottom + 25, ground);
        ctx.closePath();
        ctx.fill();
      });
    }
    if (item.prop === "universe-snow-globe") {
      const glow = ctx.createRadialGradient(x + 105, y + 36, 20, x + 105, y + 36, 94);
      glow.addColorStop(0, "rgba(111,71,117,.22)");
      glow.addColorStop(1, "rgba(111,71,117,0)");
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x + 105, y + 36, 94, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSandyEffectOverlay(item, x, y) {
    ctx.save();
    if (item.prop === "steam-locomotive") {
      [0, 1, 2].forEach((puff) => {
        const rise = (item.phase * 2 + puff * 12) % 34;
        ctx.globalAlpha = Math.max(0.12, 0.65 - rise / 48);
        ctx.fillStyle = "#d9dddd";
        ctx.beginPath();
        ctx.arc(x + 39 + Math.sin(item.phase + puff) * 5, y + 2 - rise, 7 + rise * 0.15, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    if (item.prop === "helicopter") {
      ctx.strokeStyle = "#2f403b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      const sweep = Math.sin(item.phase * 1.7) * 48;
      ctx.moveTo(x + 70 - sweep, y + 7);
      ctx.lineTo(x + 70 + sweep, y + 7);
      ctx.stroke();
    }
    if (item.prop === "satellite") {
      ctx.strokeStyle = "rgba(133,224,163,.7)";
      ctx.lineWidth = 2;
      [10, 18, 26].forEach((radius, index) => {
        ctx.globalAlpha = 0.25 + ((Math.sin(item.phase * 0.8 - index) + 1) * 0.25);
        ctx.beginPath();
        ctx.arc(x + 87, y + 8, radius, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
      });
    }
    if (item.prop === "submarine") {
      [0, 1, 2].forEach((bubble) => {
        const drift = (item.phase * 2 + bubble * 13) % 34;
        ctx.globalAlpha = 0.3 + bubble * 0.12;
        ctx.strokeStyle = "#8fc9d2";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 168 + drift * 0.35, y + 44 - drift, 3 + bubble, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
    if (item.prop === "space-station") {
      const orbit = item.phase * 0.45;
      ctx.fillStyle = "#85e0a3";
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(x + 108 + Math.cos(orbit) * 34, y + 43 + Math.sin(orbit) * 22, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (item.prop === "moon-base") {
      ctx.globalAlpha = 0.35 + (Math.sin(item.phase * 0.8) + 1) * 0.3;
      ctx.fillStyle = "#d66c57";
      ctx.beginPath();
      ctx.arc(x + 131, y + 24, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (item.prop === "fire-truck") {
      const spray = 18 + (Math.sin(item.phase * 0.8) + 1) * 13;
      ctx.strokeStyle = "rgba(143,201,210,.8)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 17, y + 39);
      ctx.quadraticCurveTo(x - 20, y + 4 - spray, x - 45, y + 47);
      ctx.stroke();
      for (let drop = 0; drop < 4; drop++) {
        ctx.globalAlpha = 0.35 + drop * 0.12;
        ctx.fillStyle = "#8fc9d2";
        ctx.beginPath();
        ctx.arc(x - 43 + drop * 7, y + 44 + Math.sin(item.phase + drop) * 9, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (item.prop === "cruise-ship") {
      [0, 1].forEach((stack) => {
        const rise = (item.phase * 1.7 + stack * 14) % 28;
        ctx.globalAlpha = 0.48 - rise / 80;
        ctx.fillStyle = "#a9b8bb";
        ctx.beginPath();
        ctx.arc(x + 92 + stack * 36 + Math.sin(item.phase + stack) * 4, y - 8 - rise, 5 + rise * 0.16, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    if (item.prop === "time-machine") {
      [-22, 22].forEach((offset, index) => {
        ctx.globalAlpha = 0.12 + (Math.sin(item.phase + index * Math.PI) + 1) * 0.07;
        ctx.strokeStyle = "#8fc9d2";
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 19 + offset, y + 5, 119, 70);
        const ghostX = x - 30 + offset * 1.35;
        ctx.fillStyle = "#8fc9d2";
        ctx.beginPath();
        ctx.arc(ghostX, y + 15, 13, 0, Math.PI * 2);
        ctx.fill();
        roundedRect(ghostX - 14, y + 29, 28, 34, 7, "#8fc9d2");
      });
    }
    if (item.prop === "volcano-dolly") {
      for (let ember = 0; ember < 3; ember++) {
        const arc = (item.phase * 0.6 + ember * 1.8) % 5.4;
        ctx.globalAlpha = 0.45 + ember * 0.16;
        ctx.fillStyle = ember % 2 ? "#f1c15b" : "#d66c57";
        ctx.beginPath();
        ctx.arc(x + 70 + Math.cos(arc) * (14 + ember * 8), y + 3 - Math.abs(Math.sin(arc)) * (23 + ember * 7), 3 + ember, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (item.prop === "black-hole-cart") {
      for (let tag = 0; tag < 3; tag++) {
        const angle = -item.phase * 0.34 + tag * Math.PI * 2 / 3;
        const radius = 51 - tag * 8;
        ctx.save();
        ctx.translate(x + 84 + Math.cos(angle) * radius, y + 35 + Math.sin(angle) * radius * 0.4);
        ctx.rotate(angle);
        ctx.globalAlpha = 0.65;
        roundedRect(-5, -7, 10, 14, 2, "#fffdf6");
        ctx.fillStyle = colors.clay;
        ctx.font = "700 7px Poppins";
        ctx.textAlign = "center";
        ctx.fillText("$", 0, 3);
        ctx.restore();
      }
    }
    if (item.prop === "friendly-kaiju") {
      ctx.strokeStyle = "rgba(138,76,54,.55)";
      ctx.lineWidth = 3;
      [11, 20, 29].forEach((radius, index) => {
        ctx.globalAlpha = 0.7 - index * 0.16;
        ctx.beginPath();
        ctx.arc(x + 113, y + 42, radius, -0.55, 0.55);
        ctx.stroke();
      });
      ctx.strokeStyle = "#d66c57";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 17, y + 39);
      ctx.quadraticCurveTo(x + 36, y + 20, x + 66, y + 34);
      ctx.stroke();
    }
    if (item.prop === "parade-float") {
      const confettiColors = ["#d66c57", "#f1c15b", "#315f91", "#85a079", "#d77aa4"];
      for (let confetti = 0; confetti < 13; confetti++) {
        const fall = (item.phase * 8 + confetti * 17) % 76;
        const confettiX = x + 8 + (confetti * 37) % 196 + Math.sin(item.phase + confetti) * 7;
        ctx.save();
        ctx.translate(confettiX, y - 20 + fall);
        ctx.rotate(item.phase + confetti);
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = confettiColors[confetti % confettiColors.length];
        ctx.fillRect(-2, -4, 4, 8);
        ctx.restore();
      }
    }
    if (item.prop === "fire-breathing-dragon") {
      const breath = 28 + Math.abs(Math.sin(item.phase * 1.4)) * 24;
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = "#f1c15b";
      ctx.beginPath();
      ctx.moveTo(x + 198, y + 35);
      ctx.quadraticCurveTo(x + 211 + breath * 0.45, y + 23, x + 207 + breath, y + 40);
      ctx.quadraticCurveTo(x + 218 + breath * 0.35, y + 49, x + 198, y + 40);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#d66c57";
      ctx.beginPath();
      ctx.moveTo(x + 201, y + 36);
      ctx.lineTo(x + 206 + breath * 0.7, y + 39);
      ctx.lineTo(x + 202, y + 41);
      ctx.closePath();
      ctx.fill();
    }
    if (item.prop === "universe-snow-globe") {
      for (let streak = 0; streak < 6; streak++) {
        const angle = item.phase * 0.18 + streak * Math.PI / 3;
        ctx.globalAlpha = 0.28 + streak * 0.06;
        ctx.strokeStyle = streak % 2 ? "#8fc9d2" : "#d77aa4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 105, y + 36, 61 + streak * 5, angle, angle + 0.4);
        ctx.stroke();
      }
    }
    if (illuminatedSandyProps.has(item.prop)) {
      const lightCount = Math.max(3, Math.min(7, Math.round((item.w - 60) / 25)));
      const usableWidth = Math.max(50, item.w - 78);
      for (let light = 0; light < lightCount; light++) {
        const lit = Math.sin(item.phase * 1.35 - light * 1.4) > -0.15;
        ctx.globalAlpha = lit ? 0.95 : 0.25;
        ctx.fillStyle = light % 2 ? "#85e0a3" : "#f1c15b";
        ctx.beginPath();
        ctx.arc(x + 18 + (usableWidth * light) / Math.max(1, lightCount - 1), y + 61, lit ? 3.2 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawSandy(item) {
    const bob = Math.sin(item.phase) * 2;
    const x = item.x + 22;
    const y = item.y + bob;

    // Sandy's short, wavy blonde hair sits behind her face.
    ctx.fillStyle = "#e1c28e";
    [[-11, 10], [-13, 17], [-8, 3], [8, 3], [13, 11], [12, 19]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#efc5a6";
    ctx.beginPath();
    ctx.arc(x, y + 15, 14, 0, Math.PI * 2);
    ctx.fill();
    drawGlasses(x, y + 15, 1.15);
    roundedRect(x - 16, y + 29, 34, 35, 8, "#202124");
    ctx.strokeStyle = "#3d4b58";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    const step = Math.sin(item.phase) * 4;
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 62);
    ctx.lineTo(x - 10 + step, item.y + item.h);
    ctx.moveTo(x + 8, y + 62);
    ctx.lineTo(x + 12 - step, item.y + item.h);
    ctx.stroke();

    const propX = item.x + 52;
    let propY = y;
    if (hoveringSandyProps.has(item.prop)) propY += Math.sin(item.phase * 0.62) * 4 - 5;
    if (item.prop === "monster-truck") propY -= Math.abs(Math.sin(item.phase)) * 4;
    if (item.prop === "dinosaur-skeleton") propY += Math.sin(item.phase * 0.55) * 2;
    if (item.prop === "art") {
      ctx.strokeStyle = "#8a6449";
      ctx.lineWidth = 6;
      ctx.strokeRect(propX, y + 16, 39, 45);
      ctx.fillStyle = "#d7a687";
      ctx.fillRect(propX + 5, y + 21, 29, 35);
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.beginPath();
      ctx.arc(propX + 20, y + 37, 9, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.prop === "lamp") {
      ctx.strokeStyle = colors.dark;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(propX + 19, y + 20);
      ctx.lineTo(propX + 19, y + 68);
      ctx.stroke();
      ctx.fillStyle = "#d5a856";
      ctx.beginPath();
      ctx.moveTo(propX + 2, y + 24);
      ctx.lineTo(propX + 36, y + 24);
      ctx.lineTo(propX + 29, y + 2);
      ctx.lineTo(propX + 10, y + 2);
      ctx.closePath();
      ctx.fill();
      roundedRect(propX + 5, y + 66, 29, 6, 3, colors.dark);
    } else if (item.prop === "plant") {
      ctx.fillStyle = "#9b6546";
      ctx.beginPath();
      ctx.moveTo(propX + 7, y + 52);
      ctx.lineTo(propX + 37, y + 52);
      ctx.lineTo(propX + 32, y + 76);
      ctx.lineTo(propX + 12, y + 76);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#527861";
      ctx.lineWidth = 5;
      [[22, 53, 5, 16], [22, 50, 39, 12], [22, 50, 8, 32], [22, 48, 36, 30], [22, 46, 22, 5]].forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath();
        ctx.moveTo(propX + x1, y + y1);
        ctx.quadraticCurveTo(propX + x2, y + y2, propX + x2, y + y2);
        ctx.stroke();
      });
      ctx.fillStyle = "#6c9677";
      [[5, 16], [39, 12], [8, 32], [36, 30], [22, 5]].forEach(([lx, ly]) => {
        ctx.beginPath();
        ctx.ellipse(propX + lx, y + ly, 8, 14, lx < 22 ? -0.6 : 0.6, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (item.prop === "pillows") {
      const pillowColors = ["#d7a687", "#77958d", "#d5a856", "#8e6f91"];
      [0, 1, 2, 3].forEach((level) => {
        const offset = level % 2 ? 5 : 0;
        roundedRect(propX + offset, y + 55 - level * 17, 42, 19, 8, pillowColors[level]);
        ctx.fillStyle = "rgba(255,255,255,.32)";
        ctx.beginPath();
        ctx.arc(propX + offset + 21, y + 64 - level * 17, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (item.prop === "clock") {
      roundedRect(propX + 3, y + 3, 39, 73, 7, "#7d5136");
      roundedRect(propX + 8, y + 8, 29, 28, 14, "#f5ead8");
      ctx.strokeStyle = colors.dark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(propX + 22, y + 22, 10, 0, Math.PI * 2);
      ctx.moveTo(propX + 22, y + 22);
      ctx.lineTo(propX + 22, y + 15);
      ctx.moveTo(propX + 22, y + 22);
      ctx.lineTo(propX + 28, y + 25);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(propX + 22, y + 39);
      ctx.lineTo(propX + 22, y + 60);
      ctx.stroke();
      ctx.fillStyle = "#d5a856";
      ctx.beginPath();
      ctx.arc(propX + 22, y + 63, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.prop === "goose") {
      ctx.fillStyle = "#fffdf6";
      ctx.beginPath();
      ctx.ellipse(propX + 25, y + 55, 23, 17, -0.1, 0, Math.PI * 2);
      ctx.fill();
      roundedRect(propX + 33, y + 17, 12, 41, 6, "#fffdf6");
      ctx.beginPath();
      ctx.arc(propX + 39, y + 17, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#df8f43";
      ctx.beginPath();
      ctx.moveTo(propX + 47, y + 17);
      ctx.lineTo(propX + 61, y + 21);
      ctx.lineTo(propX + 47, y + 24);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = colors.dark;
      ctx.beginPath();
      ctx.arc(propX + 42, y + 14, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#df8f43";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(propX + 17, y + 69);
      ctx.lineTo(propX + 14, y + 79);
      ctx.moveTo(propX + 31, y + 69);
      ctx.lineTo(propX + 34, y + 79);
      ctx.stroke();
    } else if (item.prop === "throne") {
      roundedRect(propX + 3, y + 9, 47, 57, 12, "#6f4775");
      roundedRect(propX + 8, y + 40, 48, 27, 9, "#8e6f91");
      ctx.strokeStyle = "#d5a856";
      ctx.lineWidth = 5;
      ctx.strokeRect(propX + 5, y + 7, 47, 61);
      ctx.beginPath();
      ctx.moveTo(propX + 9, y + 7);
      ctx.lineTo(propX + 15, y);
      ctx.lineTo(propX + 23, y + 7);
      ctx.lineTo(propX + 31, y);
      ctx.lineTo(propX + 40, y + 7);
      ctx.lineTo(propX + 47, y);
      ctx.stroke();
    } else if (item.prop === "bathtub") {
      ctx.fillStyle = "#f2f0e8";
      ctx.beginPath();
      ctx.moveTo(propX - 3, y + 39);
      ctx.quadraticCurveTo(propX + 28, y + 76, propX + 63, y + 39);
      ctx.lineTo(propX + 66, y + 31);
      ctx.lineTo(propX - 6, y + 31);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#6f8d8c";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = "#8fc9d2";
      ctx.beginPath();
      ctx.ellipse(propX + 30, y + 33, 34, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6f8d8c";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(propX + 58, y + 31);
      ctx.lineTo(propX + 58, y + 17);
      ctx.quadraticCurveTo(propX + 58, y + 10, propX + 50, y + 10);
      ctx.lineTo(propX + 47, y + 10);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      [[12, 24, 5], [24, 19, 4], [33, 27, 3]].forEach(([bx, by, radius]) => {
        ctx.beginPath();
        ctx.arc(propX + bx, y + by, radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = "#f3c64d";
      ctx.beginPath();
      ctx.arc(propX + 39, y + 25, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(propX + 44, y + 23);
      ctx.lineTo(propX + 53, y + 26);
      ctx.lineTo(propX + 44, y + 29);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#b8863b";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(propX + 6, y + 62);
      ctx.quadraticCurveTo(propX - 1, y + 72, propX + 6, y + 78);
      ctx.moveTo(propX + 57, y + 62);
      ctx.quadraticCurveTo(propX + 67, y + 72, propX + 59, y + 78);
      ctx.stroke();
    } else if (item.prop === "piano") {
      ctx.fillStyle = "#252525";
      ctx.beginPath();
      ctx.moveTo(propX - 4, y + 27);
      ctx.quadraticCurveTo(propX + 42, y + 10, propX + 72, y + 31);
      ctx.lineTo(propX + 62, y + 56);
      ctx.lineTo(propX - 4, y + 56);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fffdf6";
      ctx.fillRect(propX - 5, y + 48, 45, 10);
      ctx.strokeStyle = colors.dark;
      ctx.lineWidth = 1;
      for (let key = 0; key < 6; key++) {
        ctx.beginPath();
        ctx.moveTo(propX + 2 + key * 7, y + 48);
        ctx.lineTo(propX + 2 + key * 7, y + 58);
        ctx.stroke();
      }
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(propX + 4, y + 55);
      ctx.lineTo(propX, y + 78);
      ctx.moveTo(propX + 57, y + 54);
      ctx.lineTo(propX + 64, y + 78);
      ctx.stroke();
    } else if (item.prop === "canoe") {
      ctx.fillStyle = "#c66a43";
      ctx.beginPath();
      ctx.moveTo(propX - 7, y + 38);
      ctx.quadraticCurveTo(propX + 38, y + 70, propX + 85, y + 38);
      ctx.quadraticCurveTo(propX + 38, y + 51, propX - 7, y + 38);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#74462f";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = "#d5a856";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(propX + 14, y + 13);
      ctx.lineTo(propX + 70, y + 68);
      ctx.stroke();
      ctx.fillStyle = "#d5a856";
      ctx.beginPath();
      ctx.ellipse(propX + 11, y + 10, 13, 6, 0.7, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.prop === "giraffe") {
      ctx.fillStyle = "#e1b34f";
      ctx.beginPath();
      ctx.ellipse(propX + 24, y + 55, 24, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      roundedRect(propX + 38, y + 13, 12, 46, 6, "#e1b34f");
      ctx.beginPath();
      ctx.ellipse(propX + 49, y + 12, 15, 9, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e1b34f";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(propX + 10, y + 63);
      ctx.lineTo(propX + 7, y + 80);
      ctx.moveTo(propX + 34, y + 63);
      ctx.lineTo(propX + 38, y + 80);
      ctx.stroke();
      ctx.fillStyle = "#9c6a38";
      [[14, 50], [29, 57], [43, 39], [45, 23], [51, 11]].forEach(([sx, sy]) => {
        ctx.beginPath();
        ctx.arc(propX + sx, y + sy, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = colors.dark;
      ctx.beginPath();
      ctx.arc(propX + 54, y + 9, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.prop === "aquarium") {
      ctx.fillStyle = "#88c4cb";
      ctx.fillRect(propX - 3, y + 13, 72, 49);
      ctx.strokeStyle = "#315f68";
      ctx.lineWidth = 5;
      ctx.strokeRect(propX - 3, y + 13, 72, 49);
      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.fillRect(propX + 3, y + 18, 5, 38);
      [[17, 31, "#df8f43"], [46, 44, "#d56e65"], [57, 27, "#d5a856"]].forEach(([fx, fy, fill]) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.ellipse(propX + fx, y + fy, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(propX + fx - 6, y + fy);
        ctx.lineTo(propX + fx - 13, y + fy - 5);
        ctx.lineTo(propX + fx - 13, y + fy + 5);
        ctx.closePath();
        ctx.fill();
      });
      ctx.strokeStyle = colors.dark;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(propX + 6, y + 63);
      ctx.lineTo(propX + 2, y + 80);
      ctx.moveTo(propX + 61, y + 63);
      ctx.lineTo(propX + 66, y + 80);
      ctx.stroke();
    } else if (item.prop === "jukebox") {
      roundedRect(propX, y + 5, 59, 72, 25, "#9b4f3f");
      roundedRect(propX + 7, y + 12, 45, 40, 19, "#f1c15b");
      roundedRect(propX + 13, y + 17, 33, 30, 14, "#315f68");
      ctx.fillStyle = "#f6e5c9";
      ctx.beginPath();
      ctx.arc(propX + 30, y + 32, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.dark;
      ctx.fillRect(propX + 10, y + 58, 39, 12);
      [16, 24, 32, 40].forEach((bx) => {
        ctx.fillStyle = bx % 16 ? "#79a98d" : "#d66c57";
        ctx.beginPath();
        ctx.arc(propX + bx, y + 64, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (item.prop === "wedding-cake") {
      roundedRect(propX - 2, y + 76, 78, 5, 2, "#b98b7a");
      roundedRect(propX + 31, y + 79, 12, 5, 2, "#b98b7a");
      roundedRect(propX + 3, y + 55, 68, 22, 6, "#fff9ec");
      roundedRect(propX + 12, y + 35, 50, 23, 6, "#fff9ec");
      roundedRect(propX + 22, y + 17, 31, 21, 6, "#fff9ec");
      ctx.strokeStyle = "#e6a5aa";
      ctx.lineWidth = 4;
      [y + 57, y + 37, y + 19].forEach((lineY, tier) => {
        ctx.beginPath();
        ctx.moveTo(propX + 7 + tier * 9, lineY);
        ctx.quadraticCurveTo(propX + 36, lineY + 8, propX + 67 - tier * 9, lineY);
        ctx.stroke();
      });
      [[15, 66], [28, 66], [42, 66], [56, 66], [22, 47], [36, 47], [49, 47], [31, 28], [44, 28]].forEach(([dotX, dotY]) => {
        ctx.fillStyle = "#d66c57";
        ctx.beginPath();
        ctx.arc(propX + dotX, y + dotY, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = "#30343a";
      ctx.beginPath();
      ctx.arc(propX + 33, y + 8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(propX + 29, y + 12, 8, 8);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(propX + 43, y + 8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(propX + 39, y + 12, 8, 8);
      ctx.strokeStyle = "#d66c57";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(propX + 36, y + 13);
      ctx.lineTo(propX + 40, y + 13);
      ctx.stroke();
    } else if (item.prop === "dining-table") {
      roundedRect(propX - 7, y + 40, 91, 12, 5, "#7d5136");
      ctx.strokeStyle = "#7d5136";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(propX + 2, y + 50);
      ctx.lineTo(propX - 1, y + 79);
      ctx.moveTo(propX + 74, y + 50);
      ctx.lineTo(propX + 80, y + 79);
      ctx.stroke();
      [8, 34, 60].forEach((px) => {
        ctx.fillStyle = "#fffdf6";
        ctx.beginPath();
        ctx.ellipse(propX + px, y + 38, 9, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#d5a856";
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      ctx.fillStyle = "#6f4775";
      roundedRect(propX + 21, y + 58, 27, 19, 6, "#6f4775");
      ctx.fillRect(propX + 25, y + 51, 19, 15);
    } else if (item.prop === "carousel") {
      ctx.strokeStyle = "#d5a856";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(propX + 35, y + 10);
      ctx.lineTo(propX + 35, y + 78);
      ctx.stroke();
      ctx.fillStyle = "#d66c57";
      ctx.beginPath();
      ctx.moveTo(propX - 2, y + 14);
      ctx.quadraticCurveTo(propX + 35, y - 7, propX + 74, y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fffdf6";
      ctx.beginPath();
      ctx.ellipse(propX + 37, y + 49, 25, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(propX + 58, y + 39, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8e6f91";
      ctx.beginPath();
      ctx.moveTo(propX + 27, y + 42);
      ctx.lineTo(propX + 45, y + 42);
      ctx.lineTo(propX + 42, y + 52);
      ctx.lineTo(propX + 30, y + 52);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#fffdf6";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(propX + 25, y + 56);
      ctx.lineTo(propX + 17, y + 75);
      ctx.moveTo(propX + 47, y + 56);
      ctx.lineTo(propX + 56, y + 75);
      ctx.stroke();
    } else if (item.prop === "t-rex") {
      ctx.fillStyle = "#5f8f64";
      // Long tail and heavy body create an unmistakable dinosaur silhouette.
      ctx.beginPath();
      ctx.moveTo(propX - 12, y + 48);
      ctx.lineTo(propX + 26, y + 35);
      ctx.lineTo(propX + 29, y + 57);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(propX + 42, y + 45, 29, 19, -0.08, 0, Math.PI * 2);
      ctx.fill();
      roundedRect(propX + 57, y + 24, 18, 30, 8, "#5f8f64");
      // Oversized head and open jaw.
      ctx.beginPath();
      ctx.moveTo(propX + 63, y + 27);
      ctx.quadraticCurveTo(propX + 86, y + 7, propX + 104, y + 20);
      ctx.lineTo(propX + 91, y + 34);
      ctx.lineTo(propX + 67, y + 35);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f4e9d2";
      ctx.beginPath();
      ctx.moveTo(propX + 76, y + 28);
      ctx.lineTo(propX + 100, y + 27);
      ctx.lineTo(propX + 91, y + 38);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fffdf6";
      [80, 87, 94].forEach((toothX) => {
        ctx.beginPath();
        ctx.moveTo(propX + toothX, y + 28);
        ctx.lineTo(propX + toothX + 3, y + 34);
        ctx.lineTo(propX + toothX + 5, y + 28);
        ctx.closePath();
        ctx.fill();
      });
      ctx.fillStyle = colors.dark;
      ctx.beginPath();
      ctx.arc(propX + 91, y + 18, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Thick legs and famously tiny arms.
      ctx.strokeStyle = "#47714e";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(propX + 31, y + 57);
      ctx.lineTo(propX + 23, y + 78);
      ctx.moveTo(propX + 54, y + 57);
      ctx.lineTo(propX + 64, y + 78);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(propX + 66, y + 42);
      ctx.lineTo(propX + 76, y + 49);
      ctx.lineTo(propX + 82, y + 46);
      ctx.stroke();
      ctx.fillStyle = "#365a3d";
      [[27, 40], [39, 52], [52, 38], [67, 30]].forEach(([spotX, spotY]) => {
        ctx.beginPath();
        ctx.arc(propX + spotX, y + spotY, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (drawSandySpectacle(item.prop, propX, propY)) {
      // Higher tiers are drawn by the escalating spectacle renderer.
    } else if (absurdSandyProps.has(item.prop)) {
      const propScale = sandyItemScale(item.tier, item.prop);
      ctx.save();
      ctx.translate(propX, propY + 78);
      ctx.scale(propScale, propScale);
      drawSandyAbsurdity(item.prop, 0, -78, item.phase);
      ctx.restore();
    } else {
      roundedRect(propX + 3, y + 36, 38, 31, 8, "#77958d");
      roundedRect(propX + 9, y + 17, 29, 30, 8, "#91aaa4");
      ctx.strokeStyle = colors.dark;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(propX + 10, y + 64);
      ctx.lineTo(propX + 6, item.y + item.h);
      ctx.moveTo(propX + 36, y + 64);
      ctx.lineTo(propX + 42, item.y + item.h);
      ctx.stroke();
    }

    ctx.strokeStyle = "#efc5a6";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 39);
    ctx.lineTo(propX + 5, propY + 45);
    ctx.stroke();
  }

  function drawLampObstacle(item) {
    const x = item.x;
    const y = item.y;
    const bottom = item.y + item.h;
    ctx.strokeStyle = colors.dark;
    ctx.lineCap = "round";

    if (item.variant === "table") {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + 24, y + 24);
      ctx.lineTo(x + 24, bottom - 6);
      ctx.stroke();
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 25);
      ctx.lineTo(x + 43, y + 25);
      ctx.lineTo(x + 35, y + 2);
      ctx.lineTo(x + 13, y + 2);
      ctx.closePath();
      ctx.fill();
      roundedRect(x + 8, bottom - 8, 32, 7, 3, colors.dark);
    } else if (item.variant === "arc") {
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x + 13, bottom - 7);
      ctx.quadraticCurveTo(x + 10, y + 3, x + 55, y + 11);
      ctx.lineTo(x + 55, y + 24);
      ctx.stroke();
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.moveTo(x + 39, y + 22);
      ctx.lineTo(x + 69, y + 22);
      ctx.lineTo(x + 62, y + 38);
      ctx.lineTo(x + 46, y + 38);
      ctx.closePath();
      ctx.fill();
      roundedRect(x + 1, bottom - 9, 29, 8, 4, colors.dark);
    } else if (item.variant === "tripod") {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 28);
      ctx.lineTo(x + 48, y + 28);
      ctx.lineTo(x + 39, y + 2);
      ctx.lineTo(x + 13, y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + 26, y + 28);
      ctx.lineTo(x + 5, bottom);
      ctx.moveTo(x + 26, y + 28);
      ctx.lineTo(x + 47, bottom);
      ctx.moveTo(x + 26, y + 28);
      ctx.lineTo(x + 26, bottom);
      ctx.stroke();
    } else {
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x + 23, y + 30);
      ctx.lineTo(x + 23, bottom - 3);
      ctx.stroke();
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 31);
      ctx.lineTo(x + 42, y + 31);
      ctx.lineTo(x + 34, y);
      ctx.lineTo(x + 12, y);
      ctx.closePath();
      ctx.fill();
      roundedRect(x + 8, bottom - 6, 30, 6, 3, colors.dark);
    }
  }

  function drawChairObstacle(item) {
    const x = item.x;
    const y = item.y;
    const bottom = item.y + item.h;
    ctx.strokeStyle = colors.dark;
    ctx.lineCap = "round";

    if (item.variant === "office") {
      roundedRect(x + 9, y + 1, 37, 34, 12, item.color);
      roundedRect(x + 5, y + 32, 47, 14, 6, item.color);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + 29, y + 45);
      ctx.lineTo(x + 29, bottom - 8);
      ctx.moveTo(x + 9, bottom - 8);
      ctx.lineTo(x + 49, bottom - 8);
      ctx.stroke();
      [7, 29, 51].forEach((wheelX) => {
        ctx.fillStyle = colors.dark;
        ctx.beginPath();
        ctx.arc(x + wheelX, bottom - 3, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (item.variant === "dining") {
      ctx.lineWidth = 6;
      ctx.strokeStyle = item.color;
      ctx.strokeRect(x + 7, y + 2, 34, 39);
      ctx.lineWidth = 3;
      [15, 24, 33].forEach((slatX) => {
        ctx.beginPath();
        ctx.moveTo(x + slatX, y + 5);
        ctx.lineTo(x + slatX, y + 35);
        ctx.stroke();
      });
      roundedRect(x + 4, y + 35, 40, 13, 4, item.color);
      ctx.strokeStyle = colors.dark;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 47);
      ctx.lineTo(x + 7, bottom);
      ctx.moveTo(x + 38, y + 47);
      ctx.lineTo(x + 42, bottom);
      ctx.stroke();
    } else if (item.variant === "rocker") {
      roundedRect(x + 18, y + 2, 34, 38, 11, item.color);
      roundedRect(x + 10, y + 34, 45, 14, 6, item.color);
      ctx.strokeStyle = colors.dark;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + 17, y + 47);
      ctx.lineTo(x + 10, bottom - 8);
      ctx.moveTo(x + 49, y + 47);
      ctx.lineTo(x + 57, bottom - 8);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x + 34, bottom - 13, 31, 0.15, Math.PI - 0.15);
      ctx.stroke();
    } else {
      roundedRect(x + 7, y + 25, item.w - 14, 31, 10, item.color);
      roundedRect(x + 15, y + 3, item.w - 30, 34, 11, item.color);
      roundedRect(x + 1, y + 29, 18, 28, 8, item.color);
      roundedRect(x + item.w - 19, y + 29, 18, 28, 8, item.color);
      ctx.fillStyle = colors.dark;
      ctx.fillRect(x + 11, bottom - 8, 7, 8);
      ctx.fillRect(x + item.w - 18, bottom - 8, 7, 8);
    }
  }

  function drawShowroomObstacle(item) {
    const x = item.x;
    const y = item.y;
    const bottom = y + item.h;
    const wood = item.color;
    const accent = "#f0d3bd";
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (item.variant === "bar-stool") {
      roundedRect(x + 4, y + 3, item.w - 8, 12, 6, wood);
      ctx.strokeStyle = colors.dark;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + 12, y + 14);
      ctx.lineTo(x + 6, bottom);
      ctx.moveTo(x + item.w - 12, y + 14);
      ctx.lineTo(x + item.w - 6, bottom);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 9, bottom - 20);
      ctx.lineTo(x + item.w - 9, bottom - 20);
      ctx.stroke();
    } else if (item.variant === "end-table") {
      roundedRect(x + 1, y + 2, item.w - 2, 9, 3, colors.dark);
      roundedRect(x + 6, y + 10, item.w - 12, 27, 4, wood);
      ctx.strokeStyle = "rgba(36,75,66,.48)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 7, y + 23);
      ctx.lineTo(x + item.w - 7, y + 23);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(x + item.w / 2, y + 17, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.dark;
      ctx.fillRect(x + 9, y + 36, 6, bottom - y - 36);
      ctx.fillRect(x + item.w - 15, y + 36, 6, bottom - y - 36);
    } else if (item.variant === "floor-mirror") {
      roundedRect(x + 2, y, item.w - 4, item.h - 3, 13, wood);
      roundedRect(x + 8, y + 7, item.w - 16, item.h - 18, 9, "#c7d8d5");
      ctx.save();
      ctx.globalAlpha = 0.3 + (Math.sin(item.phase * 0.35) + 1) * 0.1;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + 14, y + 59);
      ctx.lineTo(x + item.w - 13, y + 27);
      ctx.stroke();
      ctx.restore();
      roundedRect(x + 7, bottom - 6, item.w - 14, 6, 3, colors.dark);
    } else if (item.variant === "plant-stand") {
      ctx.fillStyle = "#567c57";
      [[27, 12, -0.65], [18, 20, -1.2], [35, 21, 1.1], [25, 27, 0.2], [38, 12, 0.65]].forEach(([leafX, leafY, angle]) => {
        ctx.save();
        ctx.translate(x + leafX, y + leafY);
        ctx.rotate(angle + Math.sin(item.phase * 0.2) * 0.04);
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      ctx.fillStyle = "#b56f58";
      ctx.beginPath();
      ctx.moveTo(x + 12, y + 30);
      ctx.lineTo(x + 42, y + 30);
      ctx.lineTo(x + 37, y + 49);
      ctx.lineTo(x + 17, y + 49);
      ctx.closePath();
      ctx.fill();
      roundedRect(x + 8, y + 48, 38, 7, 3, wood);
      ctx.strokeStyle = colors.dark;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 15, y + 54);
      ctx.lineTo(x + 10, bottom);
      ctx.moveTo(x + 39, y + 54);
      ctx.lineTo(x + 44, bottom);
      ctx.stroke();
    } else if (item.variant === "bookcase") {
      roundedRect(x + 1, y, item.w - 2, item.h, 5, wood);
      roundedRect(x + 8, y + 7, item.w - 16, item.h - 15, 2, "#f6eadf");
      [y + 30, y + 57].forEach((shelfY) => roundedRect(x + 6, shelfY, item.w - 12, 5, 2, colors.dark));
      const bookColors = ["#8a4c36", "#315f91", "#d5a856", "#62806f", "#8e6f91"];
      [[11, 10, 10, 18], [23, 13, 8, 15], [33, 8, 12, 20], [49, 12, 8, 16], [13, 38, 9, 16], [24, 35, 12, 19], [39, 40, 8, 14], [50, 36, 12, 18], [12, 65, 13, 15], [28, 63, 8, 17], [39, 67, 12, 13]].forEach(([bx, by, bw, bh], index) => {
        roundedRect(x + bx, y + by, bw, bh, 1, bookColors[index % bookColors.length]);
      });
    } else if (item.variant === "entryway-bench") {
      roundedRect(x + 3, y + 2, item.w - 6, 17, 7, wood);
      roundedRect(x + 7, y + 19, item.w - 14, 7, 3, colors.dark);
      ctx.fillStyle = colors.dark;
      ctx.fillRect(x + 12, y + 25, 7, bottom - y - 25);
      ctx.fillRect(x + item.w - 19, y + 25, 7, bottom - y - 25);
      ctx.strokeStyle = "rgba(36,75,66,.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + item.w / 2, y + 4);
      ctx.lineTo(x + item.w / 2, y + 17);
      ctx.stroke();
    } else if (item.variant === "folding-screen") {
      const panelW = 33;
      [0, 1, 2].forEach((panel) => {
        const panelX = x + panel * 35;
        roundedRect(panelX, y + (panel === 1 ? 2 : 0), panelW, item.h - (panel === 1 ? 2 : 0), 7, panel === 1 ? "#d9b69e" : wood);
        roundedRect(panelX + 5, y + 10, panelW - 10, item.h - 25, 4, panel === 1 ? "#f5e4d7" : "#dce8e4");
        ctx.strokeStyle = "rgba(138,76,54,.45)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(panelX + 6, y + 37);
        ctx.lineTo(panelX + panelW - 6, y + 37);
        ctx.stroke();
      });
      ctx.fillStyle = colors.dark;
      [34, 69].forEach((hingeX) => {
        ctx.beginPath();
        ctx.arc(x + hingeX, y + 24, 2.3, 0, Math.PI * 2);
        ctx.arc(x + hingeX, y + 66, 2.3, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (item.variant === "coat-rack") {
      ctx.strokeStyle = colors.dark;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x + 27, y + 8);
      ctx.lineTo(x + 27, bottom - 8);
      ctx.moveTo(x + 27, y + 19);
      ctx.lineTo(x + 9, y + 9);
      ctx.moveTo(x + 27, y + 19);
      ctx.lineTo(x + 45, y + 9);
      ctx.moveTo(x + 27, y + 30);
      ctx.lineTo(x + 13, y + 24);
      ctx.moveTo(x + 27, y + 30);
      ctx.lineTo(x + 41, y + 24);
      ctx.moveTo(x + 27, bottom - 8);
      ctx.lineTo(x + 7, bottom);
      ctx.moveTo(x + 27, bottom - 8);
      ctx.lineTo(x + 47, bottom);
      ctx.stroke();
      ctx.fillStyle = wood;
      ctx.beginPath();
      ctx.ellipse(x + 10, y + 10, 12, 6, -0.22, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.variant === "rolled-rug") {
      roundedRect(x + 10, y + 3, item.w - 11, item.h - 6, 10, wood);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(x + 11, y + item.h / 2, 11, item.h / 2 - 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.clay;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x + 11, y + item.h / 2, 6, 0.15, Math.PI * 2.15);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 34, y + 5);
      ctx.lineTo(x + 34, bottom - 5);
      ctx.moveTo(x + 62, y + 5);
      ctx.lineTo(x + 62, bottom - 5);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawObstacle(item) {
    if (item.type === "shopper") {
      drawCustomer(item);
    } else if (item.type === "family") {
      drawFamily(item);
    } else if (item.type === "sandy") {
      if (reactiveSandyProps.has(item.prop)) {
        const propX = item.x + 52;
        let propY = item.y + Math.sin(item.phase) * 2;
        if (hoveringSandyProps.has(item.prop)) propY += Math.sin(item.phase * 0.62) * 4 - 5;
        if (item.prop === "monster-truck") propY -= Math.abs(Math.sin(item.phase)) * 4;
        if (item.prop === "dinosaur-skeleton") propY += Math.sin(item.phase * 0.55) * 2;
        const propScale = sandyItemScale(item.tier, item.prop);
        ctx.save();
        ctx.translate(propX, propY + 78);
        ctx.scale(propScale, propScale);
        ctx.translate(-propX, -(propY + 78));
        drawSandyEffectUnderlay(item, propX, propY);
        ctx.restore();
        drawSandy(item);
        ctx.save();
        ctx.translate(propX, propY + 78);
        ctx.scale(propScale, propScale);
        ctx.translate(-propX, -(propY + 78));
        drawSandyEffectOverlay(item, propX, propY);
        ctx.restore();
      } else {
        drawSandy(item);
      }
    } else if (item.type === "lamp") {
      drawLampObstacle(item);
    } else if (item.type === "chair") {
      drawChairObstacle(item);
    } else if (item.type === "showroom") {
      drawShowroomObstacle(item);
    }
  }

  function drawLaserLeagueWaveMark(item) {
    if (!superKids || !item.heroWave || item.heroBlast || !visibleToLaserLeague(item)) return;
    const x = item.x + item.w / 2;
    const y = item.y + item.h / 2;
    const radius = Math.max(item.w, item.h) * 0.62 + 8;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let ring = 0; ring < 2; ring++) {
      ctx.globalAlpha = 0.32 - ring * 0.1;
      ctx.strokeStyle = ring ? "#70eaff" : "#8d68ff";
      ctx.lineWidth = 4 - ring;
      ctx.setLineDash([8 + ring * 4, 7]);
      ctx.lineDashOffset = -superKids.phase * (2 + ring);
      ctx.beginPath();
      ctx.arc(x, y, radius + ring * 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 9px Poppins, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SIEGE", x, y - radius - 8);
    ctx.restore();
  }

  function drawHeroBlast(item) {
    if (!item.heroBlast) return;
    const progress = 1 - item.heroBlast / (item.heroBlastTotal || 0.2);
    const x = item.x + item.w / 2;
    const y = item.y + item.h / 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let ring = 0; ring < 3; ring++) {
      ctx.globalAlpha = Math.max(0, 0.86 - progress * 0.7 - ring * 0.16);
      ctx.strokeStyle = ring === 1 ? "#ffffff" : "#50d8ff";
      ctx.lineWidth = 5 - ring;
      ctx.beginPath();
      ctx.arc(x, y, 10 + progress * 42 + ring * 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let spark = 0; spark < 8; spark++) {
      const angle = spark * Math.PI / 4 + item.phase * 0.08;
      const inner = 12 + progress * 24;
      const outer = inner + 12 + progress * 20;
      ctx.globalAlpha = Math.max(0, 0.9 - progress * 0.7);
      ctx.strokeStyle = spark % 2 ? "#ffffff" : "#65e8ff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
      ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawOrbitFurnitureSilhouette(kind, x, y, scale, rotation, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(3,5,24,.84)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    if (kind === 0) {
      ctx.roundRect(-38, -8, 76, 28, 8);
      ctx.rect(-34, -26, 68, 22);
      ctx.rect(-31, 20, 7, 16);
      ctx.rect(24, 20, 7, 16);
    } else if (kind === 1) {
      ctx.moveTo(-22, -18);
      ctx.lineTo(22, -18);
      ctx.lineTo(12, 2);
      ctx.lineTo(-12, 2);
      ctx.closePath();
      ctx.rect(-3, 2, 6, 31);
      ctx.rect(-17, 33, 34, 5);
    } else if (kind === 2) {
      ctx.rect(-27, -32, 54, 64);
      ctx.rect(-20, -24, 40, 48);
    } else if (kind === 3) {
      ctx.rect(-25, -8, 50, 18);
      ctx.rect(-22, -34, 9, 26);
      ctx.rect(-22, 10, 7, 28);
      ctx.rect(15, 10, 7, 28);
    } else {
      ctx.ellipse(0, 17, 18, 22, 0, 0, Math.PI * 2);
      ctx.moveTo(0, -5);
      ctx.lineTo(0, -27);
      ctx.moveTo(0, -18);
      ctx.lineTo(-17, -32);
      ctx.moveTo(0, -16);
      ctx.lineTo(17, -30);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawCosmicShowroomArena(opacity, blend) {
    if (!cosmicBackdropLayer || !cosmicNebulaLayer || !cosmicStarsLayer || !cosmicOrbitLayer || !cosmicGridLayer) return;
    ctx.save();
    const arenaAlpha = opacity * blend;
    const starBlend = Math.max(0, Math.min(1, (blend - 0.12) / 0.88));
    const orbitBlend = Math.max(0, Math.min(1, (blend - 0.28) / 0.72));
    const gridBlend = Math.max(0, Math.min(1, (blend - 0.42) / 0.58));
    ctx.globalAlpha = arenaAlpha;
    ctx.drawImage(cosmicBackdropLayer, 0, 0);
    ctx.drawImage(cosmicNebulaLayer, 0, 0);

    ctx.globalCompositeOperation = "lighter";
    const starPulse = 0.78 + Math.sin(superKids.phase * 0.22) * 0.16;
    ctx.globalAlpha = opacity * starBlend * starPulse;
    ctx.drawImage(cosmicStarsLayer, 0, 0);

    ctx.globalAlpha = opacity * orbitBlend * 0.55;
    ctx.drawImage(cosmicOrbitLayer, 0, 0);

    const orbitingItemCount = compactRender ? 8 : 12;
    for (let item = 0; item < orbitingItemCount; item++) {
      const orbit = item % 4;
      const angle = superKids.phase * (0.035 + orbit * 0.008) + item * Math.PI * 2 / orbitingItemCount;
      const radiusX = 220 + orbit * 72;
      const radiusY = 62 + orbit * 23;
      const x = 480 + Math.cos(angle) * radiusX;
      const y = 150 + Math.sin(angle) * radiusY;
      const depth = 0.58 + (Math.sin(angle) + 1) * 0.18;
      drawOrbitFurnitureSilhouette(item % 5, x, y, depth, angle * 0.38, item % 2 ? "#55eeff" : "#a56dff");
    }

    ctx.globalAlpha = opacity * gridBlend * 0.52;
    ctx.drawImage(cosmicGridLayer, 0, 0);
    ctx.restore();
  }

  function drawSuperKidsAtmosphere() {
    if (!superKids) return;
    const { age, x, y, opacity } = superKidsPose();
    ctx.save();
    if (superKids.variant === 2 && superKids.powerStage >= 4) {
      const transition = Math.max(0, Math.min(1, superKids.stageDwell / 1.6));
      const cosmicBlend = transition * transition * (3 - 2 * transition);
      drawCosmicShowroomArena(opacity, cosmicBlend);
    }
    ctx.globalAlpha = opacity * 0.2;
    ctx.fillStyle = "#061936";
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";
    for (let streak = 0; streak < 9; streak++) {
      const streakY = 38 + streak * 34 + Math.sin(superKids.phase * 0.25 + streak) * 11;
      const streakX = W - ((superKids.phase * 34 + streak * 117) % (W + 260));
      ctx.globalAlpha = opacity * (0.08 + (streak % 3) * 0.035);
      ctx.strokeStyle = streak % 2 ? "#9af3ff" : "#5d86ff";
      ctx.lineWidth = 2 + streak % 3;
      ctx.beginPath();
      ctx.moveTo(streakX, streakY);
      ctx.lineTo(streakX + 92 + streak % 3 * 36, streakY);
      ctx.stroke();
    }

    if (age < 1.65) {
      const portalAlpha = Math.min(1, age * 3.5, (1.65 - age) * 1.6);
      const portalX = 48;
      const portalY = 178;
      for (let ring = 0; ring < 5; ring++) {
        ctx.globalAlpha = opacity * portalAlpha * (0.76 - ring * 0.11);
        ctx.strokeStyle = ring % 2 ? "#ffffff" : "#58ddff";
        ctx.lineWidth = 8 - ring;
        ctx.beginPath();
        ctx.ellipse(portalX, portalY, 30 + ring * 13, 112 + ring * 9, 0, -1.32 + ring * 0.08, 1.32 - ring * 0.08);
        ctx.stroke();
      }
    }

    if (superKids.comboLife > 0) {
      const comboProgress = 1 - superKids.comboLife / superKids.comboTotal;
      ctx.globalAlpha = Math.sin(comboProgress * Math.PI) * 0.22;
      ctx.fillStyle = "#bff8ff";
      ctx.fillRect(0, 0, W, H);
    }

    if (superKids.variant === 1 && superKids.life < 0.9) {
      const exitProgress = 1 - superKids.life / 0.9;
      const boomX = x + 330;
      const boomY = y + 135;
      for (let ring = 0; ring < 4; ring++) {
        ctx.globalAlpha = opacity * (0.72 - ring * 0.13);
        ctx.strokeStyle = ring % 2 ? "#ffffff" : "#70e7ff";
        ctx.lineWidth = 7 - ring;
        ctx.beginPath();
        ctx.arc(boomX, boomY, 35 + exitProgress * 150 + ring * 17, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function superKidsPose() {
    const age = superKids.total - superKids.life;
    const enter = Math.min(1, age / 0.55);
    const exit = superKids.variant === 1 && superKids.life < 0.65 ? 1 - superKids.life / 0.65 : 0;
    const eased = 1 - Math.pow(1 - enter, 3);
    return {
      age,
      x: superKidsRestingX - (1 - eased) * 470 + exit * 480,
      y: superKidsRestingY + Math.sin(superKids.phase * 0.6) * 7,
      opacity: superKids.variant === 2 ? Math.min(1, enter * 1.8) : Math.min(1, enter * 1.8, superKids.life * 1.8),
    };
  }

  function drawLaserHeroSprite(x, y, alpha = 1, glow = true) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (glow && superKids?.powerStage >= 4) {
      ctx.shadowColor = "#c8fbff";
      ctx.shadowBlur = (28 + Math.sin(superKids.phase * 1.3) * 8) * (compactRender ? 0.6 : 1);
    }
    ctx.drawImage(laserHeroSprite, x, y, laserHeroW, laserHeroH);
    ctx.restore();
  }

  function drawVortexHeroSprite(x, y, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(vortexHeroSprite, x, y, vortexHeroW, vortexHeroH);
    ctx.restore();
  }

  function drawSuperKids() {
    if (!superKids) return;
    const anchors = superKidsAnchors();
    const {
      age, opacity, laserX, laserY, vortexSpriteX, vortexSpriteY,
      eyeX, eyeY, handX, handY, handTwoX, handTwoY,
      vortexX, vortexY, gravityBallX, gravityBallY,
    } = anchors;

    ctx.save();
    ctx.globalAlpha = opacity;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(126,105,255,.62)";
    ctx.lineWidth = 3;
    for (let index = 0; index < collectibles.length; index++) {
      const tag = collectibles[index];
      const tagX = tag.x + tag.w / 2;
      const tagY = tag.y + tag.h / 2;
      if (tagX < vortexX || tagX - vortexX > 360) continue;
      ctx.beginPath();
      ctx.moveTo(vortexX, vortexY);
      ctx.quadraticCurveTo(vortexX + (tagX - vortexX) * 0.48, tagY - 42, tagX, tagY);
      ctx.stroke();
    }
    ctx.restore();

    if (superKids.waveLabelLife > 0) {
      const waveAge = 2.6 - superKids.waveLabelLife;
      const bannerAlpha = Math.min(1, waveAge * 3.4, superKids.waveLabelLife * 1.7);
      ctx.globalAlpha = opacity * bannerAlpha;
      roundedRect(274, 16, 412, 56, 18, "rgba(35,22,82,.94)");
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 21px Poppins, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(superKids.variant === 2 ? "LASER LEAGUE 2!" : "SHOWROOM SIEGE!", 480, 42);
      ctx.fillStyle = "#8ff3ff";
      ctx.font = "800 10px Poppins, sans-serif";
      ctx.fillText(superKids.variant === 2 ? "COSMIC OVERDRIVE · WILLPOWER BEYOND MAX" : "CHARGE WILLPOWER · CLEAR THE SPECIAL WAVE", 480, 59);
      ctx.globalAlpha = opacity;
    }

    if (superKids.comboLife <= 0) {
      const meterX = 338;
      const meterY = 78;
      const meterW = 284;
      const meterFill = (meterW - 8) * superKids.overdrive / 100;
      roundedRect(meterX, meterY, meterW, 27, 14, "rgba(8,25,58,.9)");
      if (meterFill > 0) {
        const meterGradient = ctx.createLinearGradient(meterX, 0, meterX + meterW, 0);
        meterGradient.addColorStop(0, "#5d70ff");
        meterGradient.addColorStop(0.58, "#36dfff");
        meterGradient.addColorStop(1, "#ffffff");
        roundedRect(meterX + 4, meterY + 4, meterFill, 19, 10, meterGradient);
      }
      ctx.strokeStyle = superKids.overdrive >= 100 ? "#ffffff" : "rgba(157,244,255,.65)";
      ctx.lineWidth = superKids.overdrive >= 100 ? 3 + Math.sin(superKids.phase) : 1.5;
      ctx.strokeRect(meterX + 1, meterY + 1, meterW - 2, 25);
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 11px Poppins, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`WILLPOWER ${Math.round(superKids.overdrive)}%`, 480, 96);
    }

    if (superKids.stageFlashLife > 0 && superKids.comboLife <= 0) {
      const stageLife = superKids.powerStage === 4 ? 2 : 1.35;
      const stageProgress = 1 - superKids.stageFlashLife / stageLife;
      const stageAlpha = Math.min(1, stageProgress * 6, superKids.stageFlashLife * 2.4);
      const stageTitles = ["", "POWER HANDS ONLINE", "PHOTON VISION ONLINE", "QUAD LASER UNLEASHED", "WILLPOWER: MAX"];
      const stageColors = ["", "#82efff", "#48d6ff", "#ffffff", "#fff8c9"];
      ctx.save();
      ctx.globalAlpha = opacity * stageAlpha;
      ctx.translate(754, 132);
      ctx.rotate(-0.035);
      roundedRect(-154, -23, 308, 46, 12, "rgba(8,31,70,.92)");
      ctx.strokeStyle = stageColors[superKids.powerStage];
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-148, -17, 296, 34);
      ctx.fillStyle = stageColors[superKids.powerStage];
      ctx.font = "900 15px Poppins, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(stageTitles[superKids.powerStage], 0, 6);
      ctx.restore();
    }

    if (superKids.powerStage >= 4) {
      const maxPulse = 0.72 + Math.sin(superKids.phase * 1.5) * 0.2;
      const glowX = laserX + laserHeroW * 0.57;
      const glowY = laserY + laserHeroH * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const willGlow = ctx.createRadialGradient(glowX, glowY, 12, glowX, glowY, 172);
      willGlow.addColorStop(0, `rgba(255,255,255,${0.34 * maxPulse})`);
      willGlow.addColorStop(0.35, `rgba(79,224,255,${0.24 * maxPulse})`);
      willGlow.addColorStop(1, "rgba(52,99,255,0)");
      ctx.fillStyle = willGlow;
      ctx.fillRect(glowX - 180, glowY - 135, 360, 270);
      for (let ray = 0; ray < 12; ray++) {
        const angle = ray * Math.PI / 6 + superKids.phase * 0.035;
        ctx.globalAlpha = opacity * (0.16 + ray % 3 * 0.04) * maxPulse;
        ctx.strokeStyle = ray % 2 ? "#ffffff" : "#5ce9ff";
        ctx.lineWidth = 2 + ray % 3;
        ctx.beginPath();
        ctx.moveTo(glowX + Math.cos(angle) * 82, glowY + Math.sin(angle) * 58);
        ctx.lineTo(glowX + Math.cos(angle) * 178, glowY + Math.sin(angle) * 126);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (superKids.powerStage >= 4 && superKids.comboLife <= 0) {
      const chargePulse = 0.5 + Math.sin(superKids.phase * 1.7) * 0.24;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      [[eyeX, eyeY], [handX, handY], [handTwoX, handTwoY]].forEach(([sourceX, sourceY], index) => {
        ctx.globalAlpha = opacity * chargePulse * 0.45;
        ctx.strokeStyle = index ? "#76edff" : "#ffffff";
        ctx.lineWidth = index ? 4 : 3;
        ctx.beginPath();
        ctx.moveTo(sourceX, sourceY);
        ctx.quadraticCurveTo((sourceX + gravityBallX) / 2, gravityBallY - 48, gravityBallX, gravityBallY);
        ctx.stroke();
      });
      for (let ring = 0; ring < 3; ring++) {
        ctx.globalAlpha = opacity * (0.62 - ring * 0.14);
        ctx.strokeStyle = ring % 2 ? "#ffffff" : "#8377ff";
        ctx.lineWidth = 5 - ring;
        ctx.beginPath();
        ctx.arc(gravityBallX, gravityBallY, 30 + ring * 11 + chargePulse * 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (superKids.laserLife > 0 && superKids.laserTarget) {
      const target = superKids.laserTarget;
      const targetX = target.x + target.w * 0.48;
      const targetY = target.y + target.h * 0.45;
      const pulse = superKids.laserLife / 0.22;
      let laserSources;
      if (superKids.powerStage < 2) {
        laserSources = [
          { x: handX, y: handY, kind: "hand" },
          { x: handTwoX, y: handTwoY, kind: "hand" },
        ];
      } else if (superKids.powerStage < 3) {
        laserSources = [
          { x: eyeX - 3, y: eyeY, kind: "eye" },
          { x: eyeX + 5, y: eyeY + 1, kind: "eye" },
        ];
      } else {
        laserSources = [
          { x: eyeX - 3, y: eyeY, kind: "eye" },
          { x: eyeX + 5, y: eyeY + 1, kind: "eye" },
          { x: handX, y: handY, kind: "hand" },
          { x: handTwoX, y: handTwoY, kind: "hand" },
        ];
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      laserSources.forEach(({ x: sourceX, y: sourceY, kind }, index) => {
        ctx.globalAlpha = opacity * (0.55 + pulse * 0.45);
        ctx.strokeStyle = kind === "hand" ? "#8ff5ff" : "#36c8ff";
        ctx.lineWidth = kind === "hand" ? 10 : 6.5;
        ctx.beginPath();
        ctx.moveTo(sourceX, sourceY);
        ctx.lineTo(targetX, targetY + (index - (laserSources.length - 1) / 2) * 5);
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = kind === "hand" ? 3 : 2.1;
        ctx.stroke();
      });
      ctx.restore();
    }

    if (superKids.comboLife > 0) {
      const comboProgress = 1 - superKids.comboLife / superKids.comboTotal;
      const launched = Math.min(1, Math.max(0, (comboProgress - 0.18) * 1.42));
      const chargePulse = Math.min(1, comboProgress / 0.2);
      const ballX = gravityBallX + Math.pow(launched, 0.72) * (W - gravityBallX + 90);
      const ballY = gravityBallY - Math.sin(launched * Math.PI) * 96;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      if (launched > 0) {
        ctx.globalAlpha = opacity * 0.7;
        ctx.strokeStyle = "#806dff";
        ctx.lineWidth = 38 * (1 - launched * 0.55);
        ctx.beginPath();
        ctx.moveTo(gravityBallX, gravityBallY);
        ctx.quadraticCurveTo((gravityBallX + ballX) / 2, ballY - 78, ballX, ballY);
        ctx.stroke();
      }
      [[eyeX, eyeY], [handX, handY], [handTwoX, handTwoY], [vortexX, vortexY]].forEach(([sourceX, sourceY], index) => {
        ctx.globalAlpha = opacity * chargePulse * (1 - launched * 0.65);
        ctx.strokeStyle = index === 3 ? "#9f83ff" : "#ffffff";
        ctx.lineWidth = index === 3 ? 11 : 5;
        ctx.beginPath();
        ctx.moveTo(sourceX, sourceY);
        ctx.lineTo(ballX, ballY);
        ctx.stroke();
      });
      for (let ring = 4; ring >= 0; ring--) {
        ctx.globalAlpha = opacity * (0.94 - ring * 0.12);
        ctx.fillStyle = ring % 2 ? "#5f6fff" : "#e7fdff";
        ctx.beginPath();
        ctx.arc(ballX, ballY, 19 + ring * 8 + Math.sin(comboProgress * Math.PI) * 18, 0, Math.PI * 2);
        ctx.fill();
      }
      if (launched > 0.72) {
        for (let ring = 0; ring < 4; ring++) {
          ctx.globalAlpha = opacity * (launched - 0.72) * (2.6 - ring * 0.42);
          ctx.strokeStyle = ring % 2 ? "#ffffff" : "#6ff2ff";
          ctx.lineWidth = 8 - ring;
          ctx.beginPath();
          ctx.arc(ballX, ballY, 44 + ring * 24 + (launched - 0.72) * 150, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();

      const titleAlpha = Math.sin(Math.min(1, comboProgress * 1.18) * Math.PI);
      ctx.save();
      ctx.globalAlpha = opacity * titleAlpha;
      ctx.translate(480, 50);
      ctx.rotate(-0.022);
      roundedRect(-204, -34, 408, 68, 15, "rgba(22,12,72,.96)");
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.strokeRect(-197, -27, 394, 54);
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 23px Poppins, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("WILLPOWER: MAX!", 0, -2);
      ctx.fillStyle = "#89f5ff";
      ctx.font = "900 11px Poppins, sans-serif";
      ctx.fillText("GRAVITY ALLEY-OOP", 0, 18);
      ctx.restore();
      ctx.globalAlpha = opacity;
    }

    const spritesReady = laserHeroSprite && vortexHeroSprite;
    if (spritesReady) {
      const trailStrength = age < 1.2 || superKids.comboLife > 0 || superKids.life < 1 ? 1 : 0.35;
      const trailCount = compactRender ? 1 : 2;
      for (let trail = trailCount; trail >= 1; trail--) {
        drawVortexHeroSprite(vortexSpriteX - trail * 8, vortexSpriteY + trail * 2, trailStrength * (0.025 + trail * 0.02));
        drawLaserHeroSprite(laserX - trail * 15, laserY + trail * 2, trailStrength * (0.035 + trail * 0.025), false);
      }
      drawVortexHeroSprite(vortexSpriteX, vortexSpriteY);
      drawLaserHeroSprite(laserX, laserY);
    } else {
      ctx.strokeStyle = "#62ddff";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(260, 190, 105, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#173b5c";
      ctx.font = "900 22px Poppins, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("LASER LEAGUE", 260, 198);
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const energyAnchors = [[eyeX, eyeY], [handX, handY], [handTwoX, handTwoY], [vortexX, vortexY], [gravityBallX, gravityBallY]];
    const energySparkCount = compactRender ? 18 : 26;
    for (let spark = 0; spark < energySparkCount; spark++) {
      const anchor = energyAnchors[spark % energyAnchors.length];
      const angle = superKids.phase * (0.12 + spark % 4 * 0.025) + spark * 2.1;
      const radius = 8 + spark % 7 * 4;
      ctx.globalAlpha = opacity * (0.3 + spark % 3 * 0.16);
      ctx.fillStyle = spark % 5 === 0 ? "#ffffff" : spark % 2 ? "#73eaff" : "#937cff";
      ctx.beginPath();
      ctx.arc(anchor[0] + Math.cos(angle) * radius, anchor[1] + Math.sin(angle) * radius, 1.5 + spark % 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  function drawLaserLeagueFinale() {
    if (!laserLeagueFinale) return;
    const progress = Math.max(0, Math.min(1, 1 - laserLeagueFinale.life / laserLeagueFinale.total));
    const chargeProgress = Math.min(1, progress / 0.62);
    const blastProgress = Math.max(0, Math.min(1, (progress - 0.62) / 0.38));
    ctx.save();

    if (laserFinaleBackdropLayer) ctx.drawImage(laserFinaleBackdropLayer, 0, 0);
    else {
      ctx.fillStyle = "#09072c";
      ctx.fillRect(0, 0, W, H);
    }

    ctx.globalCompositeOperation = "lighter";
    const finaleRayCount = compactRender ? 16 : 24;
    for (let ray = 0; ray < finaleRayCount; ray++) {
      const angle = ray * Math.PI * 2 / finaleRayCount + laserLeagueFinale.phase * 0.015;
      const inner = 55 + chargeProgress * 22;
      const outer = 620 + ray % 4 * 80;
      ctx.globalAlpha = 0.12 + ray % 3 * 0.035;
      ctx.strokeStyle = ray % 2 ? "#71efff" : "#9a72ff";
      ctx.lineWidth = 3 + ray % 4;
      ctx.beginPath();
      ctx.moveTo(290 + Math.cos(angle) * inner, 220 + Math.sin(angle) * inner);
      ctx.lineTo(290 + Math.cos(angle) * outer, 220 + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";

    if (willFinaleSprite) {
      const zoom = 1 + Math.sin(Math.min(1, chargeProgress) * Math.PI * 0.5) * 0.075;
      const drawW = 760 * zoom;
      const drawH = 507 * zoom;
      ctx.save();
      ctx.shadowColor = "#4deaff";
      ctx.shadowBlur = (32 + chargeProgress * 28) * (compactRender ? 0.58 : 1);
      ctx.drawImage(willFinaleSprite, -14 - (drawW - 760) * 0.36, -28 - (drawH - 507) * 0.34, drawW, drawH);
      ctx.restore();
    }

    const orbX = 174;
    const orbY = 304;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let ring = 4; ring >= 0; ring--) {
      ctx.globalAlpha = 0.9 - ring * 0.13;
      ctx.fillStyle = ring % 2 ? "#57eaff" : "#ffffff";
      ctx.beginPath();
      ctx.arc(orbX, orbY, 12 + ring * 10 + chargeProgress * 18 + Math.sin(laserLeagueFinale.phase) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const titleAlpha = Math.min(1, progress * 7) * (1 - blastProgress * 0.75);
    ctx.globalAlpha = titleAlpha;
    ctx.save();
    ctx.translate(708, 72);
    ctx.rotate(-0.025);
    roundedRect(-216, -43, 432, 86, 16, "rgba(8,18,58,.94)");
    ctx.strokeStyle = "#8cf6ff";
    ctx.lineWidth = 3;
    ctx.strokeRect(-208, -35, 416, 70);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 24px Poppins, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("POWER LEVEL: BEYOND MAX", 0, -5);
    ctx.fillStyle = "#86efff";
    ctx.font = "900 12px Poppins, sans-serif";
    ctx.fillText("WILL. POWER. UNLEASHED.", 0, 19);
    ctx.restore();

    if (blastProgress > 0) {
      const sourceX = orbX;
      const sourceY = orbY;
      const beamHalf = 18 + blastProgress * 195;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, blastProgress * 2.4);
      ctx.fillStyle = "rgba(61,222,255,.86)";
      ctx.beginPath();
      ctx.moveTo(sourceX, sourceY - 8 - blastProgress * 10);
      ctx.lineTo(W + 80, sourceY - beamHalf);
      ctx.lineTo(W + 80, sourceY + beamHalf);
      ctx.lineTo(sourceX, sourceY + 8 + blastProgress * 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.96)";
      ctx.beginPath();
      ctx.moveTo(sourceX, sourceY - 4);
      ctx.lineTo(W + 80, sourceY - beamHalf * 0.42);
      ctx.lineTo(W + 80, sourceY + beamHalf * 0.42);
      ctx.lineTo(sourceX, sourceY + 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (blastProgress > 0.48) {
      const whiteout = Math.pow((blastProgress - 0.48) / 0.52, 1.35);
      ctx.globalAlpha = whiteout;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
    }

    ctx.globalAlpha = Math.max(0, 1 - blastProgress * 1.3);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 9;
    ctx.strokeRect(7, 7, W - 14, H - 14);
    ctx.restore();
  }

  function drawTag(item) {
    ctx.save();
    ctx.translate(item.x + item.w / 2, item.y + item.h / 2);
    ctx.rotate(Math.sin(item.phase) * 0.16);
    ctx.fillStyle = "#fffdf6";
    ctx.strokeStyle = colors.clay;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-15, -21);
    ctx.lineTo(10, -21);
    ctx.lineTo(15, -14);
    ctx.lineTo(15, 21);
    ctx.lineTo(-15, 21);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.clay;
    ctx.beginPath();
    ctx.arc(7, -13, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "700 17px Poppins";
    ctx.textAlign = "center";
    ctx.fillText("$", 0, 10);
    ctx.restore();
  }

  function withinDrawRange(item, margin = 0) {
    return item.x < W + margin && item.x + item.w > -margin;
  }

  function draw() {
    let locomotive = null;
    let tRex = null;
    let thundercloud = null;
    let kaiju = null;
    let rollerCoaster = null;
    let dragon = null;
    for (let index = 0; index < obstacles.length; index++) {
      const item = obstacles[index];
      if (!withinDrawRange(item)) continue;
      if (item.prop === "steam-locomotive") locomotive = item;
      else if (item.prop === "t-rex") tRex = item;
      else if (item.prop === "thundercloud") thundercloud = item;
      else if (item.prop === "friendly-kaiju") kaiju = item;
      else if (item.prop === "roller-coaster") rollerCoaster = item;
      else if (item.prop === "fire-breathing-dragon") dragon = item;
    }
    const thunderFlash = thundercloud && Math.sin(thundercloud.phase * 1.7) > 0.62;
    const kaijuStomp = kaiju && Math.sin(kaiju.phase) > 0.72;
    const rollerRattle = rollerCoaster && Math.sin(rollerCoaster.phase * 1.2) > 0.25;
    const dragonRoar = dragon && Math.sin(dragon.phase * 1.4) > 0.82;
    const rumble = thunderFlash ? 3.2 : locomotive ? 2.6 : kaijuStomp ? 1.8 : rollerRattle ? 1.35 : dragonRoar ? 1.1 : (tRex && Math.sin(tRex.phase) > 0.65 ? 1.2 : 0);
    const heroAge = superKids ? superKids.total - superKids.life : 0;
    const heroRumble = laserLeagueFinale
      ? (laserLeagueFinale.blastPlayed ? 8.5 : 3.6)
      : !superKids ? 0 : superKids.comboLife > 0 ? 4.8 : heroAge < 0.65 ? (0.65 - heroAge) * 7 : superKids.life < 0.8 ? 2.8 : 0;
    const totalRumble = Math.max(rumble, heroRumble);
    ctx.save();
    if (totalRumble) ctx.translate(Math.sin(elapsed * 73) * totalRumble, Math.cos(elapsed * 91) * totalRumble * 0.55);
    drawShowroom();
    drawSuperKidsAtmosphere();
    for (let index = 0; index < collectibles.length; index++) {
      const item = collectibles[index];
      if (withinDrawRange(item, 60)) drawTag(item);
    }
    let clearanceItem = null;
    for (let index = 0; index < obstacles.length; index++) {
      const item = obstacles[index];
      if (!withinDrawRange(item, 240)) continue;
      drawObstacle(item);
      drawLaserLeagueWaveMark(item);
      drawHeroBlast(item);
      if (item.clearance) clearanceItem = item;
    }
    if (clearanceItem) drawKamdenClearanceSticker(clearanceItem);
    drawKamden();
    drawBrenda();
    for (let index = 0; index < dust.length; index++) {
      const particle = dust[index];
      ctx.globalAlpha = Math.max(0, particle.life * 1.8);
      ctx.fillStyle = "#b9a795";
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size || 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.save();
    if (recoveryGrace > 0) ctx.globalAlpha = Math.sin(recoveryGrace * 22) > 0 ? 0.35 : 1;
    drawPlayer();
    ctx.restore();
    drawSuperKids();
    drawLaserLeagueFinale();
    ctx.restore();
    if (laserAftermathFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, laserAftermathFlash / 1.12);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function loop(now) {
    if (state !== "running") return;
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    update(dt);
    draw();
    if (state === "running") requestAnimationFrame(loop);
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }

  function updateFullscreenButton() {
    const active = fullscreenElement() === gameCard;
    fullscreenButton.textContent = active ? "Exit full screen" : "Full screen";
    fullscreenButton.setAttribute("aria-pressed", String(active));
    if (!active && screen.orientation?.unlock) screen.orientation.unlock();
  }

  async function toggleFullscreen() {
    try {
      if (fullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
        if (screen.orientation?.unlock) screen.orientation.unlock();
      } else {
        const enter = gameCard.requestFullscreen || gameCard.webkitRequestFullscreen;
        if (!enter) return;
        await enter.call(gameCard);
        pause();
        try {
          if (screen.orientation?.lock) await screen.orientation.lock("landscape");
        } catch (_) {
          // Orientation lock is optional; the portrait rotation hint remains available.
        }
      }
    } catch (_) {
      // Some browsers reject fullscreen outside their supported device modes.
    }
    updateFullscreenButton();
  }

  if (gameCard.requestFullscreen || gameCard.webkitRequestFullscreen) {
    fullscreenButton.classList.add("is-available");
    fullscreenButton.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    document.addEventListener("webkitfullscreenchange", updateFullscreenButton);
  }

  soundButton.addEventListener("click", toggleSound);

  function openCrewModal() {
    pause();
    crewModal.hidden = false;
    crewCloseButton.focus();
  }

  function closeCrewModal() {
    if (crewModal.hidden) return;
    crewModal.hidden = true;
    crewOpenButton.focus();
  }

  crewOpenButton.addEventListener("click", openCrewModal);
  crewCloseButton.addEventListener("click", closeCrewModal);
  crewModal.addEventListener("click", (event) => {
    if (event.target === crewModal) closeCrewModal();
  });
  crewModal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCrewModal();
    } else if (event.key === "Tab") {
      event.preventDefault();
      crewCloseButton.focus();
    }
  });

  console.info("Couch Dash tester: append '?test' to the URL to open the tier and shop radio controls.");

  if (testMode) {
    testPanel.hidden = false;
    testPanelMinimizeButton.addEventListener("click", () => {
      const minimized = testPanel.classList.toggle("is-minimized");
      const action = minimized ? "Expand" : "Minimize";
      testPanelMinimizeButton.textContent = minimized ? "+" : "−";
      testPanelMinimizeButton.setAttribute("aria-expanded", String(!minimized));
      testPanelMinimizeButton.setAttribute("aria-label", `${action} Test Lab`);
      testPanelMinimizeButton.title = `${action} Test Lab`;
    });
    testPanelCloseButton.addEventListener("click", () => {
      testPanel.hidden = true;
    });
    sandyPropTiers.forEach((props, tierIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.testTier = String(tierIndex + 1);
      button.textContent = String(tierIndex + 1);
      button.setAttribute("aria-label", `Test Sandy tier ${tierIndex + 1}`);
      button.title = `Tier ${tierIndex + 1}: ${props.map((prop) => prop.replaceAll("-", " ")).join(", ")}`;
      tierTestButtons.append(button);
    });
    updateSandyTestControls();
    updateCharacterTestControls();
    updateRadioTestControls();
    testPanel.addEventListener("click", (event) => {
      const characterButton = event.target.closest("[data-test-character]");
      if (characterButton) {
        if (state !== "running") start();
        clearCharacterMoments();
        obstacles = [];
        collectibles = [];
        spawnIn = 2.2;
        if (characterButton.dataset.testCharacter === "brenda") {
          activateBrenda();
          characterTestStatus.textContent = "Her energy powers higher jumps and doubles every tag's value.";
        } else if (characterButton.dataset.testCharacter === "kamden") {
          activateKamden(true);
          characterTestStatus.textContent = "Her green pricing gun reduces an item's speed and hitbox, with a +75 bonus.";
        } else {
          const leagueVariant = characterButton.dataset.testCharacter === "super-kids-2" ? 2 : 1;
          activateSuperKids(leagueVariant);
          for (let tag = 0; tag < 5; tag++) {
            collectibles.push({ x: 800 + tag * 86, y: 92 + (tag % 2) * 74, w: 30, h: 42, phase: tag });
          }
          characterTestStatus.textContent = leagueVariant === 2
            ? "Cosmic Overdrive transforms the showroom, ends with Will's mega-blast, and leaves permanent damage."
            : "Will escalates from power hands to photon vision and quad lasers while the team charges WILLPOWER.";
        }
        updateCharacterTestControls(characterButton.dataset.testCharacter);
        return;
      }
      const radioButton = event.target.closest("[data-test-radio]");
      if (radioButton) {
        selectShopRadio(radioButton.dataset.testRadio);
        return;
      }
      const button = event.target.closest("[data-test-tier]");
      if (!button) return;
      const tierNumber = Number(button.dataset.testTier);
      const tierIndex = Math.max(0, Math.min(tierNumber - 1, sandyPropTiers.length - 1));
      selectedSandyTestTier = tierIndex;
      updateSandyTestControls();
      if (state !== "running") {
        start();
        return;
      }
      obstacles = [];
      collectibles = [];
      sandyEncounters = tierIndex;
      elapsed = Math.max(elapsed, tierIndex * 4);
      const obstacle = spawnSandy(tierIndex, Math.min(W * 0.68, W - 330));
      spawnIn = 2.2;
      testStatus.textContent = `Tier ${tierIndex + 1}: ${obstacle.prop.replaceAll("-", " ")} (${obstacle.w}px)`;
    });
  }

  startButton.addEventListener("click", () => state === "paused" ? resume() : start());
  jumpButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    jump();
  });
  // Pointer presses are handled immediately above; detail === 0 preserves
  // keyboard and assistive-technology button activation without double jumps.
  jumpButton.addEventListener("click", (event) => {
    if (event.detail === 0) jump();
  });
  canvas.addEventListener("pointerdown", jump);
  document.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp"].includes(event.code)) {
      event.preventDefault();
      jump();
    } else if (event.code === "KeyP") {
      event.preventDefault();
      state === "paused" ? resume() : pause();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pause();
      stopMusic();
      if (audioContext?.state === "running") audioContext.suspend().catch(() => {});
    } else if (soundEnabled && musicSessionStarted) {
      ensureAudio();
      startMusic();
    }
  });

  buildBaseShowroomLayers();
  draw();
})();
