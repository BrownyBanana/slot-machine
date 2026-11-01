const SYMBOLS = [
  { id: "doge", src: "images/doge.png" },
  { id: "pepe", src: "images/pepe.png" },
  { id: "trollface", src: "images/trollface.png" },
  { id: "gigachad", src: "images/gigachad.png" },
  { id: "popcat", src: "images/popcat.png" },
  { id: "shiba", src: "images/shiba.png" },
];

const SYMBOL_HEIGHT = 88;          
const REEL_STOP_DELAY = 500;       
const SPIN_MIN_DURATION = 850;     

const STARTING_CREDITS = 100;
const WIN_REWARD = 100;
const NEAR_WIN_PENALTY = 20;
const NO_MATCH_PENALTY = 30;

const WIN_BIAS = 0.35;


let credits = STARTING_CREDITS;
let bestCredits = STARTING_CREDITS;
let spinCount = 0;
let winStreak = 0;
let isSpinning = false;
let isMuted = false;


const loadingScreen = document.getElementById("loading-screen");
const soundToggleBtn = document.getElementById("sound-toggle");

const machineCard = document.getElementById("machine-card");
const spinBtn = document.getElementById("spin-btn");
const creditsValueEl = document.getElementById("credits-value");
const creditsPillEl = document.getElementById("credits-pill");
const resultValueEl = document.getElementById("result-value");

const bestCreditsValueEl = document.getElementById("best-credits-value");
const spinCountValueEl = document.getElementById("spin-count-value");
const winStreakValueEl = document.getElementById("win-streak-value");

const reelStrips = [
  document.getElementById("strip-0"),
  document.getElementById("strip-1"),
  document.getElementById("strip-2"),
];
const reelEls = [
  document.getElementById("reel-0"),
  document.getElementById("reel-1"),
  document.getElementById("reel-2"),
];

const fxLayer = document.getElementById("fx-layer");
const screenFlashEl = document.getElementById("screen-flash");

const gameOverModal = document.getElementById("gameover-modal");
const playAgainBtn = document.getElementById("play-again-btn");


let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(freq, startTime, duration, type, gainValue) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(gainValue, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

const DEFAULT_SOUNDS = {
  spin: () => {
    const now = getAudioCtx().currentTime;
    for (let i = 0; i < 6; i++) {
      playTone(320 + i * 18, now + i * 0.07, 0.05, "square", 0.08);
    }
  },
  win: () => {
    const now = getAudioCtx().currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      playTone(freq, now + i * 0.12, 0.25, "triangle", 0.15);
    });
  },
  jackpot: () => {
    const now = getAudioCtx().currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
      playTone(freq, now + i * 0.1, 0.3, "square", 0.12);
    });
  },
  lose: () => {
    const now = getAudioCtx().currentTime;
    playTone(220, now, 0.2, "sawtooth", 0.15);
    playTone(160, now + 0.15, 0.3, "sawtooth", 0.15);
  },
  near: () => {
    const now = getAudioCtx().currentTime;
    playTone(440, now, 0.12, "triangle", 0.13);
    playTone(415.3, now + 0.13, 0.18, "triangle", 0.1);
  },
  gameover: () => {
    const now = getAudioCtx().currentTime;
    [392, 329.63, 261.63, 196].forEach((freq, i) => {
      playTone(freq, now + i * 0.18, 0.3, "sawtooth", 0.13);
    });
  },
};

function playSound(name) {
  if (isMuted) return;
  const makeSound = DEFAULT_SOUNDS[name];
  if (!makeSound) return;
  try {
    makeSound();
  } catch (err) {
    console.warn(`[audio] "${name}" failed to play:`, err);
  }
}


function toggleSound() {
  isMuted = !isMuted;
  soundToggleBtn.textContent = isMuted ? "🔇" : "🔊";
  soundToggleBtn.classList.toggle("muted", isMuted);
}


function randomSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function createSymbolEl(symbol) {
  const wrap = document.createElement("div");
  wrap.className = "symbol";
  wrap.dataset.symbolId = symbol.id;

  const img = document.createElement("img");
  img.src = symbol.src;
  img.alt = symbol.id;
  wrap.appendChild(img);

  return wrap;
}

function buildInitialStrip(stripEl) {
  stripEl.innerHTML = "";
  stripEl.style.transform = "translateY(0)";
  for (let i = 0; i < 4; i++) {
    stripEl.appendChild(createSymbolEl(randomSymbol()));
  }
}

function randomizeSymbols() {
  const first = randomSymbol();
  const second = Math.random() < WIN_BIAS ? first : randomSymbol();
  const third = Math.random() < WIN_BIAS ? first : randomSymbol();
  return [first, second, third];
}


function startReelSpin(reelIndex) {
  const strip = reelStrips[reelIndex];
  strip.innerHTML = "";
  for (let i = 0; i < 12; i++) {
    strip.appendChild(createSymbolEl(randomSymbol()));
  }
  strip.classList.add("spinning");
}

function stopReelOnSymbol(reelIndex, finalSymbol) {
  const strip = reelStrips[reelIndex];
  strip.classList.remove("spinning");
  strip.style.transform = "translateY(0)";

  strip.innerHTML = "";
  strip.appendChild(createSymbolEl(randomSymbol()));
  strip.appendChild(createSymbolEl(finalSymbol));
  strip.appendChild(createSymbolEl(randomSymbol()));
  strip.appendChild(createSymbolEl(randomSymbol()));

  strip.style.transform = `translateY(-${SYMBOL_HEIGHT}px)`;
}

function spinReels() {
  return new Promise((resolve) => {
    const finalSymbols = randomizeSymbols();

    reelEls.forEach((el) => el.classList.remove("win-glow"));
    for (let i = 0; i < 3; i++) startReelSpin(i);

    for (let i = 0; i < 3; i++) {
      const stopTime = SPIN_MIN_DURATION + i * REEL_STOP_DELAY;
      setTimeout(() => {
        stopReelOnSymbol(i, finalSymbols[i]);
        if (i === 2) resolve(finalSymbols);
      }, stopTime);
    }
  });
}



function calculateResult(finalSymbols) {
  const [a, b, c] = finalSymbols.map((s) => s.id);

  if (a === b && b === c) {
    return { type: "win", delta: WIN_REWARD };
  }
  if (a === b || b === c || a === c) {
    return { type: "near", delta: -NEAR_WIN_PENALTY };
  }
  return { type: "lose", delta: -NO_MATCH_PENALTY };
}

function updateCredits(delta) {
  credits = Math.max(0, credits + delta);
  creditsValueEl.textContent = credits;

  creditsValueEl.classList.remove("bump-up", "bump-down");
  void creditsValueEl.offsetWidth; 
  creditsValueEl.classList.add(delta >= 0 ? "bump-up" : "bump-down");

  if (credits > bestCredits) {
    bestCredits = credits;
    bestCreditsValueEl.textContent = bestCredits;
  }
}

function updateResult(outcomeType) {
  resultValueEl.classList.remove("win", "near", "lose", "pop");

  if (outcomeType === "win") {
    resultValueEl.textContent = "🎉 YOU WIN!";
    resultValueEl.classList.add("win");
  } else if (outcomeType === "near") {
    resultValueEl.textContent = "So Close!";
    resultValueEl.classList.add("near");
  } else {
    resultValueEl.textContent = "You Lose!";
    resultValueEl.classList.add("lose");
  }

  void resultValueEl.offsetWidth;
  resultValueEl.classList.add("pop");
}

function updateSpinCount() {
  spinCount += 1;
  spinCountValueEl.textContent = spinCount;
}

function updateWinStreak(didWin) {
  winStreak = didWin ? winStreak + 1 : 0;
  winStreakValueEl.textContent = winStreak;
}



const FX_COLORS = ["#3aa757", "#ffc400", "#e05a4e", "#4dc9ff", "#ffffff"];

function launchFireworks() {
  launchConfetti(50);
  launchFireworkBursts(2);
  triggerScreenFlash();
}

function launchConfetti(count) {
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = FX_COLORS[Math.floor(Math.random() * FX_COLORS.length)];
    piece.style.animationDuration = 2 + Math.random() * 1.5 + "s";
    piece.style.animationDelay = Math.random() * 0.3 + "s";
    fxLayer.appendChild(piece);
    setTimeout(() => piece.remove(), 4000);
  }
}

function launchFireworkBursts(burstCount) {
  for (let b = 0; b < burstCount; b++) {
    const originX = Math.random() * window.innerWidth;
    const originY = window.innerHeight * 0.25 + Math.random() * window.innerHeight * 0.3;

    setTimeout(() => {
      const particles = 18;
      const color = FX_COLORS[Math.floor(Math.random() * FX_COLORS.length)];

      for (let i = 0; i < particles; i++) {
        const angle = (Math.PI * 2 * i) / particles;
        const distance = 55 + Math.random() * 55;
        const fx = Math.cos(angle) * distance;
        const fy = Math.sin(angle) * distance;

        const particle = document.createElement("div");
        particle.className = "firework-burst";
        particle.style.left = originX + "px";
        particle.style.top = originY + "px";
        particle.style.background = color;
        particle.style.boxShadow = `0 0 8px 2px ${color}`;
        particle.style.setProperty("--fx", fx + "px");
        particle.style.setProperty("--fy", fy + "px");
        fxLayer.appendChild(particle);
        setTimeout(() => particle.remove(), 1000);
      }
    }, b * 250);
  }
}

function triggerScreenFlash() {
  screenFlashEl.classList.remove("flash-active");
  void screenFlashEl.offsetWidth;
  screenFlashEl.classList.add("flash-active");
}


function showGameOverModal() {
  gameOverModal.classList.remove("hidden");
}

function hideGameOverModal() {
  gameOverModal.classList.add("hidden");
}

function resetGame() {
  credits = STARTING_CREDITS;
  creditsValueEl.textContent = credits;
  creditsValueEl.classList.remove("bump-up", "bump-down");

  resultValueEl.textContent = "You Win!";
  resultValueEl.classList.remove("win", "near", "lose", "pop");

  reelStrips.forEach((strip) => buildInitialStrip(strip));
  reelEls.forEach((el) => el.classList.remove("win-glow"));
  machineCard.classList.remove("win-glow");

  hideGameOverModal();

  isSpinning = false;
  spinBtn.disabled = false;
  spinBtn.classList.remove("spinning");
}

async function spin() {
  if (isSpinning) return; 
  isSpinning = true;

  spinBtn.disabled = true;
  spinBtn.classList.add("spinning");

  playSound("spin");

  const finalSymbols = await spinReels();
  const outcome = calculateResult(finalSymbols);
  const didWin = outcome.type === "win";

  updateCredits(outcome.delta);
  updateResult(outcome.type);
  updateSpinCount();
  updateWinStreak(didWin);

  if (didWin) {
    reelEls.forEach((el) => el.classList.add("win-glow"));
    machineCard.classList.add("win-glow");
    playSound("win");
    playSound("jackpot");
    launchFireworks();

    if (winStreak > 0 && winStreak % 3 === 0) {
      playSound("jackpot");
    }
  } else if (outcome.type === "near") {
    playSound("near");
  } else {
    playSound("lose");
  }

  const settleDelay = didWin ? 1400 : 700;

  setTimeout(() => {
    reelEls.forEach((el) => el.classList.remove("win-glow"));
    machineCard.classList.remove("win-glow");

    if (credits <= 0) {
      isSpinning = false;
      spinBtn.classList.remove("spinning");
      playSound("gameover");
      showGameOverModal();
    } else {
      isSpinning = false;
      spinBtn.disabled = false;
      spinBtn.classList.remove("spinning");
    }
  }, settleDelay);
}


spinBtn.addEventListener("click", spin);
playAgainBtn.addEventListener("click", resetGame);
soundToggleBtn.addEventListener("click", toggleSound);


function init() {
  creditsValueEl.textContent = credits;
  bestCreditsValueEl.textContent = bestCredits;
  spinCountValueEl.textContent = spinCount;
  winStreakValueEl.textContent = winStreak;


  reelStrips.forEach((strip) => buildInitialStrip(strip));

  setTimeout(() => {
    loadingScreen.classList.add("fade-out");
    setTimeout(() => loadingScreen.remove(), 600);
  }, 1500);
}

init();