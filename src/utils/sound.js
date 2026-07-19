// Tiny WebAudio synth for UI feedback — no audio assets, a few ms per blip.
// Everything is wrapped in try/catch: sound is decoration and must never
// break an interaction. The AudioContext is created lazily inside a user
// gesture, which also satisfies browser autoplay policies.

const STORAGE_KEY = 'bs-sound';
let ctx = null;

export function soundEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch { /* private mode etc. — sound just stays session-default */ }
}

function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = ctx || new AC();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// One short enveloped tone. Frequencies glide slightly downward/upward via
// `glide` for a softer, less beepy character.
function tone(ac, { freq, at = 0, dur = 0.08, type = 'triangle', peak = 0.05, glide = 0 }) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const t0 = ac.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + glide), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function play(tones) {
  if (!soundEnabled()) return;
  try {
    const ac = audio();
    if (!ac) return;
    tones.forEach((t) => tone(ac, t));
  } catch { /* never let sound break the UI */ }
}

// Generic button/tab press.
export function playTick() {
  play([{ freq: 1500, dur: 0.045, type: 'triangle', peak: 0.028, glide: -400 }]);
}

// Adding an item — a quick two-note rise.
export function playAdd() {
  play([
    { freq: 620, dur: 0.07, peak: 0.04 },
    { freq: 880, at: 0.055, dur: 0.09, peak: 0.04 }
  ]);
}

// Removing an item — a short falling pair.
export function playRemove() {
  play([
    { freq: 520, dur: 0.06, peak: 0.035 },
    { freq: 340, at: 0.05, dur: 0.09, peak: 0.035, glide: -60 }
  ]);
}

// Invoice saved/downloaded — a little lime-neon arpeggio.
export function playSuccess() {
  play([
    { freq: 523.25, dur: 0.09, peak: 0.045 },
    { freq: 659.25, at: 0.08, dur: 0.09, peak: 0.045 },
    { freq: 783.99, at: 0.16, dur: 0.16, peak: 0.05 },
    { freq: 1046.5, at: 0.24, dur: 0.22, peak: 0.04 }
  ]);
}

// Something went wrong — low, brief, unmistakable.
export function playError() {
  play([
    { freq: 220, dur: 0.12, type: 'square', peak: 0.03, glide: -60 },
    { freq: 160, at: 0.1, dur: 0.16, type: 'square', peak: 0.03, glide: -40 }
  ]);
}
