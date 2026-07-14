// Shared text-to-speech helpers.
// Browsers load voices asynchronously, so we cache and re-check on voiceschanged.
let cachedVoice = null;

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (!voices.length) return null;
  const score = (v) => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/en[-_]?us/i.test(v.lang)) s += 4;
    else if (/^en/i.test(v.lang)) s += 2;
    // Higher-quality engines first
    if (/natural|neural|premium|enhanced/.test(n)) s += 8;
    if (/google us english/.test(n)) s += 6;
    if (/samantha|aria|jenny|ava|allison|zira/.test(n)) s += 5;
    if (/google/.test(n)) s += 3;
    if (v.localService === false) s += 1; // cloud voices usually sound better
    return s;
  };
  return voices.slice().sort((a, b) => score(b) - score(a))[0];
}

export function warmVoices() {
  if (!('speechSynthesis' in window)) return;
  cachedVoice = pickVoice();
  window.speechSynthesis.onvoiceschanged = () => { cachedVoice = pickVoice(); };
}

// Apply the best voice + natural pacing to an utterance
export function tuneUtterance(utter) {
  if (!cachedVoice) cachedVoice = pickVoice();
  if (cachedVoice) utter.voice = cachedVoice;
  utter.rate = 0.98;   // slightly slower reads clearer on kiosk speakers
  utter.pitch = 1.0;
  utter.volume = 1.0;
  return utter;
}
