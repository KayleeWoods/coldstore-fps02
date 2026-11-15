// Procedural WebAudio sfx: shots, reloads, footsteps, beeps, explosion. Everything is
// synthesized; nothing downloads. AudioContext is created lazily on the first user
// gesture (or immediately in shot mode, suspended-safe).
export function createAudio(shotMode) {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return true;
  }
  if (shotMode) ensure();
  else {
    window.addEventListener('pointerdown', () => { ensure(); ctx.resume(); }, { once: false });
  }

  function env(dur, peak, attack = 0.002) {
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(master);
    return g;
  }

  function noise(dur) {
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // a local LCG keeps the noise buffer identical on every run
    let n = 0x9e3779b9;
    for (let i = 0; i < len; i++) {
      n = (n * 1664525 + 1013904223) >>> 0;
      d[i] = (n / 4294967296) * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  function shot(weaponId, dist) {
    if (!ensure()) return;
    const vol = Math.max(0.05, 1 - dist / 45);
    const g = env(0.18, 0.5 * vol, 0.001);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(weaponId === 'watchtower' ? 120 : 190, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.12);
    o.connect(g);
    o.start(); o.stop(ctx.currentTime + 0.18);
    const n = noise(0.1);
    const ng = env(0.1, 0.25 * vol, 0.001);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 900;
    n.connect(f); f.connect(ng);
    n.start();
  }

  function reload() {
    if (!ensure()) return;
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 520 + i * 180;
      const g = env(0.06, 0.2, 0.005);
      o.connect(g);
      o.start(ctx.currentTime + i * 0.12); o.stop(ctx.currentTime + i * 0.12 + 0.06);
    }
  }

  function step(dist) {
    if (!ensure()) return;
    const n = noise(0.05);
    const g = env(0.05, 0.12 * Math.max(0.1, 1 - dist / 20));
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500;
    n.connect(f); f.connect(g);
    n.start();
  }

  function beep(freq, dur = 0.1, vol = 0.25) {
    if (!ensure()) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = env(dur, vol, 0.01);
    o.connect(g);
    o.start(); o.stop(ctx.currentTime + dur);
  }

  function explosion() {
    if (!ensure()) return;
    const n = noise(0.9);
    const g = env(0.9, 0.7, 0.005);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1200, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.8);
    n.connect(f); f.connect(g);
    n.start();
  }

  function hit(headshot) { beep(headshot ? 1200 : 700, 0.05, 0.2); }

  return {
    shot, reload, step, beep, explosion, hit,
    resume() { if (ensure()) ctx.resume(); },
  };
}
