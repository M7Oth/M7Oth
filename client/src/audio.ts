// Small synthesized UI sounds (no music, no external files).
let ctx: AudioContext | null = null;
let muted = false;
export function setMuted(m: boolean) { muted = m; }

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
  if (!ctx) ctx = new AudioContext();
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function sfx(name?: string) {
  if (muted || !name) return;
  try {
    switch (name) {
      case 'click': tone(660, 0.06, 'triangle', 0.05); break;
      case 'notify': tone(880, 0.12, 'sine', 0.07); tone(1320, 0.14, 'sine', 0.05, 0.09); break;
      case 'cash': tone(1046, 0.1, 'square', 0.035); tone(1568, 0.18, 'square', 0.03, 0.08); break;
      case 'success': tone(523, 0.1, 'triangle', 0.06); tone(659, 0.1, 'triangle', 0.06, 0.08); tone(784, 0.2, 'triangle', 0.06, 0.16); break;
      case 'level': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'sine', 0.06, i * 0.09)); break;
      case 'error': tone(220, 0.2, 'sawtooth', 0.04); break;
      case 'cut': tone(1800, 0.03, 'square', 0.03); break;
      case 'pop': tone(500, 0.05, 'sine', 0.06); break;
    }
  } catch { /* audio unavailable */ }
}
