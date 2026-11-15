// Compass strip: a heading tape across the top of the HUD, drawn in the DOM.
//
// The tape is rebuilt once at construction (one span per five degrees) and then
// only its transform changes as the player turns, so a frame costs one style
// write and nothing else. Bearings are degrees clockwise from north, and the
// game's yaw (0 faces -z) maps to north.

const TICK_DEGREES = 5;
const LABELS = [
  { deg: 0, text: 'N' },
  { deg: 45, text: 'NE' },
  { deg: 90, text: 'E' },
  { deg: 135, text: 'SE' },
  { deg: 180, text: 'S' },
  { deg: 225, text: 'SW' },
  { deg: 270, text: 'W' },
  { deg: 315, text: 'NW' },
];

export function bearingOf(yaw) {
  // yaw 0 looks down -z (north); increasing yaw turns left, so the bearing runs
  // the other way and wraps into 0..360.
  const deg = (-yaw * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

export function createCompass(doc, host) {
  const root = doc.getElementById(host);
  if (!root) return { update() {} };

  const tape = doc.createElement('div');
  tape.className = 'compass-tape';
  const width = 360 / TICK_DEGREES;

  for (let i = 0; i < width; i++) {
    const deg = i * TICK_DEGREES;
    const tick = doc.createElement('i');
    const label = LABELS.find((l) => l.deg === deg);
    if (label) {
      tick.className = 'major';
      tick.textContent = label.text;
    } else if (deg % 15 === 0) {
      tick.className = 'mid';
    }
    tick.style.left = `${(deg / 360) * 100}%`;
    tape.appendChild(tick);
  }
  root.appendChild(tape);

  const readout = doc.createElement('b');
  readout.className = 'compass-readout';
  root.appendChild(readout);

  let lastPct = -1;
  let lastText = '';

  return {
    update(yaw) {
      const bearing = bearingOf(yaw);
      // the tape is twice the viewport wide, so a bearing moves it by half its
      // own share of 360 degrees
      const pct = Math.round((bearing / 360) * 1000) / 10;
      if (pct !== lastPct) {
        lastPct = pct;
        tape.style.transform = `translateX(${-pct}%)`;
      }
      const text = `${String(Math.round(bearing)).padStart(3, '0')}°`;
      if (text !== lastText) {
        lastText = text;
        readout.textContent = text;
      }
    },
  };
}
