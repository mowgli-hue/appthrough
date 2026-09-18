// Pleasant, effective new-order chime (store doorbell style: ding-dong).
// Browsers block audio until the user interacts once, so we keep a shared
// AudioContext and unlock it on the first tap/click anywhere.
let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export function unlockAudio() {
  try {
    const c = getCtx();
    if (c.state === 'suspended') c.resume();
  } catch {}
}

// Attach once per page: any first interaction unlocks sound
export function autoUnlockOnFirstTap() {
  const handler = () => { unlockAudio(); document.removeEventListener('pointerdown', handler); };
  document.addEventListener('pointerdown', handler);
}

function bell(c, freq, start, duration = 0.9, volume = 0.5) {
  // Fundamental + soft octave overtone = warm doorbell timbre
  [[freq, volume], [freq * 2, volume * 0.18]].forEach(([f, v]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(v, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  });
}

// Repeating alarm: chimes every few seconds until stopped (staff acknowledge)
let loopTimer = null;
export function startAlertLoop() {
  if (loopTimer) return;
  playNewOrderChime(1);
  loopTimer = setInterval(() => playNewOrderChime(1), 3500);
}
export function stopAlertLoop() {
  if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
}

// "Ding-dong" twice — clearly audible, never harsh
export function playNewOrderChime(times = 2) {
  try {
    const c = getCtx();
    if (c.state === 'suspended') c.resume();
    const t0 = c.currentTime + 0.02;
    for (let i = 0; i < times; i++) {
      const t = t0 + i * 1.5;
      bell(c, 659.25, t);        // E5 — ding
      bell(c, 523.25, t + 0.4);  // C5 — dong
    }
  } catch {}
}
