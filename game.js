(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const startButton = document.getElementById("start-button");
  const jumpButton = document.getElementById("jump-button");
  const fullscreenButton = document.getElementById("fullscreen-button");
  const soundButton = document.getElementById("sound-button");
  const gameCard = document.querySelector(".game-card");
  const message = document.getElementById("game-message");
  const messageTitle = document.getElementById("message-title");
  const messageCopy = document.getElementById("message-copy");
  const scoreNode = document.getElementById("score");
  const tagsNode = document.getElementById("tags");
  const bestNode = document.getElementById("best");
  const boostStatusNode = document.getElementById("boost-status");
  const testPanel = document.getElementById("test-panel");
  const tierTestButtons = document.getElementById("tier-test-buttons");
  const testStatus = document.getElementById("test-status");
  const radioTestStatus = document.getElementById("radio-test-status");
  const testMode = new URLSearchParams(location.search).has("test");

  const W = canvas.width;
  const H = canvas.height;
  const ground = 330;
  const jumpVelocity = -820;
  const gravity = 1550;
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
  let sandyEncounters = 0;
  let selectedSandyTestTier = null;
  let lastSandyProp = null;
  let speed = 270;
  let spawnIn = 1.7;
  let tagIn = 2.2;
  let helperIn = 4.5;
  let brendaIn = 10;
  let brenda = null;
  let brendaBoost = 0;
  let obstacles = [];
  let collectibles = [];
  let dust = [];
  let wallHelpers = [];
  let best = Number(localStorage.getItem("couchDashBest") || 0);
  const player = { x: 112, y: ground - 88, w: 190, h: 88, vy: 0, grounded: true };
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let soundEnabled = localStorage.getItem("couchDashSound") === "on";
  let audioContext = null;
  let audioMasterGain = null;
  let noiseBuffer = null;
  let musicTimer = null;
  let musicStep = 0;
  let nextMusicTime = 0;
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
      audioMasterGain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      audioMasterGain.gain.linearRampToValueAtTime(0.82, audioContext.currentTime + 0.012);
      audioMasterGain.connect(audioContext.destination);
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
    noiseBuffer = null;
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

  function scheduleNoiseAt(audio, startAt, duration, volume, highpass) {
    if (!noiseBuffer) return;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    source.buffer = noiseBuffer;
    filter.type = "highpass";
    filter.frequency.setValueAtTime(highpass, startAt);
    const attack = Math.min(0.006, duration * 0.25);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(volume, startAt + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    gain.gain.linearRampToValueAtTime(0, startAt + duration + 0.004);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioOutput(audio));
    source.start(startAt, Math.random() * 0.7);
    source.stop(startAt + duration + 0.006);
  }

  function scheduleMusicStep(audio, step, startAt) {
    const station = shopRadios[activeRadio];
    const bar = Math.floor(step / 8);
    const beat = step % 8;
    const chord = station.chords[bar];
    if (beat % 2 === 0) {
      const bassNote = station.bass[bar] + (beat === 4 ? 7 : 0);
      const bassFrequency = noteFrequency(bassNote);
      scheduleToneAt(audio, startAt, bassFrequency, bassFrequency * 0.985, 0.3, station.bassType, station.bassVolume);
    }
    if (station.plucks.includes(beat)) {
      chord.slice(0, 3).forEach((note, index) => {
        const frequency = noteFrequency(note + 12);
        scheduleToneAt(audio, startAt + index * 0.012, frequency, frequency * 0.995, 0.18, station.chordType, station.chordVolume);
      });
    }
    if (beat % 2 === 1) {
      scheduleNoiseAt(audio, startAt, 0.025, 0.0014, 4800);
    }
    if (station.kick.includes(beat)) scheduleToneAt(audio, startAt, 82, 44, 0.12, "sine", 0.013);
    if (station.snare.includes(beat)) scheduleNoiseAt(audio, startAt, 0.075, 0.006, 1700);
    const melodyNote = station.melody[step];
    if (melodyNote) {
      const melodyFrequency = noteFrequency(melodyNote);
      scheduleToneAt(audio, startAt, melodyFrequency, melodyFrequency * 1.006, 0.19, station.melodyType, station.melodyVolume);
    }
  }

  function pumpMusic() {
    const audio = ensureAudio();
    if (!audio || audio.state !== "running") return;
    const eighthNote = 60 / shopRadios[activeRadio].tempo / 2;
    while (nextMusicTime < audio.currentTime + 0.18) {
      scheduleMusicStep(audio, musicStep, nextMusicTime);
      musicStep = (musicStep + 1) % 32;
      nextMusicTime += eighthNote;
    }
  }

  function startMusic() {
    const audio = ensureAudio();
    if (!audio || musicTimer) return;
    musicStep = 0;
    nextMusicTime = audio.currentTime + 0.06;
    pumpMusic();
    musicTimer = setInterval(pumpMusic, 75);
  }

  function stopMusic() {
    if (!musicTimer) return;
    clearInterval(musicTimer);
    musicTimer = null;
  }

  function updateRadioTestControls() {
    radioTestStatus.textContent = `Playing: ${shopRadios[activeRadio].name}`;
    testPanel.querySelectorAll("[data-test-radio]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.testRadio === activeRadio));
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
    } else if (kind === "crash") {
      tone(145, 48, 0.38, "sawtooth", 0.052);
      tone(88, 42, 0.3, "square", 0.025, 0.05);
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

  function reset() {
    elapsed = selectedSandyTestTier === null ? 0 : selectedSandyTestTier * 4;
    distance = 0;
    tagCount = 0;
    tagPoints = 0;
    sandyEncounters = selectedSandyTestTier === null ? 0 : selectedSandyTestTier;
    lastSandyProp = null;
    speed = 270;
    spawnIn = 1.65;
    tagIn = 2;
    helperIn = 3.5 + Math.random() * 4;
    brendaIn = 9 + Math.random() * 4;
    brenda = null;
    brendaBoost = 0;
    boostStatusNode.textContent = "";
    obstacles = [];
    collectibles = [];
    dust = [];
    wallHelpers = [];
    player.y = ground - player.h;
    player.vy = 0;
    player.grounded = true;
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
      for (let i = 0; i < 5; i++) dust.push({ x: player.x + 35, y: ground - 4, life: 0.45, vx: -45 - Math.random() * 75 });
    }
  }

  function pause() {
    if (state !== "running") return;
    state = "paused";
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

  function gameOver() {
    state = "over";
    playSound("crash");
    const score = Math.floor(distance) + tagPoints;
    if (score > best) {
      best = score;
      localStorage.setItem("couchDashBest", String(best));
      bestNode.textContent = String(best).padStart(5, "0");
      messageTitle.textContent = "New showroom record!";
    } else {
      messageTitle.textContent = "Couch traffic jam!";
    }
    messageCopy.textContent = `Score ${score}: ${Math.floor(distance)} feet + ${tagPoints} tag bonus. You saved ${tagCount} price tag${tagCount === 1 ? "" : "s"}.`;
    startButton.textContent = "Try again";
    message.hidden = false;
  }

  function spawnSandy(tierIndex = Math.min(sandyEncounters, sandyPropTiers.length - 1), x = W + 40) {
    const safeTierIndex = Math.max(0, Math.min(tierIndex, sandyPropTiers.length - 1));
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
    } else if (roll < 0.84) {
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
    } else {
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
    }
  }

  function spawnTag() {
    collectibles.push({ x: W + 40, y: ground - 135 - Math.random() * 80, w: 30, h: 42, phase: Math.random() * 6 });
  }

  function intersects(a, b, inset = 0) {
    return a.x + inset < b.x + b.w && a.x + a.w - inset > b.x && a.y + inset < b.y + b.h && a.y + a.h - inset > b.y;
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
    brendaBoost = Math.max(0, brendaBoost - dt);
    if (brendaBoost === 0 && boostStatusNode.textContent) boostStatusNode.textContent = "";

    if (spawnIn <= 0) {
      spawnObstacle();
      const tierPressure = Math.min(sandyEncounters, sandyPropTiers.length) * 0.0035;
      const spawnFloor = 0.94 - lateIntensity * 0.01;
      const spawnVariation = 0.7 - lateIntensity * 0.08;
      spawnIn = Math.max(spawnFloor, 1.65 - elapsed * 0.0035 - tierPressure) + Math.random() * spawnVariation;
    }
    if (tagIn <= 0) {
      spawnTag();
      tagIn = brendaBoost > 0 ? 0.85 + Math.random() * 0.65 : 2.1 + Math.random() * 2.1;
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
    if (brendaIn <= 0 && !brenda) {
      brenda = { life: 6, total: 6, phase: 0 };
      playSound("brenda");
      brendaBoost = 6;
      wallHelpers = [];
      helperIn = Math.max(helperIn, 7);
      boostStatusNode.textContent = "Brenda Boost active. Price tags are worth double and jumps are stronger.";
      tagIn = Math.min(tagIn, 0.55);
      brendaIn = 20 + Math.random() * 8;
    }

    player.vy += gravity * dt;
    player.y += player.vy * dt;
    if (player.y >= ground - player.h) {
      player.y = ground - player.h;
      player.vy = 0;
      player.grounded = true;
    }

    obstacles.forEach((item) => { item.x -= speed * dt; item.phase += dt * 8; });
    collectibles.forEach((item) => { item.x -= speed * dt; item.phase += dt * 5; });
    dust.forEach((p) => { p.x += p.vx * dt; p.life -= dt; });
    wallHelpers.forEach((helper) => { helper.x -= speed * 0.32 * dt; helper.phase += dt * 4; });
    if (brenda) {
      brenda.life -= dt;
      brenda.phase += dt * 8;
      if (brenda.life <= 0) brenda = null;
    }
    obstacles = obstacles.filter((item) => item.x + item.w > -20);
    collectibles = collectibles.filter((item) => {
      if (intersects(player, item, 18)) {
        tagCount++;
        tagPoints += brendaBoost > 0 ? 100 : 50;
        playSound("tag");
        updateScore();
        return false;
      }
      return item.x + item.w > -20;
    });
    dust = dust.filter((p) => p.life > 0);
    wallHelpers = wallHelpers.filter((helper) => helper.x > -100);

    // Keep collisions centered on the couch instead of its decorative edges and
    // movers. This gives the long sprite a fair, readable clearance window.
    const hitbox = { x: player.x + 36, y: player.y + 14, w: player.w - 72, h: 56 };
    if (obstacles.some((item) => intersects(hitbox, item, 10))) gameOver();
    updateScore();
  }

  function updateScore() {
    scoreNode.textContent = String(Math.floor(distance) + tagPoints).padStart(5, "0");
    tagsNode.textContent = brendaBoost > 0 ? `${tagCount} ×2` : String(tagCount);
  }

  function roundedRect(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
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

  function drawShowroom() {
    ctx.fillStyle = "#f8f1e8";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fffaf4";
    ctx.fillRect(0, 0, W, 240);

    const scroll = (distance * 6) % 240;
    for (let x = -scroll; x < W + 240; x += 240) {
      ctx.strokeStyle = "#d8cec2";
      ctx.lineWidth = 8;
      ctx.strokeRect(x + 45, 42, 150, 108);
      ctx.fillStyle = (Math.floor((x + scroll) / 240) % 2) ? "#d9b69e" : "#97b1aa";
      ctx.fillRect(x + 57, 54, 126, 84);
      ctx.fillStyle = "rgba(255,255,255,.36)";
      ctx.beginPath();
      ctx.arc(x + 120, 93, 26, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!brenda) wallHelpers.forEach(drawWallHelper);

    // A wall-mounted loading-bay placard occupies every fourth gap between
    // framed pictures and scrolls with the showroom instead of the HUD.
    const signScroll = (distance * 6) % 960;
    for (let signCenter = 720 - signScroll; signCenter < W + 180; signCenter += 960) {
      if (signCenter < -180) continue;
      roundedRect(signCenter - 82, 166, 164, 46, 9, "#d8cec2");
      roundedRect(signCenter - 77, 171, 154, 36, 6, "#fffdf6");
      ctx.fillStyle = colors.forest;
      ctx.font = "700 14px Poppins, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("LOADING BAY", signCenter - 9, 195);
      ctx.strokeStyle = colors.forest;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(signCenter + 47, 189);
      ctx.lineTo(signCenter + 66, 189);
      ctx.lineTo(signCenter + 59, 183);
      ctx.moveTo(signCenter + 66, 189);
      ctx.lineTo(signCenter + 59, 195);
      ctx.stroke();
    }

    ctx.fillStyle = colors.sand;
    ctx.fillRect(0, ground, W, H - ground);
    ctx.fillStyle = "#cfc0b0";
    ctx.fillRect(0, ground, W, 7);
    ctx.strokeStyle = "rgba(138,76,54,.13)";
    ctx.lineWidth = 2;
    for (let x = -(distance * 10 % 90); x < W; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, ground + 7);
      ctx.lineTo(x - 25, H);
      ctx.stroke();
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
    ctx.rotate(0.055);
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
    }
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

  function draw() {
    const locomotive = obstacles.find((item) => item.prop === "steam-locomotive" && item.x < W && item.x + item.w > 0);
    const tRex = obstacles.find((item) => item.prop === "t-rex" && item.x < W && item.x + item.w > 0);
    const thundercloud = obstacles.find((item) => item.prop === "thundercloud" && item.x < W && item.x + item.w > 0);
    const kaiju = obstacles.find((item) => item.prop === "friendly-kaiju" && item.x < W && item.x + item.w > 0);
    const rollerCoaster = obstacles.find((item) => item.prop === "roller-coaster" && item.x < W && item.x + item.w > 0);
    const dragon = obstacles.find((item) => item.prop === "fire-breathing-dragon" && item.x < W && item.x + item.w > 0);
    const thunderFlash = thundercloud && Math.sin(thundercloud.phase * 1.7) > 0.62;
    const kaijuStomp = kaiju && Math.sin(kaiju.phase) > 0.72;
    const rollerRattle = rollerCoaster && Math.sin(rollerCoaster.phase * 1.2) > 0.25;
    const dragonRoar = dragon && Math.sin(dragon.phase * 1.4) > 0.82;
    const rumble = thunderFlash ? 3.2 : locomotive ? 2.6 : kaijuStomp ? 1.8 : rollerRattle ? 1.35 : dragonRoar ? 1.1 : (tRex && Math.sin(tRex.phase) > 0.65 ? 1.2 : 0);
    ctx.save();
    if (rumble) ctx.translate(Math.sin(elapsed * 73) * rumble, Math.cos(elapsed * 91) * rumble * 0.55);
    drawShowroom();
    collectibles.forEach(drawTag);
    obstacles.forEach(drawObstacle);
    drawBrenda();
    dust.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life * 1.8);
      ctx.fillStyle = "#b9a795";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    drawPlayer();
    ctx.restore();
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

  console.info("Couch Dash tester: append '?test' to the URL to open the tier and shop radio controls.");

  if (testMode) {
    testPanel.hidden = false;
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
    updateRadioTestControls();
    testPanel.addEventListener("click", (event) => {
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
    } else if (soundEnabled) {
      ensureAudio();
      startMusic();
    }
  });

  draw();
})();
